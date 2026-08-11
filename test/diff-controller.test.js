const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClock {
    constructor() {
        this.time = 0;
        this.nextId = 1;
        this.tasks = new Map();
    }

    setTimeout(fn, delay) {
        const id = this.nextId++;
        this.tasks.set(id, { id: id, at: this.time + delay, fn: fn });
        return id;
    }

    clearTimeout(id) {
        this.tasks.delete(id);
    }

    now() {
        return this.time;
    }

    tick(milliseconds) {
        const target = this.time + milliseconds;

        while (true) {
            let next = null;
            for (const task of this.tasks.values()) {
                if (task.at <= target && (!next || task.at < next.at || (task.at === next.at && task.id < next.id))) {
                    next = task;
                }
            }

            if (!next) break;
            this.tasks.delete(next.id);
            this.time = next.at;
            next.fn();
        }

        this.time = target;
    }

    pendingCount() {
        return this.tasks.size;
    }
}

class FakeVisibility {
    constructor(hidden) {
        this.hidden = !!hidden;
        this.listeners = new Set();
    }

    addEventListener(type, listener) {
        if (type === 'visibilitychange') this.listeners.add(listener);
    }

    removeEventListener(type, listener) {
        if (type === 'visibilitychange') this.listeners.delete(listener);
    }

    setHidden(hidden) {
        this.hidden = !!hidden;
        for (const listener of Array.from(this.listeners)) listener({ currentTarget: this });
    }
}

class FakeWorker {
    static instances = [];

    constructor(url) {
        this.url = url;
        this.messages = [];
        this.terminated = false;
        this.onmessage = null;
        this.onerror = null;
        this.onmessageerror = null;
        FakeWorker.instances.push(this);
    }

    postMessage(message) {
        this.messages.push(message);
    }

    terminate() {
        this.terminated = true;
    }

    emit(message) {
        if (typeof this.onmessage === 'function') {
            this.onmessage({ currentTarget: this, data: message });
        }
    }

    fail(message) {
        if (typeof this.onerror === 'function') {
            this.onerror({
                currentTarget: this,
                message: message,
                preventDefault: function () {}
            });
        }
    }
}

function loadController() {
    const filename = path.join(__dirname, '..', 'public', 'diff-controller.js');
    const context = {};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename: filename });
    assert.equal(typeof context.createDiffController, 'function');
    return context.createDiffController;
}

function createHarness(overrides) {
    FakeWorker.instances.length = 0;
    const createDiffController = loadController();
    const clock = new FakeClock();
    const visibility = new FakeVisibility(false);
    const states = [];
    const progress = [];
    const results = [];
    const errors = [];
    const options = Object.assign({
        WorkerCtor: FakeWorker,
        timers: {
            setTimeout: clock.setTimeout.bind(clock),
            clearTimeout: clock.clearTimeout.bind(clock),
            now: clock.now.bind(clock)
        },
        visibility: visibility,
        onStateChange: function (state) { states.push(state); },
        onProgress: function (message, meta) { progress.push({ message: message, meta: meta }); },
        onResult: function (model, meta) { results.push({ model: model, meta: meta }); },
        onError: function (error) { errors.push(error); }
    }, overrides || {});

    return {
        clock: clock,
        visibility: visibility,
        states: states,
        progress: progress,
        results: results,
        errors: errors,
        controller: createDiffController(options)
    };
}

function tagged(type, token, extra) {
    return Object.assign({
        type: type,
        jobId: token.jobId,
        inputRevision: token.inputRevision
    }, extra || {});
}

test('starts one worker with a tagged v2 request and completes atomically', function () {
    const harness = createHarness();
    assert.deepEqual(Object.keys(harness.controller).sort(), ['cancel', 'destroy', 'getState', 'start']);
    const token = harness.controller.start({ left: 'left', right: 'right', isSyncSafe: false });
    const worker = FakeWorker.instances[0];

    assert.equal(FakeWorker.instances.length, 1);
    assert.equal(worker.url, 'worker.js');
    assert.equal(worker.messages.length, 1);
    assert.equal(worker.messages[0].type, 'diff:start');
    assert.equal(worker.messages[0].protocolVersion, 2);
    assert.equal(worker.messages[0].jobId, token.jobId);
    assert.equal(worker.messages[0].inputRevision, token.inputRevision);
    assert.equal(worker.messages[0].left, 'left');
    assert.equal(worker.messages[0].right, 'right');
    assert.equal(harness.clock.pendingCount(), 2);
    assert.equal(harness.controller.getState().activeJob.state, 'starting');

    worker.emit(tagged('diff:started', token));
    assert.equal(harness.controller.getState().activeJob.state, 'computing');
    assert.equal(harness.clock.pendingCount(), 1);

    worker.emit(tagged('diff:progress', token, { phase: 'line-diff', processed: 1, total: 2 }));
    assert.equal(harness.progress.length, 1);
    assert.equal(harness.progress[0].message.phase, 'line-diff');

    const model = { version: 2 };
    worker.emit(tagged('diff:result', token, { model: model }));
    assert.equal(harness.results.length, 1);
    assert.equal(harness.results[0].model, model);
    assert.equal(harness.results[0].meta.jobId, token.jobId);
    assert.equal(harness.errors.length, 0);
    assert.equal(worker.terminated, true);
    assert.equal(harness.clock.pendingCount(), 0);
    assert.equal(harness.controller.getState().activeJob, null);
    assert.deepEqual(harness.states.map(function (entry) { return entry.state; }), [
        'starting', 'computing', 'completed'
    ]);
});

test('stale, wrong-job, wrong-revision, and wrong-worker messages are ignored', function () {
    const harness = createHarness();
    const a = harness.controller.start({ left: 'a', right: 'A', isSyncSafe: false });
    const workerA = FakeWorker.instances[0];
    const queuedAHandler = workerA.onmessage;
    const queuedAErrorHandler = workerA.onerror;
    const b = harness.controller.start({ left: 'b', right: 'B', isSyncSafe: false });
    const workerB = FakeWorker.instances[1];
    const workerBHandler = workerB.onmessage;
    const workerBErrorHandler = workerB.onerror;

    assert.equal(workerA.terminated, true);
    queuedAHandler({
        currentTarget: workerA,
        data: tagged('diff:result', a, { model: { stale: true } })
    });
    workerBHandler({
        currentTarget: workerA,
        data: tagged('diff:result', b, { model: { impostor: true } })
    });
    workerB.emit(tagged('diff:result', { jobId: b.jobId + 1, inputRevision: b.inputRevision }, { model: {} }));
    workerB.emit(tagged('diff:result', { jobId: b.jobId, inputRevision: b.inputRevision + 1 }, { model: {} }));
    workerB.emit({ type: 'diff:result', model: {} });
    queuedAErrorHandler({
        currentTarget: workerA,
        message: 'stale worker error',
        preventDefault: function () {}
    });
    workerBErrorHandler({
        currentTarget: workerA,
        message: 'wrong current target',
        preventDefault: function () {}
    });

    assert.equal(harness.results.length, 0);
    assert.equal(harness.errors.length, 0);
    assert.equal(harness.controller.getState().activeJob.jobId, b.jobId);

    workerB.emit(tagged('diff:started', b));
    workerB.emit(tagged('diff:result', b, { model: { version: 2 } }));
    assert.equal(harness.results.length, 1);
});

test('a new job terminates its predecessor and clear invalidates queued events', function () {
    const harness = createHarness();
    const a = harness.controller.start({ left: 'a', right: 'A', isSyncSafe: false });
    const workerA = FakeWorker.instances[0];
    const b = harness.controller.start({ left: 'b', right: 'B', isSyncSafe: false });
    const workerB = FakeWorker.instances[1];
    const queuedBHandler = workerB.onmessage;

    assert.equal(workerA.terminated, true);
    assert.equal(workerB.terminated, false);
    assert.ok(b.jobId > a.jobId);
    assert.ok(b.inputRevision > a.inputRevision);

    const revisionBeforeClear = harness.controller.getState().inputRevision;
    assert.equal(harness.controller.cancel({ invalidate: true, reason: 'clear' }), true);
    assert.equal(workerB.terminated, true);
    assert.equal(harness.controller.getState().inputRevision, revisionBeforeClear + 1);
    assert.equal(harness.controller.getState().activeJob, null);
    assert.equal(harness.clock.pendingCount(), 0);

    queuedBHandler({
        currentTarget: workerB,
        data: tagged('diff:result', b, { model: { late: true } })
    });
    assert.equal(harness.results.length, 0);
    assert.equal(harness.errors.length, 0);
});

test('startup timeout terminates the worker once and rejects late results', function () {
    const harness = createHarness();
    const token = harness.controller.start({ left: 'a', right: 'b', isSyncSafe: false });
    const worker = FakeWorker.instances[0];
    const queuedHandler = worker.onmessage;

    harness.clock.tick(1999);
    assert.equal(harness.errors.length, 0);
    harness.clock.tick(1);

    assert.equal(harness.errors.length, 1);
    assert.equal(harness.errors[0].code, 'WORKER_STARTUP_TIMEOUT');
    assert.equal(worker.terminated, true);
    assert.equal(harness.clock.pendingCount(), 0);

    queuedHandler({
        currentTarget: worker,
        data: tagged('diff:result', token, { model: { late: true } })
    });
    assert.equal(harness.results.length, 0);
    assert.equal(harness.errors.length, 1);
});

test('hard timeout is absolute and progress does not extend it', function () {
    const harness = createHarness();
    const token = harness.controller.start({ left: 'a', right: 'b', isSyncSafe: false });
    const worker = FakeWorker.instances[0];

    worker.emit(tagged('diff:started', token));
    harness.clock.tick(14999);
    worker.emit(tagged('diff:progress', token, { phase: 'intraline', processed: 99, total: 100 }));
    assert.equal(harness.errors.length, 0);

    harness.clock.tick(1);
    assert.equal(harness.errors.length, 1);
    assert.equal(harness.errors[0].code, 'WORKER_HARD_TIMEOUT');
    assert.equal(worker.terminated, true);
    assert.equal(harness.clock.pendingCount(), 0);
});

test('visibility changes pause and resume startup and hard timers', function () {
    const startupHarness = createHarness();
    startupHarness.controller.start({ left: 'a', right: 'b', isSyncSafe: false });
    startupHarness.clock.tick(750);
    startupHarness.visibility.setHidden(true);
    assert.equal(startupHarness.clock.pendingCount(), 0);

    startupHarness.clock.tick(60000);
    assert.equal(startupHarness.errors.length, 0);
    startupHarness.visibility.setHidden(false);
    startupHarness.clock.tick(1249);
    assert.equal(startupHarness.errors.length, 0);
    startupHarness.clock.tick(1);
    assert.equal(startupHarness.errors[0].code, 'WORKER_STARTUP_TIMEOUT');

    const hardHarness = createHarness();
    const token = hardHarness.controller.start({ left: 'a', right: 'b', isSyncSafe: false });
    const worker = FakeWorker.instances[0];
    worker.emit(tagged('diff:started', token));
    hardHarness.clock.tick(5000);
    hardHarness.visibility.setHidden(true);
    hardHarness.clock.tick(60000);
    assert.equal(hardHarness.errors.length, 0);
    hardHarness.visibility.setHidden(false);
    hardHarness.clock.tick(9999);
    assert.equal(hardHarness.errors.length, 0);
    hardHarness.clock.tick(1);
    assert.equal(hardHarness.errors[0].code, 'WORKER_HARD_TIMEOUT');
});

test('a safe input may use the same job token for sync fallback when construction fails', function () {
    let fallbackCall = null;
    class ThrowingWorker {
        constructor() {
            throw new Error('worker blocked');
        }
    }

    const harness = createHarness({
        WorkerCtor: ThrowingWorker,
        syncFallback: function (left, right, meta) {
            fallbackCall = { left: left, right: right, meta: meta };
            return { version: 2, sync: true };
        }
    });
    const token = harness.controller.start({ left: 'small-a', right: 'small-b', isSyncSafe: true });

    assert.equal(fallbackCall.left, 'small-a');
    assert.equal(fallbackCall.right, 'small-b');
    assert.equal(fallbackCall.meta.jobId, token.jobId);
    assert.equal(fallbackCall.meta.inputRevision, token.inputRevision);
    assert.equal(harness.results.length, 1);
    assert.equal(harness.results[0].model.sync, true);
    assert.equal(harness.results[0].meta.mode, 'sync');
    assert.equal(harness.errors.length, 0);
    assert.equal(harness.clock.pendingCount(), 0);
});

test('worker-required input reports the HTTP/Web Worker error when construction fails', function () {
    let fallbackCalls = 0;
    class ThrowingWorker {
        constructor() {
            throw new Error('worker blocked');
        }
    }

    const harness = createHarness({
        WorkerCtor: ThrowingWorker,
        syncFallback: function () {
            fallbackCalls++;
            return {};
        }
    });
    harness.controller.start({ left: 'large-a', right: 'large-b', isSyncSafe: false });

    assert.equal(fallbackCalls, 0);
    assert.equal(harness.results.length, 0);
    assert.equal(harness.errors.length, 1);
    assert.equal(harness.errors[0].code, 'WORKER_UNAVAILABLE');
    assert.match(harness.errors[0].message, /requires Web Worker support/);
});

test('postMessage failure is terminal and never triggers sync fallback', function () {
    let fallbackCalls = 0;
    class PostFailureWorker extends FakeWorker {
        postMessage() {
            throw new Error('clone failed');
        }
    }

    const harness = createHarness({
        WorkerCtor: PostFailureWorker,
        syncFallback: function () {
            fallbackCalls++;
            return {};
        }
    });
    harness.controller.start({ left: 'a', right: 'b', isSyncSafe: true });
    const worker = FakeWorker.instances[0];

    assert.equal(fallbackCalls, 0);
    assert.equal(harness.errors.length, 1);
    assert.equal(harness.errors[0].code, 'WORKER_POST_MESSAGE_FAILED');
    assert.equal(worker.terminated, true);
    assert.equal(harness.clock.pendingCount(), 0);
});

test('runtime and message errors are terminal without a sync retry', function () {
    let fallbackCalls = 0;
    const startupHarness = createHarness({
        syncFallback: function () {
            fallbackCalls++;
            return {};
        }
    });
    startupHarness.controller.start({ left: 'a', right: 'b', isSyncSafe: true });
    const startupWorker = FakeWorker.instances[0];
    startupWorker.fail('worker script could not load');

    assert.equal(fallbackCalls, 0);
    assert.equal(startupHarness.errors.length, 1);
    assert.equal(startupHarness.errors[0].code, 'WORKER_STARTUP_ERROR');
    assert.equal(startupWorker.terminated, true);

    const runtimeHarness = createHarness({
        syncFallback: function () {
            fallbackCalls++;
            return {};
        }
    });
    const runtimeToken = runtimeHarness.controller.start({ left: 'a', right: 'b', isSyncSafe: true });
    const runtimeWorker = FakeWorker.instances[0];
    runtimeWorker.emit(tagged('diff:started', runtimeToken));
    runtimeWorker.fail('worker crashed');

    assert.equal(fallbackCalls, 0);
    assert.equal(runtimeHarness.errors.length, 1);
    assert.equal(runtimeHarness.errors[0].code, 'WORKER_RUNTIME_ERROR');
    assert.equal(runtimeWorker.terminated, true);

    const messageHarness = createHarness();
    messageHarness.controller.start({ left: 'a', right: 'b', isSyncSafe: false });
    const messageWorker = FakeWorker.instances[0];
    messageWorker.onmessageerror({
        currentTarget: messageWorker,
        message: 'bad clone',
        preventDefault: function () {}
    });
    assert.equal(messageHarness.errors[0].code, 'WORKER_MESSAGE_ERROR');
    assert.equal(messageWorker.terminated, true);
});

test('only the first terminal outcome can invoke a callback', function () {
    const harness = createHarness();
    const token = harness.controller.start({ left: 'a', right: 'b', isSyncSafe: false });
    const worker = FakeWorker.instances[0];
    const queuedMessageHandler = worker.onmessage;
    const queuedErrorHandler = worker.onerror;

    worker.emit(tagged('diff:started', token));
    worker.emit(tagged('diff:result', token, { model: { winner: true } }));

    queuedMessageHandler({
        currentTarget: worker,
        data: tagged('diff:error', token, { code: 'LATE', message: 'late' })
    });
    queuedErrorHandler({
        currentTarget: worker,
        message: 'later',
        preventDefault: function () {}
    });
    harness.clock.tick(30000);

    assert.equal(harness.results.length, 1);
    assert.equal(harness.errors.length, 0);
    assert.equal(harness.states.filter(function (entry) { return entry.state === 'completed'; }).length, 1);
});

test('an unknown tagged message is ignored before a valid result completes', function () {
    const harness = createHarness();
    const token = harness.controller.start({ left: 'a', right: 'b', isSyncSafe: false });
    const worker = FakeWorker.instances[0];
    worker.emit(tagged('diff:unknown', token));

    assert.equal(harness.controller.getState().activeJob.state, 'starting');
    assert.deepEqual(harness.states.map(function (entry) { return entry.state; }), ['starting']);
    assert.equal(harness.progress.length, 0);
    assert.equal(harness.results.length, 0);
    assert.equal(harness.errors.length, 0);
    assert.equal(worker.terminated, false);
    assert.equal(harness.clock.pendingCount(), 2);

    worker.emit(tagged('diff:started', token));
    const model = { version: 2, mismatchCount: 1 };
    worker.emit(tagged('diff:result', token, { model: model }));

    assert.equal(harness.results.length, 1);
    assert.equal(harness.results[0].model, model);
    assert.deepEqual(harness.states.map(function (entry) { return entry.state; }), [
        'starting', 'computing', 'completed'
    ]);
    assert.equal(worker.terminated, true);
    assert.equal(harness.clock.pendingCount(), 0);
});

test('destroy terminates active work, removes visibility listener, and prevents reuse', function () {
    const harness = createHarness();
    harness.controller.start({ left: 'a', right: 'b', isSyncSafe: false });
    const worker = FakeWorker.instances[0];

    assert.equal(harness.visibility.listeners.size, 1);
    harness.controller.destroy();
    assert.equal(worker.terminated, true);
    assert.equal(harness.clock.pendingCount(), 0);
    assert.equal(harness.visibility.listeners.size, 0);
    assert.equal(harness.controller.getState().destroyed, true);
    assert.throws(function () {
        harness.controller.start({ left: 'x', right: 'y', isSyncSafe: false });
    }, /destroyed/);
});
