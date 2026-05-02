// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

importScripts('shared-diff.js');

const CHUNK_SIZE = 50;
let cancelled = false;

self.onmessage = function (e) {
    if (e.data.type === 'cancel') {
        cancelled = true;
        return;
    }

    if (e.data.type !== 'diff') return;

    cancelled = false;
    const { left, right } = e.data;

    self.postMessage({ type: 'computing' });

    let diffResult;
    try {
        diffResult = computeLineDiff(left, right);
    } catch (err) {
        self.postMessage({ type: 'error', message: err && err.message ? err.message : 'Comparison failed.' });
        return;
    }

    const totalEntries = diffResult.diff.length;
    const mismatchCount = countDifferenceRows(diffResult);

    let startIdx = 0;
    while (startIdx < totalEntries) {
        if (cancelled) {
            self.postMessage({ type: 'cancelled' });
            return;
        }

        const endIdx = Math.min(startIdx + CHUNK_SIZE, totalEntries);
        const leftChunk = buildPanelHtmlRange(diffResult, 'left', startIdx, endIdx);
        const rightChunk = buildPanelHtmlRange(diffResult, 'right', startIdx, endIdx);

        self.postMessage({
            type: 'chunk',
            leftHtml: leftChunk.html,
            rightHtml: rightChunk.html,
            startIdx: startIdx,
            endIdx: leftChunk.endIdx,
            processed: leftChunk.endIdx,
            total: totalEntries
        });

        startIdx = leftChunk.endIdx;
    }

    if (!cancelled) {
        self.postMessage({
            type: 'done',
            mismatchCount: mismatchCount,
            totalLines: diffResult.rightLines.length
        });
    }
};
