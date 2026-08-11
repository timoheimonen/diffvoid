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
        this.tasks.set(id, { at: this.time + delay, fn: fn });
        return id;
    }

    clearTimeout(id) {
        this.tasks.delete(id);
    }

    now() {
        return this.time;
    }
}

class FakeWorker {
    static instances = [];

    constructor(url) {
        this.url = url;
        this.messages = [];
        this.terminated = false;
        FakeWorker.instances.push(this);
    }

    postMessage(message) {
        this.messages.push(message);
    }

    terminate() {
        this.terminated = true;
    }

    emit(message) {
        this.onmessage({ currentTarget: this, data: message });
    }
}

function loadController() {
    const filename = path.join(__dirname, '..', 'public', 'diff-controller.js');
    assert.equal(fs.existsSync(filename), true, 'public/diff-controller.js must exist');
    const context = {};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(filename, 'utf8') + '\nthis.createDiffControllerForTest = createDiffController;', context);
    return context.createDiffControllerForTest;
}

test('an old worker cannot affect callbacks after a newer job or clear', function () {
    FakeWorker.instances.length = 0;
    const createDiffController = loadController();
    const clock = new FakeClock();
    const progress = [];
    const results = [];
    const errors = [];
    const controller = createDiffController({
        WorkerCtor: FakeWorker,
        timers: {
            setTimeout: clock.setTimeout.bind(clock),
            clearTimeout: clock.clearTimeout.bind(clock),
            now: clock.now.bind(clock)
        },
        onProgress: function (message) { progress.push(message); },
        onResult: function (model, meta) { results.push({ model: model, meta: meta }); },
        onError: function (error) { errors.push(error); }
    });

    const a = controller.start({ left: 'a', right: 'A', isSyncSafe: false });
    const workerA = FakeWorker.instances[0];
    const queuedAHandler = workerA.onmessage;
    const b = controller.start({ left: 'b', right: 'B', isSyncSafe: false });
    const workerB = FakeWorker.instances[1];

    assert.equal(workerA.terminated, true);
    queuedAHandler({
        currentTarget: workerA,
        data: { type: 'diff:result', jobId: a.jobId, inputRevision: a.inputRevision, model: { stale: true } }
    });
    workerA.emit({
        type: 'diff:progress',
        jobId: a.jobId,
        inputRevision: a.inputRevision,
        phase: 'lines',
        processed: 1,
        total: 1
    });
    assert.deepEqual(progress, []);
    assert.deepEqual(results, []);

    workerB.emit({ type: 'diff:started', jobId: b.jobId, inputRevision: b.inputRevision });
    workerB.emit({
        type: 'diff:result',
        jobId: b.jobId,
        inputRevision: b.inputRevision,
        model: { version: 2 }
    });
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].model, { version: 2 });

    controller.cancel({ invalidate: true });
    queuedAHandler({
        currentTarget: workerA,
        data: { type: 'diff:error', jobId: a.jobId, inputRevision: a.inputRevision, message: 'late' }
    });
    assert.deepEqual(errors, []);
    assert.equal(controller.getState().activeJob, null);
});
