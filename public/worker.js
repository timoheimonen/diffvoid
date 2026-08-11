// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

importScripts('shared-diff.js');

const DIFF_PROTOCOL_VERSION = 2;
const WORKER_INTERNAL_DEADLINE_MS = 12000;

self.onmessage = function (event) {
    const request = event && event.data;
    if (!request || request.type !== 'diff:start') return;

    const token = requestToken(request);
    if (request.protocolVersion !== DIFF_PROTOCOL_VERSION) {
        postError(token, 'UNSUPPORTED_PROTOCOL', 'Unsupported diff worker protocol.');
        return;
    }

    if (!isValidRequest(request)) {
        postError(token, 'INVALID_REQUEST', 'Invalid diff comparison request.');
        return;
    }

    const now = monotonicNow;
    const deadlineAt = now() + WORKER_INTERNAL_DEADLINE_MS;

    postTagged(token, { type: 'diff:started' });
    postProgress(token, 'diff', 0, 1);

    let model;
    try {
        model = computeDiffModel(request.left, request.right, {
            workBudget: createDiffWorkBudget(),
            deadlineAt: deadlineAt,
            now: now,
            checkDeadline: function () {
                throwIfDeadlineExceeded(now, deadlineAt);
            },
            onProgress: function (progress) {
                forwardProgress(token, progress);
            }
        });
        throwIfDeadlineExceeded(now, deadlineAt);
        model = normalizeTransferModel(model);
    } catch (err) {
        postComputationError(token, err);
        return;
    }

    postProgress(token, 'diff', 1, 1);

    const transferList = uniqueModelBuffers(model);
    try {
        self.postMessage({
            type: 'diff:result',
            jobId: token.jobId,
            inputRevision: token.inputRevision,
            model: model
        }, transferList);
    } catch (err) {
        postError(
            token,
            'RESULT_TRANSFER_FAILED',
            err && err.message ? err.message : 'The comparison result could not be transferred.'
        );
    }
};

function requestToken(request) {
    return {
        jobId: Number.isSafeInteger(request.jobId) ? request.jobId : null,
        inputRevision: Number.isSafeInteger(request.inputRevision) ? request.inputRevision : null
    };
}

function isValidRequest(request) {
    return Number.isSafeInteger(request.jobId)
        && request.jobId > 0
        && Number.isSafeInteger(request.inputRevision)
        && request.inputRevision >= 0
        && typeof request.left === 'string'
        && typeof request.right === 'string';
}

function monotonicNow() {
    if (self.performance && typeof self.performance.now === 'function') {
        return self.performance.now();
    }
    return Date.now();
}

function deadlineError() {
    const err = new Error('The comparison exceeded its internal time limit.');
    err.code = 'INTERNAL_DEADLINE_EXCEEDED';
    return err;
}

function throwIfDeadlineExceeded(now, deadlineAt) {
    if (now() >= deadlineAt) throw deadlineError();
}

function postTagged(token, message) {
    self.postMessage(Object.assign({
        jobId: token.jobId,
        inputRevision: token.inputRevision
    }, message));
}

function postProgress(token, phase, processed, total) {
    postTagged(token, {
        type: 'diff:progress',
        phase: phase,
        processed: processed,
        total: total
    });
}

function forwardProgress(token, progress) {
    if (!progress || typeof progress !== 'object') return;

    const phase = typeof progress.phase === 'string' ? progress.phase : 'diff';
    const processed = finiteProgressNumber(progress.processed, 0);
    const total = finiteProgressNumber(progress.total, 0);
    postProgress(token, phase, processed, total);
}

function finiteProgressNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function postComputationError(token, err) {
    const isDeadline = err && (
        err.code === 'INTERNAL_DEADLINE_EXCEEDED'
        || err.code === 'DEADLINE_EXCEEDED'
        || err.code === 'DIFF_DEADLINE_EXCEEDED'
    );
    postError(
        token,
        isDeadline ? 'INTERNAL_DEADLINE_EXCEEDED' : (err && err.code ? err.code : 'COMPARISON_FAILED'),
        isDeadline
            ? 'The comparison exceeded its internal time limit.'
            : (err && err.message ? err.message : 'Comparison failed.')
    );
}

function postError(token, code, message) {
    postTagged(token, {
        type: 'diff:error',
        code: code,
        message: message
    });
}

function normalizeTransferModel(model) {
    if (!model || model.version !== 2 || !Array.isArray(model.rows)) {
        const err = new Error('The comparison produced an invalid result model.');
        err.code = 'INVALID_RESULT_MODEL';
        throw err;
    }

    model.changeBounds = exactUint32Array(model.changeBounds, 'changeBounds');
    model.leftLineStarts = exactUint32Array(model.leftLineStarts, 'leftLineStarts');
    model.rightLineStarts = exactUint32Array(model.rightLineStarts, 'rightLineStarts');
    return model;
}

function exactUint32Array(value, name) {
    if (!(value instanceof Uint32Array)) {
        const err = new Error('The comparison result has an invalid ' + name + ' array.');
        err.code = 'INVALID_RESULT_MODEL';
        throw err;
    }

    if (value.byteOffset === 0 && value.byteLength === value.buffer.byteLength) {
        return value;
    }
    return Uint32Array.from(value);
}

function uniqueModelBuffers(model) {
    const views = [model.changeBounds, model.leftLineStarts, model.rightLineStarts];
    const seen = new Set();
    const buffers = [];
    for (let i = 0; i < views.length; i++) {
        const buffer = views[i].buffer;
        if (!seen.has(buffer)) {
            seen.add(buffer);
            buffers.push(buffer);
        }
    }
    return buffers;
}
