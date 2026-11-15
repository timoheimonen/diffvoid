'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadDiffCore() {
    const filename = path.join(__dirname, '..', 'public', 'shared-diff.js');
    const context = { Intl: Intl, performance: performance, TextDecoder: TextDecoder };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename: filename });
    return context.DiffCore;
}

const core = loadDiffCore();

function unifiedDiff(left, right, compareOptions, diffOptions) {
    const model = core.computeDiffModel(left, right, Object.assign({
        workBudget: core.createDiffWorkBudget()
    }, compareOptions));
    return core.createUnifiedDiff(left, right, model, diffOptions);
}

// Lines with their line feed, so a missing final line feed stays visible.
function splitKeepingLineFeeds(text) {
    return text.match(/[^\n]*\n|[^\n]+$/g) || [];
}

// A strict applier: every context and removed line must be exactly the source
// line, and every hunk must have the lengths its header states.
function applyUnifiedDiff(source, patch) {
    const sourceLines = splitKeepingLineFeeds(source);
    const patchLines = splitKeepingLineFeeds(patch);
    assert.match(patchLines[0], /^--- /);
    assert.match(patchLines[1], /^\+\+\+ /);
    const output = [];
    let sourceIndex = 0;
    let index = 2;
    while (index < patchLines.length) {
        const header = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@\n$/.exec(patchLines[index++]);
        assert.ok(header, 'hunk header');
        const leftStart = Number(header[1]);
        const leftLength = Number(header[2]);
        const rightStart = Number(header[3]);
        const rightLength = Number(header[4]);
        const firstSourceLine = leftLength ? leftStart - 1 : leftStart;
        assert.ok(firstSourceLine >= sourceIndex, 'hunks are ordered and do not overlap');
        while (sourceIndex < firstSourceLine) output.push(sourceLines[sourceIndex++]);
        assert.equal(output.length, rightLength ? rightStart - 1 : rightStart, 'right start');
        const outputStart = output.length;
        let consumed = 0;
        while (index < patchLines.length && !patchLines[index].startsWith('@@')) {
            const line = patchLines[index++];
            let text = line.slice(1);
            if (index < patchLines.length && patchLines[index].startsWith('\\')) {
                assert.equal(patchLines[index++], '\\ No newline at end of file\n');
                text = text.slice(0, -1);
            }
            if (line[0] === '+') {
                output.push(text);
                continue;
            }
            assert.ok(line[0] === ' ' || line[0] === '-', 'line prefix');
            assert.equal(text, sourceLines[sourceIndex], 'source line ' + (sourceIndex + 1));
            sourceIndex++;
            consumed++;
            if (line[0] === ' ') output.push(text);
        }
        assert.equal(consumed, leftLength, 'left length');
        assert.equal(output.length - outputStart, rightLength, 'right length');
    }
    while (sourceIndex < sourceLines.length) output.push(sourceLines[sourceIndex++]);
    return output.join('');
}

function numberedLines(count) {
    return Array.from({ length: count }, function (_, index) { return 'line ' + index + ' of text'; });
}

const ROUND_TRIP_CASES = (function () {
    const lines = numberedLines(400);
    const edited = lines.slice();
    edited[5] = 'changed';
    edited.splice(100, 3);
    edited.splice(200, 0, 'new1', 'new2');
    edited[edited.length - 1] += '!';
    return [
        ['a\nb\nc\n', 'a\nB\nc\n'],
        ['a\nb\nc', 'a\nb\nc\n'],
        ['a\nb\nc\n', 'a\nb\nc'],
        ['a\n', 'a\nx'],
        ['x', 'y'],
        ['a\r\nb\r\nc\r\n', 'a\nb\nc\n'],
        ['a\r\nb\r\n', 'a\r\nb changed\r\n'],
        ['one\ntwo\n', 'zero\none\ntwo\nthree\n'],
        ['a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\n', 'a\nB\nc\nd\ne\nf\ng\nh\ni\nj\nK\nl\n'],
        ['  a\nb\nC\n', 'a\nb\nc\n'],
        ['a\n\n\n', 'a\n'],
        ['a\n', 'a\n\n\n'],
        ['\n', 'a'],
        ['a', '\n'],
        ['a\nb', 'b\na'],
        ['same\n', 'same\n'],
        [lines.join('\n') + '\n', edited.join('\n')]
    ];
})();

test('a unified diff applied to the left text gives exactly the right text', function () {
    const optionSets = [
        {},
        { ignoreWhitespace: true },
        { ignoreCase: true },
        { ignoreWhitespace: true, ignoreCase: true }
    ];
    for (const compareOptions of optionSets) {
        for (const [left, right] of ROUND_TRIP_CASES) {
            for (const contextLines of [0, 1, 3]) {
                const patch = unifiedDiff(left, right, compareOptions, { contextLines: contextLines });
                const label = JSON.stringify([left.slice(0, 40), right.slice(0, 40), compareOptions, contextLines]);
                if (left === right) {
                    assert.equal(patch, '', label);
                    continue;
                }
                assert.notEqual(patch, '', label);
                assert.equal(applyUnifiedDiff(left, patch), right, label);
            }
        }
    }
});

test('randomly edited texts survive the unified diff round trip', function () {
    let seed = 12345;
    function random(limit) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % limit;
    }
    for (let round = 0; round < 40; round++) {
        const leftLines = numberedLines(60 + random(200));
        const rightLines = leftLines.slice();
        const edits = 1 + random(12);
        for (let edit = 0; edit < edits; edit++) {
            const at = random(rightLines.length + 1);
            const kind = random(4);
            if (kind === 0) rightLines.splice(at, random(4));
            else if (kind === 1) rightLines.splice(at, 0, 'inserted ' + round + ' ' + edit);
            else if (kind === 2 && at < rightLines.length) rightLines[at] = rightLines[at].toUpperCase() + '  ';
            else if (at < rightLines.length) rightLines[at] += ' edited';
        }
        const left = leftLines.join('\n') + (random(2) ? '\n' : '');
        const right = rightLines.join('\n') + (random(2) ? '\n' : '');
        const compareOptions = { ignoreWhitespace: random(2) === 1, ignoreCase: random(2) === 1 };
        const patch = unifiedDiff(left, right, compareOptions, {});
        if (left === right) assert.equal(patch, '');
        else assert.equal(applyUnifiedDiff(left, patch), right, 'round ' + round);
    }
});

test('the unified diff has standard headers, hunk ranges and end-of-file markers', function () {
    assert.equal(
        unifiedDiff('a\nb\nc', 'a\nb\nc\n', {}, { leftName: 'old.txt', rightName: 'new.txt' }),
        '--- old.txt\n+++ new.txt\n@@ -1,3 +1,3 @@\n a\n b\n-c\n\\ No newline at end of file\n+c\n'
    );
    // An empty side is a zero-length range that starts before the first line.
    assert.equal(
        unifiedDiff('\n', 'a\nb\n', {}, {}).split('\n')[2],
        '@@ -1,1 +1,2 @@'
    );
    assert.equal(unifiedDiff('a\nb\n', 'b\n', {}, { contextLines: 0 }).split('\n')[2], '@@ -1,1 +0,0 @@');
    assert.equal(unifiedDiff('b\n', 'a\nb\n', {}, { contextLines: 0 }).split('\n')[2], '@@ -0,0 +1,1 @@');

    // Changes closer than twice the context share one hunk; farther ones do not.
    const lines = numberedLines(40);
    const near = lines.slice();
    near[10] = 'x';
    near[16] = 'y';
    const far = lines.slice();
    far[10] = 'x';
    far[18] = 'y';
    const source = lines.join('\n') + '\n';
    assert.equal(unifiedDiff(source, near.join('\n') + '\n', {}, {}).match(/^@@/gm).length, 1);
    assert.equal(unifiedDiff(source, far.join('\n') + '\n', {}, {}).match(/^@@/gm).length, 2);
});

test('rows that an ignore option hides are still part of the unified diff', function () {
    const left = 'Alpha\n  beta\ngamma\r\n';
    const right = 'alpha\nbeta\ngamma\n';
    const model = core.computeDiffModel(left, right, {
        workBudget: core.createDiffWorkBudget(),
        ignoreWhitespace: true,
        ignoreCase: true
    });
    assert.equal(model.mismatchCount, 0);
    const patch = core.createUnifiedDiff(left, right, model, {});
    assert.equal(applyUnifiedDiff(left, patch), right);
    assert.match(patch, /^-gamma\r$/m);
});

test('diff file names cannot inject lines and invalid input is rejected', function () {
    const patch = unifiedDiff('a\n', 'b\n', {}, { leftName: 'evil\n+++ injected', rightName: '   ' });
    assert.deepEqual(patch.split('\n').slice(0, 3), ['--- evil_+++ injected', '+++ right', '@@ -1,1 +1,1 @@']);
    assert.throws(function () { core.createUnifiedDiff('a', 'b', null, {}); }, /requires both texts/);
    assert.throws(function () { core.createUnifiedDiff('a', 'b', { version: 1 }, {}); }, /requires both texts/);
});

test('file bytes are decoded as text without losing a UTF-8 byte order mark', function () {
    const encoder = new TextEncoder();
    const plain = core.decodeTextBytes(encoder.encode('héllo\nwörld\n'));
    assert.deepEqual(Object.assign({}, plain), { ok: true, text: 'héllo\nwörld\n', encoding: 'UTF-8' });

    const withMark = core.decodeTextBytes(Uint8Array.from([0xEF, 0xBB, 0xBF, 0x61]));
    assert.equal(withMark.text, '﻿a');
    assert.equal(core.hasInvisibleCharacters(withMark.text), true);

    const littleEndian = core.decodeTextBytes(Uint8Array.from([0xFF, 0xFE, 0x68, 0x00, 0xE4, 0x00]));
    assert.deepEqual(Object.assign({}, littleEndian), { ok: true, text: 'hä', encoding: 'UTF-16LE' });
    const bigEndian = core.decodeTextBytes(Uint8Array.from([0xFE, 0xFF, 0x00, 0x68, 0x00, 0xE4]));
    assert.deepEqual(Object.assign({}, bigEndian), { ok: true, text: 'hä', encoding: 'UTF-16BE' });

    // Bytes that are not valid UTF-8 are read as Windows-1252 and said to be.
    const legacy = core.decodeTextBytes(Uint8Array.from([0x63, 0x61, 0x66, 0xE9, 0x20, 0x80]));
    assert.deepEqual(Object.assign({}, legacy), { ok: true, text: 'café €', encoding: 'Windows-1252' });

    assert.equal(core.decodeTextBytes(new Uint8Array(0)).text, '');
});

test('binary and oversized files are refused before they reach the comparison', function () {
    assert.equal(core.decodeTextBytes(Uint8Array.from([0x61, 0x00, 0x62])).ok, false);
    assert.match(core.decodeTextBytes(Uint8Array.from([0x89, 0x50, 0x00, 0xFF])).message, /binary file/);
    assert.equal(core.maxFileBytes, 8000000);
    const oversized = core.decodeTextBytes(new Uint8Array(core.maxFileBytes + 1));
    assert.equal(oversized.ok, false);
    assert.match(oversized.message, /File too large/);
    assert.throws(function () { core.decodeTextBytes('text'); }, /requires a Uint8Array/);
});

function compareTexts(left, right, compareOptions) {
    return core.computeDiffModel(left, right, Object.assign({
        workBudget: core.createDiffWorkBudget()
    }, compareOptions));
}

// The row ranges of every change: runs of rows that are not matches.
function changeRanges(model) {
    const ranges = [];
    let index = 0;
    while (index < model.rows.length) {
        if (model.rows[index].type === 'match') {
            index++;
            continue;
        }
        const first = index;
        while (index < model.rows.length && model.rows[index].type !== 'match') index++;
        ranges.push([first, index]);
    }
    return ranges;
}

test('merging every change from one side makes the texts identical', function () {
    for (const [left, right] of ROUND_TRIP_CASES) {
        for (const fromSide of ['left', 'right']) {
            let texts = { left, right };
            let guard = 0;
            for (;;) {
                const model = compareTexts(texts.left, texts.right);
                const ranges = changeRanges(model);
                if (!ranges.length) break;
                assert.ok(guard++ < 50, 'every merge removes a change');
                // Alternate between the first and the last change.
                const range = guard % 2 ? ranges[0] : ranges[ranges.length - 1];
                const merged = core.mergeDiffRows(texts.left, texts.right, model, range[0], range[1], fromSide);
                texts = fromSide === 'left' ? { left: texts.left, right: merged } : { left: merged, right: texts.right };
                assert.ok(changeRanges(compareTexts(texts.left, texts.right)).length < ranges.length);
            }
            const label = JSON.stringify([left.slice(0, 40), right.slice(0, 40), fromSide]);
            // A CRLF text against an LF text has no change to merge: line
            // endings are compared apart from content and stay as they are.
            if (left.includes('\r') !== right.includes('\r')) {
                assert.equal(texts.left.replace(/\r\n/g, '\n'), texts.right.replace(/\r\n/g, '\n'), label);
                continue;
            }
            assert.equal(texts.left, texts.right, label);
            assert.equal(texts.left, fromSide === 'left' ? left : right, label);
        }
    }
});

test('a merged change takes exactly the lines of the chosen side, with their line endings', function () {
    const left = 'keep\r\nold one\r\nold two\r\nkeep too\r\nlast';
    const right = 'keep\nnew\nkeep too\nlast\nextra\n';
    const model = compareTexts(left, right);
    const ranges = changeRanges(model);
    assert.equal(ranges.length, 2);
    // The first change into the right text: two CRLF lines replace one LF line.
    assert.equal(
        core.mergeDiffRows(left, right, model, ranges[0][0], ranges[0][1], 'left'),
        'keep\nold one\r\nold two\r\nkeep too\nlast\nextra\n'
    );
    assert.equal(
        core.mergeDiffRows(left, right, model, ranges[0][0], ranges[0][1], 'right'),
        'keep\r\nnew\nkeep too\r\nlast'
    );
    // The second change is the added tail: taking the left version removes it
    // together with the final line feed, taking the right version adds both.
    assert.equal(
        core.mergeDiffRows(left, right, model, ranges[1][0], ranges[1][1], 'left'),
        'keep\nnew\nkeep too\nlast'
    );
    assert.equal(
        core.mergeDiffRows(left, right, model, ranges[1][0], ranges[1][1], 'right'),
        'keep\r\nold one\r\nold two\r\nkeep too\r\nlast\nextra\n'
    );
});

test('merging leaves rows that an ignore option hides as they are', function () {
    const left = 'Alpha\n  beta\nGAMMA changed\n';
    const right = 'alpha\nbeta\ngamma\n';
    const model = compareTexts(left, right, { ignoreWhitespace: true, ignoreCase: true });
    const ranges = changeRanges(model);
    assert.deepEqual(ranges, [[2, 3]]);
    assert.equal(core.mergeDiffRows(left, right, model, 2, 3, 'right'), 'Alpha\n  beta\ngamma\n');
    assert.equal(core.mergeDiffRows(left, right, model, 2, 3, 'left'), 'alpha\nbeta\nGAMMA changed\n');
});

test('merging rejects a missing model, an unknown side and rows outside the model', function () {
    const model = compareTexts('a\nb\n', 'a\nc\n');
    assert.throws(function () { core.mergeDiffRows('a\nb\n', 'a\nc\n', null, 1, 2, 'left'); }, /requires both texts/);
    assert.throws(function () { core.mergeDiffRows('a\nb\n', 'a\nc\n', model, 1, 2, 'both'); }, /requires both texts/);
    assert.throws(function () { core.mergeDiffRows('a\nb\n', 'a\nc\n', model, 2, 2, 'left'); }, /row range inside the model/);
    assert.throws(function () { core.mergeDiffRows('a\nb\n', 'a\nc\n', model, 0, 99, 'left'); }, /row range inside the model/);
});
