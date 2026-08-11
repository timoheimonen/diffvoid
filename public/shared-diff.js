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
    const estimatedLines = Math.max(leftLines.length, rightLines.length);

    const lineEditLowerBound = estimateEditDistanceLowerBound(leftLines, rightLines);
    if (lineEditLowerBound > DIFF_LIMITS.maxLineEditDistance) {
        return {
            ok: false,
            message: 'These texts are too different to compare safely in your browser. Try smaller sections or more similar files.'
        };
    }

    return {
        ok: true,
        leftLines: leftLines,
        rightLines: rightLines,
        estimatedLines: estimatedLines,
        scan: scan,
        lineEditLowerBound: lineEditLowerBound
    };
}

function splitDiffUnits(text) {
    const units = [];
    const boundaries = [];

    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        if (!graphemeSegmenter) {
            graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        }

        const segments = graphemeSegmenter.segment(text);
        for (const item of segments) {
            boundaries.push(item.index);
            units.push(item.segment);
        }
    } else {
        let offset = 0;
        for (const unit of Array.from(text)) {
            boundaries.push(offset);
            units.push(unit);
            offset += unit.length;
        }
    }

    boundaries.push(text.length);
    return {
        units: units,
        boundaries: Uint32Array.from(boundaries)
    };
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

const DIFF_DEADLINE_ERROR_CODE = 'DIFF_DEADLINE_EXCEEDED';
const DIFF_MYERS_BUDGET_ERROR_CODE = 'DIFF_MYERS_BUDGET_EXCEEDED';
const DIFF_DEADLINE_CHECK_INTERVAL = 1024;

function createCodedDiffError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function defaultDiffNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
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

function resolveDiffExecutionContext(options) {
    if (options && options.executionContext) return options.executionContext;
    if (options && (options.workBudget || typeof options.deadlineAt === 'number')) {
        return createDiffExecutionContext(options, options.workBudget);
    }
    return null;
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
    }

    return null;
}

function computeMyersRanges(left, right, options) {
    const maxEditDistance = options && typeof options.maxEditDistance === 'number'
        ? options.maxEditDistance
        : DIFF_LIMITS.maxLineEditDistance;
    const executionContext = resolveDiffExecutionContext(options);
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
        const lowerBound = estimateEditDistanceLowerBound(
            left.slice(leftStart, leftEnd),
            right.slice(rightStart, rightEnd)
        );
        checkDiffDeadline(executionContext, true);
        if (lowerBound > maxEditDistance) {
            throw new Error('These texts are too different to compare safely in your browser. Try smaller sections or more similar files.');
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
            executionContext
        );
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

function computeCharDiff(left, right) {
    const leftSplit = splitDiffUnits(left);
    const rightSplit = splitDiffUnits(right);
    const leftUnits = leftSplit.units;
    const rightUnits = rightSplit.units;
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

function computeIntralineChangeRanges(left, right, workBudget, executionContext) {
    const budget = normalizeDiffWorkBudget(workBudget);
    const execution = executionContext || createDiffExecutionContext({}, budget);
    const leftSplit = splitDiffUnits(left);
    const rightSplit = splitDiffUnits(right);
    const maxEditDistance = Math.min(
        DIFF_LIMITS.maxCharEditDistance,
        budget.remainingCharEditDistance
    );

    if (left !== right && maxEditDistance <= 0) {
        return intralineWholeLineResult();
    }

    let ranges;
    try {
        ranges = computeMyersRanges(leftSplit.units, rightSplit.units, {
            maxEditDistance: maxEditDistance,
            executionContext: execution
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

    for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        if (range.type === 'delete') {
            const leftStart = leftSplit.boundaries[range.leftStart];
            const leftEnd = leftSplit.boundaries[range.leftEnd];
            appendMergedChangeRange(leftBounds, leftStart, leftEnd);
            editDistance += range.leftEnd - range.leftStart;
        } else if (range.type === 'insert') {
            const rightStart = rightSplit.boundaries[range.rightStart];
            const rightEnd = rightSplit.boundaries[range.rightEnd];
            appendMergedChangeRange(rightBounds, rightStart, rightEnd);
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
    const leftUnits = splitDiffUnits(leftLine).units;
    const rightUnits = splitDiffUnits(rightLine).units;
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

    const leftUnits = splitDiffUnits(leftLine).units;
    const rightUnits = splitDiffUnits(rightLine).units;
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

function createLineProfile(text) {
    return {
        text: text,
        codeUnitLength: text.length,
        bigramCounts: null,
        bigramTotal: 0,
        shortUnits: null,
        visualShortUnits: null,
        isShort: null
    };
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

function lineSimilarityFromProfiles(leftProfile, rightProfile) {
    const leftLine = leftProfile.text;
    const rightLine = rightProfile.text;
    if (leftLine === rightLine) return 1;
    if (!leftLine.length || !rightLine.length) return 0;

    const leftLen = leftProfile.codeUnitLength;
    const rightLen = rightProfile.codeUnitLength;
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
    const weighted = (dice * 0.65) + (edgeRatio * 0.35);
    return weighted * (0.6 + 0.4 * lengthRatio);
}

function modifiedLineScoreFromProfiles(leftProfile, rightProfile) {
    const similarity = lineSimilarityFromProfiles(leftProfile, rightProfile);
    ensureLineProfileShortUnits(leftProfile);
    ensureLineProfileShortUnits(rightProfile);
    if (!leftProfile.isShort || !rightProfile.isShort) return similarity;

    const directSimilarity = boundedEditDistanceSimilarity(
        leftProfile.shortUnits,
        rightProfile.shortUnits
    );
    const visualSimilarity = boundedEditDistanceSimilarity(
        leftProfile.visualShortUnits,
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

function createLegacyDiffRow(leftLines, rightLines, type, leftLineIndex, rightLineIndex) {
    if (type === 'match') {
        return {
            type: 'match',
            leftLineIndex: leftLineIndex,
            rightLineIndex: rightLineIndex
        };
    }

    if (type === 'modified') {
        const charMatched = computeCharDiff(leftLines[leftLineIndex], rightLines[rightLineIndex]);
        return {
            type: 'modified',
            leftLineIndex: leftLineIndex,
            rightLineIndex: rightLineIndex,
            leftChars: buildUnitArray(charMatched.leftUnits, charMatched.left),
            chars: buildUnitArray(charMatched.rightUnits, charMatched.right)
        };
    }

    if (type === 'missing') {
        return { type: 'missing', lineIndex: leftLineIndex };
    }

    return { type: 'added', lineIndex: rightLineIndex };
}

function appendDiffRow(diff, leftLines, rightLines, type, leftLineIndex, rightLineIndex, createRow) {
    if (createRow) {
        diff.push(createRow(type, leftLineIndex, rightLineIndex));
        return;
    }
    diff.push(createLegacyDiffRow(leftLines, rightLines, type, leftLineIndex, rightLineIndex));
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
    const leftCount = leftEnd - leftStart;
    const rightCount = rightEnd - rightStart;
    if (leftCount === 0 || rightCount === 0) {
        return conservativeAlignmentFallback(leftStart, leftCount, rightStart, rightCount);
    }

    const alignmentContext = context || createAlignmentContext(
        leftLines,
        rightLines,
        createDiffWorkBudget(),
        null,
        null
    );
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

    let result;
    try {
        result = runAlignmentDp(
            leftCount,
            rightCount,
            layout,
            function (leftLocalIndex, rightLocalIndex) {
                return alignmentCandidateScoreQ(
                    alignmentContext,
                    leftStart + leftLocalIndex,
                    rightStart + rightLocalIndex
                );
            },
            alignmentContext.executionContext
        );
    } catch (err) {
        if (!err || err.code !== ALIGNMENT_SCORE_BUDGET_ERROR_CODE) throw err;
        result = null;
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

function appendAlignedActions(leftLines, rightLines, actions, diff, createRow) {
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (action.type === 'PAIR') {
            appendDiffRow(
                diff,
                leftLines,
                rightLines,
                'modified',
                action.leftIndex,
                action.rightIndex,
                createRow
            );
        } else if (action.type === 'MISSING') {
            appendDiffRow(
                diff,
                leftLines,
                rightLines,
                'missing',
                action.leftIndex,
                null,
                createRow
            );
        } else {
            appendDiffRow(
                diff,
                leftLines,
                rightLines,
                'added',
                null,
                action.rightIndex,
                createRow
            );
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
        appendAlignedActions(leftLines, rightLines, actions, diff, createRow);
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
                appendDiffRow(
                    diff,
                    leftLines,
                    rightLines,
                    'match',
                    range.leftStart + j,
                    range.rightStart + j,
                    createRow
                );
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
    leftLines,
    rightLines,
    workBudget,
    rangePool,
    stats,
    modelLimits,
    executionContext
) {
    return function (type, leftLineIndex, rightLineIndex) {
        if (type === 'match') {
            stats.matchedRows++;
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
            executionContext
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
    const leftLines = validated.leftLines;
    const rightLines = validated.rightLines;
    const rows = [];
    const rangePool = [];
    const stats = {
        matchedRows: 0,
        modifiedRows: 0,
        missingRows: 0,
        addedRows: 0,
        preciseModifiedRows: 0,
        wholeLineRows: 0,
        rangePairs: 0
    };
    const progressTotal = Math.max(leftLines.length, rightLines.length);
    reportDiffProgress(options, 'line-diff', 0, progressTotal);
    const ranges = computeMyersRanges(leftLines, rightLines, {
        maxEditDistance: DIFF_LIMITS.maxLineEditDistance,
        executionContext: executionContext
    });
    reportDiffProgress(options, 'line-diff', progressTotal, progressTotal);
    reportDiffProgress(options, 'intraline', 0, progressTotal);
    const createRow = createCompactRowFactory(
        leftLines,
        rightLines,
        workBudget,
        rangePool,
        stats,
        modelLimits,
        executionContext
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
    const alignmentContext = createAlignmentContext(
        leftLines,
        rightLines,
        createDiffWorkBudget(),
        null,
        null
    );
    appendMyersRanges(leftLines, rightLines, ranges, diff, null, alignmentContext);

    return { leftLines: leftLines, rightLines: rightLines, diff: diff };
}

function countDifferenceRows(diffResult) {
    if (diffResult && diffResult.version === 2) {
        return diffResult.mismatchCount;
    }

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

function getModelSourceLine(model, sources, side, lineIndex) {
    const source = sources[side];
    const starts = side === 'right' ? model.rightLineStarts : model.leftLineStarts;
    const start = starts[lineIndex];
    const end = lineIndex + 1 < starts.length ? starts[lineIndex + 1] - 1 : source.length;
    return source.slice(start, end);
}

function renderModelRanges(line, changeBounds, rangeOffset, rangeCount, detailMode) {
    if (detailMode === 'whole-line') {
        return `<span class="diff-mismatch">${renderWithInvisibles(line, true)}</span>`;
    }

    let html = '';
    let sourceOffset = 0;
    for (let i = 0; i < rangeCount; i++) {
        const offset = rangeOffset + (i * 2);
        const start = changeBounds[offset];
        const end = changeBounds[offset + 1];
        if (start > sourceOffset) {
            html += `<span class="diff-match">${renderWithInvisibles(line.slice(sourceOffset, start), false)}</span>`;
        }
        if (end > start) {
            html += `<span class="diff-mismatch">${renderWithInvisibles(line.slice(start, end), true)}</span>`;
        }
        sourceOffset = end;
    }

    if (sourceOffset < line.length) {
        html += `<span class="diff-match">${renderWithInvisibles(line.slice(sourceOffset), false)}</span>`;
    }
    return html;
}

function getModelPanelLineNumberAt(model, side, startIdx) {
    let lineNum = 1;
    const isRight = side === 'right';
    for (let i = 0; i < startIdx && i < model.rows.length; i++) {
        if (itemConsumesLineNumber(model.rows[i], isRight)) lineNum++;
    }
    return lineNum;
}

function renderModelPanelEntry(model, sources, row, side, lineNum) {
    const isRight = side === 'right';

    if (row.type === 'match') {
        const lineIndex = isRight ? row.rightLineIndex : row.leftLineIndex;
        const line = getModelSourceLine(model, sources, side, lineIndex);
        return {
            html: `<div class="diff-line"><span class="diff-gutter">${lineNum}</span><span class="diff-content${isRight ? ' diff-match' : ''}">${renderWithInvisibles(line)}</span></div>`,
            lineNum: lineNum + 1
        };
    }

    if (row.type === 'modified') {
        const lineIndex = isRight ? row.rightLineIndex : row.leftLineIndex;
        const rangeOffset = isRight ? row.rightRangeOffset : row.leftRangeOffset;
        const rangeCount = isRight ? row.rightRangeCount : row.leftRangeCount;
        const line = getModelSourceLine(model, sources, side, lineIndex);
        return {
            html: `<div class="diff-line${isRight ? ' diff-line-mismatch' : ''}"><span class="diff-gutter">${lineNum}</span><span class="diff-content">${renderModelRanges(line, model.changeBounds, rangeOffset, rangeCount, row.detailMode)}</span></div>`,
            lineNum: lineNum + 1
        };
    }

    if (row.type === 'added') {
        if (!isRight) {
            return {
                html: '<div class="diff-line"><span class="diff-gutter"></span><span class="diff-content"></span></div>',
                lineNum: lineNum
            };
        }

        const addedLine = getModelSourceLine(model, sources, 'right', row.rightLineIndex);
        return {
            html: `<div class="diff-line diff-line-mismatch"><span class="diff-gutter">${lineNum}</span><span class="diff-content"><span class="diff-mismatch">${renderWithInvisibles(addedLine, true)}</span></span></div>`,
            lineNum: lineNum + 1
        };
    }

    if (isRight) {
        return {
            html: '<div class="diff-line diff-line-missing"><span class="diff-gutter"></span><span class="diff-content"></span></div>',
            lineNum: lineNum
        };
    }

    const missingLine = getModelSourceLine(model, sources, 'left', row.leftLineIndex);
    return {
        html: `<div class="diff-line"><span class="diff-gutter">${lineNum}</span><span class="diff-content">${renderWithInvisibles(missingLine)}</span></div>`,
        lineNum: lineNum + 1
    };
}

function validateModelSources(model, sources) {
    if (!model || model.version !== 2 || !sources
        || typeof sources.left !== 'string' || typeof sources.right !== 'string') {
        throw new TypeError('DiffModelV2 rendering requires the original left and right source strings.');
    }
}

function buildPanelHtmlRangeFromModel(model, sources, side, startIdx, endIdx) {
    validateModelSources(model, sources);
    const safeStart = Math.max(0, Math.min(startIdx, model.rows.length));
    const safeEnd = Math.max(safeStart, Math.min(endIdx, model.rows.length));
    let lineNum = getModelPanelLineNumberAt(model, side, safeStart);
    let html = '';

    for (let i = safeStart; i < safeEnd; i++) {
        const rendered = renderModelPanelEntry(model, sources, model.rows[i], side, lineNum);
        html += rendered.html;
        lineNum = rendered.lineNum;
    }
    return { html: html, endIdx: safeEnd };
}

function buildPanelHtmlFromModel(model, sources, side) {
    return buildPanelHtmlRangeFromModel(model, sources, side, 0, model.rows.length).html;
}
