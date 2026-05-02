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

const CONFUSABLE_RENDER_META = {
    0x0391: { cls: 'confusable-greek-alpha-cap', title: 'Greek capital alpha (U+0391), looks like Latin A' },
    0x0392: { cls: 'confusable-greek-beta-cap', title: 'Greek capital beta (U+0392), looks like Latin B' },
    0x0395: { cls: 'confusable-greek-epsilon-cap', title: 'Greek capital epsilon (U+0395), looks like Latin E' },
    0x0396: { cls: 'confusable-greek-zeta-cap', title: 'Greek capital zeta (U+0396), looks like Latin Z' },
    0x0397: { cls: 'confusable-greek-eta-cap', title: 'Greek capital eta (U+0397), looks like Latin H' },
    0x0399: { cls: 'confusable-greek-iota-cap', title: 'Greek capital iota (U+0399), looks like Latin I' },
    0x039A: { cls: 'confusable-greek-kappa-cap', title: 'Greek capital kappa (U+039A), looks like Latin K' },
    0x039C: { cls: 'confusable-greek-mu-cap', title: 'Greek capital mu (U+039C), looks like Latin M' },
    0x039D: { cls: 'confusable-greek-nu-cap', title: 'Greek capital nu (U+039D), looks like Latin N' },
    0x039F: { cls: 'confusable-greek-omicron-cap', title: 'Greek capital omicron (U+039F), looks like Latin O' },
    0x03A1: { cls: 'confusable-greek-rho-cap', title: 'Greek capital rho (U+03A1), looks like Latin P' },
    0x03A4: { cls: 'confusable-greek-tau-cap', title: 'Greek capital tau (U+03A4), looks like Latin T' },
    0x03A7: { cls: 'confusable-greek-chi-cap', title: 'Greek capital chi (U+03A7), looks like Latin X' },
    0x03BF: { cls: 'confusable-greek-omicron', title: 'Greek small omicron (U+03BF), looks like Latin o' },
    0x03C1: { cls: 'confusable-greek-rho', title: 'Greek small rho (U+03C1), looks like Latin p' },
    0x03C7: { cls: 'confusable-greek-chi', title: 'Greek small chi (U+03C7), looks like Latin x' },
    0x0406: { cls: 'confusable-cyrillic-i-cap', title: 'Cyrillic capital byelorussian-ukrainian i (U+0406), looks like Latin I' },
    0x0410: { cls: 'confusable-cyrillic-a-cap', title: 'Cyrillic capital a (U+0410), looks like Latin A' },
    0x0412: { cls: 'confusable-cyrillic-ve-cap', title: 'Cyrillic capital ve (U+0412), looks like Latin B' },
    0x0415: { cls: 'confusable-cyrillic-ie-cap', title: 'Cyrillic capital ie (U+0415), looks like Latin E' },
    0x041A: { cls: 'confusable-cyrillic-ka-cap', title: 'Cyrillic capital ka (U+041A), looks like Latin K' },
    0x041C: { cls: 'confusable-cyrillic-em-cap', title: 'Cyrillic capital em (U+041C), looks like Latin M' },
    0x041D: { cls: 'confusable-cyrillic-en-cap', title: 'Cyrillic capital en (U+041D), looks like Latin H' },
    0x041E: { cls: 'confusable-cyrillic-o-cap', title: 'Cyrillic capital o (U+041E), looks like Latin O' },
    0x0420: { cls: 'confusable-cyrillic-er-cap', title: 'Cyrillic capital er (U+0420), looks like Latin P' },
    0x0421: { cls: 'confusable-cyrillic-es-cap', title: 'Cyrillic capital es (U+0421), looks like Latin C' },
    0x0422: { cls: 'confusable-cyrillic-te-cap', title: 'Cyrillic capital te (U+0422), looks like Latin T' },
    0x0425: { cls: 'confusable-cyrillic-ha-cap', title: 'Cyrillic capital ha (U+0425), looks like Latin X' },
    0x0430: { cls: 'confusable-cyrillic-a', title: 'Cyrillic small a (U+0430), looks like Latin a' },
    0x0435: { cls: 'confusable-cyrillic-ie', title: 'Cyrillic small ie (U+0435), looks like Latin e' },
    0x043E: { cls: 'confusable-cyrillic-o', title: 'Cyrillic small o (U+043E), looks like Latin o' },
    0x0440: { cls: 'confusable-cyrillic-er', title: 'Cyrillic small er (U+0440), looks like Latin p' },
    0x0441: { cls: 'confusable-cyrillic-es', title: 'Cyrillic small es (U+0441), looks like Latin c' },
    0x0445: { cls: 'confusable-cyrillic-ha', title: 'Cyrillic small ha (U+0445), looks like Latin x' },
    0x0456: { cls: 'confusable-cyrillic-i', title: 'Cyrillic small byelorussian-ukrainian i (U+0456), looks like Latin i' },
    0x04CF: { cls: 'confusable-cyrillic-palochka', title: 'Cyrillic small palochka (U+04CF), looks like Latin l' }
};

const CONFUSABLE_BASE_CHARS = {
    0x0391: 'A', 0x0392: 'B', 0x0395: 'E', 0x0396: 'Z',
    0x0397: 'H', 0x0399: 'I', 0x039A: 'K', 0x039C: 'M',
    0x039D: 'N', 0x039F: 'O', 0x03A1: 'P', 0x03A4: 'T',
    0x03A7: 'X', 0x03BF: 'o', 0x03C1: 'p', 0x03C7: 'x',
    0x0406: 'I', 0x0410: 'A', 0x0412: 'B', 0x0415: 'E',
    0x041A: 'K', 0x041C: 'M', 0x041D: 'H', 0x041E: 'O',
    0x0420: 'P', 0x0421: 'C', 0x0422: 'T', 0x0425: 'X',
    0x0430: 'a', 0x0435: 'e', 0x043E: 'o', 0x0440: 'p',
    0x0441: 'c', 0x0445: 'x', 0x0456: 'i', 0x04CF: 'l'
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

function isConfusableCode(code) {
    return !!CONFUSABLE_RENDER_META[code];
}

function hasConfusableCharacters(text) {
    for (const char of text) {
        if (isConfusableCode(char.codePointAt(0))) {
            return true;
        }
    }
    return false;
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

function renderConfusableSpan(char, code, cls, title) {
    return `<span data-char="&#x${code.toString(16)};" class="confusable-char ${cls}" title="${escapeAttribute(title)}">${escapeHtml(char)}</span>`;
}

function renderWithInvisibles(text, isMismatch) {
    let result = '';
    for (const char of text) {
        const code = char.codePointAt(0);
        const meta = INVISIBLE_RENDER_META[code];
        const confusableMeta = CONFUSABLE_RENDER_META[code];

        if (code === 0x0020 && isMismatch) {
            result += renderInvisibleSpan(code, 'invisible-regular-space', 'Space (U+0020)');
        } else if (meta) {
            result += renderInvisibleSpan(code, meta.cls, meta.title);
        } else if (code >= 0x2000 && code <= 0x200A) {
            result += renderInvisibleSpan(code, 'invisible-space', `Unicode space (U+${code.toString(16).toUpperCase()})`);
        } else if (confusableMeta) {
            result += renderConfusableSpan(char, code, confusableMeta.cls, confusableMeta.title);
        } else {
            result += escapeHtml(char);
        }
    }
    return result;
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
}

const DIFF_LIMITS = {
    maxLines: 25000,
    maxChars: 2000000,
    maxLineChars: 100000,
    maxLineEditDistance: 12000,
    maxCharEditDistance: 12000,
    maxMyersCells: 80000000
};

const MODIFIED_SIMILARITY_THRESHOLD = 0.65;
const SHORT_LINE_SIMILARITY_THRESHOLD = 0.5;
const SHORT_LINE_MAX_UNITS = 32;
const ALIGN_LOOKAHEAD = 4;
const MYERS_TRACE_MAX_ITEMS = 512;
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

    const lineEditLowerBound = estimateEditDistanceLowerBound(leftLines, rightLines);
    if (lineEditLowerBound > DIFF_LIMITS.maxLineEditDistance) {
        return {
            ok: false,
            message: 'These texts are too different to compare safely in your browser. Try smaller sections or more similar files.'
        };
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

function buildVisualSkeletonUnits(units) {
    const result = [];
    for (let i = 0; i < units.length; i++) {
        if (units[i].length === 1) {
            const code = units[i].codePointAt(0);
            result.push(CONFUSABLE_BASE_CHARS[code] || units[i]);
        } else {
            result.push(units[i]);
        }
    }
    return result;
}

function estimateEditDistanceLowerBound(leftItems, rightItems) {
    const counts = Object.create(null);
    for (let i = 0; i < leftItems.length; i++) {
        const key = '$' + leftItems[i];
        counts[key] = (counts[key] || 0) + 1;
    }

    let sharedUpperBound = 0;
    for (let j = 0; j < rightItems.length; j++) {
        const key = '$' + rightItems[j];
        if (counts[key] > 0) {
            counts[key]--;
            sharedUpperBound++;
        }
    }

    return leftItems.length + rightItems.length - (2 * sharedUpperBound);
}

function mergeMyersRanges(ranges) {
    if (!ranges.length) return ranges;

    const merged = [];
    for (let i = 0; i < ranges.length; i++) {
        const current = ranges[i];
        if (current.leftStart === current.leftEnd && current.rightStart === current.rightEnd) {
            continue;
        }

        const previous = merged[merged.length - 1];
        if (previous && previous.type === current.type
            && previous.leftEnd === current.leftStart && previous.rightEnd === current.rightStart) {
            previous.leftEnd = current.leftEnd;
            previous.rightEnd = current.rightEnd;
        } else {
            merged.push({
                type: current.type,
                leftStart: current.leftStart,
                leftEnd: current.leftEnd,
                rightStart: current.rightStart,
                rightEnd: current.rightEnd
            });
        }
    }

    return merged;
}

function atomicOpsToRanges(ops, leftOffset, rightOffset) {
    const ranges = [];
    let leftPos = leftOffset;
    let rightPos = rightOffset;

    for (let i = 0; i < ops.length; i++) {
        const type = ops[i];
        if (type === 'equal') {
            ranges.push({
                type: 'equal',
                leftStart: leftPos,
                leftEnd: leftPos + 1,
                rightStart: rightPos,
                rightEnd: rightPos + 1
            });
            leftPos++;
            rightPos++;
        } else if (type === 'delete') {
            ranges.push({
                type: 'delete',
                leftStart: leftPos,
                leftEnd: leftPos + 1,
                rightStart: rightPos,
                rightEnd: rightPos
            });
            leftPos++;
        } else {
            ranges.push({
                type: 'insert',
                leftStart: leftPos,
                leftEnd: leftPos,
                rightStart: rightPos,
                rightEnd: rightPos + 1
            });
            rightPos++;
        }
    }

    return mergeMyersRanges(ranges);
}

function buildMyersTraceRanges(left, right, leftStart, leftEnd, rightStart, rightEnd, maxEditDistance) {
    const n = leftEnd - leftStart;
    const m = rightEnd - rightStart;
    const max = Math.min(n + m, maxEditDistance);

    const offset = max + 1;
    let v = new Int32Array((2 * max) + 3);
    v.fill(-1);
    v[offset + 1] = 0;
    const trace = [];

    for (let d = 0; d <= max; d++) {
        for (let k = -d; k <= d; k += 2) {
            const kOffset = offset + k;
            let x;
            if (k === -d || (k !== d && v[kOffset - 1] < v[kOffset + 1])) {
                x = v[kOffset + 1];
            } else {
                x = v[kOffset - 1] + 1;
            }

            let y = x - k;
            while (x < n && y < m && left[leftStart + x] === right[rightStart + y]) {
                x++;
                y++;
            }

            v[kOffset] = x;
            if (x >= n && y >= m) {
                trace.push(v.slice());
                return backtrackMyersTrace(trace, n, m, offset, leftStart, rightStart);
            }
        }

        trace.push(v.slice());
    }

    throw new Error('These texts are too different to compare safely in your browser. Try smaller sections or more similar files.');
}

function backtrackMyersTrace(trace, n, m, offset, leftOffset, rightOffset) {
    let x = n;
    let y = m;
    const reversedOps = [];

    for (let d = trace.length - 1; d > 0; d--) {
        const vPrev = trace[d - 1];
        const k = x - y;
        let prevK;
        if (k === -d || (k !== d && vPrev[offset + k - 1] < vPrev[offset + k + 1])) {
            prevK = k + 1;
        } else {
            prevK = k - 1;
        }

        const prevX = vPrev[offset + prevK];
        const prevY = prevX - prevK;

        while (x > prevX && y > prevY) {
            reversedOps.push('equal');
            x--;
            y--;
        }

        if (x === prevX) {
            reversedOps.push('insert');
            y--;
        } else {
            reversedOps.push('delete');
            x--;
        }
    }

    while (x > 0 && y > 0) {
        reversedOps.push('equal');
        x--;
        y--;
    }

    return atomicOpsToRanges(reversedOps.reverse(), leftOffset, rightOffset);
}

function findMyersSplit(left, right, leftStart, leftEnd, rightStart, rightEnd, maxEditDistance) {
    const n = leftEnd - leftStart;
    const m = rightEnd - rightStart;
    const max = Math.ceil((n + m) / 2);
    const vOffset = max + 1;
    const vLength = (2 * max) + 3;
    const vForward = new Int32Array(vLength);
    const vReverse = new Int32Array(vLength);
    vForward.fill(-1);
    vReverse.fill(-1);
    vForward[vOffset + 1] = 0;
    vReverse[vOffset + 1] = 0;

    const delta = n - m;
    const oddDelta = (delta % 2) !== 0;
    let steps = 0;

    for (let d = 0; d <= max; d++) {
        if (d * 2 > maxEditDistance) {
            throw new Error('These texts are too different to compare safely in your browser. Try smaller sections or more similar files.');
        }

        for (let k = -d; k <= d; k += 2) {
            steps++;
            if (steps > DIFF_LIMITS.maxMyersCells) {
                throw new Error('Comparison is too complex for a safe browser-side diff. Try smaller sections.');
            }

            const kOffset = vOffset + k;
            let x;
            if (k === -d || (k !== d && vForward[kOffset - 1] < vForward[kOffset + 1])) {
                x = vForward[kOffset + 1];
            } else {
                x = vForward[kOffset - 1] + 1;
            }

            let y = x - k;
            while (x < n && y < m && left[leftStart + x] === right[rightStart + y]) {
                x++;
                y++;
            }

            vForward[kOffset] = x;

            if (oddDelta) {
                const reverseK = delta - k;
                const reverseOffset = vOffset + reverseK;
                if (reverseOffset >= 0 && reverseOffset < vLength && vReverse[reverseOffset] !== -1
                    && x + vReverse[reverseOffset] >= n) {
                    return { leftMid: leftStart + x, rightMid: rightStart + y };
                }
            }
        }

        for (let k = -d; k <= d; k += 2) {
            steps++;
            if (steps > DIFF_LIMITS.maxMyersCells) {
                throw new Error('Comparison is too complex for a safe browser-side diff. Try smaller sections.');
            }

            const kOffset = vOffset + k;
            let x;
            if (k === -d || (k !== d && vReverse[kOffset - 1] < vReverse[kOffset + 1])) {
                x = vReverse[kOffset + 1];
            } else {
                x = vReverse[kOffset - 1] + 1;
            }

            let y = x - k;
            while (x < n && y < m && left[leftEnd - x - 1] === right[rightEnd - y - 1]) {
                x++;
                y++;
            }

            vReverse[kOffset] = x;

            if (!oddDelta) {
                const forwardK = delta - k;
                const forwardOffset = vOffset + forwardK;
                if (forwardOffset >= 0 && forwardOffset < vLength && vForward[forwardOffset] !== -1
                    && vForward[forwardOffset] + x >= n) {
                    return { leftMid: leftEnd - x, rightMid: rightEnd - y };
                }
            }
        }
    }

    return null;
}

function computeMyersRanges(left, right, options) {
    const maxEditDistance = options && options.maxEditDistance ? options.maxEditDistance : DIFF_LIMITS.maxLineEditDistance;
    const stack = [{ leftStart: 0, leftEnd: left.length, rightStart: 0, rightEnd: right.length }];
    const output = [];

    while (stack.length) {
        const frame = stack.pop();
        let leftStart = frame.leftStart;
        let leftEnd = frame.leftEnd;
        let rightStart = frame.rightStart;
        let rightEnd = frame.rightEnd;

        let prefix = 0;
        while (leftStart + prefix < leftEnd && rightStart + prefix < rightEnd
            && left[leftStart + prefix] === right[rightStart + prefix]) {
            prefix++;
        }

        if (prefix) {
            output.push({
                type: 'equal',
                leftStart: leftStart,
                leftEnd: leftStart + prefix,
                rightStart: rightStart,
                rightEnd: rightStart + prefix
            });
            leftStart += prefix;
            rightStart += prefix;
        }

        let suffix = 0;
        while (leftStart + suffix < leftEnd && rightStart + suffix < rightEnd
            && left[leftEnd - suffix - 1] === right[rightEnd - suffix - 1]) {
            suffix++;
        }

        const suffixRange = suffix ? {
            type: 'equal',
            leftStart: leftEnd - suffix,
            leftEnd: leftEnd,
            rightStart: rightEnd - suffix,
            rightEnd: rightEnd
        } : null;

        leftEnd -= suffix;
        rightEnd -= suffix;

        if (leftStart === leftEnd && rightStart === rightEnd) {
            if (suffixRange) output.push(suffixRange);
            continue;
        }

        if (leftStart === leftEnd) {
            output.push({
                type: 'insert',
                leftStart: leftStart,
                leftEnd: leftStart,
                rightStart: rightStart,
                rightEnd: rightEnd
            });
            if (suffixRange) output.push(suffixRange);
            continue;
        }

        if (rightStart === rightEnd) {
            output.push({
                type: 'delete',
                leftStart: leftStart,
                leftEnd: leftEnd,
                rightStart: rightStart,
                rightEnd: rightStart
            });
            if (suffixRange) output.push(suffixRange);
            continue;
        }

        const leftLength = leftEnd - leftStart;
        const rightLength = rightEnd - rightStart;
        const lowerBound = estimateEditDistanceLowerBound(
            left.slice(leftStart, leftEnd),
            right.slice(rightStart, rightEnd)
        );
        if (lowerBound > maxEditDistance) {
            throw new Error('These texts are too different to compare safely in your browser. Try smaller sections or more similar files.');
        }

        if (leftLength + rightLength <= MYERS_TRACE_MAX_ITEMS) {
            output.push.apply(output, buildMyersTraceRanges(left, right, leftStart, leftEnd, rightStart, rightEnd, maxEditDistance));
            if (suffixRange) output.push(suffixRange);
            continue;
        }

        const split = findMyersSplit(left, right, leftStart, leftEnd, rightStart, rightEnd, maxEditDistance);
        if (!split
            || (split.leftMid === leftStart && split.rightMid === rightStart)
            || (split.leftMid === leftEnd && split.rightMid === rightEnd)) {
            if (leftLength + rightLength <= MYERS_TRACE_MAX_ITEMS) {
                output.push.apply(output, buildMyersTraceRanges(left, right, leftStart, leftEnd, rightStart, rightEnd, maxEditDistance));
                if (suffixRange) output.push(suffixRange);
                continue;
            }
            throw new Error('Comparison is too complex for a safe browser-side diff. Try smaller sections.');
        }

        if (suffixRange) {
            stack.push({
                leftStart: suffixRange.leftStart,
                leftEnd: suffixRange.leftEnd,
                rightStart: suffixRange.rightStart,
                rightEnd: suffixRange.rightEnd
            });
        }
        stack.push({ leftStart: split.leftMid, leftEnd: leftEnd, rightStart: split.rightMid, rightEnd: rightEnd });
        stack.push({ leftStart: leftStart, leftEnd: split.leftMid, rightStart: rightStart, rightEnd: split.rightMid });
    }

    return mergeMyersRanges(output);
}

function computeCharDiff(left, right) {
    const leftUnits = splitDiffUnits(left);
    const rightUnits = splitDiffUnits(right);
    const leftMatched = new Set();
    const rightMatched = new Set();

    const ranges = computeMyersRanges(leftUnits, rightUnits, {
        maxEditDistance: DIFF_LIMITS.maxCharEditDistance
    });
    for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        if (range.type !== 'equal') continue;
        const length = range.leftEnd - range.leftStart;
        for (let j = 0; j < length; j++) {
            leftMatched.add(range.leftStart + j);
            rightMatched.add(range.rightStart + j);
        }
    }

    return {
        left: leftMatched,
        right: rightMatched,
        leftUnits: leftUnits,
        rightUnits: rightUnits
    };
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

    const directSimilarity = boundedEditDistanceSimilarity(leftUnits, rightUnits);
    const visualSimilarity = boundedEditDistanceSimilarity(
        buildVisualSkeletonUnits(leftUnits),
        buildVisualSkeletonUnits(rightUnits)
    );
    return Math.max(directSimilarity, visualSimilarity);
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

function appendMyersRanges(leftLines, rightLines, ranges, diff) {
    let pendingLeftStart = null;
    let pendingLeftEnd = null;
    let pendingRightStart = null;
    let pendingRightEnd = null;

    function ensurePending(leftIndex, rightIndex) {
        if (pendingLeftStart === null) {
            pendingLeftStart = leftIndex;
            pendingLeftEnd = leftIndex;
            pendingRightStart = rightIndex;
            pendingRightEnd = rightIndex;
        }
    }

    function flushPending() {
        if (pendingLeftStart === null) return;
        appendAlignedRange(leftLines, rightLines, pendingLeftStart, pendingLeftEnd, pendingRightStart, pendingRightEnd, diff);
        pendingLeftStart = null;
        pendingLeftEnd = null;
        pendingRightStart = null;
        pendingRightEnd = null;
    }

    for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        if (range.type === 'equal') {
            flushPending();
            const length = range.leftEnd - range.leftStart;
            for (let j = 0; j < length; j++) {
                diff.push({
                    type: 'match',
                    leftLineIndex: range.leftStart + j,
                    rightLineIndex: range.rightStart + j
                });
            }
        } else if (range.type === 'delete') {
            ensurePending(range.leftStart, range.rightStart);
            pendingLeftEnd = range.leftEnd;
        } else if (range.type === 'insert') {
            ensurePending(range.leftStart, range.rightStart);
            pendingRightEnd = range.rightEnd;
        }
    }

    flushPending();
}

function computeLineDiff(left, right) {
    const validated = validateDiffInput(left, right);
    if (!validated.ok) {
        throw new Error(validated.message);
    }

    const leftLines = validated.leftLines;
    const rightLines = validated.rightLines;
    const diff = [];
    const ranges = computeMyersRanges(leftLines, rightLines, {
        maxEditDistance: DIFF_LIMITS.maxLineEditDistance
    });
    appendMyersRanges(leftLines, rightLines, ranges, diff);

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
