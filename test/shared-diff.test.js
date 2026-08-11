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

    const totalLimited = diff.computeDiffModel(
        'aXb\nanchor\ncXd',
        'aYb\nanchor\ncYd',
        { modelLimits: { maxRangePairsTotal: 2 } }
    );
    const modifiedRows = Array.from(totalLimited.rows).filter(function (row) { return row.type === 'modified'; });
    assert.deepEqual(modifiedRows.map(function (row) { return row.detailMode; }), ['precise', 'whole-line']);
    assert.deepEqual(Array.from(totalLimited.changeBounds), [1, 2, 1, 2]);
    assert.equal(modifiedRows[1].leftRangeOffset, 4);
    assert.equal(modifiedRows[1].rightRangeOffset, 4);
    assert.equal(totalLimited.stats.rangePairs, 2);
    assert.deepEqual(
        Object.assign({}, totalLimited.stats.workBudget),
        {
            remainingMyersSteps: 40000000,
            remainingAlignmentCells: 2000000,
            remainingCharEditDistance: 49996,
            remainingRangePairs: 199998
        }
    );

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

test('bounded row alignment finds both globally compatible modified pairs', function () {
    const result = diff.computeLineDiff('abc1\nabc1y', 'abc2\nabc1x');
    assert.deepEqual(Array.from(result.diff, function (row) { return row.type; }), ['modified', 'modified']);
});
