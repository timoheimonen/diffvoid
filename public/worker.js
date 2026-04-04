// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

importScripts('shared-diff.js');

function buildPanelHtmlRange(diffResult, side, startIdx, endIdx) {
    var html = '';
    var lineNum = 1;
    var isRight = side === 'right';

    for (var i = 0; i < startIdx; i++) {
        var prevItem = diffResult.diff[i];
        if (prevItem.type === 'match' || prevItem.type === 'modified'
            || (prevItem.type === 'added' && isRight) || (prevItem.type === 'missing' && !isRight)) {
            lineNum++;
        }
    }

    for (var i = startIdx; i < endIdx && i < diffResult.diff.length; i++) {
        var item = diffResult.diff[i];

        if (item.type === 'match') {
            var line = isRight ? diffResult.rightLines[item.rightLineIndex] : diffResult.leftLines[item.leftLineIndex];
            html += '<div class="diff-line">';
            html += '<span class="diff-gutter">' + lineNum + '</span>';
            html += '<span class="diff-content';
            if (isRight) html += ' diff-match';
            html += '">' + renderWithInvisibles(line) + '</span>';
            html += '</div>';
            lineNum++;
        } else if (item.type === 'modified') {
            html += '<div class="diff-line';
            if (isRight) html += ' diff-line-mismatch';
            html += '">';
            html += '<span class="diff-gutter">' + lineNum + '</span>';
            html += '<span class="diff-content">';
            if (isRight) {
                var j = 0;
                while (j < item.chars.length) {
                    var match = item.chars[j].match;
                    var segment = '';
                    while (j < item.chars.length && item.chars[j].match === match) {
                        segment += item.chars[j].c;
                        j++;
                    }
                    var cls = match ? 'diff-match' : 'diff-mismatch';
                    html += '<span class="' + cls + '">' + renderWithInvisibles(segment, !match) + '</span>';
                }
            } else {
                var lj = 0;
                while (lj < item.leftChars.length) {
                    var lmatch = item.leftChars[lj].match;
                    var lsegment = '';
                    while (lj < item.leftChars.length && item.leftChars[lj].match === lmatch) {
                        lsegment += item.leftChars[lj].c;
                        lj++;
                    }
                    var lcls = lmatch ? 'diff-match' : 'diff-mismatch';
                    html += '<span class="' + lcls + '">' + renderWithInvisibles(lsegment, !lmatch) + '</span>';
                }
            }
            html += '</span>';
            html += '</div>';
            lineNum++;
        } else if (item.type === 'added') {
            if (isRight) {
                var addedLine = diffResult.rightLines[item.lineIndex];
                html += '<div class="diff-line diff-line-mismatch">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content"><span class="diff-mismatch">' + renderWithInvisibles(addedLine, true) + '</span></span>';
                html += '</div>';
                lineNum++;
            } else {
                html += '<div class="diff-line">';
                html += '<span class="diff-gutter"></span>';
                html += '<span class="diff-content"></span>';
                html += '</div>';
            }
        } else if (item.type === 'missing') {
            if (isRight) {
                html += '<div class="diff-line diff-line-missing">';
                html += '<span class="diff-gutter"></span>';
                html += '<span class="diff-content"></span>';
                html += '</div>';
            } else {
                var missingLine = diffResult.leftLines[item.lineIndex];
                html += '<div class="diff-line">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content">' + renderWithInvisibles(missingLine) + '</span>';
                html += '</div>';
                lineNum++;
            }
        }
    }

    return { html: html, endIdx: Math.min(endIdx, diffResult.diff.length) };
}

var CHUNK_SIZE = 50;
var cancelled = false;

self.onmessage = function (e) {
    if (e.data.type === 'cancel') {
        cancelled = true;
        return;
    }

    if (e.data.type !== 'diff') return;

    cancelled = false;
    var left = e.data.left;
    var right = e.data.right;

    var diffResult = computeLineDiff(left, right);
    var totalEntries = diffResult.diff.length;

    var mismatchCount = 0;
    for (var i = 0; i < totalEntries; i++) {
        var type = diffResult.diff[i].type;
        if (type === 'added' || type === 'missing' || type === 'modified') {
            mismatchCount++;
        }
    }

    var startIdx = 0;
    while (startIdx < totalEntries) {
        if (cancelled) {
            self.postMessage({ type: 'cancelled' });
            return;
        }

        var endIdx = Math.min(startIdx + CHUNK_SIZE, totalEntries);
        var leftChunk = buildPanelHtmlRange(diffResult, 'left', startIdx, endIdx);
        var rightChunk = buildPanelHtmlRange(diffResult, 'right', startIdx, endIdx);

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
