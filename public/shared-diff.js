// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

(function (root) {
    'use strict';

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
    return !!CONFUSABLE_BASE_CHARS[code];
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

const DIFF_LIMITS = {
    maxLines: 25000,
    maxChars: 2000000,
    maxLineChars: 100000,
    maxCharEditDistance: 12000,
    maxMyersCells: 80000000
};

const DIFF_WORK_BUDGET_DEFAULTS = {
    remainingMyersSteps: 40000000,
    remainingAlignmentCells: 2000000,
    remainingAlignmentScoreWork: 32000000,
    remainingCharEditDistance: 50000,
    remainingRangePairs: 200000
};

const DIFF_MODEL_LIMITS = {
    maxRangePairsPerRow: 4096,
    maxRangePairsTotal: 200000
};

const SYNC_DIFF_LIMITS = {
    maxCost: 65536,
    maxTotalChars: 32768,
    maxLinesPerSide: 200,
    maxLineChars: 16384,
    maxSpanRiskChars: 1024,
    lineWeight: 16,
    lineEditWeight: 256,
    spanRiskWeight: 64
};

const MODIFIED_SIMILARITY_THRESHOLD = 0.65;
const SHORT_LINE_SIMILARITY_THRESHOLD = 0.5;
const SHORT_LINE_MAX_UNITS = 32;
const CONTAINED_LINE_MIN_HEAD = 4;
const CONTAINED_LINE_MAX_ADDED = 160;
const POSITION_BLIND_SCORE_SLOPE = 0.25;
const POSITION_BLIND_MAX_LENGTH = 512;
const ALIGN_SCORE_SCALE = 1000000;
const ALIGN_FULL_MAX_CELLS = 262144;
const ALIGN_BAND_MAX_CELLS = 1000000;
const ALIGN_SCORE_WORK_MAX = 32000000;
const ALIGN_PREFERRED_BAND = 64;
const ALIGN_ACTION_NONE = 0;
const ALIGN_ACTION_PAIR = 1;
const ALIGN_ACTION_MISSING = 2;
const ALIGN_ACTION_ADDED = 3;
const MYERS_TRACE_MAX_ITEMS = 512;
const LINE_SPLIT_MAX_COST = 256;
const LINE_EXACT_MYERS_STEPS = 12000000;
const MOVED_BLOCK_MIN_WEIGHT = 20;
const MOVED_BLOCK_MAX_CANDIDATES = 32;
const MOVED_BLOCK_MAX_WORK = 4000000;
const MOVED_EDIT_MAX_WORK = 4000000;
let graphemeSegmenter = null;

function finiteBudgetValue(overrides, key, fallback) {
    if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, key)) {
        return fallback;
    }

    const value = overrides[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.max(0, Math.floor(value));
}

function createDiffWorkBudget(overrides) {
    return {
        remainingMyersSteps: finiteBudgetValue(
            overrides,
            'remainingMyersSteps',
            DIFF_WORK_BUDGET_DEFAULTS.remainingMyersSteps
        ),
        remainingAlignmentCells: finiteBudgetValue(
            overrides,
            'remainingAlignmentCells',
            DIFF_WORK_BUDGET_DEFAULTS.remainingAlignmentCells
        ),
        remainingAlignmentScoreWork: finiteBudgetValue(
            overrides,
            'remainingAlignmentScoreWork',
            DIFF_WORK_BUDGET_DEFAULTS.remainingAlignmentScoreWork
        ),
        remainingCharEditDistance: finiteBudgetValue(
            overrides,
            'remainingCharEditDistance',
            DIFF_WORK_BUDGET_DEFAULTS.remainingCharEditDistance
        ),
        remainingRangePairs: finiteBudgetValue(
            overrides,
            'remainingRangePairs',
            DIFF_WORK_BUDGET_DEFAULTS.remainingRangePairs
        )
    };
}

function scanDiffSide(text) {
    let lineCount = 1;
    let lineChars = 0;
    let maxLineChars = 0;
    let spanRiskChars = 0;

    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code === 0x000A) {
            if (lineChars > maxLineChars) maxLineChars = lineChars;
            lineChars = 0;
            lineCount++;
            continue;
        }

        lineChars++;
        if (code === 0x0020) {
            spanRiskChars++;
        } else if (code > 0x007F && (isInvisibleCode(code) || isConfusableCode(code))) {
            spanRiskChars++;
        }
    }

    if (lineChars > maxLineChars) maxLineChars = lineChars;
    return {
        chars: text.length,
        lines: lineCount,
        maxLineChars: maxLineChars,
        spanRiskChars: spanRiskChars
    };
}

function scanDiffInput(left, right) {
    const leftScan = scanDiffSide(left);
    const rightScan = scanDiffSide(right);
    return {
        leftChars: leftScan.chars,
        rightChars: rightScan.chars,
        totalChars: leftScan.chars + rightScan.chars,
        leftLines: leftScan.lines,
        rightLines: rightScan.lines,
        totalLines: leftScan.lines + rightScan.lines,
        maxLineChars: Math.max(leftScan.maxLineChars, rightScan.maxLineChars),
        spanRiskChars: leftScan.spanRiskChars + rightScan.spanRiskChars
    };
}

function validateScannedDiffInput(scan) {
    if (scan.leftChars > DIFF_LIMITS.maxChars || scan.rightChars > DIFF_LIMITS.maxChars) {
        return {
            ok: false,
            message: 'Text too large. Maximum ' + DIFF_LIMITS.maxChars.toLocaleString() + ' characters per side supported.'
        };
    }

    if (Math.max(scan.leftLines, scan.rightLines) > DIFF_LIMITS.maxLines) {
        return {
            ok: false,
            message: 'File too large. Maximum ' + DIFF_LIMITS.maxLines.toLocaleString() + ' lines supported.'
        };
    }

    if (scan.maxLineChars > DIFF_LIMITS.maxLineChars) {
        return {
            ok: false,
            message: 'Line too long. Maximum ' + DIFF_LIMITS.maxLineChars.toLocaleString() + ' characters per line supported.'
        };
    }

    return { ok: true };
}

function diffClassification(isSyncSafe, cost, lineEditLowerBound, reason, scan) {
    return {
        isSyncSafe: isSyncSafe,
        cost: cost,
        lineEditLowerBound: lineEditLowerBound,
        reason: reason,
        scan: scan
    };
}

function classifyDiffWork(left, right, scan) {
    const inputScan = scan || scanDiffInput(left, right);
    const validation = validateScannedDiffInput(inputScan);
    const cheapCost = inputScan.totalChars
        + (SYNC_DIFF_LIMITS.lineWeight * inputScan.totalLines)
        + (SYNC_DIFF_LIMITS.spanRiskWeight * inputScan.spanRiskChars);

    if (!validation.ok) {
        return diffClassification(false, cheapCost, null, validation.message, inputScan);
    }
    if (inputScan.totalChars > SYNC_DIFF_LIMITS.maxTotalChars) {
        return diffClassification(false, cheapCost, null, 'Character count requires a Web Worker.', inputScan);
    }
    if (Math.max(inputScan.leftLines, inputScan.rightLines) > SYNC_DIFF_LIMITS.maxLinesPerSide) {
        return diffClassification(false, cheapCost, null, 'Line count requires a Web Worker.', inputScan);
    }
    if (inputScan.maxLineChars > SYNC_DIFF_LIMITS.maxLineChars) {
        return diffClassification(false, cheapCost, null, 'Line length requires a Web Worker.', inputScan);
    }
    if (inputScan.spanRiskChars > SYNC_DIFF_LIMITS.maxSpanRiskChars) {
        return diffClassification(false, cheapCost, null, 'Decorated character count requires a Web Worker.', inputScan);
    }
    if (cheapCost > SYNC_DIFF_LIMITS.maxCost) {
        return diffClassification(false, cheapCost, null, 'Estimated comparison cost requires a Web Worker.', inputScan);
    }

    const leftLines = left.split('\n');
    const rightLines = right.split('\n');
    const lineEditLowerBound = estimateEditDistanceLowerBound(leftLines, rightLines);
    const cost = cheapCost + (SYNC_DIFF_LIMITS.lineEditWeight * lineEditLowerBound);
    if (cost > SYNC_DIFF_LIMITS.maxCost) {
        return diffClassification(false, cost, lineEditLowerBound, 'Estimated comparison cost requires a Web Worker.', inputScan);
    }

    return diffClassification(true, cost, lineEditLowerBound, 'Safe for synchronous comparison.', inputScan);
}

function validateDiffInput(left, right) {
    const scan = scanDiffInput(left, right);
    const scannedValidation = validateScannedDiffInput(scan);
    if (!scannedValidation.ok) return scannedValidation;

    const leftLines = left.split('\n');
    const rightLines = right.split('\n');

    return {
        ok: true,
        leftLines: leftLines,
        rightLines: rightLines,
        estimatedLines: Math.max(leftLines.length, rightLines.length),
        scan: scan
    };
}

function splitDiffUnits(text) {
    const units = [];
    const boundaries = [];

    if (!graphemeSegmenter) {
        graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    }

    const segments = graphemeSegmenter.segment(text);
    for (const item of segments) {
        boundaries.push(item.index);
        units.push(item.segment);
    }

    boundaries.push(text.length);
    return {
        units: units,
        boundaries: Uint32Array.from(boundaries)
    };
}

// Returns the units array itself when it holds no confusable character, so callers
// can tell by identity that the visual form adds nothing.
function buildVisualSkeletonUnits(units) {
    let result = null;
    for (let i = 0; i < units.length; i++) {
        const base = units[i].length === 1 ? CONFUSABLE_BASE_CHARS[units[i].charCodeAt(0)] : undefined;
        if (base && !result) result = units.slice(0, i);
        if (result) result.push(base || units[i]);
    }
    return result || units;
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

const DIFF_DEADLINE_ERROR_CODE = 'DIFF_DEADLINE_EXCEEDED';
const DIFF_MYERS_BUDGET_ERROR_CODE = 'DIFF_MYERS_BUDGET_EXCEEDED';
const DIFF_DEADLINE_CHECK_INTERVAL = 1024;

function createCodedDiffError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function defaultDiffNow() {
    return performance.now();
}

function createDiffExecutionContext(options, workBudget) {
    const deadlineAt = options && typeof options.deadlineAt === 'number'
        ? options.deadlineAt
        : null;
    return {
        workBudget: workBudget ? normalizeDiffWorkBudget(workBudget) : null,
        deadlineAt: deadlineAt,
        now: options && typeof options.now === 'function' ? options.now : defaultDiffNow,
        deadlineWorkSinceCheck: 0
    };
}

function checkDiffDeadline(executionContext, force) {
    if (!executionContext || executionContext.deadlineAt === null) return;
    if (!force && executionContext.deadlineWorkSinceCheck < DIFF_DEADLINE_CHECK_INTERVAL) return;

    executionContext.deadlineWorkSinceCheck = 0;
    if (executionContext.now() >= executionContext.deadlineAt) {
        throw createCodedDiffError(
            DIFF_DEADLINE_ERROR_CODE,
            'Comparison timed out. Try smaller sections.'
        );
    }
}

function consumeMyersWork(executionContext, amount) {
    if (!executionContext) return;

    const work = amount || 1;
    const budget = executionContext.workBudget;
    if (budget) {
        if (budget.remainingMyersSteps < work) {
            budget.remainingMyersSteps = 0;
            throw createCodedDiffError(
                DIFF_MYERS_BUDGET_ERROR_CODE,
                'Comparison is too complex for a safe browser-side diff. Try smaller sections.'
            );
        }
        budget.remainingMyersSteps -= work;
    }

    executionContext.deadlineWorkSinceCheck += work;
    checkDiffDeadline(executionContext, false);
}

function buildMyersTraceRanges(
    left,
    right,
    leftStart,
    leftEnd,
    rightStart,
    rightEnd,
    maxEditDistance,
    executionContext
) {
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
            consumeMyersWork(executionContext, 1);
            const kOffset = offset + k;
            let x;
            if (k === -d || (k !== d && v[kOffset - 1] < v[kOffset + 1])) {
                x = v[kOffset + 1];
            } else {
                x = v[kOffset - 1] + 1;
            }

            let y = x - k;
            while (x < n && y < m && left[leftStart + x] === right[rightStart + y]) {
                consumeMyersWork(executionContext, 1);
                x++;
                y++;
            }

            v[kOffset] = x;
            if (x >= n && y >= m) {
                trace.push(v.slice());
                return backtrackMyersTrace(
                    trace,
                    n,
                    m,
                    offset,
                    leftStart,
                    rightStart,
                    executionContext
                );
            }
        }

        trace.push(v.slice());
    }

    throw new Error('These texts are too different to compare safely in your browser. Try smaller sections or more similar files.');
}

function backtrackMyersTrace(trace, n, m, offset, leftOffset, rightOffset, executionContext) {
    let x = n;
    let y = m;
    const reversedOps = [];

    for (let d = trace.length - 1; d > 0; d--) {
        consumeMyersWork(executionContext, 1);
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
            consumeMyersWork(executionContext, 1);
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
        consumeMyersWork(executionContext, 1);
        reversedOps.push('equal');
        x--;
        y--;
    }

    return atomicOpsToRanges(reversedOps.reverse(), leftOffset, rightOffset);
}

function findMyersSplit(
    left,
    right,
    leftStart,
    leftEnd,
    rightStart,
    rightEnd,
    maxEditDistance,
    approximation,
    executionContext
) {
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
            consumeMyersWork(executionContext, 1);

            const kOffset = vOffset + k;
            let x;
            if (k === -d || (k !== d && vForward[kOffset - 1] < vForward[kOffset + 1])) {
                x = vForward[kOffset + 1];
            } else {
                x = vForward[kOffset - 1] + 1;
            }

            let y = x - k;
            while (x < n && y < m && left[leftStart + x] === right[rightStart + y]) {
                consumeMyersWork(executionContext, 1);
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
            consumeMyersWork(executionContext, 1);

            const kOffset = vOffset + k;
            let x;
            if (k === -d || (k !== d && vReverse[kOffset - 1] < vReverse[kOffset + 1])) {
                x = vReverse[kOffset + 1];
            } else {
                x = vReverse[kOffset - 1] + 1;
            }

            let y = x - k;
            while (x < n && y < m && left[leftEnd - x - 1] === right[rightEnd - y - 1]) {
                consumeMyersWork(executionContext, 1);
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

        if (myersApproximationAllowed(approximation, d, executionContext)) {
            const split = furthestMyersSplit(
                vForward,
                vReverse,
                vOffset,
                d,
                leftStart,
                leftEnd,
                rightStart,
                rightEnd
            );
            if (split) {
                split.approximate = true;
                return split;
            }
        }
    }

    return null;
}

// The exact search may be abandoned only when the caller opted in, the search for
// this split has already cost maxSplitCost edits, and the shared step budget has
// fallen below the caller's reserve. Until then every result is a shortest script.
function myersApproximationAllowed(approximation, cost, executionContext) {
    if (!approximation || cost < approximation.maxSplitCost) return false;
    if (approximation.belowRemainingSteps === Infinity) return true;
    const budget = executionContext && executionContext.workBudget;
    return !!budget && budget.remainingMyersSteps < approximation.belowRemainingSteps;
}

// Fallback split: the point either search direction has reached furthest. Any
// interior point yields a valid edit script; only minimality is given up.
function furthestMyersSplit(
    vForward,
    vReverse,
    vOffset,
    d,
    leftStart,
    leftEnd,
    rightStart,
    rightEnd
) {
    const n = leftEnd - leftStart;
    const m = rightEnd - rightStart;
    let forwardX = 0;
    let forwardY = 0;
    let forwardReach = 0;
    let reverseX = 0;
    let reverseY = 0;
    let reverseReach = 0;

    for (let k = -d; k <= d; k += 2) {
        let x = vForward[vOffset + k];
        let y = x - k;
        if (x >= 0 && x <= n && y >= 0 && y <= m
            && x + y > forwardReach && x + y < n + m) {
            forwardX = x;
            forwardY = y;
            forwardReach = x + y;
        }

        x = vReverse[vOffset + k];
        y = x - k;
        if (x >= 0 && x <= n && y >= 0 && y <= m
            && x + y > reverseReach && x + y < n + m) {
            reverseX = x;
            reverseY = y;
            reverseReach = x + y;
        }
    }

    if (forwardReach === 0 && reverseReach === 0) return null;
    if (forwardReach >= reverseReach) {
        return { leftMid: leftStart + forwardX, rightMid: rightStart + forwardY };
    }
    return { leftMid: leftEnd - reverseX, rightMid: rightEnd - reverseY };
}

// Preferred split once the exact search is abandoned: items that occur exactly
// once on both sides of the frame, reduced to their longest chain that keeps the
// same order on both sides. Returns flat [leftIndex, rightIndex, ...] pairs.
function uniqueItemAnchors(left, right, leftStart, leftEnd, rightStart, rightEnd, executionContext) {
    consumeMyersWork(executionContext, (leftEnd - leftStart) + (rightEnd - rightStart));

    const rightIndexes = new Map();
    for (let j = rightStart; j < rightEnd; j++) {
        rightIndexes.set(right[j], rightIndexes.has(right[j]) ? -1 : j);
    }
    const leftCounts = new Map();
    for (let i = leftStart; i < leftEnd; i++) {
        if (rightIndexes.get(left[i]) >= 0) {
            leftCounts.set(left[i], (leftCounts.get(left[i]) || 0) + 1);
        }
    }

    const candidateLeft = [];
    const candidateRight = [];
    for (let i = leftStart; i < leftEnd; i++) {
        if (leftCounts.get(left[i]) === 1) {
            candidateLeft.push(i);
            candidateRight.push(rightIndexes.get(left[i]));
        }
    }
    if (!candidateLeft.length) return [];
    consumeMyersWork(executionContext, candidateLeft.length);

    const chainTails = [];
    const previous = new Int32Array(candidateLeft.length);
    for (let c = 0; c < candidateLeft.length; c++) {
        let low = 0;
        let high = chainTails.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (candidateRight[chainTails[middle]] < candidateRight[c]) low = middle + 1;
            else high = middle;
        }
        previous[c] = low > 0 ? chainTails[low - 1] : -1;
        chainTails[low] = c;
    }

    const anchors = new Array(chainTails.length * 2);
    let c = chainTails[chainTails.length - 1];
    for (let slot = chainTails.length - 1; slot >= 0; slot--) {
        anchors[slot * 2] = candidateLeft[c];
        anchors[(slot * 2) + 1] = candidateRight[c];
        c = previous[c];
    }
    return anchors;
}

function computeMyersRanges(left, right, options) {
    const maxEditDistance = options && typeof options.maxEditDistance === 'number'
        ? options.maxEditDistance
        : Infinity;
    const approximation = options && typeof options.maxSplitCost === 'number'
        ? {
            maxSplitCost: Math.max(1, options.maxSplitCost),
            belowRemainingSteps: typeof options.approximateBelowSteps === 'number'
                ? options.approximateBelowSteps
                : Infinity
        }
        : null;
    const executionContext = options && options.executionContext
        ? options.executionContext
        : null;
    const stack = [{ leftStart: 0, leftEnd: left.length, rightStart: 0, rightEnd: right.length }];
    const output = [];

    checkDiffDeadline(executionContext, true);

    while (stack.length) {
        const frame = stack.pop();
        let leftStart = frame.leftStart;
        let leftEnd = frame.leftEnd;
        let rightStart = frame.rightStart;
        let rightEnd = frame.rightEnd;

        let prefix = 0;
        while (leftStart + prefix < leftEnd && rightStart + prefix < rightEnd) {
            consumeMyersWork(executionContext, 1);
            if (left[leftStart + prefix] !== right[rightStart + prefix]) break;
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
        while (leftStart + suffix < leftEnd && rightStart + suffix < rightEnd) {
            consumeMyersWork(executionContext, 1);
            if (left[leftEnd - suffix - 1] !== right[rightEnd - suffix - 1]) break;
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
        checkDiffDeadline(executionContext, true);
        if (Number.isFinite(maxEditDistance)) {
            const lowerBound = estimateEditDistanceLowerBound(
                left.slice(leftStart, leftEnd),
                right.slice(rightStart, rightEnd)
            );
            checkDiffDeadline(executionContext, true);
            if (lowerBound > maxEditDistance) {
                throw new Error('These texts are too different to compare safely in your browser. Try smaller sections or more similar files.');
            }
        }

        if (leftLength + rightLength <= MYERS_TRACE_MAX_ITEMS) {
            output.push.apply(output, buildMyersTraceRanges(
                left,
                right,
                leftStart,
                leftEnd,
                rightStart,
                rightEnd,
                maxEditDistance,
                executionContext
            ));
            if (suffixRange) output.push(suffixRange);
            continue;
        }

        const split = findMyersSplit(
            left,
            right,
            leftStart,
            leftEnd,
            rightStart,
            rightEnd,
            maxEditDistance,
            approximation,
            executionContext
        );
        if (split && split.approximate) {
            const anchors = uniqueItemAnchors(
                left,
                right,
                leftStart,
                leftEnd,
                rightStart,
                rightEnd,
                executionContext
            );
            if (anchors.length) {
                if (suffixRange) {
                    stack.push({
                        leftStart: suffixRange.leftStart,
                        leftEnd: suffixRange.leftEnd,
                        rightStart: suffixRange.rightStart,
                        rightEnd: suffixRange.rightEnd
                    });
                }
                // Each frame starts at its anchor, so the match itself is emitted by
                // that frame's common-prefix scan.
                let frameLeftEnd = leftEnd;
                let frameRightEnd = rightEnd;
                for (let a = anchors.length - 2; a >= 0; a -= 2) {
                    stack.push({
                        leftStart: anchors[a],
                        leftEnd: frameLeftEnd,
                        rightStart: anchors[a + 1],
                        rightEnd: frameRightEnd
                    });
                    frameLeftEnd = anchors[a];
                    frameRightEnd = anchors[a + 1];
                }
                stack.push({
                    leftStart: leftStart,
                    leftEnd: frameLeftEnd,
                    rightStart: rightStart,
                    rightEnd: frameRightEnd
                });
                continue;
            }
        }
        if (!split
            || (split.leftMid === leftStart && split.rightMid === rightStart)
            || (split.leftMid === leftEnd && split.rightMid === rightEnd)) {
            if (leftLength + rightLength <= MYERS_TRACE_MAX_ITEMS) {
                output.push.apply(output, buildMyersTraceRanges(
                    left,
                    right,
                    leftStart,
                    leftEnd,
                    rightStart,
                    rightEnd,
                    maxEditDistance,
                    executionContext
                ));
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

    checkDiffDeadline(executionContext, true);
    return mergeMyersRanges(output);
}

// Lines are compared as integer ids. A line that never occurs on the other side
// cannot be part of any common subsequence, so it is left out of the Myers input
// and restored afterwards as a deletion or an insertion. The edit script stays
// minimal while wholesale rewrites no longer exhaust the search.
function internDiffLines(leftLines, rightLines) {
    const ids = new Map();
    const leftIds = new Int32Array(leftLines.length);
    const rightIds = new Int32Array(rightLines.length);

    for (let i = 0; i < leftLines.length; i++) {
        let id = ids.get(leftLines[i]);
        if (id === undefined) {
            id = ids.size;
            ids.set(leftLines[i], id);
        }
        leftIds[i] = id;
    }
    const leftIdCount = ids.size;
    const sharedIds = new Uint8Array(leftIdCount);
    for (let j = 0; j < rightLines.length; j++) {
        const id = ids.get(rightLines[j]);
        if (id === undefined) {
            rightIds[j] = -1;
        } else {
            rightIds[j] = id;
            sharedIds[id] = 1;
        }
    }

    return { leftIds: leftIds, rightIds: rightIds, sharedIds: sharedIds };
}

function keepSharedLines(ids, sharedIds) {
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
        if (ids[i] >= 0 && sharedIds[ids[i]]) count++;
    }

    const items = new Int32Array(count);
    const indexes = new Int32Array(count);
    let next = 0;
    for (let i = 0; i < ids.length; i++) {
        if (ids[i] >= 0 && sharedIds[ids[i]]) {
            items[next] = ids[i];
            indexes[next] = i;
            next++;
        }
    }
    return { items: items, indexes: indexes };
}

function expandSharedLineRanges(ranges, leftIndexes, rightIndexes, leftCount, rightCount) {
    const output = [];
    let leftPos = 0;
    let rightPos = 0;

    function appendGap(leftEnd, rightEnd) {
        if (leftEnd > leftPos) {
            output.push({
                type: 'delete',
                leftStart: leftPos,
                leftEnd: leftEnd,
                rightStart: rightPos,
                rightEnd: rightPos
            });
        }
        if (rightEnd > rightPos) {
            output.push({
                type: 'insert',
                leftStart: leftEnd,
                leftEnd: leftEnd,
                rightStart: rightPos,
                rightEnd: rightEnd
            });
        }
        leftPos = leftEnd;
        rightPos = rightEnd;
    }

    for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        if (range.type !== 'equal') continue;

        const length = range.leftEnd - range.leftStart;
        for (let offset = 0; offset < length; offset++) {
            const leftIndex = leftIndexes[range.leftStart + offset];
            const rightIndex = rightIndexes[range.rightStart + offset];
            const previous = output[output.length - 1];
            if (previous && previous.type === 'equal'
                && previous.leftEnd === leftIndex && previous.rightEnd === rightIndex) {
                previous.leftEnd++;
                previous.rightEnd++;
            } else {
                appendGap(leftIndex, rightIndex);
                output.push({
                    type: 'equal',
                    leftStart: leftIndex,
                    leftEnd: leftIndex + 1,
                    rightStart: rightIndex,
                    rightEnd: rightIndex + 1
                });
            }
            leftPos = leftIndex + 1;
            rightPos = rightIndex + 1;
        }
    }

    appendGap(leftCount, rightCount);
    return output;
}

function computeLineRanges(leftLines, rightLines, options) {
    const executionContext = options && options.executionContext
        ? options.executionContext
        : null;
    checkDiffDeadline(executionContext, true);

    const interned = internDiffLines(leftLines, rightLines);
    const left = keepSharedLines(interned.leftIds, interned.sharedIds);
    const right = keepSharedLines(interned.rightIds, interned.sharedIds);
    const budget = executionContext && executionContext.workBudget;
    const exactSteps = options && typeof options.exactSteps === 'number'
        ? options.exactSteps
        : LINE_EXACT_MYERS_STEPS;
    const ranges = computeMyersRanges(left.items, right.items, {
        maxSplitCost: options && typeof options.maxSplitCost === 'number'
            ? options.maxSplitCost
            : LINE_SPLIT_MAX_COST,
        approximateBelowSteps: budget
            ? Math.max(0, budget.remainingMyersSteps - exactSteps)
            : Infinity,
        executionContext: executionContext
    });

    return expandSharedLineRanges(
        ranges,
        left.indexes,
        right.indexes,
        leftLines.length,
        rightLines.length
    );
}

// Width of a line's indentation, or -1 for a line that is blank.
function lineIndentation(line) {
    let width = 0;
    for (let index = 0; index < line.length; index++) {
        const code = line.charCodeAt(index);
        if (code === 0x0020) width++;
        else if (code === 0x0009) width += 4;
        else return width;
    }
    return -1;
}

// How badly a change that starts or ends between two lines cuts the text.
// Next to a blank line or at an end of the text nothing is cut. Between lines
// of equal indentation a list is cut between two items. A step inwards cuts a
// block right after its opening line, and a step outwards cuts it right before
// its closing line, which separates a body from the brace that ends it.
function boundaryCutCost(lines, index) {
    if (index <= 0 || index >= lines.length) return 0;
    const above = lineIndentation(lines[index - 1]);
    const below = lineIndentation(lines[index]);
    if (above < 0 || below < 0) return 0;
    if (below === above) return 2;
    return below > above ? 4 : 6;
}

// A run of removed or added lines between two matching stretches can often sit
// in several places: when the line before it equals its last line, it can move
// up by one, and likewise down. Myers picks one of them arbitrarily, which can
// leave a function without its own closing brace. This moves every such run to
// the position that cuts the text least (see boundaryCutCost), preferring a run
// that ends rather than starts with a blank line, and the earliest position on
// a tie. Only the position changes: the same lines stay matched in number, and
// a run never swallows the whole matching stretch that separates it from the
// next change.
function slideChangeRanges(source, leftKeys, rightKeys, leftContent, rightContent, executionContext) {
    // Neighbouring ranges of one kind are joined first so that "the matching
    // stretch before a change" is a single range.
    const ranges = [];
    for (let index = 0; index < source.length; index++) {
        const range = source[index];
        const last = ranges[ranges.length - 1];
        if (last && last.type === range.type
            && last.leftEnd === range.leftStart && last.rightEnd === range.rightStart) {
            last.leftEnd = range.leftEnd;
            last.rightEnd = range.rightEnd;
        } else {
            ranges.push({
                type: range.type,
                leftStart: range.leftStart,
                leftEnd: range.leftEnd,
                rightStart: range.rightStart,
                rightEnd: range.rightEnd
            });
        }
    }

    const output = [];
    for (let index = 0; index < ranges.length; index++) {
        const range = ranges[index];
        const previous = output.length ? output[output.length - 1] : null;
        const next = index + 1 < ranges.length ? ranges[index + 1] : null;
        const removed = range.type === 'delete';
        const keys = removed ? leftKeys : rightKeys;
        const content = removed ? leftContent : rightContent;
        const start = removed ? range.leftStart : range.rightStart;
        const end = removed ? range.leftEnd : range.rightEnd;

        if (range.type === 'equal' || end === start
            || (previous && previous.type !== 'equal') || (next && next.type !== 'equal')) {
            output.push(range);
            continue;
        }

        // A matching stretch may be used up entirely only at an end of the text.
        const maxUp = previous
            ? previous.leftEnd - previous.leftStart - (output.length > 1 ? 1 : 0)
            : 0;
        const maxDown = next
            ? next.leftEnd - next.leftStart - (index + 2 < ranges.length ? 1 : 0)
            : 0;

        let up = 0;
        while (up < maxUp && keys[start - up - 1] === keys[end - up - 1]) up++;
        let down = 0;
        while (down < maxDown && keys[start + down] === keys[end + down]) down++;
        if (executionContext) {
            executionContext.deadlineWorkSinceCheck += up + down + 1;
            checkDiffDeadline(executionContext, false);
        }

        let shift = 0;
        let bestCost = Infinity;
        for (let candidate = -up; candidate <= down; candidate++) {
            // The empty last line of a text that ends with a line break is not
            // a separator to carry along: marking it would look like a change
            // in the final line break.
            const takesFinalLine = end + candidate === content.length
                && content[content.length - 1] === '';
            const cost = boundaryCutCost(content, start + candidate)
                + boundaryCutCost(content, end + candidate)
                + (lineIndentation(content[start + candidate]) < 0 ? 1 : 0)
                + (takesFinalLine ? 2 : 0);
            if (cost < bestCost) {
                bestCost = cost;
                shift = candidate;
            }
        }

        const moved = {
            type: range.type,
            leftStart: range.leftStart + shift,
            leftEnd: range.leftEnd + shift,
            rightStart: range.rightStart + shift,
            rightEnd: range.rightEnd + shift
        };

        if (shift > 0) {
            // Lines the change no longer covers at its start match the lines
            // that used to follow it.
            if (previous) {
                previous.leftEnd += shift;
                previous.rightEnd += shift;
            } else {
                output.push({
                    type: 'equal',
                    leftStart: range.leftStart,
                    leftEnd: range.leftStart + shift,
                    rightStart: range.rightStart,
                    rightEnd: range.rightStart + shift
                });
            }
            next.leftStart += shift;
            next.rightStart += shift;
            output.push(moved);
            if (next.leftEnd === next.leftStart) index++;
        } else if (shift < 0) {
            previous.leftEnd += shift;
            previous.rightEnd += shift;
            if (previous.leftEnd === previous.leftStart) output.pop();
            output.push(moved);
            if (next) {
                next.leftStart += shift;
                next.rightStart += shift;
            } else {
                output.push({
                    type: 'equal',
                    leftStart: moved.leftEnd,
                    leftEnd: moved.leftEnd - shift,
                    rightStart: moved.rightEnd,
                    rightEnd: moved.rightEnd - shift
                });
            }
        } else {
            output.push(range);
        }
    }

    return output;
}

function appendMergedChangeRange(bounds, start, end) {
    if (start === end) return;

    const length = bounds.length;
    if (length >= 2 && start <= bounds[length - 1]) {
        if (end > bounds[length - 1]) {
            bounds[length - 1] = end;
        }
        return;
    }

    bounds.push(start, end);
}

function intralineWholeLineResult() {
    return {
        detailMode: 'whole-line',
        leftBounds: [],
        rightBounds: [],
        editDistance: 0
    };
}

function isBlankCode(code) {
    return code === 0x0020 || code === 0x0009;
}

// Offsets of the line content without leading and trailing spaces and tabs.
// Only these two count as ignorable whitespace: a non-breaking space or another
// Unicode space is exactly the kind of difference the comparison must keep.
function blankEdges(line) {
    let start = 0;
    let end = line.length;
    while (start < end && isBlankCode(line.charCodeAt(start))) start++;
    while (end > start && isBlankCode(line.charCodeAt(end - 1))) end--;
    return { start: start, end: end };
}

// The form of a line that is compared when whitespace is ignored: no leading
// or trailing spaces and tabs, and every inner run of them reduced to one space.
function whitespaceInsensitiveLine(line) {
    const edges = blankEdges(line);
    let result = '';
    let runStart = edges.start;
    let changed = edges.start > 0 || edges.end < line.length;

    for (let index = edges.start; index < edges.end; index++) {
        if (!isBlankCode(line.charCodeAt(index))) continue;
        let runEnd = index + 1;
        while (runEnd < edges.end && isBlankCode(line.charCodeAt(runEnd))) runEnd++;
        if (runEnd - index > 1 || line.charCodeAt(index) === 0x0009) {
            result += line.slice(runStart, index) + ' ';
            runStart = runEnd;
            changed = true;
        }
        index = runEnd - 1;
    }

    if (!changed) return line;
    return result + line.slice(runStart, edges.end);
}

// Splits the lines a comparison works on from their line endings. A carriage
// return directly before the line feed belongs to the line ending, so CRLF and
// LF texts compare equal line by line; any other carriage return stays content.
// content keeps source offsets valid because only the end of a line is cut.
// The form of a text that is compared when letter case is ignored. Lower-casing
// a whole line turns a word-final Greek sigma into its final form while
// lower-casing one character does not, so the final form is folded away: lines
// and single characters must fold to the same result. Not locale-dependent.
function caseInsensitiveText(text) {
    const lower = text.toLowerCase();
    return lower.indexOf('\u03C2') < 0 ? lower : lower.replace(/\u03C2/g, '\u03C3');
}

function prepareDiffLines(lines, ignoreWhitespace, ignoreCase) {
    const content = new Array(lines.length);
    const carriageReturns = new Uint8Array(lines.length);
    const last = lines.length - 1;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (index < last && line.length > 0 && line.charCodeAt(line.length - 1) === 0x000D) {
            content[index] = line.slice(0, -1);
            carriageReturns[index] = 1;
        } else {
            content[index] = line;
        }
    }

    let keys = content;
    if (ignoreWhitespace || ignoreCase) {
        keys = new Array(content.length);
        for (let index = 0; index < content.length; index++) {
            let key = content[index];
            if (ignoreWhitespace) key = whitespaceInsensitiveLine(key);
            if (ignoreCase) key = caseInsensitiveText(key);
            keys[index] = key;
        }
    }

    return { content: content, keys: keys, carriageReturns: carriageReturns };
}

const WORD_UNIT_PATTERN = /^[\p{L}\p{N}_]/u;
// Scripts written without spaces between words: grouping their letters would turn
// a whole clause into one token, so each grapheme stays a token of its own.
const UNSPACED_SCRIPT_PATTERN = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const DIGIT_UNIT_PATTERN = /^\p{Nd}/u;

// Groups graphemes into the tokens the intraline diff compares: a run of letters,
// digits and underscores is one token, every other grapheme stands alone. starts
// holds each token's first grapheme index plus a final end sentinel.
function splitDiffTokens(units, collapseBlanks) {
    const texts = [];
    const starts = [];
    let index = 0;

    function isBlank(unit) {
        return unit === ' ' || unit === '\t';
    }

    function joinsWord(unit) {
        return WORD_UNIT_PATTERN.test(unit) && !UNSPACED_SCRIPT_PATTERN.test(unit);
    }

    while (index < units.length) {
        const start = index;
        const isWord = joinsWord(units[index]);
        const isBlankRun = collapseBlanks && isBlank(units[index]);
        index++;
        if (isWord) {
            // A dot between two digits stays inside the word, so a decimal or
            // a version number such as 1.2.3 is compared as one piece.
            while (index < units.length && (joinsWord(units[index])
                || (units[index] === '.' && index + 1 < units.length
                    && DIGIT_UNIT_PATTERN.test(units[index - 1])
                    && DIGIT_UNIT_PATTERN.test(units[index + 1])))) {
                index++;
            }
        } else if (isBlankRun) {
            while (index < units.length && isBlank(units[index])) index++;
        }
        starts.push(start);
        if (isBlankRun) texts.push(' ');
        else texts.push(index - start === 1 ? units[start] : units.slice(start, index).join(''));
    }

    starts.push(units.length);
    return { texts: texts, starts: Uint32Array.from(starts) };
}

// True when cutting units before index would split a run of digits.
function splitsNumber(units, index, start, end) {
    return index > start && index < end
        && DIGIT_UNIT_PATTERN.test(units[index - 1]) && DIGIT_UNIT_PATTERN.test(units[index]);
}

// A replaced stretch is narrowed to the part between the common start and end of
// its two sides, but only when those cover at least half of the longer side.
// Otherwise the whole stretch is the change, and a number is never cut in two:
// "15000" to "30000" reads better as one replacement than as two digit edits.
// The narrowing also keeps a character inserted inside a word (a hidden
// zero-width space, a hyphen) marked on its own.
function sharedReplacementAffix(leftSplit, leftTokens, removed, rightSplit, rightTokens, added) {
    const leftStart = leftTokens.starts[removed.leftStart];
    const leftEnd = leftTokens.starts[removed.leftEnd];
    const rightStart = rightTokens.starts[added.rightStart];
    const rightEnd = rightTokens.starts[added.rightEnd];
    const leftUnits = leftSplit.units;
    const rightUnits = rightSplit.units;
    const leftLength = leftEnd - leftStart;
    const rightLength = rightEnd - rightStart;
    const limit = Math.min(leftLength, rightLength);

    let prefix = 0;
    while (prefix < limit && leftUnits[leftStart + prefix] === rightUnits[rightStart + prefix]) {
        prefix++;
    }
    while (prefix > 0 && (splitsNumber(leftUnits, leftStart + prefix, leftStart, leftEnd)
        || splitsNumber(rightUnits, rightStart + prefix, rightStart, rightEnd))) {
        prefix--;
    }

    let suffix = 0;
    while (suffix < limit - prefix
        && leftUnits[leftEnd - 1 - suffix] === rightUnits[rightEnd - 1 - suffix]) {
        suffix++;
    }
    while (suffix > 0 && (splitsNumber(leftUnits, leftEnd - suffix, leftStart, leftEnd)
        || splitsNumber(rightUnits, rightEnd - suffix, rightStart, rightEnd))) {
        suffix--;
    }

    if (prefix + suffix === 0 || (prefix + suffix) * 2 < Math.max(leftLength, rightLength)) {
        return null;
    }
    return {
        leftStart: leftStart + prefix,
        leftEnd: leftEnd - suffix,
        rightStart: rightStart + prefix,
        rightEnd: rightEnd - suffix
    };
}

// Graphemes in the form the comparison uses, with the boundaries of the text as
// written: folding can change a character's length, the offsets must not move.
function foldDiffUnits(split) {
    const units = new Array(split.units.length);
    for (let index = 0; index < units.length; index++) {
        units[index] = caseInsensitiveText(split.units[index]);
    }
    return { units: units, boundaries: split.boundaries };
}

function computeIntralineChangeRanges(
    sourceLeft, sourceRight, workBudget, executionContext, ignoreWhitespace, ignoreCase
) {
    if (!executionContext) {
        throw new TypeError('Intraline diff requires an execution context.');
    }
    const budget = normalizeDiffWorkBudget(workBudget);
    // With whitespace ignored the edges are cut off before comparing and the
    // resulting offsets are shifted back to the untrimmed line.
    const leftEdges = ignoreWhitespace ? blankEdges(sourceLeft) : null;
    const rightEdges = ignoreWhitespace ? blankEdges(sourceRight) : null;
    const leftShift = leftEdges ? leftEdges.start : 0;
    const rightShift = rightEdges ? rightEdges.start : 0;
    const left = leftEdges ? sourceLeft.slice(leftEdges.start, leftEdges.end) : sourceLeft;
    const right = rightEdges ? sourceRight.slice(rightEdges.start, rightEdges.end) : sourceRight;
    const leftSplit = ignoreCase ? foldDiffUnits(splitDiffUnits(left)) : splitDiffUnits(left);
    const rightSplit = ignoreCase ? foldDiffUnits(splitDiffUnits(right)) : splitDiffUnits(right);
    const maxEditDistance = Math.min(
        DIFF_LIMITS.maxCharEditDistance,
        budget.remainingCharEditDistance
    );

    if (left !== right && maxEditDistance <= 0) {
        return intralineWholeLineResult();
    }

    const leftTokens = splitDiffTokens(leftSplit.units, !!ignoreWhitespace);
    const rightTokens = splitDiffTokens(rightSplit.units, !!ignoreWhitespace);
    let ranges;
    try {
        ranges = computeMyersRanges(leftTokens.texts, rightTokens.texts, {
            maxEditDistance: maxEditDistance,
            executionContext: executionContext
        });
    } catch (err) {
        if (err && err.code === DIFF_DEADLINE_ERROR_CODE) throw err;
        if (err && err.code === DIFF_MYERS_BUDGET_ERROR_CODE) {
            return intralineWholeLineResult();
        }
        budget.remainingCharEditDistance = 0;
        return intralineWholeLineResult();
    }

    const leftBounds = [];
    const rightBounds = [];
    let editDistance = 0;

    function appendUnits(bounds, boundaries, unitStart, unitEnd) {
        const shift = bounds === leftBounds ? leftShift : rightShift;
        appendMergedChangeRange(bounds, boundaries[unitStart] + shift, boundaries[unitEnd] + shift);
    }

    for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        if (range.type === 'equal') continue;

        const next = ranges[i + 1];
        if (next && next.type !== 'equal' && next.type !== range.type) {
            const removed = range.type === 'delete' ? range : next;
            const added = range.type === 'insert' ? range : next;
            const affix = sharedReplacementAffix(
                leftSplit, leftTokens, removed,
                rightSplit, rightTokens, added
            );
            if (affix) {
                appendUnits(leftBounds, leftSplit.boundaries, affix.leftStart, affix.leftEnd);
                appendUnits(rightBounds, rightSplit.boundaries, affix.rightStart, affix.rightEnd);
                editDistance += removed.leftEnd - removed.leftStart + added.rightEnd - added.rightStart;
                i++;
                continue;
            }
        }

        if (range.type === 'delete') {
            appendUnits(
                leftBounds,
                leftSplit.boundaries,
                leftTokens.starts[range.leftStart],
                leftTokens.starts[range.leftEnd]
            );
            editDistance += range.leftEnd - range.leftStart;
        } else {
            appendUnits(
                rightBounds,
                rightSplit.boundaries,
                rightTokens.starts[range.rightStart],
                rightTokens.starts[range.rightEnd]
            );
            editDistance += range.rightEnd - range.rightStart;
        }
    }

    if (editDistance > budget.remainingCharEditDistance) {
        budget.remainingCharEditDistance = 0;
        return intralineWholeLineResult();
    }

    budget.remainingCharEditDistance -= editDistance;
    return {
        detailMode: 'precise',
        leftBounds: leftBounds,
        rightBounds: rightBounds,
        editDistance: editDistance
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

// One bit per pattern position for every distinct unit. A short line has at most
// SHORT_LINE_MAX_UNITS (32) units, so a pattern always fits one 32-bit word.
function buildShortUnitMasks(units) {
    const masks = new Map();
    for (let i = 0; i < units.length; i++) {
        masks.set(units[i], (masks.get(units[i]) || 0) | (1 << i));
    }
    return masks;
}

// Levenshtein distance by the bit-parallel method of Myers (1999) in Hyyro's
// formulation: one pass over the text instead of a pattern-by-text table.
function shortEditDistance(patternMasks, patternLength, textUnits) {
    if (patternLength === 0) return textUnits.length;

    const lastBit = 1 << (patternLength - 1);
    let positive = -1;
    let negative = 0;
    let distance = patternLength;
    for (let i = 0; i < textUnits.length; i++) {
        let equal = patternMasks.get(textUnits[i]) || 0;
        const diagonal = equal | negative;
        equal |= ((equal & positive) + positive) ^ positive;
        negative |= ~(equal | positive);
        positive &= equal;
        if (negative & lastBit) distance++;
        if (positive & lastBit) distance--;
        negative = (negative << 1) | 1;
        positive = (positive << 1) | ~(diagonal | negative);
        negative &= diagonal;
    }
    return distance;
}

function shortEditDistanceSimilarity(patternMasks, patternLength, textUnits) {
    const maxLen = Math.max(patternLength, textUnits.length);
    if (maxLen === 0) return 1;
    return 1 - (shortEditDistance(patternMasks, patternLength, textUnits) / maxLen);
}

function createLineProfile(text) {
    return {
        text: text,
        codeUnitLength: text.length,
        bigramCounts: null,
        bigramTotal: 0,
        shortUnits: null,
        visualShortUnits: null,
        shortMasks: null,
        visualShortMasks: null,
        isShort: null,
        canonicalText: undefined
    };
}

// Two lines that are the same text in different Unicode normalization forms
// always belong together, however many of their characters differ in encoding.
function canonicallyEquivalentProfiles(leftProfile, rightProfile) {
    if (leftProfile.canonicalText === undefined) {
        leftProfile.canonicalText = NON_ASCII_PATTERN.test(leftProfile.text)
            ? leftProfile.text.normalize('NFC') : null;
    }
    if (leftProfile.canonicalText === null) return false;
    if (rightProfile.canonicalText === undefined) {
        rightProfile.canonicalText = NON_ASCII_PATTERN.test(rightProfile.text)
            ? rightProfile.text.normalize('NFC') : null;
    }
    return leftProfile.canonicalText === rightProfile.canonicalText;
}

function ensureLineProfileBigrams(profile) {
    if (profile.bigramCounts) return;
    const bigrams = getBigrams(profile.text);
    profile.bigramCounts = bigrams.map;
    profile.bigramTotal = bigrams.total;
}

function ensureLineProfileShortUnits(profile) {
    if (profile.isShort !== null) return;
    const units = splitDiffUnits(profile.text).units;
    profile.isShort = units.length <= SHORT_LINE_MAX_UNITS;
    if (profile.isShort) {
        profile.shortUnits = units;
        profile.visualShortUnits = buildVisualSkeletonUnits(units);
    }
}

function ensureLineProfileShortMasks(profile) {
    if (profile.shortMasks) return;
    profile.shortMasks = buildShortUnitMasks(profile.shortUnits);
    profile.visualShortMasks = profile.visualShortUnits === profile.shortUnits
        ? profile.shortMasks
        : buildShortUnitMasks(profile.visualShortUnits);
}

function leadingBlankLength(text) {
    let length = 0;
    while (length < text.length
        && (text.charCodeAt(length) === 0x0020 || text.charCodeAt(length) === 0x0009)) {
        length++;
    }
    return length;
}

// positionBlind lets content overlap alone admit a pair. It is meant for lines too
// long for the exact edit-distance score, where a change at both ends would
// otherwise cap the result below the pairing threshold. Such a pair scores only
// just above the threshold, so a candidate that also agrees in position wins.
// Very long lines are excluded: reordered content there costs a character diff
// large enough to take the detail budget away from the rows that follow.
function lineSimilarityFromProfiles(leftProfile, rightProfile, positionBlind) {
    const leftLine = leftProfile.text;
    const rightLine = rightProfile.text;
    if (leftLine === rightLine) return 1;
    if (!leftLine.length || !rightLine.length) return 0;

    const leftLen = leftProfile.codeUnitLength;
    const rightLen = rightProfile.codeUnitLength;
    const maxLen = Math.max(leftLen, rightLen);
    const minLen = Math.min(leftLen, rightLen);
    const lengthRatio = minLen / maxLen;

    let prefix = 0;
    while (prefix < minLen && leftLine[prefix] === rightLine[prefix]) prefix++;

    let suffix = 0;
    while (
        suffix < minLen - prefix
        && leftLine[leftLen - 1 - suffix] === rightLine[rightLen - 1 - suffix]
    ) {
        suffix++;
    }

    // The shorter line is the longer one with a single run removed, and both
    // open with the same content: an extension. The run is capped so that such
    // pairs cannot drain the character-diff budget shared with every other row.
    let containedScore = 0;
    if (prefix + suffix === minLen && maxLen - minLen <= CONTAINED_LINE_MAX_ADDED) {
        const shorterLine = leftLen <= rightLen ? leftLine : rightLine;
        if (prefix - Math.min(prefix, leadingBlankLength(shorterLine)) >= CONTAINED_LINE_MIN_HEAD) {
            containedScore = MODIFIED_SIMILARITY_THRESHOLD
                + ((1 - MODIFIED_SIMILARITY_THRESHOLD) * lengthRatio);
        }
    }
    if (lengthRatio < 0.4) return containedScore;

    ensureLineProfileBigrams(leftProfile);
    ensureLineProfileBigrams(rightProfile);
    let intersection = 0;
    for (let gram in leftProfile.bigramCounts) {
        if (rightProfile.bigramCounts[gram]) {
            intersection += Math.min(
                leftProfile.bigramCounts[gram],
                rightProfile.bigramCounts[gram]
            );
        }
    }

    const denominator = leftProfile.bigramTotal + rightProfile.bigramTotal;
    const dice = denominator > 0 ? (2 * intersection) / denominator : 0;
    const edgeRatio = (prefix + suffix) / maxLen;
    const lengthFactor = 0.6 + (0.4 * lengthRatio);
    let score = ((dice * 0.65) + (edgeRatio * 0.35)) * lengthFactor;
    if (positionBlind && maxLen <= POSITION_BLIND_MAX_LENGTH) {
        const overlap = dice * lengthFactor;
        if (overlap >= MODIFIED_SIMILARITY_THRESHOLD) {
            score = Math.max(
                score,
                MODIFIED_SIMILARITY_THRESHOLD
                    + ((overlap - MODIFIED_SIMILARITY_THRESHOLD) * POSITION_BLIND_SCORE_SLOPE)
            );
        }
    }
    return Math.max(containedScore, score);
}

function modifiedLineScoreFromProfiles(leftProfile, rightProfile) {
    if (canonicallyEquivalentProfiles(leftProfile, rightProfile)) return 1;
    ensureLineProfileShortUnits(leftProfile);
    ensureLineProfileShortUnits(rightProfile);
    const shortPair = leftProfile.isShort && rightProfile.isShort;
    const similarity = lineSimilarityFromProfiles(leftProfile, rightProfile, !shortPair);
    if (!shortPair) return similarity;

    ensureLineProfileShortMasks(leftProfile);
    const directSimilarity = shortEditDistanceSimilarity(
        leftProfile.shortMasks,
        leftProfile.shortUnits.length,
        rightProfile.shortUnits
    );
    const sameVisualForm = leftProfile.visualShortUnits === leftProfile.shortUnits
        && rightProfile.visualShortUnits === rightProfile.shortUnits;
    const visualSimilarity = sameVisualForm ? directSimilarity : shortEditDistanceSimilarity(
        leftProfile.visualShortMasks,
        leftProfile.visualShortUnits.length,
        rightProfile.visualShortUnits
    );
    return Math.max(similarity, directSimilarity, visualSimilarity);
}

function quantizedModifiedLineScore(leftLine, rightLine) {
    const leftProfile = createLineProfile(leftLine);
    const rightProfile = createLineProfile(rightLine);
    const scoreQ = Math.round(
        modifiedLineScoreFromProfiles(leftProfile, rightProfile) * ALIGN_SCORE_SCALE
    );
    const shortPair = leftProfile.isShort && rightProfile.isShort;
    const thresholdQ = shortPair
        ? Math.round(SHORT_LINE_SIMILARITY_THRESHOLD * ALIGN_SCORE_SCALE)
        : Math.round(MODIFIED_SIMILARITY_THRESHOLD * ALIGN_SCORE_SCALE);
    return {
        scoreQ: scoreQ,
        thresholdQ: thresholdQ,
        allowed: scoreQ >= thresholdQ,
        shortPair: shortPair
    };
}

const ALIGNMENT_SCORE_BUDGET_ERROR_CODE = 'DIFF_ALIGNMENT_SCORE_BUDGET_EXCEEDED';

function alignmentScoreWorkForLengths(leftLength, rightLength) {
    return 1 + leftLength + rightLength;
}

function createFullAlignmentLayout(leftCount, rightCount) {
    const rowStarts = new Int32Array(leftCount + 1);
    const rowEnds = new Int32Array(leftCount + 1);
    const rowOffsets = new Uint32Array(leftCount + 2);
    const rowWidth = rightCount + 1;
    for (let i = 0; i <= leftCount; i++) {
        rowEnds[i] = rightCount;
        rowOffsets[i] = i * rowWidth;
    }
    rowOffsets[leftCount + 1] = (leftCount + 1) * rowWidth;
    return {
        kind: 'full',
        band: null,
        rowStarts: rowStarts,
        rowEnds: rowEnds,
        rowOffsets: rowOffsets,
        cellCount: (leftCount + 1) * (rightCount + 1)
    };
}

function alignmentBandRowStart(row, leftCount, rightCount, band) {
    const threshold = band * Math.max(leftCount, rightCount);
    return Math.max(0, Math.ceil(((row * rightCount) - threshold) / leftCount));
}

function alignmentBandRowEnd(row, leftCount, rightCount, band) {
    const threshold = band * Math.max(leftCount, rightCount);
    return Math.min(rightCount, Math.floor(((row * rightCount) + threshold) / leftCount));
}

function createBandedAlignmentLayout(leftCount, rightCount, band) {
    const rowStarts = new Int32Array(leftCount + 1);
    const rowEnds = new Int32Array(leftCount + 1);
    const rowOffsets = new Uint32Array(leftCount + 2);
    let cellCount = 0;

    for (let i = 0; i <= leftCount; i++) {
        const start = alignmentBandRowStart(i, leftCount, rightCount, band);
        const end = alignmentBandRowEnd(i, leftCount, rightCount, band);
        rowStarts[i] = start;
        rowEnds[i] = end;
        rowOffsets[i] = cellCount;
        cellCount += end - start + 1;
    }
    rowOffsets[leftCount + 1] = cellCount;

    return {
        kind: 'banded',
        band: band,
        rowStarts: rowStarts,
        rowEnds: rowEnds,
        rowOffsets: rowOffsets,
        cellCount: cellCount
    };
}

function estimateAlignmentScoreWork(
    layout,
    leftLines,
    rightLines,
    leftStart,
    rightStart,
    limit,
    executionContext
) {
    let work = 0;
    let deadlineWork = 0;
    const tracksDeadline = executionContext && executionContext.deadlineAt !== null;
    for (let i = 1; i < layout.rowStarts.length; i++) {
        const start = Math.max(1, layout.rowStarts[i]);
        const end = layout.rowEnds[i];
        const previousStart = layout.rowStarts[i - 1];
        const previousEnd = layout.rowEnds[i - 1];
        for (let j = start; j <= end; j++) {
            if (tracksDeadline) {
                deadlineWork++;
                if (deadlineWork >= DIFF_DEADLINE_CHECK_INTERVAL) {
                    executionContext.deadlineWorkSinceCheck += deadlineWork;
                    deadlineWork = 0;
                    checkDiffDeadline(executionContext, false);
                }
            }
            if (j - 1 < previousStart || j - 1 > previousEnd) continue;
            work += alignmentScoreWorkForLengths(
                leftLines[leftStart + i - 1].length,
                rightLines[rightStart + j - 1].length
            );
            if (work > limit) {
                if (deadlineWork) {
                    executionContext.deadlineWorkSinceCheck += deadlineWork;
                    checkDiffDeadline(executionContext, false);
                }
                return work;
            }
        }
    }
    if (deadlineWork) {
        executionContext.deadlineWorkSinceCheck += deadlineWork;
        checkDiffDeadline(executionContext, false);
    }
    return work;
}

function alignmentActionPriority(action, leftCount, rightCount) {
    if (action === ALIGN_ACTION_PAIR) return 0;
    if (leftCount > rightCount) {
        return action === ALIGN_ACTION_MISSING ? 1 : 2;
    }
    return action === ALIGN_ACTION_ADDED ? 1 : 2;
}

function isBetterAlignmentCandidate(
    cost,
    pairCount,
    drift,
    action,
    bestCost,
    bestPairCount,
    bestDrift,
    bestAction,
    leftCount,
    rightCount
) {
    if (cost !== bestCost) return cost < bestCost;
    if (pairCount !== bestPairCount) return pairCount > bestPairCount;
    if (drift !== bestDrift) return drift < bestDrift;
    return alignmentActionPriority(action, leftCount, rightCount)
        < alignmentActionPriority(bestAction, leftCount, rightCount);
}

function alignmentBackpointerAt(layout, row, column, backpointers) {
    if (column < layout.rowStarts[row] || column > layout.rowEnds[row]) {
        return ALIGN_ACTION_NONE;
    }
    return backpointers[layout.rowOffsets[row] + column - layout.rowStarts[row]];
}

function runAlignmentDp(leftCount, rightCount, layout, getScoreQ, executionContext) {
    const backpointers = new Uint8Array(layout.cellCount);
    let prevCost = new Float64Array(rightCount + 1);
    let currCost = new Float64Array(rightCount + 1);
    let prevPairs = new Uint32Array(rightCount + 1);
    let currPairs = new Uint32Array(rightCount + 1);
    let prevDrift = new Float64Array(rightCount + 1);
    let currDrift = new Float64Array(rightCount + 1);
    prevCost.fill(Infinity);
    currCost.fill(Infinity);
    prevDrift.fill(Infinity);
    currDrift.fill(Infinity);

    const firstStart = layout.rowStarts[0];
    const firstEnd = layout.rowEnds[0];
    for (let j = firstStart; j <= firstEnd; j++) {
        const pointerOffset = layout.rowOffsets[0] + j - firstStart;
        if (j === 0) {
            prevCost[j] = 0;
            prevPairs[j] = 0;
            prevDrift[j] = 0;
            continue;
        }
        if (j - 1 >= firstStart && Number.isFinite(prevCost[j - 1])) {
            prevCost[j] = prevCost[j - 1] + ALIGN_SCORE_SCALE;
            prevPairs[j] = prevPairs[j - 1];
            prevDrift[j] = prevDrift[j - 1];
            backpointers[pointerOffset] = ALIGN_ACTION_ADDED;
        }
    }

    let prevStart = firstStart;
    let prevEnd = firstEnd;
    for (let i = 1; i <= leftCount; i++) {
        const currentStart = layout.rowStarts[i];
        const currentEnd = layout.rowEnds[i];
        for (let j = currentStart; j <= currentEnd; j++) {
            currCost[j] = Infinity;
            currPairs[j] = 0;
            currDrift[j] = Infinity;
            let bestAction = ALIGN_ACTION_NONE;
            let bestCost = Infinity;
            let bestPairCount = 0;
            let bestDrift = Infinity;

            if (j >= prevStart && j <= prevEnd && Number.isFinite(prevCost[j])) {
                const cost = prevCost[j] + ALIGN_SCORE_SCALE;
                if (isBetterAlignmentCandidate(
                    cost,
                    prevPairs[j],
                    prevDrift[j],
                    ALIGN_ACTION_MISSING,
                    bestCost,
                    bestPairCount,
                    bestDrift,
                    bestAction,
                    leftCount,
                    rightCount
                )) {
                    bestAction = ALIGN_ACTION_MISSING;
                    bestCost = cost;
                    bestPairCount = prevPairs[j];
                    bestDrift = prevDrift[j];
                }
            }

            if (j > currentStart && Number.isFinite(currCost[j - 1])) {
                const cost = currCost[j - 1] + ALIGN_SCORE_SCALE;
                if (isBetterAlignmentCandidate(
                    cost,
                    currPairs[j - 1],
                    currDrift[j - 1],
                    ALIGN_ACTION_ADDED,
                    bestCost,
                    bestPairCount,
                    bestDrift,
                    bestAction,
                    leftCount,
                    rightCount
                )) {
                    bestAction = ALIGN_ACTION_ADDED;
                    bestCost = cost;
                    bestPairCount = currPairs[j - 1];
                    bestDrift = currDrift[j - 1];
                }
            }

            if (j > 0 && j - 1 >= prevStart && j - 1 <= prevEnd
                && Number.isFinite(prevCost[j - 1])) {
                const scoreQ = getScoreQ(i - 1, j - 1);
                if (scoreQ >= 0) {
                    const cost = prevCost[j - 1]
                        + (2 * (ALIGN_SCORE_SCALE - scoreQ));
                    const pairCount = prevPairs[j - 1] + 1;
                    const drift = prevDrift[j - 1] + Math.abs(
                        ((2 * (i - 1) + 1) * rightCount)
                        - ((2 * (j - 1) + 1) * leftCount)
                    );
                    if (isBetterAlignmentCandidate(
                        cost,
                        pairCount,
                        drift,
                        ALIGN_ACTION_PAIR,
                        bestCost,
                        bestPairCount,
                        bestDrift,
                        bestAction,
                        leftCount,
                        rightCount
                    )) {
                        bestAction = ALIGN_ACTION_PAIR;
                        bestCost = cost;
                        bestPairCount = pairCount;
                        bestDrift = drift;
                    }
                }
            }

            if (bestAction !== ALIGN_ACTION_NONE) {
                currCost[j] = bestCost;
                currPairs[j] = bestPairCount;
                currDrift[j] = bestDrift;
                backpointers[layout.rowOffsets[i] + j - currentStart] = bestAction;
            }
        }

        if (executionContext) {
            executionContext.deadlineWorkSinceCheck += currentEnd - currentStart + 1;
            checkDiffDeadline(executionContext, false);
        }
        let swap = prevCost;
        prevCost = currCost;
        currCost = swap;
        swap = prevPairs;
        prevPairs = currPairs;
        currPairs = swap;
        swap = prevDrift;
        prevDrift = currDrift;
        currDrift = swap;
        prevStart = currentStart;
        prevEnd = currentEnd;
    }

    if (!Number.isFinite(prevCost[rightCount])) return null;
    const actions = [];
    let i = leftCount;
    let j = rightCount;
    while (i > 0 || j > 0) {
        const action = alignmentBackpointerAt(layout, i, j, backpointers);
        if (action === ALIGN_ACTION_PAIR) {
            actions.push({ type: 'PAIR', leftIndex: i - 1, rightIndex: j - 1 });
            i--;
            j--;
        } else if (action === ALIGN_ACTION_MISSING) {
            actions.push({ type: 'MISSING', leftIndex: i - 1 });
            i--;
        } else if (action === ALIGN_ACTION_ADDED) {
            actions.push({ type: 'ADDED', rightIndex: j - 1 });
            j--;
        } else {
            return null;
        }
    }
    actions.reverse();
    return {
        actions: actions,
        cost: prevCost[rightCount],
        pairCount: prevPairs[rightCount],
        drift: prevDrift[rightCount],
        backpointerBytes: backpointers.byteLength
    };
}

function createAlignmentStats() {
    return {
        fullHunks: 0,
        bandedHunks: 0,
        fallbackHunks: 0,
        cellsUsed: 0,
        scoreWorkUsed: 0,
        scoreEvaluations: 0,
        leftProfilesBuilt: 0,
        rightProfilesBuilt: 0,
        intralineComputations: 0,
        maxBandUsed: 0
    };
}

function createAlignmentContext(
    leftLines,
    rightLines,
    workBudget,
    executionContext,
    resultStats
) {
    const alignmentStats = createAlignmentStats();
    if (resultStats) resultStats.alignment = alignmentStats;
    return {
        leftLines: leftLines,
        rightLines: rightLines,
        workBudget: normalizeDiffWorkBudget(workBudget),
        executionContext: executionContext || null,
        leftProfiles: new Array(leftLines.length),
        rightProfiles: new Array(rightLines.length),
        stats: alignmentStats
    };
}

function getCachedAlignmentProfile(context, side, lineIndex) {
    const isRight = side === 'right';
    const cache = isRight ? context.rightProfiles : context.leftProfiles;
    if (!cache[lineIndex]) {
        const lines = isRight ? context.rightLines : context.leftLines;
        cache[lineIndex] = createLineProfile(lines[lineIndex]);
        if (isRight) context.stats.rightProfilesBuilt++;
        else context.stats.leftProfilesBuilt++;
    }
    return cache[lineIndex];
}

function alignmentCandidateScoreQ(context, leftLineIndex, rightLineIndex) {
    const leftLine = context.leftLines[leftLineIndex];
    const rightLine = context.rightLines[rightLineIndex];
    const scoreWork = alignmentScoreWorkForLengths(leftLine.length, rightLine.length);
    if (context.workBudget.remainingAlignmentScoreWork < scoreWork) {
        context.workBudget.remainingAlignmentScoreWork = 0;
        throw createCodedDiffError(
            ALIGNMENT_SCORE_BUDGET_ERROR_CODE,
            'Row alignment score budget exceeded.'
        );
    }
    context.workBudget.remainingAlignmentScoreWork -= scoreWork;
    context.stats.scoreWorkUsed += scoreWork;
    context.stats.scoreEvaluations++;

    if (context.executionContext) {
        context.executionContext.deadlineWorkSinceCheck += scoreWork;
        checkDiffDeadline(context.executionContext, false);
    }

    const leftProfile = getCachedAlignmentProfile(context, 'left', leftLineIndex);
    const rightProfile = getCachedAlignmentProfile(context, 'right', rightLineIndex);
    const scoreQ = Math.round(
        modifiedLineScoreFromProfiles(leftProfile, rightProfile) * ALIGN_SCORE_SCALE
    );
    const shortPair = leftProfile.isShort && rightProfile.isShort;
    const thresholdQ = shortPair
        ? Math.round(SHORT_LINE_SIMILARITY_THRESHOLD * ALIGN_SCORE_SCALE)
        : Math.round(MODIFIED_SIMILARITY_THRESHOLD * ALIGN_SCORE_SCALE);
    return scoreQ >= thresholdQ ? scoreQ : -1;
}

function alignmentLayoutFits(
    layout,
    leftLines,
    rightLines,
    leftStart,
    rightStart,
    context,
    maxCells
) {
    if (layout.cellCount > maxCells) return false;
    const scoreWork = estimateAlignmentScoreWork(
        layout,
        leftLines,
        rightLines,
        leftStart,
        rightStart,
        context.workBudget.remainingAlignmentScoreWork,
        context.executionContext
    );
    return scoreWork <= context.workBudget.remainingAlignmentScoreWork;
}

function selectAlignmentLayout(
    leftLines,
    rightLines,
    leftStart,
    leftCount,
    rightStart,
    rightCount,
    context
) {
    const fullCellCount = (leftCount + 1) * (rightCount + 1);
    if (fullCellCount <= ALIGN_FULL_MAX_CELLS) {
        const full = createFullAlignmentLayout(leftCount, rightCount);
        if (alignmentLayoutFits(
            full,
            leftLines,
            rightLines,
            leftStart,
            rightStart,
            context,
            context.workBudget.remainingAlignmentCells
        )) {
            return full;
        }
    }

    const maxCells = Math.min(
        ALIGN_BAND_MAX_CELLS,
        context.workBudget.remainingAlignmentCells
    );
    let low = 1;
    let high = ALIGN_PREFERRED_BAND;
    let best = null;
    while (low <= high) {
        const band = Math.floor((low + high) / 2);
        const layout = createBandedAlignmentLayout(leftCount, rightCount, band);
        if (alignmentLayoutFits(
            layout,
            leftLines,
            rightLines,
            leftStart,
            rightStart,
            context,
            maxCells
        )) {
            best = layout;
            low = band + 1;
        } else {
            high = band - 1;
        }
    }
    return best;
}

function conservativeAlignmentFallback(leftStart, leftCount, rightStart, rightCount) {
    const actions = [];
    for (let i = 0; i < leftCount; i++) {
        actions.push({ type: 'MISSING', leftIndex: leftStart + i });
    }
    for (let j = 0; j < rightCount; j++) {
        actions.push({ type: 'ADDED', rightIndex: rightStart + j });
    }
    return actions;
}

function computeAlignedRowActions(
    leftLines,
    rightLines,
    leftStart,
    leftEnd,
    rightStart,
    rightEnd,
    context
) {
    if (!context) {
        throw new TypeError('Aligned row computation requires an alignment context.');
    }
    const leftCount = leftEnd - leftStart;
    const rightCount = rightEnd - rightStart;
    if (leftCount === 0 || rightCount === 0) {
        return conservativeAlignmentFallback(leftStart, leftCount, rightStart, rightCount);
    }

    const alignmentContext = context;
    const layout = selectAlignmentLayout(
        leftLines,
        rightLines,
        leftStart,
        leftCount,
        rightStart,
        rightCount,
        alignmentContext
    );
    if (!layout) {
        alignmentContext.stats.fallbackHunks++;
        return conservativeAlignmentFallback(leftStart, leftCount, rightStart, rightCount);
    }

    alignmentContext.workBudget.remainingAlignmentCells -= layout.cellCount;
    alignmentContext.stats.cellsUsed += layout.cellCount;
    if (layout.kind === 'full') alignmentContext.stats.fullHunks++;
    else {
        alignmentContext.stats.bandedHunks++;
        alignmentContext.stats.maxBandUsed = Math.max(
            alignmentContext.stats.maxBandUsed,
            layout.band
        );
    }

    // The DP asks for scores row by row with a non-decreasing column window, so a
    // profile is dropped once the window has passed it. Without this a single
    // hunk spanning two maximum-size inputs keeps every line profile alive.
    let activeLeftIndex = -1;
    let releasedRightEnd = rightStart;
    let result;
    try {
        result = runAlignmentDp(
            leftCount,
            rightCount,
            layout,
            function (leftLocalIndex, rightLocalIndex) {
                const leftIndex = leftStart + leftLocalIndex;
                const rightIndex = rightStart + rightLocalIndex;
                if (leftIndex !== activeLeftIndex) {
                    if (activeLeftIndex >= 0) {
                        alignmentContext.leftProfiles[activeLeftIndex] = undefined;
                    }
                    activeLeftIndex = leftIndex;
                    while (releasedRightEnd < rightIndex) {
                        alignmentContext.rightProfiles[releasedRightEnd++] = undefined;
                    }
                }
                return alignmentCandidateScoreQ(alignmentContext, leftIndex, rightIndex);
            },
            alignmentContext.executionContext
        );
    } catch (err) {
        if (!err || err.code !== ALIGNMENT_SCORE_BUDGET_ERROR_CODE) throw err;
        result = null;
    } finally {
        if (activeLeftIndex >= 0) alignmentContext.leftProfiles[activeLeftIndex] = undefined;
        while (releasedRightEnd < rightEnd) {
            alignmentContext.rightProfiles[releasedRightEnd++] = undefined;
        }
    }
    if (!result) {
        alignmentContext.stats.fallbackHunks++;
        return conservativeAlignmentFallback(leftStart, leftCount, rightStart, rightCount);
    }

    return result.actions.map(function (action) {
        if (action.type === 'PAIR') {
            return {
                type: 'PAIR',
                leftIndex: leftStart + action.leftIndex,
                rightIndex: rightStart + action.rightIndex
            };
        }
        if (action.type === 'MISSING') {
            return { type: 'MISSING', leftIndex: leftStart + action.leftIndex };
        }
        return { type: 'ADDED', rightIndex: rightStart + action.rightIndex };
    });
}

function appendAlignedActions(actions, rows, createRow) {
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (action.type === 'PAIR') {
            rows.push(createRow(
                'modified',
                action.leftIndex,
                action.rightIndex
            ));
        } else if (action.type === 'MISSING') {
            rows.push(createRow(
                'missing',
                action.leftIndex,
                null
            ));
        } else {
            rows.push(createRow(
                'added',
                null,
                action.rightIndex
            ));
        }
    }
}

function appendMyersRanges(
    leftLines,
    rightLines,
    ranges,
    diff,
    createRow,
    alignmentContext
) {
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
        const actions = computeAlignedRowActions(
            leftLines,
            rightLines,
            pendingLeftStart,
            pendingLeftEnd,
            pendingRightStart,
            pendingRightEnd,
            alignmentContext
        );
        appendAlignedActions(actions, diff, createRow);
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
                diff.push(createRow(
                    'match',
                    range.leftStart + j,
                    range.rightStart + j
                ));
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

const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;

// Number of letters and digits on a line, counted up to limit. Lines without
// any are "weak": braces, blank lines and rules repeat everywhere, so they
// say nothing about where a piece of text came from.
function lineWordWeight(line, limit) {
    let weight = 0;
    for (let index = 0; index < line.length && weight < limit; index++) {
        const code = line.charCodeAt(index);
        if (code < 0x0080) {
            if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5A)
                || (code >= 0x61 && code <= 0x7A)) {
                weight++;
            }
        } else if (WORD_CHARACTER_PATTERN.test(line[index])) {
            weight++;
        }
    }
    return weight;
}

// Marks removed lines that reappear unchanged among the added lines as moved.
// A move is a run of consecutive removed lines equal to a run of consecutive
// added lines that together hold at least MOVED_BLOCK_MIN_WEIGHT letters and
// digits, so a lone brace or blank line is never called a move. A single line
// must also occur only once in each text: a common line removed in one place
// and added in another is more likely two edits than a move. The rows stay
// missing and added rows; they only learn where their counterpart is.
//
// A moved block may also have been edited on the way. Once the unchanged moves
// are known, each block grows over the removed and added lines right next to
// it, pairing them in order as long as the two lines are similar enough to be
// one modified line (or equal). The unchanged lines always anchor the move:
// edited lines are taken between two blocks that moved the same distance, or
// at the end of a block with at least two unchanged lines for each of them,
// and a line two blocks would pair differently is left alone. An
// edited pair carries its changed ranges (leftRange* on the removed row,
// rightRange* on the added row); when those cannot be computed precisely the
// pair stays a plain removed and added line, so a moved row without ranges
// always means unchanged text.
function annotateMovedRows(rows, leftLines, rightLines, stats, executionContext, detail) {
    const leftRow = new Int32Array(leftLines.length).fill(-1);
    const rightRow = new Int32Array(rightLines.length).fill(-1);
    let missing = 0;
    let added = 0;
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (row.type === 'missing') {
            leftRow[row.leftLineIndex] = index;
            missing++;
        } else if (row.type === 'added') {
            rightRow[row.rightLineIndex] = index;
            added++;
        }
    }
    if (missing === 0 || added === 0) return;

    const weights = new Map();
    function weightOf(line) {
        let weight = weights.get(line);
        if (weight === undefined) {
            weight = lineWordWeight(line, MOVED_BLOCK_MIN_WEIGHT);
            weights.set(line, weight);
        }
        return weight;
    }

    // Added lines that can start a move, by text, in line order.
    const candidates = new Map();
    for (let index = 0; index < rightLines.length; index++) {
        if (rightRow[index] < 0 || weightOf(rightLines[index]) === 0) continue;
        const entry = candidates.get(rightLines[index]);
        if (entry) entry.lines.push(index);
        else candidates.set(rightLines[index], { lines: [index], first: 0 });
    }

    // How often each line that could start a move occurs on each side: a move
    // of a single line is only believable when that line exists once.
    const leftCounts = new Map();
    const rightCounts = new Map();
    for (let index = 0; index < leftLines.length; index++) {
        if (candidates.has(leftLines[index])) {
            leftCounts.set(leftLines[index], (leftCounts.get(leftLines[index]) || 0) + 1);
        }
    }
    for (let index = 0; index < rightLines.length; index++) {
        if (candidates.has(rightLines[index])) {
            rightCounts.set(rightLines[index], (rightCounts.get(rightLines[index]) || 0) + 1);
        }
    }

    const leftTarget = new Int32Array(leftLines.length).fill(-1);
    const rightTaken = new Uint8Array(rightLines.length);
    let work = 0;

    function free(leftIndex, rightIndex) {
        return leftIndex >= 0 && rightIndex >= 0
            && leftIndex < leftLines.length && rightIndex < rightLines.length
            && leftRow[leftIndex] >= 0 && rightRow[rightIndex] >= 0
            && leftTarget[leftIndex] < 0 && rightTaken[rightIndex] === 0
            && leftLines[leftIndex] === rightLines[rightIndex];
    }

    for (let leftIndex = 0; leftIndex < leftLines.length; leftIndex++) {
        if (leftRow[leftIndex] < 0 || leftTarget[leftIndex] >= 0) continue;
        if (work >= MOVED_BLOCK_MAX_WORK) break;
        const entry = candidates.get(leftLines[leftIndex]);
        if (!entry || weightOf(leftLines[leftIndex]) === 0) continue;

        while (entry.first < entry.lines.length && rightTaken[entry.lines[entry.first]] !== 0) {
            entry.first++;
        }

        let bestStart = -1;
        let bestRight = -1;
        let bestLength = 0;
        let tried = 0;
        for (let slot = entry.first; slot < entry.lines.length
            && tried < MOVED_BLOCK_MAX_CANDIDATES; slot++) {
            const rightIndex = entry.lines[slot];
            work++;
            if (rightTaken[rightIndex] !== 0) continue;
            tried++;

            let before = 0;
            while (free(leftIndex - before - 1, rightIndex - before - 1)) before++;
            let after = 1;
            while (free(leftIndex + after, rightIndex + after)) after++;
            work += before + after;
            if (before + after > bestLength) {
                bestLength = before + after;
                bestStart = leftIndex - before;
                bestRight = rightIndex - before;
            }
        }
        if (executionContext) {
            executionContext.deadlineWorkSinceCheck += tried + bestLength;
            checkDiffDeadline(executionContext, false);
        }
        if (bestLength === 0) continue;

        let weight = 0;
        for (let offset = 0; offset < bestLength && weight < MOVED_BLOCK_MIN_WEIGHT; offset++) {
            weight += weightOf(leftLines[bestStart + offset]);
        }
        if (weight < MOVED_BLOCK_MIN_WEIGHT) continue;
        if (bestLength === 1 && (leftCounts.get(leftLines[bestStart]) !== 1
            || rightCounts.get(leftLines[bestStart]) !== 1)) {
            continue;
        }

        for (let offset = 0; offset < bestLength; offset++) {
            leftTarget[bestStart + offset] = bestRight + offset;
            rightTaken[bestRight + offset] = 1;
            rows[leftRow[bestStart + offset]].movedTo = bestRight + offset;
            rows[rightRow[bestRight + offset]].movedFrom = bestStart + offset;
        }
        stats.movedRows += bestLength;
    }

    if (!detail || stats.movedRows === 0) return;

    const blocks = [];
    for (let leftIndex = 0; leftIndex < leftLines.length; leftIndex++) {
        if (leftTarget[leftIndex] < 0) continue;
        let end = leftIndex + 1;
        while (end < leftLines.length && leftTarget[end] === leftTarget[end - 1] + 1) end++;
        blocks.push({ start: leftIndex, end: end, right: leftTarget[leftIndex], before: null, after: null });
        leftIndex = end - 1;
    }

    const wantedRight = new Map();
    const wantedLeft = new Map();
    let scoreWork = 0;

    function open(leftIndex, rightIndex) {
        return leftIndex >= 0 && rightIndex >= 0
            && leftIndex < leftLines.length && rightIndex < rightLines.length
            && leftRow[leftIndex] >= 0 && rightRow[rightIndex] >= 0
            && leftTarget[leftIndex] < 0 && rightTaken[rightIndex] === 0;
    }

    function want(pairs) {
        for (let index = 0; index < pairs.length; index++) {
            const pair = pairs[index];
            const right = wantedRight.get(pair.left);
            wantedRight.set(pair.left, right === undefined || right === pair.right ? pair.right : -2);
            const left = wantedLeft.get(pair.right);
            wantedLeft.set(pair.right, left === undefined || left === pair.left ? pair.left : -2);
        }
        return pairs;
    }

    // Pairs count lines in order from the given start, away from the block
    // when direction is negative. With whole set, every one of them has to
    // qualify; otherwise the run ends at the first that does not.
    function collect(leftStart, rightStart, count, direction, maxEdited, whole) {
        const pairs = [];
        let edited = 0;
        for (let step = 0; step < count; step++) {
            const leftIndex = leftStart + step * direction;
            const rightIndex = rightStart + step * direction;
            if (!open(leftIndex, rightIndex)) return whole ? null : pairs;
            const same = leftLines[leftIndex] === rightLines[rightIndex];
            if (!same) {
                if (edited === maxEdited || scoreWork >= MOVED_EDIT_MAX_WORK) return whole ? null : pairs;
                const work = 1 + leftLines[leftIndex].length + rightLines[rightIndex].length;
                scoreWork += work;
                executionContext.deadlineWorkSinceCheck += work;
                checkDiffDeadline(executionContext, false);
                if (!quantizedModifiedLineScore(leftLines[leftIndex], rightLines[rightIndex]).allowed) {
                    return whole ? null : pairs;
                }
                edited++;
            }
            pairs.push({ left: leftIndex, right: rightIndex, same: same });
        }
        return pairs;
    }

    // Lines between two blocks that moved by the same distance are held from
    // both sides: together the blocks may carry as many edited lines as they
    // have unchanged ones.
    for (let index = 0; index + 1 < blocks.length; index++) {
        const block = blocks[index];
        const next = blocks[index + 1];
        const gap = next.start - block.end;
        const anchors = next.end - block.start - gap;
        if (gap !== next.right - (block.right + block.end - block.start) || gap > anchors * 2) continue;
        const pairs = collect(block.end, block.right + block.end - block.start, gap, 1, anchors, true);
        if (!pairs) continue;
        block.after = want(pairs);
        next.before = [];
    }

    // At an open end a block needs two unchanged lines for every edited one:
    // in text made of similar lines, the neighbours of a single moved line
    // resemble the neighbours at its destination by chance.
    for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index];
        const length = block.end - block.start;
        const maxEdited = Math.floor(length / 2);
        if (!block.before) {
            block.before = maxEdited === 0 ? []
                : want(collect(block.start - 1, block.right - 1, length * 2, -1, maxEdited, false));
        }
        if (!block.after) {
            block.after = maxEdited === 0 ? []
                : want(collect(block.end, block.right + length, length * 2, 1, maxEdited, false));
        }
    }

    function claim(pairs) {
        for (let index = 0; index < pairs.length; index++) {
            const pair = pairs[index];
            if (wantedRight.get(pair.left) !== pair.right || wantedLeft.get(pair.right) !== pair.left) {
                return;
            }
            // The block on the other side of a gap may have taken the pair.
            if (leftTarget[pair.left] === pair.right) continue;
            if (leftTarget[pair.left] >= 0 || rightTaken[pair.right] !== 0) return;

            const removedRow = rows[leftRow[pair.left]];
            const addedRow = rows[rightRow[pair.right]];
            if (!pair.same) {
                const intraline = computeIntralineChangeRanges(
                    detail.leftContent[pair.left],
                    detail.rightContent[pair.right],
                    detail.workBudget,
                    executionContext,
                    detail.ignoreWhitespace,
                    detail.ignoreCase
                );
                const leftRangeCount = intraline.leftBounds.length / 2;
                const rightRangeCount = intraline.rightBounds.length / 2;
                const rangePairs = leftRangeCount + rightRangeCount;
                if (intraline.detailMode !== 'precise' || rangePairs === 0
                    || rangePairs > detail.modelLimits.maxRangePairsPerRow
                    || stats.rangePairs + rangePairs > detail.modelLimits.maxRangePairsTotal
                    || rangePairs > detail.workBudget.remainingRangePairs) {
                    return;
                }
                removedRow.leftRangeOffset = detail.rangePool.length;
                removedRow.leftRangeCount = leftRangeCount;
                appendBoundsToPool(detail.rangePool, intraline.leftBounds);
                addedRow.rightRangeOffset = detail.rangePool.length;
                addedRow.rightRangeCount = rightRangeCount;
                appendBoundsToPool(detail.rangePool, intraline.rightBounds);
                detail.workBudget.remainingRangePairs -= rangePairs;
                stats.rangePairs += rangePairs;
                stats.movedChangedRows++;
            }
            leftTarget[pair.left] = pair.right;
            rightTaken[pair.right] = 1;
            removedRow.movedTo = pair.right;
            addedRow.movedFrom = pair.left;
            stats.movedRows++;
        }
    }

    for (let index = 0; index < blocks.length; index++) {
        claim(blocks[index].before);
        claim(blocks[index].after);
    }
}

const NON_ASCII_PATTERN = /[^\x00-\x7F]/;
const EQUIVALENT_RANGE_MAX_COUNT = 64;
const EQUIVALENT_RANGE_MAX_LENGTH = 256;

// Finds changed ranges that only differ in Unicode normalization: the text of a
// range on one side is canonically equivalent (equal after NFC) to the text of a
// range on the other side without being the same code units, as with a
// precomposed "é" against "e" plus a combining accent. Bounds are start/end
// pairs in each line, read from the given offset. Returns one flag per range for
// each side, or null when no range qualifies. The model's row count and the
// view's hint both come from this one rule.
function findCanonicallyEquivalentRanges(
    leftLine, leftBounds, leftOffset, leftCount,
    rightLine, rightBounds, rightOffset, rightCount
) {
    if (leftCount === 0 || rightCount === 0
        || leftCount > EQUIVALENT_RANGE_MAX_COUNT || rightCount > EQUIVALENT_RANGE_MAX_COUNT) {
        return null;
    }

    function rangeTexts(line, bounds, offset, count) {
        const texts = new Array(count);
        for (let index = 0; index < count; index++) {
            const start = bounds[offset + index * 2];
            const end = bounds[offset + index * 2 + 1];
            texts[index] = end - start <= EQUIVALENT_RANGE_MAX_LENGTH ? line.slice(start, end) : '';
        }
        return texts;
    }

    const leftTexts = rangeTexts(leftLine, leftBounds, leftOffset, leftCount);
    const rightTexts = rangeTexts(rightLine, rightBounds, rightOffset, rightCount);
    // Plain ASCII has a single normalized form, so two different ASCII texts
    // are never equivalent.
    if (!leftTexts.some(function (text) { return NON_ASCII_PATTERN.test(text); })
        && !rightTexts.some(function (text) { return NON_ASCII_PATTERN.test(text); })) {
        return null;
    }

    const rightByForm = new Map();
    for (let index = 0; index < rightCount; index++) {
        if (!rightTexts[index]) continue;
        const form = rightTexts[index].normalize('NFC');
        const entry = rightByForm.get(form);
        if (entry) entry.push(index);
        else rightByForm.set(form, [index]);
    }

    let left = null;
    let right = null;
    for (let index = 0; index < leftCount; index++) {
        if (!leftTexts[index]) continue;
        const matches = rightByForm.get(leftTexts[index].normalize('NFC'));
        if (!matches) continue;
        for (let slot = 0; slot < matches.length; slot++) {
            if (rightTexts[matches[slot]] === leftTexts[index]) continue;
            if (!left) {
                left = new Uint8Array(leftCount);
                right = new Uint8Array(rightCount);
            }
            left[index] = 1;
            right[matches[slot]] = 1;
        }
    }

    return left ? { left: left, right: right } : null;
}

function buildLineStarts(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 0x000A) {
            starts.push(i + 1);
        }
    }
    return Uint32Array.from(starts);
}

function resolvedModelLimit(options, key, fallback) {
    const limits = options && options.modelLimits;
    if (!limits || !Object.prototype.hasOwnProperty.call(limits, key)) {
        return fallback;
    }

    const value = limits[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(fallback, Math.max(0, Math.floor(value)));
}

function normalizeDiffWorkBudget(workBudget) {
    if (!workBudget) return createDiffWorkBudget();

    const defaults = createDiffWorkBudget();
    const keys = Object.keys(defaults);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = workBudget[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            workBudget[key] = defaults[key];
        } else {
            workBudget[key] = Math.max(0, Math.floor(value));
        }
    }
    return workBudget;
}

function appendBoundsToPool(pool, bounds) {
    for (let i = 0; i < bounds.length; i++) {
        pool.push(bounds[i]);
    }
}

function createCompactRowFactory(
    left,
    right,
    workBudget,
    rangePool,
    stats,
    modelLimits,
    executionContext,
    ignoreWhitespace,
    ignoreCase
) {
    const leftLines = left.content;
    const rightLines = right.content;
    const lastLeft = leftLines.length - 1;
    const lastRight = rightLines.length - 1;

    return function (type, leftLineIndex, rightLineIndex) {
        if ((type === 'match' || type === 'modified')
            && leftLineIndex < lastLeft && rightLineIndex < lastRight
            && left.carriageReturns[leftLineIndex] !== right.carriageReturns[rightLineIndex]) {
            stats.lineEndingRows++;
        }

        if (type === 'match') {
            stats.matchedRows++;
            const leftLine = leftLines[leftLineIndex];
            const rightLine = rightLines[rightLineIndex];
            if (leftLine !== rightLine) {
                // With both options on, a row counts for each one that the
                // other alone would not have made equal.
                if (ignoreWhitespace && (!ignoreCase
                    || caseInsensitiveText(leftLine) !== caseInsensitiveText(rightLine))) {
                    stats.whitespaceRows++;
                }
                if (ignoreCase && (!ignoreWhitespace
                    || whitespaceInsensitiveLine(leftLine) !== whitespaceInsensitiveLine(rightLine))) {
                    stats.caseRows++;
                }
            }
            return {
                type: 'match',
                leftLineIndex: leftLineIndex,
                rightLineIndex: rightLineIndex
            };
        }

        if (type === 'missing') {
            stats.missingRows++;
            return { type: 'missing', leftLineIndex: leftLineIndex };
        }

        if (type === 'added') {
            stats.addedRows++;
            return { type: 'added', rightLineIndex: rightLineIndex };
        }

        stats.modifiedRows++;
        if (stats.alignment) stats.alignment.intralineComputations++;
        const intraline = computeIntralineChangeRanges(
            leftLines[leftLineIndex],
            rightLines[rightLineIndex],
            workBudget,
            executionContext,
            ignoreWhitespace,
            ignoreCase
        );
        const leftRangeCount = intraline.leftBounds.length / 2;
        const rightRangeCount = intraline.rightBounds.length / 2;
        const rowRangePairs = leftRangeCount + rightRangeCount;
        const withinRowLimit = rowRangePairs <= modelLimits.maxRangePairsPerRow;
        const withinModelLimit = stats.rangePairs + rowRangePairs <= modelLimits.maxRangePairsTotal;
        const withinWorkBudget = rowRangePairs <= workBudget.remainingRangePairs;
        const usePreciseRanges = intraline.detailMode === 'precise'
            && withinRowLimit && withinModelLimit && withinWorkBudget;

        if (!usePreciseRanges) {
            stats.wholeLineRows++;
            // Without ranges the whole line is the change on both sides.
            const leftLine = leftLines[leftLineIndex];
            const rightLine = rightLines[rightLineIndex];
            if (findCanonicallyEquivalentRanges(
                leftLine, [0, leftLine.length], 0, 1,
                rightLine, [0, rightLine.length], 0, 1
            )) {
                stats.normalizationRows++;
            }
            return {
                type: 'modified',
                leftLineIndex: leftLineIndex,
                rightLineIndex: rightLineIndex,
                leftRangeOffset: rangePool.length,
                leftRangeCount: 0,
                rightRangeOffset: rangePool.length,
                rightRangeCount: 0,
                detailMode: 'whole-line'
            };
        }

        if (findCanonicallyEquivalentRanges(
            leftLines[leftLineIndex], intraline.leftBounds, 0, leftRangeCount,
            rightLines[rightLineIndex], intraline.rightBounds, 0, rightRangeCount
        )) {
            stats.normalizationRows++;
        }

        const leftRangeOffset = rangePool.length;
        appendBoundsToPool(rangePool, intraline.leftBounds);
        const rightRangeOffset = rangePool.length;
        appendBoundsToPool(rangePool, intraline.rightBounds);
        workBudget.remainingRangePairs -= rowRangePairs;
        stats.rangePairs += rowRangePairs;
        stats.preciseModifiedRows++;

        return {
            type: 'modified',
            leftLineIndex: leftLineIndex,
            rightLineIndex: rightLineIndex,
            leftRangeOffset: leftRangeOffset,
            leftRangeCount: leftRangeCount,
            rightRangeOffset: rightRangeOffset,
            rightRangeCount: rightRangeCount,
            detailMode: 'precise'
        };
    };
}

function reportDiffProgress(options, phase, processed, total) {
    if (!options || typeof options.onProgress !== 'function') return;
    options.onProgress({ phase: phase, processed: processed, total: total });
}

function computeDiffModel(left, right, options) {
    const workBudget = normalizeDiffWorkBudget(options && options.workBudget);
    const executionContext = createDiffExecutionContext(options || {}, workBudget);
    checkDiffDeadline(executionContext, true);

    const validated = validateDiffInput(left, right);
    if (!validated.ok) {
        throw new Error(validated.message);
    }
    checkDiffDeadline(executionContext, true);

    const modelLimits = {
        maxRangePairsPerRow: resolvedModelLimit(
            options,
            'maxRangePairsPerRow',
            DIFF_MODEL_LIMITS.maxRangePairsPerRow
        ),
        maxRangePairsTotal: resolvedModelLimit(
            options,
            'maxRangePairsTotal',
            DIFF_MODEL_LIMITS.maxRangePairsTotal
        )
    };
    const ignoreWhitespace = !!(options && options.ignoreWhitespace);
    const ignoreCase = !!(options && options.ignoreCase);
    const leftPrepared = prepareDiffLines(validated.leftLines, ignoreWhitespace, ignoreCase);
    const rightPrepared = prepareDiffLines(validated.rightLines, ignoreWhitespace, ignoreCase);
    const leftLines = leftPrepared.keys;
    const rightLines = rightPrepared.keys;
    const rows = [];
    const rangePool = [];
    const stats = {
        matchedRows: 0,
        modifiedRows: 0,
        missingRows: 0,
        addedRows: 0,
        preciseModifiedRows: 0,
        wholeLineRows: 0,
        rangePairs: 0,
        lineEndingRows: 0,
        whitespaceRows: 0,
        caseRows: 0,
        movedRows: 0,
        movedChangedRows: 0,
        normalizationRows: 0
    };
    const progressTotal = Math.max(leftLines.length, rightLines.length);
    reportDiffProgress(options, 'line-diff', 0, progressTotal);
    const ranges = slideChangeRanges(
        computeLineRanges(leftLines, rightLines, { executionContext: executionContext }),
        leftLines,
        rightLines,
        leftPrepared.content,
        rightPrepared.content,
        executionContext
    );
    reportDiffProgress(options, 'line-diff', progressTotal, progressTotal);
    reportDiffProgress(options, 'intraline', 0, progressTotal);
    const createRow = createCompactRowFactory(
        leftPrepared,
        rightPrepared,
        workBudget,
        rangePool,
        stats,
        modelLimits,
        executionContext,
        ignoreWhitespace,
        ignoreCase
    );
    const alignmentContext = createAlignmentContext(
        leftLines,
        rightLines,
        workBudget,
        executionContext,
        stats
    );
    appendMyersRanges(
        leftLines,
        rightLines,
        ranges,
        rows,
        createRow,
        alignmentContext
    );
    annotateMovedRows(rows, leftLines, rightLines, stats, executionContext, {
        leftContent: leftPrepared.content,
        rightContent: rightPrepared.content,
        workBudget: workBudget,
        rangePool: rangePool,
        modelLimits: modelLimits,
        ignoreWhitespace: ignoreWhitespace,
        ignoreCase: ignoreCase
    });
    checkDiffDeadline(executionContext, true);
    reportDiffProgress(options, 'intraline', progressTotal, progressTotal);

    const mismatchCount = stats.modifiedRows + stats.missingRows + stats.addedRows;
    stats.workBudget = {
        remainingMyersSteps: workBudget.remainingMyersSteps,
        remainingAlignmentCells: workBudget.remainingAlignmentCells,
        remainingAlignmentScoreWork: workBudget.remainingAlignmentScoreWork,
        remainingCharEditDistance: workBudget.remainingCharEditDistance,
        remainingRangePairs: workBudget.remainingRangePairs
    };
    return {
        version: 2,
        rows: rows,
        changeBounds: Uint32Array.from(rangePool),
        leftLineStarts: buildLineStarts(left),
        rightLineStarts: buildLineStarts(right),
        mismatchCount: mismatchCount,
        stats: stats
    };
}

const UNIFIED_DIFF_CONTEXT_LINES = 3;
const UNIFIED_DIFF_NO_NEWLINE = '\\ No newline at end of file\n';

// The entry after the last line feed is a line only when text follows it.
function unifiedDiffLineCount(text, lineStarts) {
    const endsWithLineFeed = !text.length || text.charCodeAt(text.length - 1) === 0x000A;
    return endsWithLineFeed ? lineStarts.length - 1 : lineStarts.length;
}

function unifiedDiffLineEnd(text, lineStarts, lineIndex) {
    return lineIndex + 1 < lineStarts.length ? lineStarts[lineIndex + 1] - 1 : text.length;
}

function appendUnifiedDiffLines(parts, prefix, text, lineStarts, first, last) {
    for (let lineIndex = first; lineIndex < last; lineIndex++) {
        parts.push(prefix, text.slice(lineStarts[lineIndex], unifiedDiffLineEnd(text, lineStarts, lineIndex)), '\n');
        if (lineIndex + 1 >= lineStarts.length) parts.push(UNIFIED_DIFF_NO_NEWLINE);
    }
}

function unifiedDiffFileName(name, fallback) {
    const value = typeof name === 'string' ? name.replace(/[\u0000-\u001F\u007F]/g, '_').trim() : '';
    return value || fallback;
}

function unifiedDiffRange(start, length) {
    return (length ? start + 1 : start) + ',' + length;
}

// A unified diff of the two original texts, taken from the rows of a model.
// It describes the exact texts: rows that an ignore option or the line-ending
// rule shows as matching are still changes here, so applying the result to the
// left text always gives the right text.
function createUnifiedDiff(left, right, model, options) {
    if (typeof left !== 'string' || typeof right !== 'string' || !model || model.version !== 2
        || !Array.isArray(model.rows) || !model.leftLineStarts || !model.rightLineStarts) {
        throw new TypeError('A unified diff requires both texts and their DiffModelV2 result.');
    }
    const leftStarts = model.leftLineStarts;
    const rightStarts = model.rightLineStarts;
    const leftCount = unifiedDiffLineCount(left, leftStarts);
    const rightCount = unifiedDiffLineCount(right, rightStarts);
    const requestedContext = options && options.contextLines;
    const context = Number.isInteger(requestedContext) && requestedContext >= 0
        ? requestedContext : UNIFIED_DIFF_CONTEXT_LINES;

    // Changes as [leftStart, leftEnd, rightStart, rightEnd) line ranges.
    const changes = [];
    let leftPosition = 0;
    let rightPosition = 0;
    let open = false;
    const rows = model.rows;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const hasLeft = Number.isInteger(row.leftLineIndex) && row.leftLineIndex < leftCount;
        const hasRight = Number.isInteger(row.rightLineIndex) && row.rightLineIndex < rightCount;
        if (!hasLeft && !hasRight) continue;
        let equal = false;
        if (row.type === 'match' && hasLeft && hasRight) {
            const leftStart = leftStarts[leftPosition];
            const rightStart = rightStarts[rightPosition];
            const leftEnd = unifiedDiffLineEnd(left, leftStarts, leftPosition);
            const rightEnd = unifiedDiffLineEnd(right, rightStarts, rightPosition);
            equal = leftEnd - leftStart === rightEnd - rightStart
                && (leftPosition + 1 < leftStarts.length) === (rightPosition + 1 < rightStarts.length)
                && left.slice(leftStart, leftEnd) === right.slice(rightStart, rightEnd);
        }
        if (equal) {
            open = false;
            leftPosition++;
            rightPosition++;
            continue;
        }
        if (!open) {
            changes.push(leftPosition, leftPosition, rightPosition, rightPosition);
            open = true;
        }
        if (hasLeft) changes[changes.length - 3] = ++leftPosition;
        if (hasRight) changes[changes.length - 1] = ++rightPosition;
    }
    if (!changes.length) return '';

    const parts = [
        '--- ', unifiedDiffFileName(options && options.leftName, 'left'), '\n',
        '+++ ', unifiedDiffFileName(options && options.rightName, 'right'), '\n'
    ];
    let index = 0;
    while (index < changes.length) {
        let last = index;
        while (last + 4 < changes.length && changes[last + 4] - changes[last + 1] <= context * 2) last += 4;
        const lead = Math.min(context, changes[index]);
        const trail = Math.min(context, leftCount - changes[last + 1]);
        const leftFirst = changes[index] - lead;
        const rightFirst = changes[index + 2] - lead;
        const leftLength = changes[last + 1] + trail - leftFirst;
        const rightLength = changes[last + 3] + trail - rightFirst;
        parts.push('@@ -', unifiedDiffRange(leftFirst, leftLength),
            ' +', unifiedDiffRange(rightFirst, rightLength), ' @@\n');
        let leftLine = leftFirst;
        for (let change = index; change <= last; change += 4) {
            appendUnifiedDiffLines(parts, ' ', left, leftStarts, leftLine, changes[change]);
            appendUnifiedDiffLines(parts, '-', left, leftStarts, changes[change], changes[change + 1]);
            appendUnifiedDiffLines(parts, '+', right, rightStarts, changes[change + 2], changes[change + 3]);
            leftLine = changes[change + 1];
        }
        appendUnifiedDiffLines(parts, ' ', left, leftStarts, leftLine, leftLine + trail);
        index = last + 4;
    }
    return parts.join('');
}

// The line range a run of rows covers on one side. A side without lines in
// the run answers with the empty range where its lines would go.
function diffRowsLineRange(rows, firstRow, lastRow, key) {
    let start = -1;
    let end = -1;
    for (let i = firstRow; i < lastRow; i++) {
        const lineIndex = rows[i][key];
        if (!Number.isInteger(lineIndex)) continue;
        if (start < 0) start = lineIndex;
        end = lineIndex + 1;
    }
    if (start >= 0) return { start: start, end: end };
    for (let i = firstRow - 1; i >= 0; i--) {
        const lineIndex = rows[i][key];
        if (Number.isInteger(lineIndex)) return { start: lineIndex + 1, end: lineIndex + 1 };
    }
    return { start: 0, end: 0 };
}

// Makes one side agree with the other over a run of rows: returns the new
// text of the other side, in which the lines of the run are replaced with the
// lines the run has on fromSide. Lines keep their own line endings.
function mergeDiffRows(left, right, model, firstRow, lastRow, fromSide) {
    if (typeof left !== 'string' || typeof right !== 'string' || !model || !Array.isArray(model.rows)
        || (fromSide !== 'left' && fromSide !== 'right')) {
        throw new TypeError('Merging rows requires both texts, their model and a source side.');
    }
    const rows = model.rows;
    if (!Number.isInteger(firstRow) || !Number.isInteger(lastRow)
        || firstRow < 0 || lastRow > rows.length || firstRow >= lastRow) {
        throw new RangeError('Merging rows requires a row range inside the model.');
    }
    const fromLeft = fromSide === 'left';
    const sourceRange = diffRowsLineRange(rows, firstRow, lastRow, fromLeft ? 'leftLineIndex' : 'rightLineIndex');
    const targetRange = diffRowsLineRange(rows, firstRow, lastRow, fromLeft ? 'rightLineIndex' : 'leftLineIndex');
    const sourceLines = (fromLeft ? left : right).split('\n');
    const targetLines = (fromLeft ? right : left).split('\n');
    return targetLines.slice(0, targetRange.start)
        .concat(sourceLines.slice(sourceRange.start, sourceRange.end), targetLines.slice(targetRange.end))
        .join('\n');
}

// Four UTF-8 bytes per character at most; a larger file cannot fit the limit.
const TEXT_FILE_MAX_BYTES = DIFF_LIMITS.maxChars * 4;

// Decodes the bytes of a local file into text. UTF-8 keeps a byte order mark
// as a character, because it is one of the hidden characters the comparison
// shows. UTF-16 is recognised by its byte order mark, and bytes that are not
// valid UTF-8 are read as Windows-1252.
function decodeTextBytes(bytes) {
    if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1) {
        throw new TypeError('decodeTextBytes requires a Uint8Array.');
    }
    if (bytes.length > TEXT_FILE_MAX_BYTES) {
        return {
            ok: false,
            message: 'File too large. Maximum ' + DIFF_LIMITS.maxChars.toLocaleString() + ' characters per side supported.'
        };
    }
    let text;
    let encoding = 'UTF-8';
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        encoding = 'UTF-16LE';
        text = new TextDecoder('utf-16le').decode(bytes);
    } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        encoding = 'UTF-16BE';
        text = new TextDecoder('utf-16be').decode(bytes);
    } else {
        try {
            text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        } catch (err) {
            if (bytes.indexOf(0) !== -1) return { ok: false, message: 'This looks like a binary file, not text.' };
            encoding = 'Windows-1252';
            text = new TextDecoder('windows-1252').decode(bytes);
        }
    }
    if (text.indexOf('\u0000') !== -1) {
        return { ok: false, message: 'This looks like a binary file, not text.' };
    }
    return { ok: true, text: text, encoding: encoding };
}

root.DiffCore = Object.freeze({
    maxFileBytes: TEXT_FILE_MAX_BYTES,
    createUnifiedDiff: createUnifiedDiff,
    decodeTextBytes: decodeTextBytes,
    mergeDiffRows: mergeDiffRows,
    hasInvisibleCharacters: hasInvisibleCharacters,
    stripInvisibleCharacters: stripInvisibleCharacters,
    createDiffWorkBudget: createDiffWorkBudget,
    scanDiffInput: scanDiffInput,
    validateScannedDiffInput: validateScannedDiffInput,
    classifyDiffWork: classifyDiffWork,
    findCanonicallyEquivalentRanges: findCanonicallyEquivalentRanges,
    computeDiffModel: computeDiffModel
});
})(globalThis);
