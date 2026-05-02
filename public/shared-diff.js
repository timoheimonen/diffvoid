// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

const INVISIBLE_RENDER_META = {
    0x00A0: { cls: 'invisible-nbsp', title: 'Non-breaking space (U+00A0)' },
    0x00AD: { cls: 'invisible-shy', title: 'Soft hyphen (U+00AD)' },
    0x180E: { cls: 'invisible-mvs', title: 'Mongolian vowel separator (U+180E)' },
    0x2002: { cls: 'invisible-ensp', title: 'En space (U+2002)' },
    0x2003: { cls: 'invisible-emsp', title: 'Em space (U+2003)' },
    0x2007: { cls: 'invisible-figure', title: 'Figure space (U+2007)' },
    0x2008: { cls: 'invisible-punct', title: 'Punctuation space (U+2008)' },
    0x2009: { cls: 'invisible-thin', title: 'Thin space (U+2009)' },
    0x200A: { cls: 'invisible-hair', title: 'Hair space (U+200A)' },
    0x200B: { cls: 'invisible-zwsp', title: 'Zero-width space (U+200B)' },
    0x200C: { cls: 'invisible-zwnj', title: 'Zero-width non-joiner (U+200C)' },
    0x200D: { cls: 'invisible-zwj', title: 'Zero-width joiner (U+200D)' },
    0x200E: { cls: 'invisible-lrm', title: 'Left-to-right mark (U+200E)' },
    0x200F: { cls: 'invisible-rlm', title: 'Right-to-left mark (U+200F)' },
    0x202F: { cls: 'invisible-nnbsp', title: 'Narrow no-break space (U+202F)' },
    0x205F: { cls: 'invisible-mmsp', title: 'Medium mathematical space (U+205F)' },
    0x2060: { cls: 'invisible-wj', title: 'Word joiner (U+2060)' },
    0x3000: { cls: 'invisible-ideo', title: 'Ideographic space (U+3000)' },
    0xFEFF: { cls: 'invisible-bom', title: 'Zero-width no-break space / BOM (U+FEFF)' }
};

const REMOVE_ON_COPY_CODES = {
    0x00AD: true,
    0xFEFF: true
};

const SPACE_ON_COPY_CODES = {
    0x00A0: true, 0x180E: true, 0x200B: true, 0x200C: true,
    0x200D: true, 0x200E: true, 0x200F: true, 0x202F: true,
    0x205F: true, 0x2060: true, 0x3000: true
};

function isInvisibleCode(code) {
    return REMOVE_ON_COPY_CODES[code]
        || SPACE_ON_COPY_CODES[code]
        || (code >= 0x2000 && code <= 0x200A);
}

function hasInvisibleCharacters(text) {
    for (let i = 0; i < text.length; i++) {
        if (isInvisibleCode(text.charCodeAt(i))) {
            return true;
        }
    }
    return false;
}

function stripInvisibleCharacters(text) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const code = char.charCodeAt(0);

        if (REMOVE_ON_COPY_CODES[code]) {
            continue;
        }

        if (SPACE_ON_COPY_CODES[code] || (code >= 0x2000 && code <= 0x200B)) {
            if (result.slice(-1) !== ' ') {
                result += ' ';
            }
            continue;
        }

        result += char;
    }
    return result;
}

function renderInvisibleSpan(code, cls, title) {
    return `<span data-char="&#x${code.toString(16)};" class="invisible-char ${cls}" title="${title}"></span>`;
}

function renderWithInvisibles(text, isMismatch) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const code = char.charCodeAt(0);
        const meta = INVISIBLE_RENDER_META[code];

        if (code === 0x0020 && isMismatch) {
            result += renderInvisibleSpan(code, 'invisible-regular-space', 'Space (U+0020)');
        } else if (meta) {
            result += renderInvisibleSpan(code, meta.cls, meta.title);
        } else if (code >= 0x2000 && code <= 0x200A) {
            result += renderInvisibleSpan(code, 'invisible-space', `Unicode space (U+${code.toString(16).toUpperCase()})`);
        } else {
            result += escapeHtml(char);
        }
    }
    return result;
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DIFF_LIMITS = {
    maxLines: 25000,
    maxChars: 2000000,
    maxLineChars: 100000
};

const MODIFIED_SIMILARITY_THRESHOLD = 0.65;
const SHORT_LINE_SIMILARITY_THRESHOLD = 0.5;
const SHORT_LINE_MAX_UNITS = 32;
const ALIGN_LOOKAHEAD = 4;
let graphemeSegmenter = null;

function validateDiffInput(left, right) {
    if (left.length > DIFF_LIMITS.maxChars || right.length > DIFF_LIMITS.maxChars) {
        return {
            ok: false,
            message: 'Text too large. Maximum ' + DIFF_LIMITS.maxChars.toLocaleString() + ' characters per side supported.'
        };
    }

    const leftLines = left.split('\n');
    const rightLines = right.split('\n');
    const estimatedLines = Math.max(leftLines.length, rightLines.length);
    if (estimatedLines > DIFF_LIMITS.maxLines) {
        return {
            ok: false,
            message: 'File too large. Maximum ' + DIFF_LIMITS.maxLines.toLocaleString() + ' lines supported.'
        };
    }

    for (let i = 0; i < leftLines.length; i++) {
        if (leftLines[i].length > DIFF_LIMITS.maxLineChars) {
            return {
                ok: false,
                message: 'Line too long. Maximum ' + DIFF_LIMITS.maxLineChars.toLocaleString() + ' characters per line supported.'
            };
        }
    }

    for (let i = 0; i < rightLines.length; i++) {
        if (rightLines[i].length > DIFF_LIMITS.maxLineChars) {
            return {
                ok: false,
                message: 'Line too long. Maximum ' + DIFF_LIMITS.maxLineChars.toLocaleString() + ' characters per line supported.'
            };
        }
    }

    return { ok: true, leftLines: leftLines, rightLines: rightLines, estimatedLines: estimatedLines };
}

function splitDiffUnits(text) {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        if (!graphemeSegmenter) {
            graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        }
        return Array.from(graphemeSegmenter.segment(text), function (item) { return item.segment; });
    }

    return Array.from(text);
}

function buildUnitArray(units, matched) {
    const result = [];
    for (let i = 0; i < units.length; i++) {
        result.push({ c: units[i], match: matched.has(i) });
    }
    return result;
}

function computeLCSLengthsRange(left, leftStart, leftEnd, right, rightStart, rightEnd, reverseLeft, reverseRight) {
    const m = leftEnd - leftStart;
    const n = rightEnd - rightStart;
    let prev = new Uint32Array(n + 1);
    let curr = new Uint32Array(n + 1);

    for (let i = 1; i <= m; i++) {
        curr[0] = 0;
        const leftIndex = reverseLeft ? (leftEnd - i) : (leftStart + i - 1);
        const leftValue = left[leftIndex];
        for (let j = 1; j <= n; j++) {
            const rightIndex = reverseRight ? (rightEnd - j) : (rightStart + j - 1);
            if (leftValue === right[rightIndex]) {
                curr[j] = prev[j - 1] + 1;
            } else if (prev[j] > curr[j - 1]) {
                curr[j] = prev[j];
            } else {
                curr[j] = curr[j - 1];
            }
        }
        const tmp = prev;
        prev = curr;
        curr = tmp;
    }
    return prev;
}

function collectLcsPairsHirschberg(left, right, leftStart, leftEnd, rightStart, rightEnd, pairs) {
    const m = leftEnd - leftStart;
    const n = rightEnd - rightStart;
    if (m === 0 || n === 0) return;

    if (m === 1) {
        const leftValue = left[leftStart];
        for (let j = rightStart; j < rightEnd; j++) {
            if (leftValue === right[j]) {
                pairs.push([leftStart, j]);
                return;
            }
        }
        return;
    }

    const midOffset = Math.floor(m / 2);
    const leftMid = leftStart + midOffset;
    const leftLcs = computeLCSLengthsRange(left, leftStart, leftMid, right, rightStart, rightEnd, false, false);
    const rightLcs = computeLCSLengthsRange(left, leftMid, leftEnd, right, rightStart, rightEnd, true, true);

    let maxSum = -1;
    let bestJOffset = 0;
    for (let jOffset = 0; jOffset <= n; jOffset++) {
        const sum = leftLcs[jOffset] + rightLcs[n - jOffset];
        if (sum > maxSum) {
            maxSum = sum;
            bestJOffset = jOffset;
        }
    }

    const rightMid = rightStart + bestJOffset;
    collectLcsPairsHirschberg(left, right, leftStart, leftMid, rightStart, rightMid, pairs);
    collectLcsPairsHirschberg(left, right, leftMid, leftEnd, rightMid, rightEnd, pairs);
}

function computeCharDiff(left, right) {
    const leftUnits = splitDiffUnits(left);
    const rightUnits = splitDiffUnits(right);
    const m = leftUnits.length, n = rightUnits.length;

    let prefix = 0;
    while (prefix < m && prefix < n && leftUnits[prefix] === rightUnits[prefix]) prefix++;

    let suffix = 0;
    while (suffix < m - prefix && suffix < n - prefix
        && leftUnits[m - 1 - suffix] === rightUnits[n - 1 - suffix]) suffix++;

    const leftMatched = new Set();
    const rightMatched = new Set();
    for (let k = 0; k < prefix; k++) {
        leftMatched.add(k);
        rightMatched.add(k);
    }
    for (let k = m - suffix; k < m; k++) leftMatched.add(k);
    for (let k = n - suffix; k < n; k++) rightMatched.add(k);

    const ml = m - prefix - suffix;
    const nl = n - prefix - suffix;
    if (ml === 0 || nl === 0) {
        return {
            left: leftMatched,
            right: rightMatched,
            leftUnits: leftUnits,
            rightUnits: rightUnits
        };
    }

    const leftCore = leftUnits.slice(prefix, m - suffix);
    const rightCore = rightUnits.slice(prefix, n - suffix);

    if (ml * nl > 1000000) {
        const charPairs = [];
        collectLcsPairsHirschberg(leftCore, rightCore, 0, leftCore.length, 0, rightCore.length, charPairs);
        for (const pair of charPairs) {
            leftMatched.add(prefix + pair[0]);
            rightMatched.add(prefix + pair[1]);
        }
    } else {
        const dp = [];
        for (let i = 0; i <= ml; i++) dp[i] = new Uint32Array(nl + 1);

        for (let i = 1; i <= ml; i++) {
            for (let j = 1; j <= nl; j++) {
                if (leftCore[i - 1] === rightCore[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else if (dp[i - 1][j] > dp[i][j - 1]) {
                    dp[i][j] = dp[i - 1][j];
                } else {
                    dp[i][j] = dp[i][j - 1];
                }
            }
        }

        let i = ml, j = nl;
        while (i > 0 && j > 0) {
            if (leftCore[i - 1] === rightCore[j - 1]) {
                leftMatched.add(prefix + i - 1);
                rightMatched.add(prefix + j - 1);
                i--; j--;
            } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
    }

    return {
        left: leftMatched,
        right: rightMatched,
        leftUnits: leftUnits,
        rightUnits: rightUnits
    };
}

function collectLineLcsPairs(leftLines, rightLines, pairs) {
    collectLcsPairsHirschberg(leftLines, rightLines, 0, leftLines.length, 0, rightLines.length, pairs);
}

function getBigrams(text) {
    const map = Object.create(null);
    if (text.length < 2) return { map: map, total: 0 };
    for (let i = 0; i < text.length - 1; i++) {
        const gram = text[i] + text[i + 1];
        map[gram] = (map[gram] || 0) + 1;
    }
    return { map: map, total: text.length - 1 };
}

function boundedEditDistanceSimilarity(leftUnits, rightUnits) {
    const m = leftUnits.length;
    const n = rightUnits.length;
    const maxLen = Math.max(m, n);
    if (maxLen === 0) return 1;

    let prev = new Uint16Array(n + 1);
    let curr = new Uint16Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = leftUnits[i - 1] === rightUnits[j - 1] ? 0 : 1;
            const deletion = prev[j] + 1;
            const insertion = curr[j - 1] + 1;
            const substitution = prev[j - 1] + cost;
            curr[j] = Math.min(deletion, insertion, substitution);
        }
        const tmp = prev;
        prev = curr;
        curr = tmp;
    }

    return 1 - (prev[n] / maxLen);
}

function shortLineSimilarity(leftLine, rightLine) {
    const leftUnits = splitDiffUnits(leftLine);
    const rightUnits = splitDiffUnits(rightLine);
    const maxUnits = Math.max(leftUnits.length, rightUnits.length);
    if (maxUnits > SHORT_LINE_MAX_UNITS) return 0;
    return boundedEditDistanceSimilarity(leftUnits, rightUnits);
}

function modifiedLineScore(leftLine, rightLine) {
    const similarity = lineSimilarity(leftLine, rightLine);
    const shortSimilarity = shortLineSimilarity(leftLine, rightLine);
    return Math.max(similarity, shortSimilarity);
}

function isModifiedLineCandidate(leftLine, rightLine, score) {
    if (score >= MODIFIED_SIMILARITY_THRESHOLD) return true;

    const leftUnits = splitDiffUnits(leftLine);
    const rightUnits = splitDiffUnits(rightLine);
    const maxUnits = Math.max(leftUnits.length, rightUnits.length);
    if (maxUnits > SHORT_LINE_MAX_UNITS) return false;

    return score >= SHORT_LINE_SIMILARITY_THRESHOLD;
}

function lineSimilarity(leftLine, rightLine) {
    if (leftLine === rightLine) return 1;
    if (!leftLine.length || !rightLine.length) return 0;

    const leftLen = leftLine.length;
    const rightLen = rightLine.length;
    const maxLen = Math.max(leftLen, rightLen);
    const minLen = Math.min(leftLen, rightLen);
    const lengthRatio = minLen / maxLen;
    if (lengthRatio < 0.4) return 0;

    let prefix = 0;
    while (prefix < minLen && leftLine[prefix] === rightLine[prefix]) prefix++;

    let suffix = 0;
    while (
        suffix < minLen - prefix
        && leftLine[leftLen - 1 - suffix] === rightLine[rightLen - 1 - suffix]
    ) {
        suffix++;
    }

    const edgeRatio = (prefix + suffix) / maxLen;
    const leftBigrams = getBigrams(leftLine);
    const rightBigrams = getBigrams(rightLine);
    let intersection = 0;
    for (let gram in leftBigrams.map) {
        if (rightBigrams.map[gram]) {
            const leftCount = leftBigrams.map[gram];
            const rightCount = rightBigrams.map[gram];
            intersection += leftCount < rightCount ? leftCount : rightCount;
        }
    }

    const denominator = leftBigrams.total + rightBigrams.total;
    const dice = denominator > 0 ? (2 * intersection) / denominator : 0;
    const weighted = (dice * 0.65) + (edgeRatio * 0.35);
    return weighted * (0.6 + 0.4 * lengthRatio);
}

function appendAlignedRange(leftLines, rightLines, leftStart, leftEnd, rightStart, rightEnd, diff) {
    const leftCount = leftEnd - leftStart;
    const rightCount = rightEnd - rightStart;

    if (leftCount === 0) {
        for (let ri = rightStart; ri < rightEnd; ri++) {
            diff.push({ type: 'added', lineIndex: ri });
        }
        return;
    }

    if (rightCount === 0) {
        for (let li = leftStart; li < leftEnd; li++) {
            diff.push({ type: 'missing', lineIndex: li });
        }
        return;
    }

    let i = leftStart;
    let j = rightStart;
    while (i < leftEnd && j < rightEnd) {
        const s00 = modifiedLineScore(leftLines[i], rightLines[j]);

        let bestRightScore = -1;
        let bestRightSkip = 0;
        for (let rSkip = 1; rSkip <= ALIGN_LOOKAHEAD && j + rSkip < rightEnd; rSkip++) {
            const rScore = modifiedLineScore(leftLines[i], rightLines[j + rSkip]);
            if (rScore > bestRightScore) {
                bestRightScore = rScore;
                bestRightSkip = rSkip;
            }
        }

        let bestLeftScore = -1;
        let bestLeftSkip = 0;
        for (let lSkip = 1; lSkip <= ALIGN_LOOKAHEAD && i + lSkip < leftEnd; lSkip++) {
            const lScore = modifiedLineScore(leftLines[i + lSkip], rightLines[j]);
            if (lScore > bestLeftScore) {
                bestLeftScore = lScore;
                bestLeftSkip = lSkip;
            }
        }

        if (isModifiedLineCandidate(leftLines[i], rightLines[j], s00) && s00 >= bestRightScore && s00 >= bestLeftScore) {
            const charMatched = computeCharDiff(leftLines[i], rightLines[j]);
            diff.push({
                type: 'modified',
                leftLineIndex: i,
                rightLineIndex: j,
                leftChars: buildUnitArray(charMatched.leftUnits, charMatched.left),
                chars: buildUnitArray(charMatched.rightUnits, charMatched.right)
            });
            i++;
            j++;
            continue;
        }

        if (isModifiedLineCandidate(leftLines[i], rightLines[j + bestRightSkip], bestRightScore) && bestRightScore >= bestLeftScore) {
            for (let add = 0; add < bestRightSkip; add++) {
                diff.push({ type: 'added', lineIndex: j });
                j++;
            }
            continue;
        }

        if (isModifiedLineCandidate(leftLines[i + bestLeftSkip], rightLines[j], bestLeftScore)) {
            for (let miss = 0; miss < bestLeftSkip; miss++) {
                diff.push({ type: 'missing', lineIndex: i });
                i++;
            }
            continue;
        }

        const leftRemaining = leftEnd - i;
        const rightRemaining = rightEnd - j;
        if (rightRemaining > leftRemaining) {
            diff.push({ type: 'added', lineIndex: j });
            j++;
        } else if (leftRemaining > rightRemaining) {
            diff.push({ type: 'missing', lineIndex: i });
            i++;
        } else {
            const fallbackSim = modifiedLineScore(leftLines[i], rightLines[j]);
            if (isModifiedLineCandidate(leftLines[i], rightLines[j], fallbackSim)) {
                const charMatchedFallback = computeCharDiff(leftLines[i], rightLines[j]);
                diff.push({
                    type: 'modified',
                    leftLineIndex: i,
                    rightLineIndex: j,
                    leftChars: buildUnitArray(charMatchedFallback.leftUnits, charMatchedFallback.left),
                    chars: buildUnitArray(charMatchedFallback.rightUnits, charMatchedFallback.right)
                });
                i++;
                j++;
            } else {
                diff.push({ type: 'missing', lineIndex: i });
                i++;
                diff.push({ type: 'added', lineIndex: j });
                j++;
            }
        }
    }

    while (i < leftEnd) {
        diff.push({ type: 'missing', lineIndex: i });
        i++;
    }

    while (j < rightEnd) {
        diff.push({ type: 'added', lineIndex: j });
        j++;
    }
}

function computeLineDiff(left, right) {
    const validated = validateDiffInput(left, right);
    if (!validated.ok) {
        throw new Error(validated.message);
    }

    const leftLines = validated.leftLines;
    const rightLines = validated.rightLines;
    const diff = [];
    const pairs = [];

    collectLineLcsPairs(leftLines, rightLines, pairs);

    let leftPos = 0;
    let rightPos = 0;
    for (const pair of pairs) {
        const leftMatch = pair[0];
        const rightMatch = pair[1];

        appendAlignedRange(leftLines, rightLines, leftPos, leftMatch, rightPos, rightMatch, diff);
        diff.push({ type: 'match', leftLineIndex: leftMatch, rightLineIndex: rightMatch });

        leftPos = leftMatch + 1;
        rightPos = rightMatch + 1;
    }

    appendAlignedRange(leftLines, rightLines, leftPos, leftLines.length, rightPos, rightLines.length, diff);

    return { leftLines: leftLines, rightLines: rightLines, diff: diff };
}

function countDifferenceRows(diffResult) {
    let count = 0;
    for (let i = 0; i < diffResult.diff.length; i++) {
        const type = diffResult.diff[i].type;
        if (type === 'added' || type === 'missing' || type === 'modified') {
            count++;
        }
    }
    return count;
}

function itemConsumesLineNumber(item, isRight) {
    return item.type === 'match' || item.type === 'modified'
        || (item.type === 'added' && isRight) || (item.type === 'missing' && !isRight);
}

function getPanelLineNumberAt(diffResult, side, startIdx) {
    let lineNum = 1;
    const isRight = side === 'right';
    for (let i = 0; i < startIdx && i < diffResult.diff.length; i++) {
        if (itemConsumesLineNumber(diffResult.diff[i], isRight)) {
            lineNum++;
        }
    }
    return lineNum;
}

function renderMatchedUnits(units) {
    let html = '';
    let i = 0;
    while (i < units.length) {
        const match = units[i].match;
        let segment = '';
        while (i < units.length && units[i].match === match) {
            segment += units[i].c;
            i++;
        }
        html += `<span class="${match ? 'diff-match' : 'diff-mismatch'}">${renderWithInvisibles(segment, !match)}</span>`;
    }
    return html;
}

function renderPanelEntry(diffResult, item, side, lineNum) {
    const isRight = side === 'right';

    if (item.type === 'match') {
        const line = isRight ? diffResult.rightLines[item.rightLineIndex] : diffResult.leftLines[item.leftLineIndex];
        return {
            html: `<div class="diff-line"><span class="diff-gutter">${lineNum}</span><span class="diff-content${isRight ? ' diff-match' : ''}">${renderWithInvisibles(line)}</span></div>`,
            lineNum: lineNum + 1
        };
    }

    if (item.type === 'modified') {
        const units = isRight ? item.chars : item.leftChars;
        return {
            html: `<div class="diff-line${isRight ? ' diff-line-mismatch' : ''}"><span class="diff-gutter">${lineNum}</span><span class="diff-content">${renderMatchedUnits(units)}</span></div>`,
            lineNum: lineNum + 1
        };
    }

    if (item.type === 'added') {
        if (!isRight) {
            return {
                html: '<div class="diff-line"><span class="diff-gutter"></span><span class="diff-content"></span></div>',
                lineNum: lineNum
            };
        }

        const addedLine = diffResult.rightLines[item.lineIndex];
        return {
            html: `<div class="diff-line diff-line-mismatch"><span class="diff-gutter">${lineNum}</span><span class="diff-content"><span class="diff-mismatch">${renderWithInvisibles(addedLine, true)}</span></span></div>`,
            lineNum: lineNum + 1
        };
    }

    if (item.type === 'missing') {
        if (isRight) {
            return {
                html: '<div class="diff-line diff-line-missing"><span class="diff-gutter"></span><span class="diff-content"></span></div>',
                lineNum: lineNum
            };
        }

        const missingLine = diffResult.leftLines[item.lineIndex];
        return {
            html: `<div class="diff-line"><span class="diff-gutter">${lineNum}</span><span class="diff-content">${renderWithInvisibles(missingLine)}</span></div>`,
            lineNum: lineNum + 1
        };
    }

    return { html: '', lineNum: lineNum };
}

function buildPanelHtmlRange(diffResult, side, startIdx, endIdx) {
    let html = '';
    let lineNum = getPanelLineNumberAt(diffResult, side, startIdx);
    const safeEnd = Math.min(endIdx, diffResult.diff.length);

    for (let i = startIdx; i < safeEnd; i++) {
        const rendered = renderPanelEntry(diffResult, diffResult.diff[i], side, lineNum);
        html += rendered.html;
        lineNum = rendered.lineNum;
    }

    return { html: html, endIdx: safeEnd };
}

function buildPanelHtml(diffResult, side) {
    return buildPanelHtmlRange(diffResult, side, 0, diffResult.diff.length).html;
}
