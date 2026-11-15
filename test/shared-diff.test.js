const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSharedDiff(contextOverrides) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared-diff.js'), 'utf8');
    const context = Object.assign({ Intl: Intl }, contextOverrides);
    const closing = '\n})(globalThis);';
    const closingIndex = code.lastIndexOf(closing);
    assert.notEqual(closingIndex, -1, 'shared diff must use the canonical IIFE wrapper');
    const testExports = `
root.__DiffCoreTest = Object.freeze({
    validateDiffInput: validateDiffInput,
    computeMyersRanges: computeMyersRanges,
    computeLineRanges: computeLineRanges,
    splitDiffUnits: splitDiffUnits,
    computeIntralineChangeRanges: computeIntralineChangeRanges,
    DIFF_WORK_BUDGET_DEFAULTS: DIFF_WORK_BUDGET_DEFAULTS,
    DIFF_MODEL_LIMITS: DIFF_MODEL_LIMITS,
    SYNC_DIFF_LIMITS: SYNC_DIFF_LIMITS,
    DIFF_DEADLINE_ERROR_CODE: DIFF_DEADLINE_ERROR_CODE,
    DIFF_MYERS_BUDGET_ERROR_CODE: DIFF_MYERS_BUDGET_ERROR_CODE,
    computeAlignedRowActions: computeAlignedRowActions,
    createAlignmentContext: createAlignmentContext,
    createFullAlignmentLayout: createFullAlignmentLayout,
    createBandedAlignmentLayout: createBandedAlignmentLayout,
    selectAlignmentLayout: selectAlignmentLayout,
    runAlignmentDp: runAlignmentDp,
    quantizedModifiedLineScore: quantizedModifiedLineScore,
    ALIGNMENT_CONSTANTS: Object.freeze({
        scoreScale: ALIGN_SCORE_SCALE,
        fullMaxCells: ALIGN_FULL_MAX_CELLS,
        bandMaxCells: ALIGN_BAND_MAX_CELLS,
        scoreWorkMax: ALIGN_SCORE_WORK_MAX,
        preferredBand: ALIGN_PREFERRED_BAND
    })
});`;
    const instrumentedCode = code.slice(0, closingIndex) + testExports + code.slice(closingIndex);
    vm.createContext(context);
    vm.runInContext(instrumentedCode, context);
    return Object.assign({}, context.DiffCore, context.__DiffCoreTest);
}

const diff = loadSharedDiff();

function types(left, right) {
    return Array.from(diff.computeDiffModel(left, right).rows, function (row) { return row.type; });
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

function assertCurrentModelSchema(model) {
    assert.deepEqual(Object.keys(model).sort(), [
        'changeBounds',
        'leftLineStarts',
        'mismatchCount',
        'rightLineStarts',
        'rows',
        'stats',
        'version'
    ]);

    const rowKeys = {
        match: ['leftLineIndex', 'rightLineIndex', 'type'],
        missing: ['leftLineIndex', 'type'],
        added: ['rightLineIndex', 'type'],
        modified: [
            'detailMode',
            'leftLineIndex',
            'leftRangeCount',
            'leftRangeOffset',
            'rightLineIndex',
            'rightRangeCount',
            'rightRangeOffset',
            'type'
        ]
    };
    const allowedStrings = new Set([
        'added', 'banded', 'full', 'match', 'missing', 'modified', 'precise', 'whole-line'
    ]);
    const pending = [{ value: model, path: 'model' }];

    for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex++) {
        const row = model.rows[rowIndex];
        assert.ok(Object.hasOwn(rowKeys, row.type), 'rows[' + rowIndex + '] has an unknown type');
        // A moved line carries the index of its counterpart on the other side.
        const optional = row.type === 'missing' ? 'movedTo' : (row.type === 'added' ? 'movedFrom' : null);
        // A moved line that was also edited carries its changed ranges, and
        // only a moved line may.
        const side = row.type === 'missing' ? 'left' : 'right';
        const ranges = optional && Object.hasOwn(row, optional) ? [side + 'RangeOffset', side + 'RangeCount'] : [];
        if (ranges.length) {
            assert.equal(Object.hasOwn(row, ranges[0]), Object.hasOwn(row, ranges[1]));
        }
        const keys = Object.keys(row).filter(function (key) {
            return key !== optional && ranges.indexOf(key) < 0;
        });
        assert.deepEqual(
            keys.sort(),
            rowKeys[row.type].slice().sort(),
            'rows[' + rowIndex + '] has an unexpected shape'
        );
        if (optional && Object.hasOwn(row, optional)) {
            assert.equal(Number.isInteger(row[optional]) && row[optional] >= 0, true);
        }
    }

    while (pending.length > 0) {
        const current = pending.pop();
        const value = current.value;
        if (typeof value === 'string') {
            assert.ok(allowedStrings.has(value), current.path + ' contains an unexpected string');
            continue;
        }
        if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) continue;
        for (const key of Object.keys(value)) {
            pending.push({ value: value[key], path: current.path + '.' + key });
        }
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
    const ranges = diff.computeLineRanges(left.split('\n'), right.split('\n'));
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

test('DiffModelV2 handles equal, added, missing, and modified rows', function () {
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

test('DiffModelV2 rows can reconstruct both original inputs', function () {
    const cases = [
        ['a\nb\nc', 'a\nb\nc'],
        ['a\nc', 'a\nb\nc'],
        ['a\nb\nc', 'a\nc'],
        ['one\ntwo\nthree', 'zero\none\ntwo!\nthree'],
        ['x=1\nabc\ntrue', 'x=2\naxc\nfalse']
    ];

    for (const [left, right] of cases) {
        const model = diff.computeDiffModel(left, right);
        assert.deepEqual(reconstructedFromModel(model, left, right), { left: left, right: right });
    }
});

test('compact ranges keep emoji and combining-mark edits as single graphemes', function () {
    const emoji = diff.computeDiffModel('hi 😀', 'hi 😃');
    assert.equal(emoji.rows[0].type, 'modified');
    assert.equal(emoji.rows[0].detailMode, 'precise');
    assert.deepEqual(Array.from(emoji.changeBounds), [3, 5, 3, 5]);

    const combining = diff.computeDiffModel('Cafe\u0301', 'Cafe');
    assert.equal(combining.rows[0].type, 'modified');
    assert.equal(combining.rows[0].detailMode, 'precise');
    assert.deepEqual(Array.from(combining.changeBounds), [3, 5, 3, 4]);
});

test('grapheme segmentation requires Intl.Segmenter', function () {
    const withoutSegmenter = loadSharedDiff({ Intl: {} });
    assert.throws(function () { withoutSegmenter.splitDiffUnits('text'); }, /Intl\.Segmenter/);
});

test('internal diff stages require their canonical shared execution contexts', function () {
    assert.throws(
        function () {
            diff.computeIntralineChangeRanges('left', 'right', diff.createDiffWorkBudget());
        },
        /requires an execution context/
    );
    assert.throws(
        function () {
            diff.computeAlignedRowActions(['left'], ['right'], 0, 1, 0, 1);
        },
        /requires an alignment context/
    );
});

test('invisible character detection and clean copy normalization work', function () {
    assert.equal(diff.hasInvisibleCharacters('a\u200Bb'), true);
    assert.equal(diff.stripInvisibleCharacters('a\u200Bb\u00A0c\uFEFF'), 'a b c');
});

test('confusable characters are detected for routing and visual-skeleton matching', function () {
    assert.equal(diff.scanDiffInput('A', 'A').spanRiskChars, 0);
    assert.equal(diff.scanDiffInput('\u0410', '\u0410').spanRiskChars, 2);

    const model = diff.computeDiffModel('A', '\u0410');
    assert.equal(model.rows[0].type, 'modified');
    assert.equal(model.rows[0].detailMode, 'precise');
    assert.deepEqual(Array.from(model.changeBounds), [0, 1, 0, 1]);
});

test('input validation rejects excessive character, line, and line-length inputs', function () {
    assert.equal(diff.validateDiffInput('a', 'b').ok, true);
    assert.match(diff.validateDiffInput('x'.repeat(2000001), 'b').message, /Maximum 2,000,000 characters/);
    assert.match(diff.validateDiffInput(Array.from({ length: 25001 }, function () { return 'x'; }).join('\n'), 'b').message, /Maximum 25,000 lines/);
    assert.match(diff.validateDiffInput('x'.repeat(100001), 'b').message, /Maximum 100,000 characters per line/);
    assert.equal(
        diff.validateDiffInput(
            Array.from({ length: 6001 }, function (_, index) { return 'left ' + index; }).join('\n'),
            Array.from({ length: 6001 }, function (_, index) { return 'right ' + index; }).join('\n')
        ).ok,
        true
    );
});

function assertValidRanges(ranges, left, right, label) {
    let leftPos = 0;
    let rightPos = 0;
    for (const range of ranges) {
        assert.equal(range.leftStart, leftPos, label);
        assert.equal(range.rightStart, rightPos, label);
        const leftLength = range.leftEnd - range.leftStart;
        const rightLength = range.rightEnd - range.rightStart;
        if (range.type === 'equal') {
            assert.equal(leftLength > 0 && leftLength === rightLength, true, label);
            for (let offset = 0; offset < leftLength; offset++) {
                assert.equal(left[range.leftStart + offset], right[range.rightStart + offset], label);
            }
        } else if (range.type === 'delete') {
            assert.equal(leftLength > 0 && rightLength === 0, true, label);
        } else {
            assert.equal(range.type, 'insert', label);
            assert.equal(leftLength === 0 && rightLength > 0, true, label);
        }
        leftPos = range.leftEnd;
        rightPos = range.rightEnd;
    }
    assert.equal(leftPos, left.length, label);
    assert.equal(rightPos, right.length, label);
}

function shuffled(items, random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const swap = result[i];
        result[i] = result[j];
        result[j] = swap;
    }
    return result;
}

test('line ranges ignore one-sided lines without losing the shortest edit script', function () {
    const random = createRandom(13572468);
    const alphabet = ['a', 'b', 'c', 'd', '', '}', 'left only 1', 'left only 2', 'right only 1', 'right only 2'];

    for (let caseIndex = 0; caseIndex < 1000; caseIndex++) {
        const left = Array.from({ length: Math.floor(random() * 14) }, function () {
            return alphabet[Math.floor(random() * 8)];
        });
        const right = Array.from({ length: Math.floor(random() * 14) }, function () {
            const index = Math.floor(random() * 8);
            return alphabet[index < 6 ? index : index + 2];
        });

        const ranges = diff.computeLineRanges(left, right);
        assertValidRanges(ranges, left, right, 'case ' + caseIndex);
        assert.equal(editDistanceFromRanges(ranges), lcsEditDistance(left, right));
    }

    assert.deepEqual(
        JSON.parse(JSON.stringify(diff.computeLineRanges(['x', 'same', 'y'], ['same', 'z']))),
        [
            { type: 'delete', leftStart: 0, leftEnd: 1, rightStart: 0, rightEnd: 0 },
            { type: 'equal', leftStart: 1, leftEnd: 2, rightStart: 0, rightEnd: 1 },
            { type: 'delete', leftStart: 2, leftEnd: 3, rightStart: 1, rightEnd: 1 },
            { type: 'insert', leftStart: 3, leftEnd: 3, rightStart: 1, rightEnd: 2 }
        ]
    );
});

test('abandoned exact searches still produce valid, terminating edit scripts', function () {
    const random = createRandom(97531);

    for (let caseIndex = 0; caseIndex < 120; caseIndex++) {
        const leftCount = 300 + Math.floor(random() * 400);
        const rightCount = 300 + Math.floor(random() * 400);
        const symbolCount = [2, 3, 5, 12, 60, 400][caseIndex % 6];
        let left;
        let right;
        if (caseIndex % 3 === 0) {
            left = Array.from({ length: leftCount }, function () {
                return 'x' + Math.floor(random() * symbolCount);
            });
            right = Array.from({ length: rightCount }, function () {
                return 'x' + Math.floor(random() * symbolCount);
            });
        } else if (caseIndex % 3 === 1) {
            left = Array.from({ length: leftCount }, function (_, index) { return 'u' + index; });
            right = shuffled(left, random).slice(0, rightCount);
        } else {
            left = Array.from({ length: leftCount }, function (_, index) {
                return random() < 0.3 ? '' : 'u' + index;
            });
            const cut = Math.floor(random() * leftCount);
            right = left.slice(cut).concat(left.slice(0, cut));
        }

        const exactDistance = editDistanceFromRanges(diff.computeMyersRanges(left, right));
        for (const maxSplitCost of [1, 2, 4, 16]) {
            const label = 'case ' + caseIndex + ' cost ' + maxSplitCost;
            const generic = diff.computeMyersRanges(left, right, { maxSplitCost: maxSplitCost });
            assertValidRanges(generic, left, right, label);
            assert.equal(editDistanceFromRanges(generic) >= exactDistance, true, label);

            const lines = diff.computeLineRanges(left, right, {
                maxSplitCost: maxSplitCost,
                exactSteps: 0
            });
            assertValidRanges(lines, left, right, label);
            assert.equal(editDistanceFromRanges(lines) >= exactDistance, true, label);
        }
    }
});

test('unique-line anchors recover the longest common order of reordered lines', function () {
    const random = createRandom(424242);
    const left = Array.from({ length: 700 }, function (_, index) { return 'unique ' + index; });
    const right = shuffled(left, random);

    const approximate = diff.computeLineRanges(left, right, { maxSplitCost: 1, exactSteps: 0 });
    assertValidRanges(approximate, left, right, 'shuffled');
    assert.equal(editDistanceFromRanges(approximate), lcsEditDistance(left, right));

    const blocks = [];
    for (let block = 0; block < 6; block++) {
        blocks.push(left.slice(block * 100, (block + 1) * 100));
    }
    const reordered = [blocks[3], blocks[0], blocks[1], blocks[5], blocks[2], blocks[4]].flat();
    const moved = diff.computeLineRanges(left.slice(0, 600), reordered, { maxSplitCost: 1, exactSteps: 0 });
    assertValidRanges(moved, left.slice(0, 600), reordered, 'moved blocks');
    assert.equal(editDistanceFromRanges(moved), lcsEditDistance(left.slice(0, 600), reordered));
});

test('the exact line search is kept while the step budget allows it', function () {
    const left = Array.from({ length: 2000 }, function (_, index) { return 'line ' + index; });
    const right = left.slice(400).concat(left.slice(0, 400));
    const workBudget = diff.createDiffWorkBudget();
    const model = diff.computeDiffModel(left.join('\n'), right.join('\n'), { workBudget: workBudget });

    assert.equal(model.stats.matchedRows, 1600);
    assert.equal(model.stats.missingRows, 400);
    assert.equal(model.stats.addedRows, 400);
    assert.equal(
        workBudget.remainingMyersSteps > diff.DIFF_WORK_BUDGET_DEFAULTS.remainingMyersSteps - 12000000,
        true
    );
});

test('wholesale-different and heavily reordered inputs are compared instead of rejected', function () {
    const count = 6100;
    const lines = Array.from({ length: count }, function (_, index) {
        return 'const value' + index + ' = compute(' + index + ');';
    });

    const trailing = diff.computeDiffModel(lines.join(' \n'), lines.join('\n'));
    assert.equal(trailing.rows.length, count);
    assert.equal(trailing.stats.modifiedRows, count - 1);
    assert.equal(trailing.stats.matchedRows, 1);
    assert.equal(trailing.stats.alignment.leftProfilesBuilt <= count, true);
    assert.equal(trailing.stats.alignment.rightProfilesBuilt <= count, true);

    const everyFifth = lines.map(function (line, index) {
        return index % 5 === 0 ? line.replace('compute', 'calc') : line;
    });
    const scattered = diff.computeDiffModel(lines.join('\n'), everyFifth.join('\n'));
    assert.equal(scattered.stats.modifiedRows, count / 5);
    assert.equal(scattered.stats.matchedRows, count - (count / 5));

    const unrelatedLeft = Array.from({ length: count }, function (_, index) { return 'left ' + index; });
    const unrelatedRight = Array.from({ length: count }, function (_, index) { return 'RIGHT-' + index; });
    const unrelated = diff.computeDiffModel(unrelatedLeft.join('\n'), unrelatedRight.join('\n'));
    assert.equal(unrelated.stats.matchedRows, 0);
    assert.equal(unrelated.stats.modifiedRows + unrelated.stats.missingRows, count);
    assert.equal(unrelated.stats.modifiedRows + unrelated.stats.addedRows, count);

    const random = createRandom(8642);
    const reordered = shuffled(lines, random);
    const workBudget = diff.createDiffWorkBudget();
    const shuffledModel = diff.computeDiffModel(lines.join('\n'), reordered.join('\n'), {
        workBudget: workBudget
    });
    assertModelAlignmentInvariants(shuffledModel, lines.join('\n'), reordered.join('\n'));
    assert.equal(shuffledModel.stats.matchedRows > 0, true);
    assert.equal(workBudget.remainingMyersSteps > 0, true);
});

test('DiffModelV2 exposes the semantic difference-row count', function () {
    const model = diff.computeDiffModel('a\nb\nc', 'a\nb!\nx\nc');
    assert.equal(model.mismatchCount, 2);
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
    assertCurrentModelSchema(model);

    const rebuilt = { left: [], right: [] };
    for (const row of model.rows) {
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
                Array.from(diff.splitDiffUnits(left.slice(leftLineStart, leftLineEnd)).boundaries)
            );
            const rightBoundaries = new Set(
                Array.from(diff.splitDiffUnits(right.slice(rightLineStart, rightLineEnd)).boundaries)
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

test('DiffModelV2 has the exact compact schema and line-start arrays', function () {
    const cases = [
        ['', ''],
        ['a', 'a\n'],
        ['a\n', 'a'],
        ['same\nleft only\nend', 'same\nright only\nend'],
        ['a\r\n😀\n', 'a\r\n😃\n']
    ];

    for (const [left, right] of cases) {
        const model = diff.computeDiffModel(left, right);

        assertCurrentModelSchema(model);
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

    const separated = diff.computeDiffModel('a x b x c', 'a y b y c');
    const separatedRow = separated.rows[0];
    assert.equal(separatedRow.leftRangeCount, 2);
    assert.equal(separatedRow.rightRangeCount, 2);
    assert.deepEqual(Array.from(separated.changeBounds), [2, 3, 6, 7, 2, 3, 6, 7]);
});

test('intraline ranges follow word boundaries instead of scattered characters', function () {
    function marked(left, right) {
        const model = diff.computeDiffModel(left, right);
        const row = model.rows[0];
        assert.equal(row.type, 'modified');
        assert.equal(row.detailMode, 'precise');
        function mark(text, offset, count) {
            let out = '';
            let position = 0;
            for (let index = 0; index < count; index++) {
                const start = model.changeBounds[offset + index * 2];
                const end = model.changeBounds[offset + index * 2 + 1];
                out += text.slice(position, start) + '[' + text.slice(start, end) + ']';
                position = end;
            }
            return out + text.slice(position);
        }
        return [
            mark(left, row.leftRangeOffset, row.leftRangeCount),
            mark(right, row.rightRangeOffset, row.rightRangeCount)
        ];
    }

    // Numbers are replaced whole, never digit by digit.
    assert.deepEqual(
        marked('timeout: 15000, retries: 3', 'timeout: 30000, retries: 5'),
        ['timeout: [15000], retries: [3]', 'timeout: [30000], retries: [5]']
    );
    // Words that share most of their start and end keep the shared part unmarked.
    assert.deepEqual(
        marked('return this.handleRequest(req, res);', 'return this.handleResponse(req, res);'),
        ['return this.handleRe[quest](req, res);', 'return this.handleRe[sponse](req, res);']
    );
    assert.deepEqual(
        marked('color = "grey"', 'colour = "gray"'),
        ['color = "gr[e]y"', 'colo[u]r = "gr[a]y"']
    );
    // Words with little in common are replaced whole.
    assert.deepEqual(
        marked('The quick brown fox jumps over the lazy dog', 'The quick red fox jumps over the sleepy dog'),
        ['The quick [brown] fox jumps over the [lazy] dog', 'The quick [red] fox jumps over the [sleepy] dog']
    );
    // Punctuation and whitespace still diff one character at a time.
    assert.deepEqual(marked('  foo();', '    foo();'), ['  foo();', '  [  ]foo();']);
    assert.deepEqual(marked('foo(a)', 'foo(a, b, c)'), ['foo(a)', 'foo(a[, b, c])']);
    // A character inserted inside a word is marked alone, hidden ones included.
    assert.deepEqual(marked('foo\u200Bbar baz', 'foobar baz'), ['foo[\u200B]bar baz', 'foobar baz']);
    assert.deepEqual(marked('co\u00ADoperate now', 'cooperate now'), ['co[\u00AD]operate now', 'cooperate now']);
    assert.deepEqual(marked('foobar baz', 'foo-bar baz'), ['foobar baz', 'foo[-]bar baz']);
    // A changed number inside a longer replaced stretch is still never cut in two.
    assert.deepEqual(marked('size 15000px', 'size 25000px'), ['size [15000px]', 'size [25000px]']);
    // Scripts written without spaces keep character precision.
    assert.deepEqual(
        marked('\u3053\u308c\u306f\u53e4\u3044\u672c\u3067\u3059', '\u3042\u308c\u306f\u53e4\u3044\u7d19\u3067\u3059'),
        ['[\u3053]\u308c\u306f\u53e4\u3044[\u672c]\u3067\u3059', '[\u3042]\u308c\u306f\u53e4\u3044[\u7d19]\u3067\u3059']
    );
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

    const rowLimited = diff.computeDiffModel('a x b x c', 'a y b y c', {
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

test('bounded row alignment finds both globally compatible modified pairs', function () {
    const model = diff.computeDiffModel('abc1\nabc1y', 'abc2\nabc1x');
    assert.deepEqual(Array.from(model.rows, function (row) { return row.type; }), ['modified', 'modified']);
    assert.equal(model.mismatchCount, 2);
});

test('long lines changed at both ends and extended lines pair as modified rows', function () {
    const cases = [
        [
            '    const total = computeTotal(items, taxRate, discount)',
            '        const total = computeTotal(items, taxRate, discount);'
        ],
        [
            '  const total = computeTotal(items, taxRate, discount)\r',
            '    const total = computeTotal(items, taxRate, discount)'
        ],
        [
            'The quick brown fox jumps over the lazy dog',
            'The quick red fox jumps over the sleepy dog'
        ],
        ['x = 1;', 'x = 1; // initial value for the counter'],
        ['foo(a)', 'foo(a, b, c, d, e)'],
        ['<main>', '<main aria-label="Text comparison workspace">'],
        [
            'Then visit `http://localhost:8000`.',
            'Then visit `http://localhost:8000`. The static pages are linked without the `.html` extension.'
        ]
    ];

    for (const [left, right] of cases) {
        assert.deepEqual(types(left, right), ['modified'], left);
        assert.deepEqual(types(right, left), ['modified'], right);
    }
});

test('shared closers and heavily rewritten lines stay add/remove pairs', function () {
    const cases = [
        ['    </div>', '    <div><strong>Copy</strong><span>Take either side as is.</span></div>'],
        ['</li>', 'like Latin letters, with tooltips explaining the real Unicode character.</span></li>'],
        ['}', '} catch (error) { report(error); }'],
        [
            'The quick brown fox jumps over the lazy dog',
            'The slow red fox leaps over the sleepy dog'
        ],
        [
            'const result = computeTotal(items, taxRate);',
            'const output = calculateSum(items, vatRate);'
        ]
    ];

    for (const [left, right] of cases) {
        assert.deepEqual(types(left, right), ['missing', 'added'], left);
        assert.deepEqual(types(right, left), ['missing', 'added'], right);
    }
});

test('oversized extensions and reordered long lines do not drain the shared detail budget', function () {
    const head = 'The opening words of a hard-wrapped paragraph';
    const wrapped = [];
    const unwrapped = [];
    for (let index = 0; index < 100; index++) {
        wrapped.push(head + ' ' + index, 'continuation ' + index);
        unwrapped.push(head + ' ' + index + ' ' + 'and then a long remainder of that paragraph. '.repeat(20));
    }
    const longWords = Array.from({ length: 600 }, function (_, index) { return 'word' + (index % 37); });
    const reordered = longWords.slice(300).concat(longWords.slice(0, 300));
    const left = wrapped.concat([longWords.join(' '), 'final value = 1']).join('\n');
    const right = unwrapped.concat([reordered.join(' '), 'final value = 2']).join('\n');

    const workBudget = diff.createDiffWorkBudget();
    const model = diff.computeDiffModel(left, right, { workBudget: workBudget });
    const last = model.rows.at(-1);

    assert.equal(last.type, 'modified');
    assert.equal(last.detailMode, 'precise');
    assert.equal(model.stats.modifiedRows, 2);
    assert.equal(model.stats.missingRows, 200);
    assert.equal(model.stats.addedRows, 100);
    assert.equal(model.stats.wholeLineRows, 0);
    assert.equal(workBudget.remainingCharEditDistance, 49966);
});

test('a candidate that agrees in position outranks one that only shares content', function () {
    const left = "divider.addEventListener('dblclick', function () {";
    const samePosition = "divider.addEventListener('dblclick', resetDivider);";
    const sameContent = "divider.addEventListener('keydown', function (event) {";

    assert.equal(
        diff.quantizedModifiedLineScore(left, samePosition).scoreQ
            > diff.quantizedModifiedLineScore(left, sameContent).scoreQ,
        true
    );

    const model = diff.computeDiffModel(left, samePosition + '\n' + sameContent);
    assert.deepEqual(
        Array.from(model.rows, function (row) { return row.type; }),
        ['modified', 'added']
    );
});

test('DiffModelV2 alignment preserves the hardcoded presentation golden corpus', function () {
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

function rowSummary(model) {
    return model.rows.map(function (row) { return row.type; }).join(' ');
}

test('CRLF and LF line endings compare equal and are reported separately', function () {
    const windows = diff.computeDiffModel('a\r\nb\r\nc', 'a\nb\nc');
    assert.equal(rowSummary(windows), 'match match match');
    assert.equal(windows.mismatchCount, 0);
    assert.equal(windows.stats.lineEndingRows, 2);
    assert.deepEqual(Array.from(windows.leftLineStarts), [0, 3, 6]);

    // A real edit next to a line-ending difference is still found and its
    // ranges are offsets into the line without the carriage return.
    const edited = diff.computeDiffModel('same\r\nvalue = 10\r\nend\r\n', 'same\nvalue = 20\nend\n');
    assert.equal(rowSummary(edited), 'match modified match match');
    assert.equal(edited.mismatchCount, 1);
    assert.equal(edited.stats.lineEndingRows, 3);
    assert.deepEqual(Array.from(edited.changeBounds), [8, 10, 8, 10]);

    // Identical mixed endings are not a difference; differing ones count per row.
    const sameMixed = diff.computeDiffModel('a\r\nb\nc\n', 'a\r\nb\nc\n');
    assert.equal(sameMixed.stats.lineEndingRows, 0);
    const mixed = diff.computeDiffModel('a\r\nb\nc\r\nd', 'a\r\nb\r\nc\nd');
    assert.equal(rowSummary(mixed), 'match match match match');
    assert.equal(mixed.stats.lineEndingRows, 2);
});

test('a carriage return that is not part of a line ending stays content', function () {
    const inside = diff.computeDiffModel('a\rb\nc', 'ab\nc');
    assert.equal(rowSummary(inside), 'modified match');
    assert.deepEqual(Array.from(inside.changeBounds), [1, 2]);
    assert.equal(inside.stats.lineEndingRows, 0);

    // The last line has no line feed after it, so its carriage return is text.
    const atEnd = diff.computeDiffModel('a\nc\r', 'a\nc');
    assert.equal(rowSummary(atEnd), 'match modified');
    assert.deepEqual(Array.from(atEnd.changeBounds), [1, 2]);

    // Only the one before the line feed is the line ending.
    const doubled = diff.computeDiffModel('a\r\r\nb', 'a\nb');
    assert.equal(rowSummary(doubled), 'modified match');
    assert.deepEqual(Array.from(doubled.changeBounds), [1, 2]);
    assert.equal(doubled.stats.lineEndingRows, 1);
});

test('ignoreWhitespace sets aside indentation, trailing blanks and the length of inner runs', function () {
    const left = '  foo(a,  b);\n\tbar\nbaz';
    const right = 'foo(a, b);  \n    bar\nbaz';

    const strict = diff.computeDiffModel(left, right);
    assert.equal(strict.stats.matchedRows, 1);
    assert.equal(strict.mismatchCount > 0, true);
    assert.equal(strict.stats.whitespaceRows, 0);

    const relaxed = diff.computeDiffModel(left, right, { ignoreWhitespace: true });
    assert.equal(rowSummary(relaxed), 'match match match');
    assert.equal(relaxed.mismatchCount, 0);
    assert.equal(relaxed.stats.whitespaceRows, 2);
    assertCurrentModelSchema(relaxed);

    // Only the real edit is marked, at offsets of the untrimmed lines.
    const edited = diff.computeDiffModel('x = 1', '\tx  =  2  ', { ignoreWhitespace: true });
    assert.equal(rowSummary(edited), 'modified');
    assert.deepEqual(Array.from(edited.changeBounds), [4, 5, 7, 8]);
    assert.equal(edited.stats.whitespaceRows, 0);

    // Whitespace that separates words is not ignored altogether.
    const joined = diff.computeDiffModel('a b', 'ab', { ignoreWhitespace: true });
    assert.equal(rowSummary(joined), 'modified');
    assert.deepEqual(Array.from(joined.changeBounds), [1, 2]);

    // Only spaces and tabs are ignorable: other spaces remain real differences.
    for (const other of [' ', ' ', '​', '﻿']) {
        const model = diff.computeDiffModel('a' + other + 'b', 'a b', { ignoreWhitespace: true });
        assert.equal(rowSummary(model), 'modified', 'U+' + other.charCodeAt(0).toString(16));
        const indented = diff.computeDiffModel(other + 'ab', 'ab', { ignoreWhitespace: true });
        assert.equal(rowSummary(indented), 'modified');
    }
});

test('ignoreWhitespace lets a re-indented block match line by line', function () {
    const lines = Array.from({ length: 400 }, function (_, index) {
        return 'const value' + index + ' = compute(' + index + ');';
    });
    const indented = lines.map(function (line, index) {
        return '    ' + (index === 200 ? line.replace('compute', 'calc') : line) + (index < 399 ? '\r' : '');
    });
    const model = diff.computeDiffModel(lines.join('\n'), indented.join('\n'), { ignoreWhitespace: true });

    assert.equal(model.stats.matchedRows, 399);
    assert.equal(model.stats.modifiedRows, 1);
    assert.equal(model.stats.whitespaceRows, 399);
    assert.equal(model.stats.lineEndingRows, 399);
    assert.deepEqual(reconstructedFromModel(model, lines.join('\n'), indented.join('\n')), {
        left: lines.join('\n'),
        right: indented.join('\n')
    });
});

function taggedRows(left, right, options) {
    const model = diff.computeDiffModel(left, right, options);
    const leftLines = left.split('\n');
    const rightLines = right.split('\n');
    assertCurrentModelSchema(model);
    assert.deepEqual(reconstructedFromModel(model, left, right), { left: left, right: right });
    return {
        model: model,
        rows: Array.from(model.rows, function (row) {
            if (row.type === 'missing') {
                return '-' + (Number.isInteger(row.movedTo) ? '>' + row.movedTo : '') + ' ' + leftLines[row.leftLineIndex];
            }
            if (row.type === 'added') {
                return '+' + (Number.isInteger(row.movedFrom) ? '<' + row.movedFrom : '') + ' ' + rightLines[row.rightLineIndex];
            }
            return (row.type === 'match' ? '= ' : '~ ') + leftLines[row.leftLineIndex];
        })
    };
}

const ALPHA_FUNCTION = ['function alpha(items) {', '    let total = 0;', '    return total;', '}'];
const BETA_FUNCTION = ['function beta(user) {', '    if (!user) {', '        return null;', '    }', '    return user.name;', '}'];
const GAMMA_FUNCTION = ['function gamma() {', '    return 42;', '}'];

test('two functions that swap places keep their own braces and are reported as a move', function () {
    const left = ['// header', ''].concat(ALPHA_FUNCTION, [''], BETA_FUNCTION, [''], GAMMA_FUNCTION).join('\n');
    const right = ['// header', ''].concat(BETA_FUNCTION, [''], ALPHA_FUNCTION, [''], GAMMA_FUNCTION).join('\n');
    const result = taggedRows(left, right);

    assert.deepEqual(result.rows, [
        '= // header',
        '= ',
        '->9 function alpha(items) {',
        '->10     let total = 0;',
        '->11     return total;',
        '->12 }',
        '->13 ',
        '= function beta(user) {',
        '=     if (!user) {',
        '=         return null;',
        '=     }',
        '=     return user.name;',
        '= }',
        '= ',
        '+<2 function alpha(items) {',
        '+<3     let total = 0;',
        '+<4     return total;',
        '+<5 }',
        '+<6 ',
        '= function gamma() {',
        '=     return 42;',
        '= }'
    ]);
    assert.equal(result.model.stats.movedRows, 5);
    // A move is still a difference on both sides.
    assert.equal(result.model.mismatchCount, 10);

    // The same comparison the other way round mirrors it exactly.
    const mirrored = taggedRows(right, left);
    assert.equal(mirrored.model.stats.movedRows, 5);
    assert.deepEqual(
        mirrored.model.rows.filter(function (row) { return row.type === 'match'; })
            .map(function (row) { return [row.rightLineIndex, row.leftLineIndex]; }),
        result.model.rows.filter(function (row) { return row.type === 'match'; })
            .map(function (row) { return [row.leftLineIndex, row.rightLineIndex]; })
    );
});

test('moves pair each line once, both ways, and need real content', function () {
    const model = taggedRows(
        ALPHA_FUNCTION.concat([''], BETA_FUNCTION, [''], GAMMA_FUNCTION).join('\n'),
        GAMMA_FUNCTION.concat([''], ALPHA_FUNCTION.map(function (line) { return line.replace('total', 'sum'); }),
            [''], BETA_FUNCTION).join('\n')
    ).model;
    const to = new Map();
    const from = new Map();
    for (const row of model.rows) {
        assert.equal(Object.hasOwn(row, 'movedTo') && row.type !== 'missing', false);
        assert.equal(Object.hasOwn(row, 'movedFrom') && row.type !== 'added', false);
        if (Number.isInteger(row.movedTo)) to.set(row.leftLineIndex, row.movedTo);
        if (Number.isInteger(row.movedFrom)) from.set(row.rightLineIndex, row.movedFrom);
    }
    assert.equal(to.size, 3);
    assert.equal(from.size, to.size);
    assert.equal(new Set(to.values()).size, to.size);
    for (const [leftLine, rightLine] of to) assert.equal(from.get(rightLine), leftLine);
    assert.equal(model.stats.movedRows, 3);

    // Lines without letters or digits, and blocks with too little text, are
    // removed and added, never moved.
    for (const [left, right] of [
        ['{\n}\nfirst line of text\nsecond line of text\nthird line of text',
            'first line of text\nsecond line of text\nthird line of text\n{\n}'],
        ['a = 1\nkeep this line as it is\nkeep this one as well', 'keep this line as it is\nkeep this one as well\na = 1']
    ]) {
        const small = diff.computeDiffModel(left, right);
        assert.equal(small.stats.movedRows, 0, JSON.stringify(left));
        assert.equal(small.rows.some(function (row) {
            return Object.hasOwn(row, 'movedTo') || Object.hasOwn(row, 'movedFrom');
        }), false);
    }

    // One line on its own is a move only when it occurs once on each side.
    const uniqueLine = 'const uniqueSetting = loadTheOnlySetting();';
    const commonLine = 'background-color: var(--panel-background);';
    function single(line, extra) {
        return diff.computeDiffModel(
            [line, 'first kept line', 'second kept line', 'third kept line'].concat(extra).join('\n'),
            ['first kept line', 'second kept line', 'third kept line', line].concat(extra).join('\n')
        ).stats.movedRows;
    }
    assert.equal(single(uniqueLine, []), 1);
    assert.equal(single(commonLine, ['tail', commonLine]), 0);

    // With whitespace ignored a re-indented block is still the same block.
    const body = ['const first = loadFirstValue();', 'const second = loadSecondValue();'];
    const anchors = ['anchorOne();', 'anchorTwo();', 'anchorThree();'];
    const before = body.concat(anchors).join('\n');
    const after = anchors.concat(body.map(function (line) { return '    ' + line; })).join('\n');
    assert.equal(diff.computeDiffModel(before, after, { ignoreWhitespace: true }).stats.movedRows, 2);
    assert.equal(diff.computeDiffModel(before, after).stats.movedRows, 0);
});

test('a moved block keeps the lines edited on the way, with their changed ranges', function () {
    const alpha = ['function alpha() {', '    const total = computeTotal(items);', '    return formatCurrency(total, locale);', '}', ''];
    const beta = ['function beta() {', '    const user = loadUser(session.userId);', "    logger.info('loaded user', user.name);", '    return user;', '}', ''];
    const betaEdited = beta.slice();
    betaEdited[2] = "    logger.debug('loaded user', user.name);";
    const left = betaEdited.concat(alpha, ['const tail = 1;']).join('\n');
    const right = alpha.concat(beta, ['const tail = 1;']).join('\n');

    const result = taggedRows(left, right);
    const model = result.model;
    assert.equal(model.stats.movedRows, 6);
    assert.equal(model.stats.movedChangedRows, 1);
    assert.equal(model.stats.rangePairs, 2);
    assert.equal(model.changeBounds.length, 4);
    assert.equal(model.mismatchCount, 12);

    const rows = Array.from(model.rows);
    const removed = rows.filter(function (row) { return Object.hasOwn(row, 'leftRangeOffset'); });
    const added = rows.filter(function (row) { return Object.hasOwn(row, 'rightRangeOffset'); });
    assert.equal(removed.length, 1);
    assert.equal(added.length, 1);
    assert.equal(removed[0].type, 'missing');
    assert.equal(added[0].type, 'added');
    assert.equal(removed[0].movedTo, added[0].rightLineIndex);
    assert.equal(added[0].movedFrom, removed[0].leftLineIndex);
    const leftLine = left.split('\n')[removed[0].leftLineIndex];
    const rightLine = right.split('\n')[added[0].rightLineIndex];
    assert.equal(leftLine.slice(model.changeBounds[removed[0].leftRangeOffset],
        model.changeBounds[removed[0].leftRangeOffset + 1]), 'debug');
    assert.equal(rightLine.slice(model.changeBounds[added[0].rightRangeOffset],
        model.changeBounds[added[0].rightRangeOffset + 1]), 'info');
    // Lines after the edited one still belong to the move.
    assert.equal(rows.filter(function (row) {
        return row.type === 'missing' && Number.isInteger(row.movedTo);
    }).length, 6);
});

test('edited lines join a move only between unchanged moved lines or at the end of a longer block', function () {
    const anchors = ['first anchor line stays here', 'second anchor line stays here', 'third anchor line stays here'];
    function movedStats(block, changed) {
        return diff.computeDiffModel(block.concat(anchors).join('\n'), anchors.concat(changed).join('\n')).stats;
    }
    const block = [
        'const alphaValue = loadAlphaValue(source);',
        'const betaValue = loadBetaValue(source);',
        'const gammaValue = loadGammaValue(source);',
        'const deltaValue = loadDeltaValue(source);'
    ];

    // An edited line between two unchanged moved lines belongs to the move.
    const between = movedStats(block.slice(0, 3),
        [block[0], block[1].replace('source', 'origin'), block[2]]);
    assert.equal(between.movedRows, 3);
    assert.equal(between.movedChangedRows, 1);

    // At an open end two unchanged lines carry one edited line, not two.
    const tail = movedStats(block,
        [block[0], block[1], block[2].replace('source', 'origin'), block[3].replace('source', 'origin')]);
    assert.equal(tail.movedRows, 3);
    assert.equal(tail.movedChangedRows, 1);

    // A single unchanged line carries none: its neighbours may be similar by chance.
    const single = movedStats(block.slice(0, 3),
        [block[0].replace('source', 'origin'), block[1], block[2].replace('source', 'origin')]);
    assert.equal(single.movedRows, 1);
    assert.equal(single.movedChangedRows, 0);

    // Without any unchanged line nothing is called a move.
    const none = movedStats(block, block.map(function (line) { return line.replace('source', 'origin'); }));
    assert.equal(none.movedRows, 0);
    assert.equal(none.movedChangedRows, 0);

    // A line that is not similar to its neighbour at the destination ends the move.
    const unrelated = movedStats(block.slice(0, 3), [block[0], block[1], 'return somethingElseEntirely;']);
    assert.equal(unrelated.movedRows, 2);
    assert.equal(unrelated.movedChangedRows, 0);

    // Range limits: an edited line whose detail does not fit stays a plain
    // removed and added line.
    const limited = diff.computeDiffModel(
        block.slice(0, 3).concat(anchors).join('\n'),
        anchors.concat([block[0], block[1], block[2].replace('source', 'origin')]).join('\n'),
        { modelLimits: { maxRangePairsTotal: 0 } }
    );
    assert.equal(limited.stats.movedRows, 2);
    assert.equal(limited.stats.movedChangedRows, 0);
    assert.equal(limited.changeBounds.length, 0);
});

test('ignoreCase compares letters without their case and keeps offsets in the text as written', function () {
    const left = 'Hello World\nSELECT name FROM users\nvalue = 1';
    const right = 'hello world\nselect name from users\nVALUE = 2';

    const strict = diff.computeDiffModel(left, right);
    assert.equal(strict.stats.matchedRows, 0);
    assert.equal(strict.stats.caseRows, 0);

    const relaxed = diff.computeDiffModel(left, right, { ignoreCase: true });
    assertCurrentModelSchema(relaxed);
    assert.deepEqual(Array.from(relaxed.rows, function (row) { return row.type; }), ['match', 'match', 'modified']);
    assert.equal(relaxed.stats.caseRows, 2);
    assert.deepEqual(Array.from(relaxed.changeBounds), [8, 9, 8, 9]);

    function only(leftLine, rightLine, options) {
        const model = diff.computeDiffModel(leftLine, rightLine, options || { ignoreCase: true });
        return { type: model.rows[0].type, bounds: Array.from(model.changeBounds), stats: model.stats };
    }

    // A word-final sigma folds the same way in a whole line and in one character.
    assert.equal(only('\u039F\u0394\u039F\u03A3', '\u03BF\u03B4\u03BF\u03C3').type, 'match');
    assert.equal(only('\u039F\u0394\u039F\u03A3', '\u03BF\u03B4\u03BF\u03C2').type, 'match');
    assert.deepEqual(only('\u039F\u0394\u039F\u03A3 x', '\u03BF\u03B4\u03BF\u03C2 y').bounds, [5, 6, 5, 6]);
    // Lower-casing can lengthen a character; the ranges still point into the original.
    assert.deepEqual(only('\u0130STANBUL foo', '\u0130stanbul bar').bounds, [9, 12, 9, 12]);
    // Look-alike letters of different scripts remain a difference.
    assert.equal(only('\u0410', 'A').type, 'modified');
    // Numbers and identifiers still change as one piece.
    assert.deepEqual(only('const MAX_VALUE = 15000;', 'const max_value = 30000;').bounds, [18, 23, 18, 23]);
    // Whitespace still counts unless it is ignored too.
    assert.deepEqual(only('Hello World', 'hello  world').bounds, [6, 7]);

    // With both options a row counts for each one the other could not have covered.
    const both = diff.computeDiffModel('Foo  bar\nBAZ\nq  x\nsame', 'foo bar\nbaz\nq x\nsame',
        { ignoreCase: true, ignoreWhitespace: true });
    assert.equal(both.mismatchCount, 0);
    assert.equal(both.stats.caseRows, 2);
    assert.equal(both.stats.whitespaceRows, 2);
    const caseOnly = diff.computeDiffModel('Foo  bar\nBAZ\nq  x\nsame', 'foo bar\nbaz\nq x\nsame',
        { ignoreCase: true });
    assert.equal(caseOnly.mismatchCount, 2);
    assert.equal(caseOnly.stats.caseRows, 1);
    assert.equal(caseOnly.stats.whitespaceRows, 0);

    // A block that moved and changed case is the same block.
    const body = ['const first = loadFirstValue();', 'const second = loadSecondValue();'];
    const anchors = ['anchorOne();', 'anchorTwo();', 'anchorThree();'];
    const moved = diff.computeDiffModel(body.concat(anchors).join('\n'),
        anchors.concat(body.map(function (line) { return line.toUpperCase(); })).join('\n'),
        { ignoreCase: true });
    assert.equal(moved.stats.movedRows, 2);
    assert.equal(moved.stats.movedChangedRows, 0);
});

test('a block of added or removed lines settles where it cuts the text least', function () {
    // A list item is added whole, not as the tail of one item and the head of the next.
    const list = ['items = [', '    {', '        id: 1,', '    },', '    {', '        id: 3,', '    },', ']'];
    const longer = list.slice(0, 4).concat(['    {', '        id: 2,', '    },'], list.slice(4));
    assert.deepEqual(taggedRows(list.join('\n'), longer.join('\n')).rows.filter(function (row) {
        return row[0] !== '=';
    }), ['+     {', '+         id: 2,', '+     },']);
    assert.deepEqual(taggedRows(longer.join('\n'), list.join('\n')).rows.filter(function (row) {
        return row[0] !== '=';
    }), ['-     {', '-         id: 2,', '-     },']);

    // A function goes with the blank line after it; at the end of the text
    // with the one before it.
    const inserted = taggedRows(
        ALPHA_FUNCTION.concat([''], GAMMA_FUNCTION).join('\n'),
        ALPHA_FUNCTION.concat([''], BETA_FUNCTION, [''], GAMMA_FUNCTION).join('\n')
    ).rows.filter(function (row) { return row[0] !== '='; });
    assert.equal(inserted[0], '+ function beta(user) {');
    assert.equal(inserted[inserted.length - 1], '+ ');
    const appended = taggedRows(
        ALPHA_FUNCTION.join('\n'),
        ALPHA_FUNCTION.concat([''], GAMMA_FUNCTION).join('\n')
    ).rows.filter(function (row) { return row[0] !== '='; });
    assert.deepEqual(appended, ['+ ', '+ function gamma() {', '+     return 42;', '+ }']);

    // In a text that ends with a line break the empty last line stays matched:
    // marking it would look like a change in the final line break.
    const withNewline = taggedRows(
        ALPHA_FUNCTION.join('\n') + '\n',
        ALPHA_FUNCTION.concat([''], GAMMA_FUNCTION).join('\n') + '\n'
    );
    assert.deepEqual(withNewline.rows.filter(function (row) { return row[0] !== '='; }),
        ['+ ', '+ function gamma() {', '+     return 42;', '+ }']);
    assert.equal(withNewline.model.rows.at(-1).type, 'match');
    const removedTail = taggedRows(
        ALPHA_FUNCTION.concat([''], GAMMA_FUNCTION).join('\n') + '\n',
        ALPHA_FUNCTION.join('\n') + '\n'
    );
    assert.deepEqual(removedTail.rows.filter(function (row) { return row[0] !== '='; }),
        ['- ', '- function gamma() {', '-     return 42;', '- }']);
    assert.equal(removedTail.model.rows.at(-1).type, 'match');

    // Sliding to the very start or end of the text keeps every line accounted for.
    for (const [left, right] of [
        ['x\nalpha line\nbeta line\nx', 'x'],
        ['x', 'x\nalpha line\nbeta line\nx'],
        ['}\n\nfoo\n}', '}'],
        ['a\nx\nx\nx\nb', 'a\nx\nb']
    ]) {
        const model = taggedRows(left, right).model;
        assert.equal(model.stats.matchedRows, Math.min(left.split('\n').length, right.split('\n').length));
    }
});

test('decimals and version numbers are compared as one piece', function () {
    function bounds(left, right) {
        return Array.from(diff.computeDiffModel(left, right).changeBounds);
    }
    // "1.2.3" -> "2.3.4" is one replacement, not a shifted pair of fragments.
    assert.deepEqual(bounds('version = "1.2.3"', 'version = "2.3.4"'), [11, 16, 11, 16]);
    // A change in one component marks only that component.
    assert.deepEqual(bounds('version = "1.2.3"', 'version = "1.2.4"'), [15, 16, 15, 16]);
    assert.deepEqual(bounds('pi = 3.14', 'pi = 3.15'), [7, 9, 7, 9]);
    // A dot that ends a sentence or separates names is not part of a number.
    assert.deepEqual(bounds('end of 2024. Next', 'end of 2025. Next'), [7, 11, 7, 11]);
    assert.deepEqual(bounds('a.b.c = 1', 'a.b.d = 1'), [4, 5, 4, 5]);
});

test('Unicode normalization differences pair lines and are counted, compatibility forms are not', function () {
    const composed = 'Tiếng Việt rất đẹp';
    const decomposed = composed.normalize('NFD');
    const model = diff.computeDiffModel('first\n' + composed + '\nÅ', 'first\n' + decomposed + '\nÅ');
    assert.deepEqual(Array.from(model.rows, function (row) { return row.type; }), ['match', 'modified', 'modified']);
    assert.equal(model.stats.normalizationRows, 2);
    assert.equal(model.mismatchCount, 2);

    const flags = diff.findCanonicallyEquivalentRanges(
        'x é y', [2, 3], 0, 1,
        'x é y', [2, 4], 0, 1
    );
    assert.deepEqual([Array.from(flags.left), Array.from(flags.right)], [[1], [1]]);
    // Identical text, plain ASCII, and compatibility (NFKC) forms do not qualify.
    assert.equal(diff.findCanonicallyEquivalentRanges('é', [0, 1], 0, 1, 'é', [0, 1], 0, 1), null);
    assert.equal(diff.findCanonicallyEquivalentRanges('ab', [0, 2], 0, 1, 'cd', [0, 2], 0, 1), null);
    assert.equal(diff.findCanonicallyEquivalentRanges('ﬁ', [0, 1], 0, 1, 'fi', [0, 2], 0, 1), null);
    assert.equal(diff.computeDiffModel('ofﬁce hours', 'office hours').stats.normalizationRows, 0);
});

