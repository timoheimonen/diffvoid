// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

importScripts('shared-diff.js');

const CHUNK_SIZE = 50;

self.onmessage = function (e) {
    const request = e.data || {};
    if (request.type !== 'diff:start') return;

    const { jobId, inputRevision, left, right } = request;

    function post(message) {
        self.postMessage(Object.assign({
            jobId: jobId,
            inputRevision: inputRevision
        }, message));
    }

    if (request.protocolVersion !== 2) {
        post({
            type: 'diff:error',
            code: 'UNSUPPORTED_PROTOCOL',
            message: 'Unsupported diff worker protocol.'
        });
        return;
    }

    post({ type: 'diff:started' });
    post({ type: 'diff:progress', phase: 'diff', processed: 0, total: 1 });

    let diffResult;
    try {
        diffResult = computeLineDiff(left, right);
    } catch (err) {
        post({
            type: 'diff:error',
            code: 'COMPARISON_FAILED',
            message: err && err.message ? err.message : 'Comparison failed.'
        });
        return;
    }

    const totalEntries = diffResult.diff.length;
    const mismatchCount = countDifferenceRows(diffResult);

    let startIdx = 0;
    while (startIdx < totalEntries) {
        const endIdx = Math.min(startIdx + CHUNK_SIZE, totalEntries);
        const leftChunk = buildPanelHtmlRange(diffResult, 'left', startIdx, endIdx);
        const rightChunk = buildPanelHtmlRange(diffResult, 'right', startIdx, endIdx);

        post({
            type: 'diff:chunk',
            leftHtml: leftChunk.html,
            rightHtml: rightChunk.html,
            startIdx: startIdx,
            endIdx: leftChunk.endIdx,
            processed: leftChunk.endIdx,
            total: totalEntries
        });

        startIdx = leftChunk.endIdx;
    }

    post({
        type: 'diff:result',
        model: {
            version: 1,
            mismatchCount: mismatchCount,
            totalLines: diffResult.rightLines.length
        }
    });
};
