const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSharedDiff() {
    const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared-diff.js'), 'utf8');
    const context = { Intl };
    vm.createContext(context);
    vm.runInContext(code + `
this.computeLineDiff = computeLineDiff;
this.buildPanelHtml = buildPanelHtml;
this.buildPanelHtmlRange = buildPanelHtmlRange;
this.countDifferenceRows = countDifferenceRows;
this.hasInvisibleCharacters = hasInvisibleCharacters;
this.hasConfusableCharacters = hasConfusableCharacters;
this.stripInvisibleCharacters = stripInvisibleCharacters;
this.validateDiffInput = validateDiffInput;
this.lineSimilarity = lineSimilarity;
this.computeMyersRanges = computeMyersRanges;
this.renderWithInvisibles = renderWithInvisibles;
this.scanDiffInput = typeof scanDiffInput === 'function' ? scanDiffInput : undefined;
this.classifyDiffWork = typeof classifyDiffWork === 'function' ? classifyDiffWork : undefined;
this.computeDiffModel = typeof computeDiffModel === 'function' ? computeDiffModel : undefined;
this.splitDiffUnitsV2 = typeof splitDiffUnits === 'function' ? splitDiffUnits : undefined;
this.computeIntralineChangeRanges = typeof computeIntralineChangeRanges === 'function'
    ? computeIntralineChangeRanges
    : undefined;
this.createDiffWorkBudget = typeof createDiffWorkBudget === 'function' ? createDiffWorkBudget : undefined;
this.DIFF_WORK_BUDGET_DEFAULTS = typeof DIFF_WORK_BUDGET_DEFAULTS === 'object'
    ? DIFF_WORK_BUDGET_DEFAULTS
    : undefined;
this.DIFF_MODEL_LIMITS = typeof DIFF_MODEL_LIMITS === 'object' ? DIFF_MODEL_LIMITS : undefined;
this.SYNC_DIFF_LIMITS = typeof SYNC_DIFF_LIMITS === 'object' ? SYNC_DIFF_LIMITS : undefined;
this.validateScannedDiffInput = typeof validateScannedDiffInput === 'function'
    ? validateScannedDiffInput
    : undefined;
this.buildPanelHtmlFromModel = typeof buildPanelHtmlFromModel === 'function'
    ? buildPanelHtmlFromModel
    : undefined;
this.buildPanelHtmlRangeFromModel = typeof buildPanelHtmlRangeFromModel === 'function'
    ? buildPanelHtmlRangeFromModel
    : undefined;
this.DIFF_DEADLINE_ERROR_CODE = typeof DIFF_DEADLINE_ERROR_CODE === 'string'
    ? DIFF_DEADLINE_ERROR_CODE
    : undefined;
this.DIFF_MYERS_BUDGET_ERROR_CODE = typeof DIFF_MYERS_BUDGET_ERROR_CODE === 'string'
    ? DIFF_MYERS_BUDGET_ERROR_CODE
    : undefined;
this.computeAlignedRowActions = typeof computeAlignedRowActions === 'function'
    ? computeAlignedRowActions
    : undefined;
this.createAlignmentContext = typeof createAlignmentContext === 'function'
    ? createAlignmentContext
    : undefined;
this.createFullAlignmentLayout = typeof createFullAlignmentLayout === 'function'
    ? createFullAlignmentLayout
    : undefined;
this.createBandedAlignmentLayout = typeof createBandedAlignmentLayout === 'function'
    ? createBandedAlignmentLayout
    : undefined;
this.selectAlignmentLayout = typeof selectAlignmentLayout === 'function'
    ? selectAlignmentLayout
    : undefined;
this.runAlignmentDp = typeof runAlignmentDp === 'function' ? runAlignmentDp : undefined;
this.quantizedModifiedLineScore = typeof quantizedModifiedLineScore === 'function'
    ? quantizedModifiedLineScore
    : undefined;
this.ALIGNMENT_CONSTANTS = {
    scoreScale: typeof ALIGN_SCORE_SCALE === 'number' ? ALIGN_SCORE_SCALE : undefined,
    fullMaxCells: typeof ALIGN_FULL_MAX_CELLS === 'number' ? ALIGN_FULL_MAX_CELLS : undefined,
    bandMaxCells: typeof ALIGN_BAND_MAX_CELLS === 'number' ? ALIGN_BAND_MAX_CELLS : undefined,
    scoreWorkMax: typeof ALIGN_SCORE_WORK_MAX === 'number' ? ALIGN_SCORE_WORK_MAX : undefined,
    preferredBand: typeof ALIGN_PREFERRED_BAND === 'number' ? ALIGN_PREFERRED_BAND : undefined
};
`, context);
    return context;
}

const diff = loadSharedDiff();

function types(left, right) {
    return Array.from(diff.computeLineDiff(left, right).diff, function (item) { return item.type; });
}

function reconstructed(result) {
    const left = [];
    const right = [];
    for (const item of result.diff) {
        if (item.type === 'match') {
            left.push(result.leftLines[item.leftLineIndex]);
            right.push(result.rightLines[item.rightLineIndex]);
        } else if (item.type === 'modified') {
            left.push(result.leftLines[item.leftLineIndex]);
            right.push(result.rightLines[item.rightLineIndex]);
        } else if (item.type === 'missing') {
            left.push(result.leftLines[item.lineIndex]);
        } else if (item.type === 'added') {
            right.push(result.rightLines[item.lineIndex]);
        }
    }

    return { left: left.join('\n'), right: right.join('\n') };
}

function modelLine(source, starts, lineIndex) {
    const start = starts[lineIndex];
    const end = lineIndex + 1 < starts.length ? starts[lineIndex + 1] - 1 : source.length;
    return source.slice(start, end);
}

function reconstructedFromModel(model, leftSource, rightSource) {
    const left = [];
    const right = [];

    for (const row of model.rows) {
        if (Number.isInteger(row.leftLineIndex)) {
            left.push(modelLine(leftSource, model.leftLineStarts, row.leftLineIndex));
        }
        if (Number.isInteger(row.rightLineIndex)) {
            right.push(modelLine(rightSource, model.rightLineStarts, row.rightLineIndex));
        }
    }

    return { left: left.join('\n'), right: right.join('\n') };
}

function assertNoLegacyModelKeys(value) {
    if (!value || typeof value !== 'object') return;

    const forbidden = new Set([
        'left', 'right', 'leftLines', 'rightLines', 'diff',
        'leftChars', 'chars', 'leftHtml', 'rightHtml', 'html'
    ]);
    for (const key of Object.keys(value)) {
        assert.equal(forbidden.has(key), false, 'unexpected legacy/source key: ' + key);
        assertNoLegacyModelKeys(value[key]);
    }
}

function editDistanceFromRanges(ranges) {
    let distance = 0;
    for (const range of ranges) {
        if (range.type === 'delete') {
            distance += range.leftEnd - range.leftStart;
        } else if (range.type === 'insert') {
            distance += range.rightEnd - range.rightStart;
        }
    }
    return distance;
}

function lcsEditDistance(left, right) {
    const dp = Array.from({ length: left.length + 1 }, function () {
        return new Array(right.length + 1).fill(0);
    });

    for (let i = 1; i <= left.length; i++) {
        for (let j = 1; j <= right.length; j++) {
            if (left[i - 1] === right[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    return left.length + right.length - (2 * dp[left.length][right.length]);
}

function reconstructedFromRanges(ranges, leftItems, rightItems) {
    const left = [];
    const right = [];

    for (const range of ranges) {
        if (range.type === 'equal') {
            left.push.apply(left, leftItems.slice(range.leftStart, range.leftEnd));
            right.push.apply(right, rightItems.slice(range.rightStart, range.rightEnd));
        } else if (range.type === 'delete') {
            left.push.apply(left, leftItems.slice(range.leftStart, range.leftEnd));
        } else if (range.type === 'insert') {
            right.push.apply(right, rightItems.slice(range.rightStart, range.rightEnd));
        }
    }

    return { left: left, right: right };
}

function createRandom(seed) {
    let value = seed >>> 0;
    return function () {
        value = ((value * 1664525) + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}

function plainAlignmentActions(actions) {
    return Array.from(actions, function (action) {
        if (action.type === 'PAIR') {
            return ['PAIR', action.leftIndex, action.rightIndex];
        }
        if (action.type === 'MISSING') return ['MISSING', action.leftIndex];
        return ['ADDED', action.rightIndex];
    });
}

function alignmentMetrics(actions, leftCount, rightCount, scores) {
    const scale = diff.ALIGNMENT_CONSTANTS.scoreScale;
    let leftIndex = 0;
    let rightIndex = 0;
    let cost = 0;
    let pairCount = 0;
    let drift = 0;

    for (const action of actions) {
        if (action === 'PAIR') {
            const scoreQ = scores[leftIndex][rightIndex];
            assert.equal(scoreQ >= 0, true);
            cost += 2 * (scale - scoreQ);
            drift += Math.abs(
                ((2 * leftIndex + 1) * rightCount)
                - ((2 * rightIndex + 1) * leftCount)
            );
            pairCount++;
            leftIndex++;
            rightIndex++;
        } else if (action === 'MISSING') {
            cost += scale;
            leftIndex++;
        } else {
            assert.equal(action, 'ADDED');
            cost += scale;
            rightIndex++;
        }
    }

    assert.equal(leftIndex, leftCount);
    assert.equal(rightIndex, rightCount);
    return { cost: cost, pairCount: pairCount, drift: drift };
}

function alignmentActionPriorityForOracle(action, leftCount, rightCount) {
    if (action === 'PAIR') return 0;
    if (leftCount > rightCount) return action === 'MISSING' ? 1 : 2;
    return action === 'ADDED' ? 1 : 2;
}

function oracleActionsWinTie(actions, bestActions, leftCount, rightCount) {
    for (let index = actions.length - 1; index >= 0; index--) {
        const priority = alignmentActionPriorityForOracle(actions[index], leftCount, rightCount);
        const bestPriority = alignmentActionPriorityForOracle(
            bestActions[index],
            leftCount,
            rightCount
        );
        if (priority !== bestPriority) return priority < bestPriority;
    }
    return false;
}

function bruteForceAlignmentOracle(leftCount, rightCount, scores) {
    let best = null;
    const actions = [];

    function visit(leftIndex, rightIndex) {
        if (leftIndex === leftCount && rightIndex === rightCount) {
            const metrics = alignmentMetrics(actions, leftCount, rightCount, scores);
            if (!best
                || metrics.cost < best.cost
                || (metrics.cost === best.cost && metrics.pairCount > best.pairCount)
                || (metrics.cost === best.cost && metrics.pairCount === best.pairCount
                    && metrics.drift < best.drift)
                || (metrics.cost === best.cost && metrics.pairCount === best.pairCount
                    && metrics.drift === best.drift
                    && oracleActionsWinTie(actions, best.actions, leftCount, rightCount))) {
                best = Object.assign({ actions: actions.slice() }, metrics);
            }
            return;
        }

        if (leftIndex < leftCount) {
            actions.push('MISSING');
            visit(leftIndex + 1, rightIndex);
            actions.pop();
        }
        if (rightIndex < rightCount) {
            actions.push('ADDED');
            visit(leftIndex, rightIndex + 1);
            actions.pop();
        }
        if (leftIndex < leftCount && rightIndex < rightCount
            && scores[leftIndex][rightIndex] >= 0) {
            actions.push('PAIR');
            visit(leftIndex + 1, rightIndex + 1);
            actions.pop();
        }
    }

    visit(0, 0);
    return best;
}

function exactMyersAnchorPairs(left, right) {
    const ranges = diff.computeMyersRanges(left.split('\n'), right.split('\n'));
    const pairs = [];
    for (const range of ranges) {
        if (range.type !== 'equal') continue;
        for (let offset = 0; offset < range.leftEnd - range.leftStart; offset++) {
            pairs.push([range.leftStart + offset, range.rightStart + offset]);
        }
    }
    return pairs;
}

function hasSwapStableMyersAnchors(left, right) {
    const forward = exactMyersAnchorPairs(left, right);
    const reverse = exactMyersAnchorPairs(right, left).map(function (pair) {
        return [pair[1], pair[0]];
    });
    return JSON.stringify(forward) === JSON.stringify(reverse);
}

function assertModelAlignmentInvariants(model, left, right) {
    assert.deepEqual(reconstructedFromModel(model, left, right), { left: left, right: right });
    let previousLeft = -1;
    let previousRight = -1;
    let pairCount = 0;
    const leftIndexes = [];
    const rightIndexes = [];

    for (const row of model.rows) {
        if (Number.isInteger(row.leftLineIndex)) {
            assert.equal(row.leftLineIndex > previousLeft, true);
            previousLeft = row.leftLineIndex;
            leftIndexes.push(row.leftLineIndex);
        }
        if (Number.isInteger(row.rightLineIndex)) {
            assert.equal(row.rightLineIndex > previousRight, true);
            previousRight = row.rightLineIndex;
            rightIndexes.push(row.rightLineIndex);
        }
        if (row.type === 'match' || row.type === 'modified') pairCount++;
        if (row.type === 'modified') {
            const score = diff.quantizedModifiedLineScore(
                modelLine(left, model.leftLineStarts, row.leftLineIndex),
                modelLine(right, model.rightLineStarts, row.rightLineIndex)
            );
            assert.equal(score.allowed, true);
        }
    }

    assert.deepEqual(
        leftIndexes,
        Array.from({ length: model.leftLineStarts.length }, function (_, index) { return index; })
    );
    assert.deepEqual(
        rightIndexes,
        Array.from({ length: model.rightLineStarts.length }, function (_, index) { return index; })
    );
    return pairCount;
}

test('line diff handles equal, added, missing, and modified rows', function () {
    assert.deepEqual(types('a\nb\nc', 'a\nb\nc'), ['match', 'match', 'match']);
    assert.deepEqual(types('a\nc', 'a\nb\nc'), ['match', 'added', 'match']);
    assert.deepEqual(types('a\nb\nc', 'a\nc'), ['match', 'missing', 'match']);
    assert.deepEqual(types('alpha\nbeta\ngamma', 'alpha\nbeto\ngamma'), ['match', 'modified', 'match']);
});

test('Myers ranges produce shortest edit scripts for small inputs', function () {
    const cases = [
        [['a', 'b', 'c'], ['a', 'x', 'b', 'c']],
        [['a', 'b', 'c'], ['b', 'a', 'c']],
        [['a', 'b', 'a', 'c'], ['a', 'a', 'b', 'c']],
        [['one', 'two', 'three'], ['zero', 'one', 'two!', 'three']],
        [['x', 'y', 'z'], ['a', 'b', 'c']]
    ];

    for (const [left, right] of cases) {
        const ranges = diff.computeMyersRanges(left, right, { maxEditDistance: 100 });
        assert.equal(editDistanceFromRanges(ranges), lcsEditDistance(left, right));
    }
});

test('Myers ranges preserve and minimize deterministic random small inputs', function () {
    const random = createRandom(123456789);
    const alphabet = ['a', 'b', 'c', 'd', 'e', 'aa', 'bb', ''];

    for (let caseIndex = 0; caseIndex < 1000; caseIndex++) {
        const leftLength = Math.floor(random() * 12);
        const rightLength = Math.floor(random() * 12);
        const left = Array.from({ length: leftLength }, function () {
            return alphabet[Math.floor(random() * alphabet.length)];
        });
        const right = Array.from({ length: rightLength }, function () {
            return alphabet[Math.floor(random() * alphabet.length)];
        });

        const ranges = diff.computeMyersRanges(left, right, { maxEditDistance: 100 });
        const rebuilt = reconstructedFromRanges(ranges, left, right);

        assert.deepEqual(rebuilt, { left: left, right: right });
        assert.equal(editDistanceFromRanges(ranges), lcsEditDistance(left, right));
    }
});

test('Myers split path preserves and minimizes larger edited inputs', function () {
    const random = createRandom(987654321);

    for (let caseIndex = 0; caseIndex < 40; caseIndex++) {
        const left = [];
        const right = [];
        for (let i = 0; i < 300; i++) {
            const value = 'line ' + i;
            left.push(value);
            right.push(value);
        }

        for (let i = 0; i < 20; i++) {
            left.splice(Math.floor(random() * left.length), 1, 'left edit ' + caseIndex + ':' + i);
            right.splice(Math.floor(random() * right.length), 1, 'right edit ' + caseIndex + ':' + i);
        }

        for (let i = 0; i < 12; i++) {
            right.splice(Math.floor(random() * (right.length + 1)), 0, 'inserted ' + caseIndex + ':' + i);
        }

        for (let i = 0; i < 12; i++) {
            left.splice(Math.floor(random() * left.length), 1);
        }

        const ranges = diff.computeMyersRanges(left, right, { maxEditDistance: 1000 });
        const rebuilt = reconstructedFromRanges(ranges, left, right);

        assert.deepEqual(rebuilt, { left: left, right: right });
        assert.equal(editDistanceFromRanges(ranges), lcsEditDistance(left, right));
    }
});

test('short same-position row edits are treated as modified rows', function () {
    assert.deepEqual(types('x=1', 'x=2'), ['modified']);
    assert.deepEqual(types('abc', 'axc'), ['modified']);
    assert.deepEqual(types('hello', 'hallo'), ['modified']);
});

test('clearly unrelated short rows remain add/remove pairs', function () {
    assert.deepEqual(types('true', 'false'), ['missing', 'added']);
});

test('trailing newlines and blank lines are preserved', function () {
    assert.deepEqual(types('a\n', 'a\n'), ['match', 'match']);
    assert.deepEqual(types('a', 'a\n'), ['match', 'added']);
    assert.deepEqual(types('a\n\nc', 'a\n\nc'), ['match', 'match', 'match']);
});

test('diff entries can reconstruct both original inputs', function () {
    const cases = [
        ['a\nb\nc', 'a\nb\nc'],
        ['a\nc', 'a\nb\nc'],
        ['a\nb\nc', 'a\nc'],
        ['one\ntwo\nthree', 'zero\none\ntwo!\nthree'],
        ['x=1\nabc\ntrue', 'x=2\naxc\nfalse']
    ];

    for (const [left, right] of cases) {
        assert.deepEqual(reconstructed(diff.computeLineDiff(left, right)), { left, right });
    }
});

test('grapheme diff keeps emoji and combining-mark edits as single units', function () {
    const emoji = diff.computeLineDiff('hi 😀', 'hi 😃').diff[0];
    assert.equal(emoji.type, 'modified');
    assert.equal(emoji.leftChars.at(-1).c, '😀');
    assert.equal(emoji.chars.at(-1).c, '😃');

    const combining = diff.computeLineDiff('Cafe\u0301', 'Cafe').diff[0];
    assert.equal(combining.type, 'modified');
    assert.equal(combining.leftChars.at(-1).c, 'e\u0301');
});

test('invisible character detection and clean copy normalization work', function () {
    assert.equal(diff.hasInvisibleCharacters('a\u200Bb'), true);
    assert.equal(diff.stripInvisibleCharacters('a\u200Bb\u00A0c\uFEFF'), 'a b c');
});

test('confusable characters are detected and rendered with explanatory tooltips', function () {
    assert.equal(diff.hasConfusableCharacters('Latin A'), false);
    assert.equal(diff.hasConfusableCharacters('Cyrillic \u0410'), true);

    const html = diff.renderWithInvisibles('A\u0410\u03BF', true);
    assert.match(html, /class="confusable-char confusable-cyrillic-a-cap"/);
    assert.match(html, /title="Cyrillic capital a \(U\+0410\), looks like Latin A"/);
    assert.match(html, /class="confusable-char confusable-greek-omicron"/);
    assert.match(html, /data-char="&#x410;"/);
});

test('confusable diffs explain visually similar changed characters', function () {
    const result = diff.computeLineDiff('A', '\u0410');
    assert.equal(result.diff[0].type, 'modified');

    const rightHtml = diff.buildPanelHtml(result, 'right');
    assert.match(rightHtml, /confusable-char/);
    assert.match(rightHtml, /looks like Latin A/);
});

test('input validation rejects excessive character, line, and line-length inputs', function () {
    assert.equal(diff.validateDiffInput('a', 'b').ok, true);
    assert.match(diff.validateDiffInput('x'.repeat(2000001), 'b').message, /Maximum 2,000,000 characters/);
    assert.match(diff.validateDiffInput(Array.from({ length: 25001 }, function () { return 'x'; }).join('\n'), 'b').message, /Maximum 25,000 lines/);
    assert.match(diff.validateDiffInput('x'.repeat(100001), 'b').message, /Maximum 100,000 characters per line/);
    assert.match(
        diff.validateDiffInput(
            Array.from({ length: 6001 }, function (_, index) { return 'left ' + index; }).join('\n'),
            Array.from({ length: 6001 }, function (_, index) { return 'right ' + index; }).join('\n')
        ).message,
        /too different/
    );
});

test('chunked panel rendering matches full panel rendering', function () {
    const result = diff.computeLineDiff('a\nb\nc\nd', 'a\nb!\nc\nx\nd');
    const leftFull = diff.buildPanelHtml(result, 'left');
    const rightFull = diff.buildPanelHtml(result, 'right');
    const leftChunked = diff.buildPanelHtmlRange(result, 'left', 0, 2).html
        + diff.buildPanelHtmlRange(result, 'left', 2, result.diff.length).html;
    const rightChunked = diff.buildPanelHtmlRange(result, 'right', 0, 2).html
        + diff.buildPanelHtmlRange(result, 'right', 2, result.diff.length).html;

    assert.equal(leftChunked, leftFull);
    assert.equal(rightChunked, rightFull);
});

test('difference row count uses the shared semantic counter', function () {
    const result = diff.computeLineDiff('a\nb\nc', 'a\nb!\nx\nc');
    assert.equal(diff.countDifferenceRows(result), 2);
});

test('compact v2 ranges preserve grapheme boundaries and reconstruct both sources', function () {
    assert.equal(typeof diff.computeDiffModel, 'function');

    const left = 'Cafe\u0301 😀\nunchanged\n';
    const right = 'Cafe 😃\nunchanged\n';
    const model = diff.computeDiffModel(left, right);

    assert.equal(model.version, 2);
    assert.equal(Object.prototype.toString.call(model.changeBounds), '[object Uint32Array]');
    assert.equal(Object.prototype.toString.call(model.leftLineStarts), '[object Uint32Array]');
    assert.equal(Object.prototype.toString.call(model.rightLineStarts), '[object Uint32Array]');

    const rebuilt = { left: [], right: [] };
    for (const row of model.rows) {
        assert.equal(Object.hasOwn(row, 'leftChars'), false);
        assert.equal(Object.hasOwn(row, 'chars'), false);

        if (Number.isInteger(row.leftLineIndex)) {
            const start = model.leftLineStarts[row.leftLineIndex];
            const end = row.leftLineIndex + 1 < model.leftLineStarts.length
                ? model.leftLineStarts[row.leftLineIndex + 1] - 1
                : left.length;
            rebuilt.left.push(left.slice(start, end));
        }
        if (Number.isInteger(row.rightLineIndex)) {
            const start = model.rightLineStarts[row.rightLineIndex];
            const end = row.rightLineIndex + 1 < model.rightLineStarts.length
                ? model.rightLineStarts[row.rightLineIndex + 1] - 1
                : right.length;
            rebuilt.right.push(right.slice(start, end));
        }

        if (row.type === 'modified' && row.detailMode === 'precise') {
            const leftLineStart = model.leftLineStarts[row.leftLineIndex];
            const leftLineEnd = row.leftLineIndex + 1 < model.leftLineStarts.length
                ? model.leftLineStarts[row.leftLineIndex + 1] - 1
                : left.length;
            const rightLineStart = model.rightLineStarts[row.rightLineIndex];
            const rightLineEnd = row.rightLineIndex + 1 < model.rightLineStarts.length
                ? model.rightLineStarts[row.rightLineIndex + 1] - 1
                : right.length;
            const leftBoundaries = new Set(
                Array.from(diff.splitDiffUnitsV2(left.slice(leftLineStart, leftLineEnd)).boundaries)
            );
            const rightBoundaries = new Set(
                Array.from(diff.splitDiffUnitsV2(right.slice(rightLineStart, rightLineEnd)).boundaries)
            );

            for (let i = 0; i < row.leftRangeCount; i++) {
                const offset = row.leftRangeOffset + (i * 2);
                assert.equal(leftBoundaries.has(model.changeBounds[offset]), true);
                assert.equal(leftBoundaries.has(model.changeBounds[offset + 1]), true);
            }
            for (let i = 0; i < row.rightRangeCount; i++) {
                const offset = row.rightRangeOffset + (i * 2);
                assert.equal(rightBoundaries.has(model.changeBounds[offset]), true);
                assert.equal(rightBoundaries.has(model.changeBounds[offset + 1]), true);
            }
        }
    }

    assert.equal(rebuilt.left.join('\n'), left);
    assert.equal(rebuilt.right.join('\n'), right);
});

test('DiffModelV2 uses source-free rows and exact line-start arrays', function () {
    const cases = [
        ['', ''],
        ['a', 'a\n'],
        ['a\n', 'a'],
        ['same\nleft only\nend', 'same\nright only\nend'],
        ['a\r\n😀\n', 'a\r\n😃\n']
    ];

    for (const [left, right] of cases) {
        const model = diff.computeDiffModel(left, right);

        assert.equal(Object.hasOwn(model, 'left'), false);
        assert.equal(Object.hasOwn(model, 'right'), false);
        assert.equal(Object.hasOwn(model, 'leftLines'), false);
        assert.equal(Object.hasOwn(model, 'rightLines'), false);
        assert.equal(Object.hasOwn(model, 'diff'), false);
        assertNoLegacyModelKeys(model);
        assert.deepEqual(reconstructedFromModel(model, left, right), { left, right });

        const leftIndexes = Array.from(model.rows)
            .filter(function (row) { return Number.isInteger(row.leftLineIndex); })
            .map(function (row) { return row.leftLineIndex; });
        const rightIndexes = Array.from(model.rows)
            .filter(function (row) { return Number.isInteger(row.rightLineIndex); })
            .map(function (row) { return row.rightLineIndex; });
        assert.deepEqual(leftIndexes, Array.from({ length: model.leftLineStarts.length }, function (_, i) { return i; }));
        assert.deepEqual(rightIndexes, Array.from({ length: model.rightLineStarts.length }, function (_, i) { return i; }));

        assert.equal(model.leftLineStarts.byteLength, model.leftLineStarts.length * Uint32Array.BYTES_PER_ELEMENT);
        assert.equal(model.rightLineStarts.byteLength, model.rightLineStarts.length * Uint32Array.BYTES_PER_ELEMENT);
        assert.equal(model.changeBounds.byteLength, model.changeBounds.length * Uint32Array.BYTES_PER_ELEMENT);
    }

    assert.deepEqual(Array.from(diff.computeDiffModel('', '').leftLineStarts), [0]);
    assert.deepEqual(Array.from(diff.computeDiffModel('\n', '\n').leftLineStarts), [0, 1]);
    assert.deepEqual(Array.from(diff.computeDiffModel('a\n', 'a\n').leftLineStarts), [0, 2]);
    assert.deepEqual(Array.from(diff.computeDiffModel('a\n\n', 'a\n\n').leftLineStarts), [0, 2, 3]);
    assert.deepEqual(
        Array.from(diff.computeDiffModel('a\r\n😀\n', 'a\r\n😀\n').leftLineStarts),
        [0, 3, 6]
    );
});

test('compact intraline ranges use half-open UTF-16 grapheme offsets', function () {
    const emoji = diff.computeDiffModel('a😀b', 'a😃b');
    const emojiRow = emoji.rows[0];
    assert.equal(emojiRow.detailMode, 'precise');
    assert.equal(emojiRow.leftRangeOffset, 0);
    assert.equal(emojiRow.leftRangeCount, 1);
    assert.equal(emojiRow.rightRangeOffset, 2);
    assert.equal(emojiRow.rightRangeCount, 1);
    assert.deepEqual(Array.from(emoji.changeBounds), [1, 3, 1, 3]);

    const combining = diff.computeDiffModel('Cafe\u0301', 'Cafe');
    const combiningRow = combining.rows[0];
    assert.equal(combiningRow.detailMode, 'precise');
    assert.deepEqual(Array.from(combining.changeBounds), [3, 5, 3, 4]);

    const separated = diff.computeDiffModel('axbxc', 'aybyc');
    const separatedRow = separated.rows[0];
    assert.equal(separatedRow.leftRangeCount, 2);
    assert.equal(separatedRow.rightRangeCount, 2);
    assert.deepEqual(Array.from(separated.changeBounds), [1, 2, 3, 4, 1, 2, 3, 4]);
});

test('DiffWorkBudget and model range limits use atomic whole-line fallback', function () {
    assert.deepEqual(
        Object.assign({}, diff.DIFF_WORK_BUDGET_DEFAULTS),
        {
            remainingMyersSteps: 40000000,
            remainingAlignmentCells: 2000000,
            remainingAlignmentScoreWork: 32000000,
            remainingCharEditDistance: 50000,
            remainingRangePairs: 200000
        }
    );
    assert.deepEqual(
        Object.assign({}, diff.DIFF_MODEL_LIMITS),
        { maxRangePairsPerRow: 4096, maxRangePairsTotal: 200000 }
    );

    const rowLimited = diff.computeDiffModel('axbxc', 'aybyc', {
        modelLimits: { maxRangePairsPerRow: 3 }
    });
    assert.equal(rowLimited.rows[0].detailMode, 'whole-line');
    assert.equal(rowLimited.rows[0].leftRangeCount, 0);
    assert.equal(rowLimited.rows[0].rightRangeCount, 0);
    assert.equal(rowLimited.changeBounds.length, 0);
    assert.equal(rowLimited.stats.rangePairs, 0);
    assert.equal(rowLimited.stats.wholeLineRows, 1);

    const rangeBudget = diff.createDiffWorkBudget({ remainingRangePairs: 1 });
    const budgetLimited = diff.computeDiffModel('aXb', 'aYb', { workBudget: rangeBudget });
    assert.equal(budgetLimited.rows[0].detailMode, 'whole-line');
    assert.equal(budgetLimited.changeBounds.length, 0);
    assert.equal(rangeBudget.remainingRangePairs, 1);

    const totalWorkBudget = diff.createDiffWorkBudget();
    const totalLimited = diff.computeDiffModel(
        'aXb\nanchor\ncXd',
        'aYb\nanchor\ncYd',
        {
            modelLimits: { maxRangePairsTotal: 2 },
            workBudget: totalWorkBudget
        }
    );
    const modifiedRows = Array.from(totalLimited.rows).filter(function (row) { return row.type === 'modified'; });
    assert.deepEqual(modifiedRows.map(function (row) { return row.detailMode; }), ['precise', 'whole-line']);
    assert.deepEqual(Array.from(totalLimited.changeBounds), [1, 2, 1, 2]);
    assert.equal(modifiedRows[1].leftRangeOffset, 4);
    assert.equal(modifiedRows[1].rightRangeOffset, 4);
    assert.equal(totalLimited.stats.rangePairs, 2);
    assert.deepEqual(Object.assign({}, totalLimited.stats.workBudget), Object.assign({}, totalWorkBudget));
    assert.equal(totalWorkBudget.remainingMyersSteps < 40000000, true);
    assert.equal(totalWorkBudget.remainingAlignmentCells < 2000000, true);
    assert.equal(totalWorkBudget.remainingAlignmentScoreWork < 32000000, true);
    assert.equal(totalWorkBudget.remainingCharEditDistance, 49996);
    assert.equal(totalWorkBudget.remainingRangePairs, 199998);

    const charBudget = diff.createDiffWorkBudget({ remainingCharEditDistance: 1 });
    const charLimited = diff.computeDiffModel('aXb', 'aYb', { workBudget: charBudget });
    assert.equal(charLimited.rows[0].detailMode, 'whole-line');
    assert.equal(charLimited.changeBounds.length, 0);
    assert.equal(charBudget.remainingCharEditDistance, 0);
});

test('legacy diff and HTML APIs remain compatible beside DiffModelV2', function () {
    const legacy = diff.computeLineDiff('a\nCafe\u0301', 'a\nCafe');
    assert.deepEqual(Array.from(legacy.diff, function (row) { return row.type; }), ['match', 'modified']);
    assert.equal(legacy.diff[1].leftChars.at(-1).c, 'e\u0301');
    assert.match(diff.buildPanelHtml(legacy, 'left'), /diff-mismatch/);
    assert.equal(diff.countDifferenceRows(legacy), 1);

    const model = diff.computeDiffModel('a\nCafe\u0301', 'a\nCafe');
    assert.equal(diff.countDifferenceRows(model), 1);
});

test('linear input scan and sync classification expose the centralized routing contract', function () {
    const left = 'a b\n\u200B\u0410';
    const right = 'x\u00A0';
    const scan = diff.scanDiffInput(left, right);

    assert.deepEqual(
        Object.assign({}, scan),
        {
            leftChars: 6,
            rightChars: 2,
            totalChars: 8,
            leftLines: 2,
            rightLines: 1,
            totalLines: 3,
            maxLineChars: 3,
            spanRiskChars: 4
        }
    );
    assert.deepEqual(Object.assign({}, diff.SYNC_DIFF_LIMITS), {
        maxCost: 65536,
        maxTotalChars: 32768,
        maxLinesPerSide: 200,
        maxLineChars: 16384,
        maxSpanRiskChars: 1024,
        lineWeight: 16,
        lineEditWeight: 256,
        spanRiskWeight: 64
    });
    assert.equal(diff.validateScannedDiffInput(scan).ok, true);
    assert.match(
        diff.validateScannedDiffInput(diff.scanDiffInput('x'.repeat(100001), 'a')).message,
        /Maximum 100,000 characters per line/
    );

    const smallLeft = 'a\nb';
    const smallRight = 'a\nc';
    const smallScan = diff.scanDiffInput(smallLeft, smallRight);
    const small = diff.classifyDiffWork(smallLeft, smallRight, smallScan);
    assert.equal(small.isSyncSafe, true);
    assert.equal(small.lineEditLowerBound, 2);
    assert.equal(small.cost, 582);

    const decoratedLeft = ' '.repeat(1025);
    const decorated = diff.classifyDiffWork(
        decoratedLeft,
        'a',
        diff.scanDiffInput(decoratedLeft, 'a')
    );
    assert.equal(decorated.isSyncSafe, false);
    assert.equal(decorated.lineEditLowerBound, null);
    assert.match(decorated.reason, /Decorated character/);
});

test('shared Myers work budget is terminal for lines and degrades only intraline detail', function () {
    const exhaustedLineBudget = diff.createDiffWorkBudget({ remainingMyersSteps: 0 });
    assert.throws(
        function () {
            diff.computeDiffModel('same', 'same', { workBudget: exhaustedLineBudget });
        },
        function (err) {
            assert.equal(err.code, diff.DIFF_MYERS_BUDGET_ERROR_CODE);
            return true;
        }
    );

    const intralineBudget = diff.createDiffWorkBudget({ remainingMyersSteps: 100 });
    const progress = [];
    const model = diff.computeDiffModel('aXb', 'aYb', {
        workBudget: intralineBudget,
        onProgress: function (update) {
            progress.push({
                phase: update.phase,
                processed: update.processed,
                total: update.total
            });
            if (update.phase === 'line-diff' && update.processed === update.total) {
                intralineBudget.remainingMyersSteps = 0;
            }
        }
    });

    assert.equal(model.rows[0].type, 'modified');
    assert.equal(model.rows[0].detailMode, 'whole-line');
    assert.equal(model.changeBounds.length, 0);
    assert.equal(intralineBudget.remainingMyersSteps, 0);
    assert.deepEqual(progress, [
        { phase: 'line-diff', processed: 0, total: 1 },
        { phase: 'line-diff', processed: 1, total: 1 },
        { phase: 'intraline', processed: 0, total: 1 },
        { phase: 'intraline', processed: 1, total: 1 }
    ]);
});

test('deadline failures remain terminal with a stable code in line and intraline Myers', function () {
    assert.equal(diff.DIFF_DEADLINE_ERROR_CODE, 'DIFF_DEADLINE_EXCEEDED');
    assert.throws(
        function () {
            diff.computeDiffModel('a', 'a', { deadlineAt: 1, now: function () { return 1; } });
        },
        function (err) {
            assert.equal(err.code, 'DIFF_DEADLINE_EXCEEDED');
            assert.match(err.message, /timed out/);
            return true;
        }
    );

    let intralineExpired = false;
    assert.throws(
        function () {
            diff.computeDiffModel('aXb', 'aYb', {
                deadlineAt: 1,
                now: function () { return intralineExpired ? 1 : 0; },
                onProgress: function (update) {
                    if (update.phase === 'line-diff' && update.processed === update.total) {
                        intralineExpired = true;
                    }
                }
            });
        },
        function (err) {
            assert.equal(err.code, 'DIFF_DEADLINE_EXCEEDED');
            return true;
        }
    );
});

test('alignment layout planning and DP propagate deadline failures terminally', function () {
    function expiredExecutionContext() {
        return {
            deadlineAt: 1,
            now: function () { return 1; },
            deadlineWorkSinceCheck: 1023,
            workBudget: null
        };
    }

    const layoutLines = new Array(1024).fill('x');
    const layoutContext = diff.createAlignmentContext(
        ['x', 'y'],
        layoutLines,
        diff.createDiffWorkBudget(),
        expiredExecutionContext(),
        null
    );
    assert.throws(
        function () {
            diff.selectAlignmentLayout(
                ['x', 'y'],
                layoutLines,
                0,
                2,
                0,
                layoutLines.length,
                layoutContext
            );
        },
        function (err) {
            assert.equal(err.code, diff.DIFF_DEADLINE_ERROR_CODE);
            return true;
        }
    );

    assert.throws(
        function () {
            diff.runAlignmentDp(
                1,
                2,
                diff.createFullAlignmentLayout(1, 2),
                function () { return 800000; },
                expiredExecutionContext()
            );
        },
        function (err) {
            assert.equal(err.code, diff.DIFF_DEADLINE_ERROR_CODE);
            return true;
        }
    );
});

test('source-aware V2 HTML adapter matches legacy output without persisting sources or HTML', function () {
    const left = 'same\nCafe\u0301\nleft only\nA\u200B\nend';
    const right = 'same\nCafe\nright only\n\u0410\nextra\nend';
    const sources = { left: left, right: right };
    const legacy = diff.computeLineDiff(left, right);
    const model = diff.computeDiffModel(left, right);

    for (const side of ['left', 'right']) {
        const expected = diff.buildPanelHtml(legacy, side);
        const actual = diff.buildPanelHtmlFromModel(model, sources, side);
        assert.equal(actual, expected);

        const splitAt = Math.min(3, model.rows.length);
        const chunked = diff.buildPanelHtmlRangeFromModel(model, sources, side, 0, splitAt).html
            + diff.buildPanelHtmlRangeFromModel(model, sources, side, splitAt, model.rows.length).html;
        assert.equal(chunked, expected);
    }

    assertNoLegacyModelKeys(model);
    assert.throws(
        function () { diff.buildPanelHtmlFromModel(model, null, 'left'); },
        /requires the original left and right source strings/
    );
});

test('V2 HTML adapter escapes untrusted source text', function () {
    const attack = '<img src=x onerror="alert(1)">&<script>alert(2)</script>\u200B';
    const model = diff.computeDiffModel(attack, attack);
    const html = diff.buildPanelHtmlFromModel(model, { left: attack, right: attack }, 'left');

    assert.doesNotMatch(html, /<img\b/i);
    assert.doesNotMatch(html, /<script\b/i);
    assert.match(html, /&lt;img src=x onerror="alert\(1\)"&gt;/);
    assert.match(html, /&amp;/);
    assert.match(html, /invisible-zwsp/);
    assertNoLegacyModelKeys(model);
});

test('bounded row alignment finds both globally compatible modified pairs', function () {
    const result = diff.computeLineDiff('abc1\nabc1y', 'abc2\nabc1x');
    assert.deepEqual(Array.from(result.diff, function (row) { return row.type; }), ['modified', 'modified']);
});

test('bounded alignment preserves the pre-DP presentation golden corpus', function () {
    const corpus = [
        {
            left: 'a\nb',
            right: 'a\nb',
            rows: [['match', 0, 0], ['match', 1, 1]]
        },
        {
            left: 'a\nc',
            right: 'a\nb\nc',
            rows: [['match', 0, 0], ['added', null, 1], ['match', 1, 2]]
        },
        {
            left: 'a\nb\nc',
            right: 'a\nc',
            rows: [['match', 0, 0], ['missing', 1, null], ['match', 2, 1]]
        },
        {
            left: 'x=1',
            right: 'x=2',
            rows: [['modified', 0, 0]]
        },
        {
            left: 'true',
            right: 'false',
            rows: [['missing', 0, null], ['added', null, 0]]
        },
        {
            left: 'b\na',
            right: 'a\nb',
            rows: [['missing', 0, null], ['match', 1, 0], ['added', null, 1]]
        },
        {
            left: 'head\nabc1\nfixed\nabc1y\ntail',
            right: 'head\nabc2\nfixed\nabc1x\ntail',
            rows: [
                ['match', 0, 0],
                ['modified', 1, 1],
                ['match', 2, 2],
                ['modified', 3, 3],
                ['match', 4, 4]
            ]
        },
        {
            left: 'a\nx\na',
            right: 'a\ny\na',
            rows: [
                ['match', 0, 0],
                ['missing', 1, null],
                ['added', null, 1],
                ['match', 2, 2]
            ]
        }
    ];

    for (const fixture of corpus) {
        const model = diff.computeDiffModel(fixture.left, fixture.right);
        assert.deepEqual(
            Array.from(model.rows, function (row) {
                return [
                    row.type,
                    Number.isInteger(row.leftLineIndex) ? row.leftLineIndex : null,
                    Number.isInteger(row.rightLineIndex) ? row.rightLineIndex : null
                ];
            }),
            fixture.rows,
            JSON.stringify({ left: fixture.left, right: fixture.right })
        );
    }
});

test('alignment DP matches an exhaustive oracle through 6 by 6 hunks', function () {
    const scale = diff.ALIGNMENT_CONSTANTS.scoreScale;
    const scoreValues = [-1, 500000, 650000, 800000, scale];

    for (let leftCount = 0; leftCount <= 6; leftCount++) {
        for (let rightCount = 0; rightCount <= 6; rightCount++) {
            for (let variant = 0; variant < 4; variant++) {
                const scores = Array.from({ length: leftCount }, function (_, leftIndex) {
                    return Array.from({ length: rightCount }, function (_, rightIndex) {
                        const index = (
                            (leftIndex * 17)
                            + (rightIndex * 31)
                            + (variant * 13)
                            + (leftCount * rightCount)
                        ) % scoreValues.length;
                        return scoreValues[index];
                    });
                });
                const layout = diff.createFullAlignmentLayout(leftCount, rightCount);
                const result = diff.runAlignmentDp(
                    leftCount,
                    rightCount,
                    layout,
                    function (leftIndex, rightIndex) { return scores[leftIndex][rightIndex]; }
                );
                const oracle = bruteForceAlignmentOracle(leftCount, rightCount, scores);

                assert.equal(result.cost, oracle.cost);
                assert.equal(result.pairCount, oracle.pairCount);
                assert.equal(result.drift, oracle.drift);
                assert.equal(result.backpointerBytes, layout.cellCount);
                assert.deepEqual(
                    alignmentMetrics(
                        Array.from(result.actions, function (action) { return action.type; }),
                        leftCount,
                        rightCount,
                        scores
                    ),
                    { cost: oracle.cost, pairCount: oracle.pairCount, drift: oracle.drift }
                );
                assert.deepEqual(
                    Array.from(result.actions, function (action) { return action.type; }),
                    oracle.actions
                );

                let nextLeft = 0;
                let nextRight = 0;
                for (const action of result.actions) {
                    if (action.type === 'PAIR') {
                        assert.equal(action.leftIndex, nextLeft++);
                        assert.equal(action.rightIndex, nextRight++);
                    } else if (action.type === 'MISSING') {
                        assert.equal(action.leftIndex, nextLeft++);
                    } else {
                        assert.equal(action.type, 'ADDED');
                        assert.equal(action.rightIndex, nextRight++);
                    }
                }
                assert.equal(nextLeft, leftCount);
                assert.equal(nextRight, rightCount);
            }
        }
    }
});

test('alignment scoring is quantized and applies the short and normal thresholds', function () {
    assert.deepEqual(Object.assign({}, diff.ALIGNMENT_CONSTANTS), {
        scoreScale: 1000000,
        fullMaxCells: 262144,
        bandMaxCells: 1000000,
        scoreWorkMax: 32000000,
        preferredBand: 64
    });

    const shortAllowed = diff.quantizedModifiedLineScore('abc', 'abx');
    assert.equal(shortAllowed.scoreQ, 666667);
    assert.equal(shortAllowed.thresholdQ, 500000);
    assert.equal(shortAllowed.shortPair, true);
    assert.equal(shortAllowed.allowed, true);

    const confusable = diff.quantizedModifiedLineScore('A', '\u0410');
    assert.equal(confusable.scoreQ, 1000000);
    assert.equal(confusable.allowed, true);

    const shortForbidden = diff.quantizedModifiedLineScore('true', 'false');
    assert.equal(shortForbidden.thresholdQ, 500000);
    assert.equal(shortForbidden.allowed, false);

    const normal = diff.quantizedModifiedLineScore(
        'a'.repeat(33),
        'a'.repeat(32) + 'b'
    );
    assert.equal(normal.shortPair, false);
    assert.equal(normal.thresholdQ, 650000);
    assert.equal(normal.allowed, normal.scoreQ >= normal.thresholdQ);

    const pairWinsExactCostTie = diff.runAlignmentDp(
        1,
        1,
        diff.createFullAlignmentLayout(1, 1),
        function () { return 0; }
    );
    assert.deepEqual(plainAlignmentActions(pairWinsExactCostTie.actions), [['PAIR', 0, 0]]);
});

test('full and banded alignment respect exact matrix boundaries and typed backpointers', function () {
    const fullBoundary = diff.createFullAlignmentLayout(511, 511);
    assert.equal(fullBoundary.cellCount, 262144);
    assert.equal(fullBoundary.rowStarts.constructor.name, 'Int32Array');
    assert.equal(fullBoundary.rowEnds.constructor.name, 'Int32Array');
    assert.equal(fullBoundary.rowOffsets.constructor.name, 'Uint32Array');

    const leftFull = new Array(511).fill('');
    const rightFull = new Array(511).fill('');
    const fullBudget = diff.createDiffWorkBudget();
    const fullStats = {};
    const fullContext = diff.createAlignmentContext(
        leftFull,
        rightFull,
        fullBudget,
        null,
        fullStats
    );
    const fullActions = diff.computeAlignedRowActions(
        leftFull,
        rightFull,
        0,
        leftFull.length,
        0,
        rightFull.length,
        fullContext
    );
    assert.equal(fullStats.alignment.fullHunks, 1);
    assert.equal(fullStats.alignment.bandedHunks, 0);
    assert.equal(fullStats.alignment.cellsUsed, 262144);
    assert.equal(fullStats.alignment.scoreEvaluations, 511 * 511);
    assert.equal(fullBudget.remainingAlignmentCells, 2000000 - 262144);
    assert.equal(fullActions.filter(function (action) { return action.type === 'PAIR'; }).length, 511);

    const leftBanded = new Array(512).fill('');
    const rightBanded = new Array(512).fill('');
    const bandBudget = diff.createDiffWorkBudget();
    const bandStats = {};
    const bandContext = diff.createAlignmentContext(
        leftBanded,
        rightBanded,
        bandBudget,
        null,
        bandStats
    );
    diff.computeAlignedRowActions(
        leftBanded,
        rightBanded,
        0,
        leftBanded.length,
        0,
        rightBanded.length,
        bandContext
    );
    const preferredLayout = diff.createBandedAlignmentLayout(512, 512, 64);
    assert.equal(bandStats.alignment.fullHunks, 0);
    assert.equal(bandStats.alignment.bandedHunks, 1);
    assert.equal(bandStats.alignment.maxBandUsed, 64);
    assert.equal(bandStats.alignment.cellsUsed, preferredLayout.cellCount);
    assert.equal(preferredLayout.cellCount <= 1000000, true);

    const fullResult = diff.runAlignmentDp(
        6,
        6,
        diff.createFullAlignmentLayout(6, 6),
        function (leftIndex, rightIndex) { return leftIndex === rightIndex ? 900000 : -1; }
    );
    const bandResult = diff.runAlignmentDp(
        6,
        6,
        diff.createBandedAlignmentLayout(6, 6, 1),
        function (leftIndex, rightIndex) { return leftIndex === rightIndex ? 900000 : -1; }
    );
    assert.equal(bandResult.cost, fullResult.cost);
    assert.equal(bandResult.pairCount, fullResult.pairCount);
    assert.equal(bandResult.drift, fullResult.drift);
    assert.deepEqual(
        plainAlignmentActions(bandResult.actions),
        plainAlignmentActions(fullResult.actions)
    );

    const largeGapResult = diff.runAlignmentDp(
        5000,
        0,
        diff.createFullAlignmentLayout(5000, 0),
        function () { throw new Error('no pair score should be requested'); }
    );
    assert.equal(largeGapResult.cost, 5000000000);
    assert.equal(largeGapResult.backpointerBytes, 5001);
});

test('band selection shrinks below the preferred width to stay under one million cells', function () {
    const leftLines = new Array(100).fill('');
    const rightLines = new Array(20000).fill('');
    const context = diff.createAlignmentContext(
        leftLines,
        rightLines,
        diff.createDiffWorkBudget(),
        null,
        null
    );
    const layout = diff.selectAlignmentLayout(
        leftLines,
        rightLines,
        0,
        leftLines.length,
        0,
        rightLines.length,
        context
    );

    assert.equal(layout.kind, 'banded');
    assert.equal(layout.band < 64, true);
    assert.equal(layout.band >= 1, true);
    assert.equal(layout.cellCount <= 1000000, true);
    assert.equal(
        diff.createBandedAlignmentLayout(100, 20000, layout.band + 1).cellCount > 1000000,
        true
    );
});

test('alignment cell and score budgets are shared, exact, and fall back atomically', function () {
    const leftLines = ['a', 'b'];
    const rightLines = ['x', 'y'];

    const exactBudget = diff.createDiffWorkBudget({
        remainingAlignmentCells: 9,
        remainingAlignmentScoreWork: 12
    });
    const exactStats = {};
    const exactContext = diff.createAlignmentContext(
        leftLines,
        rightLines,
        exactBudget,
        null,
        exactStats
    );
    const exactActions = diff.computeAlignedRowActions(
        leftLines,
        rightLines,
        0,
        2,
        0,
        2,
        exactContext
    );
    assert.equal(exactBudget.remainingAlignmentCells, 0);
    assert.equal(exactBudget.remainingAlignmentScoreWork, 0);
    assert.equal(exactStats.alignment.cellsUsed, 9);
    assert.equal(exactStats.alignment.scoreWorkUsed, 12);
    assert.equal(exactStats.alignment.scoreEvaluations, 4);
    assert.equal(exactActions.some(function (action) { return action.type === 'PAIR'; }), false);

    const sharedFallback = diff.computeAlignedRowActions(
        leftLines,
        rightLines,
        0,
        2,
        0,
        2,
        exactContext
    );
    assert.deepEqual(plainAlignmentActions(sharedFallback), [
        ['MISSING', 0],
        ['MISSING', 1],
        ['ADDED', 0],
        ['ADDED', 1]
    ]);
    assert.equal(exactStats.alignment.fallbackHunks, 1);
    assert.equal(exactStats.alignment.cellsUsed, 9);
    assert.equal(exactStats.alignment.scoreWorkUsed, 12);

    const lowCellBudget = diff.createDiffWorkBudget({
        remainingAlignmentCells: 6,
        remainingAlignmentScoreWork: 12
    });
    const lowCellContext = diff.createAlignmentContext(
        leftLines,
        rightLines,
        lowCellBudget,
        null,
        null
    );
    const lowCellActions = diff.computeAlignedRowActions(
        leftLines,
        rightLines,
        0,
        2,
        0,
        2,
        lowCellContext
    );
    assert.equal(lowCellActions.some(function (action) { return action.type === 'PAIR'; }), false);
    assert.equal(lowCellContext.stats.fallbackHunks, 1);
    assert.equal(lowCellBudget.remainingAlignmentCells, 6);
    assert.equal(lowCellBudget.remainingAlignmentScoreWork, 12);

    const lowScoreBudget = diff.createDiffWorkBudget({
        remainingAlignmentCells: 9,
        remainingAlignmentScoreWork: 11
    });
    const lowScoreContext = diff.createAlignmentContext(
        leftLines,
        rightLines,
        lowScoreBudget,
        null,
        null
    );
    diff.computeAlignedRowActions(
        leftLines,
        rightLines,
        0,
        2,
        0,
        2,
        lowScoreContext
    );
    assert.equal(lowScoreContext.stats.fallbackHunks, 1);
    assert.equal(lowScoreBudget.remainingAlignmentCells, 9);
    assert.equal(lowScoreBudget.remainingAlignmentScoreWork, 11);

    const unbalancedLeft = ['a', 'b'];
    const unbalancedRight = new Array(10).fill('x');
    const bandLayout = diff.createBandedAlignmentLayout(2, 10, 1);
    assert.equal(bandLayout.cellCount, 23);
    const exactBandBudget = diff.createDiffWorkBudget({
        remainingAlignmentCells: 23,
        remainingAlignmentScoreWork: 36
    });
    const exactBandStats = {};
    const exactBandContext = diff.createAlignmentContext(
        unbalancedLeft,
        unbalancedRight,
        exactBandBudget,
        null,
        exactBandStats
    );
    diff.computeAlignedRowActions(
        unbalancedLeft,
        unbalancedRight,
        0,
        2,
        0,
        10,
        exactBandContext
    );
    assert.equal(exactBandStats.alignment.bandedHunks, 1);
    assert.equal(exactBandStats.alignment.maxBandUsed, 1);
    assert.equal(exactBandStats.alignment.scoreEvaluations, 12);
    assert.equal(exactBandStats.alignment.scoreWorkUsed, 36);
    assert.equal(exactBandBudget.remainingAlignmentCells, 0);
    assert.equal(exactBandBudget.remainingAlignmentScoreWork, 0);

    const shortBandBudget = diff.createDiffWorkBudget({
        remainingAlignmentCells: 23,
        remainingAlignmentScoreWork: 35
    });
    const shortBandContext = diff.createAlignmentContext(
        unbalancedLeft,
        unbalancedRight,
        shortBandBudget,
        null,
        null
    );
    diff.computeAlignedRowActions(
        unbalancedLeft,
        unbalancedRight,
        0,
        2,
        0,
        10,
        shortBandContext
    );
    assert.equal(shortBandContext.stats.fallbackHunks, 1);
    assert.equal(shortBandBudget.remainingAlignmentCells, 23);
    assert.equal(shortBandBudget.remainingAlignmentScoreWork, 35);
});

test('global alignment budgets are consumed across separate Myers hunks', function () {
    const left = 'aX\nanchor\ncX';
    const right = 'aY\nanchor\ncY';
    const cellBudget = diff.createDiffWorkBudget({ remainingAlignmentCells: 4 });
    const cellLimited = diff.computeDiffModel(left, right, { workBudget: cellBudget });

    assert.equal(cellLimited.stats.alignment.fullHunks, 1);
    assert.equal(cellLimited.stats.alignment.fallbackHunks, 1);
    assert.equal(cellLimited.stats.alignment.cellsUsed, 4);
    assert.equal(cellLimited.stats.alignment.intralineComputations, 1);
    assert.deepEqual(
        Array.from(cellLimited.rows, function (row) { return row.type; }).sort(),
        ['added', 'match', 'missing', 'modified'].sort()
    );
    assertModelAlignmentInvariants(cellLimited, left, right);

    const scoreBudget = diff.createDiffWorkBudget({
        remainingAlignmentCells: 8,
        remainingAlignmentScoreWork: 5
    });
    const scoreLimited = diff.computeDiffModel(left, right, { workBudget: scoreBudget });
    assert.equal(scoreLimited.stats.alignment.fullHunks, 1);
    assert.equal(scoreLimited.stats.alignment.fallbackHunks, 1);
    assert.equal(scoreLimited.stats.alignment.cellsUsed, 4);
    assert.equal(scoreLimited.stats.alignment.scoreWorkUsed, 5);
    assert.equal(scoreBudget.remainingAlignmentCells, 4);
    assert.equal(scoreBudget.remainingAlignmentScoreWork, 0);
    assertModelAlignmentInvariants(scoreLimited, left, right);
});

test('line profiles are cached lazily and intraline work runs only for final pairs', function () {
    const left = 'anchor\nabc1\nabc1y\ntail';
    const right = 'anchor\nabc2\nabc1x\ntail';
    const workBudget = diff.createDiffWorkBudget();
    const model = diff.computeDiffModel(left, right, { workBudget: workBudget });
    const modified = Array.from(model.rows).filter(function (row) {
        return row.type === 'modified';
    });

    assert.equal(modified.length, 2);
    assert.equal(model.stats.alignment.scoreEvaluations, 4);
    assert.equal(model.stats.alignment.leftProfilesBuilt, 2);
    assert.equal(model.stats.alignment.rightProfilesBuilt, 2);
    assert.equal(model.stats.alignment.intralineComputations, 2);
    assert.equal(model.stats.alignment.intralineComputations, model.stats.modifiedRows);
    assert.equal(workBudget.remainingCharEditDistance, 49996);
    assert.equal(model.rows[0].type, 'match');
    assert.equal(model.rows.at(-1).type, 'match');
});

test('Myers exact anchors remain fixed around independently aligned hunks', function () {
    const left = 'head\nabc1\nfixed\nabc1y\ntail';
    const right = 'head\nabc2\nfixed\nabc1x\ntail';
    const model = diff.computeDiffModel(left, right);
    const matches = Array.from(model.rows).filter(function (row) { return row.type === 'match'; });

    assert.deepEqual(
        matches.map(function (row) { return [row.leftLineIndex, row.rightLineIndex]; }),
        [[0, 0], [2, 2], [4, 4]]
    );
    assert.deepEqual(
        Array.from(model.rows, function (row) { return row.type; }),
        ['match', 'modified', 'match', 'modified', 'match']
    );
    assert.equal(model.stats.alignment.fullHunks, 2);
    assertModelAlignmentInvariants(model, left, right);

    const ambiguousLeft = 'b\na';
    const ambiguousRight = 'a\nb';
    const ambiguous = diff.computeDiffModel(ambiguousLeft, ambiguousRight);
    assert.deepEqual(
        Array.from(ambiguous.rows)
            .filter(function (row) { return row.type === 'match'; })
            .map(function (row) { return [row.leftLineIndex, row.rightLineIndex]; }),
        exactMyersAnchorPairs(ambiguousLeft, ambiguousRight),
        'bounded alignment must not replace an ambiguous Myers tie with a canonicalized anchor'
    );
});

test('alignment is deterministic and preserves reconstruction and hunk-level swap invariants', function () {
    const random = createRandom(246813579);
    const lines = [
        'alpha', 'alpHa', 'abc1', 'abc1x', 'abc2', 'true', 'false',
        'A', '\u0410', 'Cafe\u0301', 'Cafe', 'omega'
    ];

    for (let caseIndex = 0; caseIndex < 200; caseIndex++) {
        const leftCount = 1 + Math.floor(random() * 6);
        const rightCount = 1 + Math.floor(random() * 6);
        const left = Array.from({ length: leftCount }, function () {
            return lines[Math.floor(random() * lines.length)];
        }).join('\n');
        const right = Array.from({ length: rightCount }, function () {
            return lines[Math.floor(random() * lines.length)];
        }).join('\n');

        const model = diff.computeDiffModel(left, right);
        const repeated = diff.computeDiffModel(left, right);
        const swapped = diff.computeDiffModel(right, left);
        const pairCount = assertModelAlignmentInvariants(model, left, right);
        const swappedPairCount = assertModelAlignmentInvariants(swapped, right, left);

        assert.deepEqual(
            JSON.parse(JSON.stringify(model.rows)),
            JSON.parse(JSON.stringify(repeated.rows))
        );
        assert.deepEqual(Array.from(model.changeBounds), Array.from(repeated.changeBounds));
        const caseMessage = JSON.stringify({
            caseIndex: caseIndex,
            left: left,
            right: right,
            rows: model.rows,
            swappedRows: swapped.rows
        });
        if (hasSwapStableMyersAnchors(left, right)) {
            assert.equal(pairCount, swappedPairCount, caseMessage);
            assert.equal(model.mismatchCount, swapped.mismatchCount, caseMessage);
        }
    }

    for (let caseIndex = 0; caseIndex < 200; caseIndex++) {
        const leftCount = 1 + Math.floor(random() * 6);
        const rightCount = 1 + Math.floor(random() * 6);
        const scores = Array.from({ length: leftCount }, function () {
            return Array.from({ length: rightCount }, function () {
                const value = random();
                return value < 0.35 ? -1 : Math.round((0.5 + (value * 0.5)) * 1000000);
            });
        });
        const forward = diff.runAlignmentDp(
            leftCount,
            rightCount,
            diff.createFullAlignmentLayout(leftCount, rightCount),
            function (leftIndex, rightIndex) { return scores[leftIndex][rightIndex]; }
        );
        const swapped = diff.runAlignmentDp(
            rightCount,
            leftCount,
            diff.createFullAlignmentLayout(rightCount, leftCount),
            function (leftIndex, rightIndex) { return scores[rightIndex][leftIndex]; }
        );
        assert.equal(forward.pairCount, swapped.pairCount);
        assert.equal(forward.actions.length, swapped.actions.length);
    }
});
