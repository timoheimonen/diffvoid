const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const adapterFilename = path.join(__dirname, 'worker-thread-adapter.js');
const workerFilename = path.join(__dirname, '..', 'public', 'worker.js');

async function runWorkerRequest(request, options) {
    options = options || {};
    const worker = new Worker(adapterFilename, {
        workerData: {
            workerFilename: workerFilename,
            clockStep: options.clockStep
        }
    });
    const output = {
        messages: [],
        transferObservation: null
    };

    try {
        await new Promise(function (resolve, reject) {
            let terminalMessage = null;
            const timeout = setTimeout(function () {
                reject(new Error('Timed out waiting for worker protocol response.'));
            }, 5000);

            function maybeResolve() {
                if (!terminalMessage) return;
                if (terminalMessage.type === 'diff:result' && !output.transferObservation) return;
                clearTimeout(timeout);
                resolve();
            }

            worker.on('message', function (entry) {
                if (entry.kind === 'ready') {
                    worker.postMessage(request);
                } else if (entry.kind === 'worker-message') {
                    output.messages.push(entry.message);
                    if (entry.message.type === 'diff:result' || entry.message.type === 'diff:error') {
                        terminalMessage = entry.message;
                    }
                    maybeResolve();
                } else if (entry.kind === 'transfer-observation') {
                    output.transferObservation = entry;
                    maybeResolve();
                } else if (entry.kind === 'adapter-error') {
                    clearTimeout(timeout);
                    reject(new Error(entry.message));
                }
            });
            worker.once('error', function (err) {
                clearTimeout(timeout);
                reject(err);
            });
            worker.once('exit', function (code) {
                if (!terminalMessage && code !== 0) {
                    clearTimeout(timeout);
                    reject(new Error('Worker adapter exited with code ' + code + '.'));
                }
            });
        });
    } finally {
        await worker.terminate();
    }

    return output;
}

function validRequest(overrides) {
    return Object.assign({
        type: 'diff:start',
        protocolVersion: 2,
        jobId: 7,
        inputRevision: 11,
        left: 'alpha\nCafe\u0301\n<script>alert(1)</script>',
        right: 'alpha\nCafe\n<img src=x onerror=alert(1)>'
    }, overrides || {});
}

function terminalMessages(output) {
    return output.messages.filter(function (message) {
        return message.type === 'diff:result' || message.type === 'diff:error';
    });
}

function assertTagged(messages, jobId, inputRevision) {
    for (const message of messages) {
        assert.equal(message.jobId, jobId);
        assert.equal(message.inputRevision, inputRevision);
    }
}

function walkKeys(value, visitor) {
    if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return;
    for (const key of Object.keys(value)) {
        visitor(key, value[key]);
        walkKeys(value[key], visitor);
    }
}

test('actual worker returns one atomic source-free DiffModelV2 with exact transferred arrays', async function () {
    const request = validRequest();
    const output = await runWorkerRequest(request);
    const types = output.messages.map(function (message) { return message.type; });
    const terminals = terminalMessages(output);

    assert.equal(types[0], 'diff:started');
    assert.equal(types.includes('diff:progress'), true);
    assert.equal(types.includes('diff:chunk'), false);
    assert.equal(types.includes('chunk'), false);
    assert.equal(types.includes('done'), false);
    assert.equal(terminals.length, 1);
    assert.equal(terminals[0].type, 'diff:result');
    assertTagged(output.messages, request.jobId, request.inputRevision);

    const model = terminals[0].model;
    assert.equal(model.version, 2);
    assert.equal(Array.isArray(model.rows), true);
    assert.equal(model.changeBounds instanceof Uint32Array, true);
    assert.equal(model.leftLineStarts instanceof Uint32Array, true);
    assert.equal(model.rightLineStarts instanceof Uint32Array, true);
    assert.equal(model.changeBounds.byteOffset, 0);
    assert.equal(model.leftLineStarts.byteOffset, 0);
    assert.equal(model.rightLineStarts.byteOffset, 0);
    assert.equal(model.changeBounds.byteLength, model.changeBounds.buffer.byteLength);
    assert.equal(model.leftLineStarts.byteLength, model.leftLineStarts.buffer.byteLength);
    assert.equal(model.rightLineStarts.byteLength, model.rightLineStarts.buffer.byteLength);
    assert.ok(model.changeBounds.length > 0);

    const forbiddenKeys = new Set([
        'left', 'right', 'text', 'leftLines', 'rightLines', 'chars', 'leftChars',
        'html', 'leftHtml', 'rightHtml'
    ]);
    walkKeys(model, function (key) {
        assert.equal(forbiddenKeys.has(key), false, 'model must not contain source/HTML field ' + key);
    });
    assert.equal(JSON.stringify(model).includes('<script>alert(1)</script>'), false);
    assert.equal(JSON.stringify(model).includes('<img src=x onerror=alert(1)>'), false);

    assert.ok(output.transferObservation);
    assert.equal(output.transferObservation.messageType, 'diff:result');
    assert.equal(output.transferObservation.transferCount, 3);
    assert.deepEqual(output.transferObservation.byteLengthsAfter, [0, 0, 0]);
    assert.deepEqual(output.transferObservation.byteLengthsBefore, [
        model.changeBounds.byteLength,
        model.leftLineStarts.byteLength,
        model.rightLineStarts.byteLength
    ]);
});

test('unsupported and malformed v2 requests return tagged protocol errors without results', async function () {
    const unsupported = await runWorkerRequest(validRequest({ protocolVersion: 99 }));
    assert.deepEqual(unsupported.messages.map(function (message) { return message.type; }), ['diff:error']);
    assert.equal(unsupported.messages[0].code, 'UNSUPPORTED_PROTOCOL');
    assert.equal(unsupported.messages[0].jobId, 7);
    assert.equal(unsupported.messages[0].inputRevision, 11);
    assert.equal(unsupported.transferObservation, null);

    const malformed = await runWorkerRequest(validRequest({ left: 42 }));
    assert.deepEqual(malformed.messages.map(function (message) { return message.type; }), ['diff:error']);
    assert.equal(malformed.messages[0].code, 'INVALID_REQUEST');
    assert.equal(malformed.messages[0].jobId, 7);
    assert.equal(malformed.messages[0].inputRevision, 11);
    assert.equal(malformed.transferObservation, null);

    const badToken = await runWorkerRequest(validRequest({ jobId: 'not-a-job' }));
    assert.equal(badToken.messages[0].type, 'diff:error');
    assert.equal(badToken.messages[0].code, 'INVALID_REQUEST');
    assert.equal(badToken.messages[0].jobId, null);
    assert.equal(badToken.messages[0].inputRevision, 11);
});

test('authoritative compute errors remain tagged and never emit a model or transfer', async function () {
    const request = validRequest({ left: 'x'.repeat(2000001), right: 'y' });
    const output = await runWorkerRequest(request);
    const terminal = terminalMessages(output);

    assert.equal(output.messages[0].type, 'diff:started');
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].type, 'diff:error');
    assert.equal(terminal[0].code, 'COMPARISON_FAILED');
    assert.match(terminal[0].message, /Maximum 2,000,000 characters/);
    assert.equal(output.messages.some(function (message) { return message.type === 'diff:result'; }), false);
    assert.equal(output.transferObservation, null);
    assertTagged(output.messages, request.jobId, request.inputRevision);
});

test('worker internal deadline produces a terminal tagged error without a result', async function () {
    const request = validRequest({ left: 'a', right: 'b' });
    const output = await runWorkerRequest(request, { clockStep: 13000 });
    const terminal = terminalMessages(output);

    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].type, 'diff:error');
    assert.equal(terminal[0].code, 'INTERNAL_DEADLINE_EXCEEDED');
    assert.match(terminal[0].message, /internal time limit/);
    assert.equal(output.messages.some(function (message) { return message.type === 'diff:result'; }), false);
    assert.equal(output.transferObservation, null);
    assertTagged(output.messages, request.jobId, request.inputRevision);
});
