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

function buildCharArray(text, matched) {
    const result = [];
    for (let i = 0; i < text.length; i++) {
        result.push({ c: text[i], match: matched.has(i) });
    }
    return result;
}

const MODIFIED_SIMILARITY_THRESHOLD = 0.65;
const ALIGN_LOOKAHEAD = 4;

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
    const m = left.length, n = right.length;

    let prefix = 0;
    while (prefix < m && prefix < n && left[prefix] === right[prefix]) prefix++;

    let suffix = 0;
    while (suffix < m - prefix && suffix < n - prefix
        && left[m - 1 - suffix] === right[n - 1 - suffix]) suffix++;

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
    if (ml === 0 || nl === 0) return { left: leftMatched, right: rightMatched };

    const leftCore = left.slice(prefix, m - suffix);
    const rightCore = right.slice(prefix, n - suffix);

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

    return { left: leftMatched, right: rightMatched };
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
        const s00 = lineSimilarity(leftLines[i], rightLines[j]);

        let bestRightScore = -1;
        let bestRightSkip = 0;
        for (let rSkip = 1; rSkip <= ALIGN_LOOKAHEAD && j + rSkip < rightEnd; rSkip++) {
            const rScore = lineSimilarity(leftLines[i], rightLines[j + rSkip]);
            if (rScore > bestRightScore) {
                bestRightScore = rScore;
                bestRightSkip = rSkip;
            }
        }

        let bestLeftScore = -1;
        let bestLeftSkip = 0;
        for (let lSkip = 1; lSkip <= ALIGN_LOOKAHEAD && i + lSkip < leftEnd; lSkip++) {
            const lScore = lineSimilarity(leftLines[i + lSkip], rightLines[j]);
            if (lScore > bestLeftScore) {
                bestLeftScore = lScore;
                bestLeftSkip = lSkip;
            }
        }

        if (s00 >= MODIFIED_SIMILARITY_THRESHOLD && s00 >= bestRightScore && s00 >= bestLeftScore) {
            const charMatched = computeCharDiff(leftLines[i], rightLines[j]);
            diff.push({
                type: 'modified',
                leftLineIndex: i,
                rightLineIndex: j,
                leftChars: buildCharArray(leftLines[i], charMatched.left),
                chars: buildCharArray(rightLines[j], charMatched.right)
            });
            i++;
            j++;
            continue;
        }

        if (bestRightScore >= MODIFIED_SIMILARITY_THRESHOLD && bestRightScore >= bestLeftScore) {
            for (let add = 0; add < bestRightSkip; add++) {
                diff.push({ type: 'added', lineIndex: j });
                j++;
            }
            continue;
        }

        if (bestLeftScore >= MODIFIED_SIMILARITY_THRESHOLD) {
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
            const fallbackSim = lineSimilarity(leftLines[i], rightLines[j]);
            if (fallbackSim >= MODIFIED_SIMILARITY_THRESHOLD) {
                const charMatchedFallback = computeCharDiff(leftLines[i], rightLines[j]);
                diff.push({
                    type: 'modified',
                    leftLineIndex: i,
                    rightLineIndex: j,
                    leftChars: buildCharArray(leftLines[i], charMatchedFallback.left),
                    chars: buildCharArray(rightLines[j], charMatchedFallback.right)
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
    const leftTrailing = left.endsWith('\n');
    const rightTrailing = right.endsWith('\n');
    const leftLines = (leftTrailing ? left.slice(0, -1) : left).split('\n');
    const rightLines = (rightTrailing ? right.slice(0, -1) : right).split('\n');
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

function buildPanelHtml(diffResult, side, startIdx, endIdx, startLineNum) {
    let html = '';
    const isRight = side === 'right';
    const from = startIdx || 0;
    const to = endIdx != null ? Math.min(endIdx, diffResult.diff.length) : diffResult.diff.length;
    let lineNum = startLineNum || 1;

    for (let i = from; i < to; i++) {
        const item = diffResult.diff[i];

        if (item.type === 'match') {
            const line = isRight ? diffResult.rightLines[item.rightLineIndex] : diffResult.leftLines[item.leftLineIndex];
            html += `<div class="diff-line"><span class="diff-gutter">${lineNum}</span><span class="diff-content${isRight ? ' diff-match' : ''}">${renderWithInvisibles(line)}</span></div>`;
            lineNum++;
        } else if (item.type === 'modified') {
            html += `<div class="diff-line${isRight ? ' diff-line-mismatch' : ''}"><span class="diff-gutter">${lineNum}</span><span class="diff-content">`;
            if (isRight) {
                let j = 0;
                while (j < item.chars.length) {
                    const match = item.chars[j].match;
                    let segment = '';
                    while (j < item.chars.length && item.chars[j].match === match) {
                        segment += item.chars[j].c;
                        j++;
                    }
                    html += `<span class="${match ? 'diff-match' : 'diff-mismatch'}">${renderWithInvisibles(segment, !match)}</span>`;
                }
            } else {
                let lj = 0;
                while (lj < item.leftChars.length) {
                    const lmatch = item.leftChars[lj].match;
                    let lsegment = '';
                    while (lj < item.leftChars.length && item.leftChars[lj].match === lmatch) {
                        lsegment += item.leftChars[lj].c;
                        lj++;
                    }
                    html += `<span class="${lmatch ? 'diff-match' : 'diff-mismatch'}">${renderWithInvisibles(lsegment, !lmatch)}</span>`;
                }
            }
            html += '</span></div>';
            lineNum++;
        } else if (item.type === 'added') {
            if (isRight) {
                const addedLine = diffResult.rightLines[item.lineIndex];
                html += `<div class="diff-line diff-line-mismatch"><span class="diff-gutter">${lineNum}</span><span class="diff-content"><span class="diff-mismatch">${renderWithInvisibles(addedLine, true)}</span></span></div>`;
                lineNum++;
            } else {
                html += '<div class="diff-line"><span class="diff-gutter"></span><span class="diff-content"></span></div>';
            }
        } else if (item.type === 'missing') {
            if (isRight) {
                html += '<div class="diff-line diff-line-missing"><span class="diff-gutter"></span><span class="diff-content"></span></div>';
            } else {
                const missingLine = diffResult.leftLines[item.lineIndex];
                html += `<div class="diff-line"><span class="diff-gutter">${lineNum}</span><span class="diff-content">${renderWithInvisibles(missingLine)}</span></div>`;
                lineNum++;
            }
        }
    }

    return { html: html, endIdx: to, lineNum: lineNum };
}
