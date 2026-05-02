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
