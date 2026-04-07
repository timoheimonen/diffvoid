// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

const workerUrl = new URL(self.location.href);
const APP_VERSION = workerUrl.searchParams.get('v') || '0.0.0';
const BUILD_ID = workerUrl.searchParams.get('b') || 'dev';
importScripts('shared-diff.js?v=' + encodeURIComponent(APP_VERSION) + '&b=' + encodeURIComponent(BUILD_ID));

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

    const diffResult = computeLineDiff(left, right);
    const totalEntries = diffResult.diff.length;

    let mismatchCount = 0;
    for (let i = 0; i < totalEntries; i++) {
        const { type } = diffResult.diff[i];
        if (type === 'added' || type === 'missing' || type === 'modified') {
            mismatchCount++;
        }
    }

    let startIdx = 0;
    let leftLineNum = 1;
    let rightLineNum = 1;
    while (startIdx < totalEntries) {
        if (cancelled) {
            self.postMessage({ type: 'cancelled' });
            return;
        }

        const endIdx = Math.min(startIdx + CHUNK_SIZE, totalEntries);
        const leftChunk = buildPanelHtml(diffResult, 'left', startIdx, endIdx, leftLineNum);
        const rightChunk = buildPanelHtml(diffResult, 'right', startIdx, endIdx, rightLineNum);
        leftLineNum = leftChunk.lineNum;
        rightLineNum = rightChunk.lineNum;

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
