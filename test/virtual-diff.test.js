const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
    FakeDocument,
    FakeEvent,
    createFakeAnimationFrame,
    createClipboardData,
    countDescendants
} = require('./fake-dom');

function loadVirtualDiff(contextOverrides) {
    const sharedFilename = path.join(__dirname, '..', 'public', 'shared-diff.js');
    const virtualFilename = path.join(__dirname, '..', 'public', 'virtual-diff.js');
    assert.equal(fs.existsSync(sharedFilename), true, 'public/shared-diff.js must exist');
    assert.equal(fs.existsSync(virtualFilename), true, 'public/virtual-diff.js must exist');
    const context = Object.assign({ Intl: Intl }, contextOverrides);
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(sharedFilename, 'utf8'), context);

    const code = fs.readFileSync(virtualFilename, 'utf8');
    const closing = '\n})(globalThis);';
    const closingIndex = code.lastIndexOf(closing);
    assert.notEqual(closingIndex, -1, 'virtual diff must use the canonical IIFE wrapper');
    const testExports = `
root.__VirtualDiffTest = Object.freeze({
    computeVirtualWindow: computeVirtualWindow,
    renderBudgets: RENDER_BUDGETS,
    getCopyText: getVirtualDiffCopyText,
    getCleanCopyText: getVirtualDiffCleanCopyText
});`;
    vm.runInContext(code.slice(0, closingIndex) + testExports + code.slice(closingIndex), context);
    return {
        stripInvisibleCharactersForTest: context.DiffCore.stripInvisibleCharacters,
        diffCoreForTest: context.DiffCore,
        createVirtualDiffViewForTest: context.createVirtualDiffView,
        computeVirtualWindowForTest: context.__VirtualDiffTest.computeVirtualWindow,
        renderBudgetsForTest: context.__VirtualDiffTest.renderBudgets,
        copyTextForTest: context.__VirtualDiffTest.getCopyText,
        cleanCopyTextForTest: context.__VirtualDiffTest.getCleanCopyText
    };
}

const virtual = loadVirtualDiff();

function buildLineStarts(source) {
    const starts = [0];
    for (let i = 0; i < source.length; i++) {
        if (source.charCodeAt(i) === 10) starts.push(i + 1);
    }
    return Uint32Array.from(starts);
}

function equalFixture(lineCount, lineFactory, trailingNewline) {
    const lines = Array.from({ length: lineCount }, function (_, index) {
        return lineFactory ? lineFactory(index) : 'line ' + index;
    });
    const source = lines.join('\n') + (trailingNewline ? '\n' : '');
    const starts = buildLineStarts(source);
    const rows = Array.from({ length: starts.length }, function (_, index) {
        return { type: 'match', leftLineIndex: index, rightLineIndex: index };
    });
    return {
        sources: { left: source, right: source },
        model: {
            version: 2,
            rows,
            changeBounds: new Uint32Array(0),
            leftLineStarts: starts,
            rightLineStarts: Uint32Array.from(starts),
            mismatchCount: 0,
            stats: {}
        }
    };
}

function modelFixture(left, right, rows, changeBounds, stats) {
    return {
        sources: { left, right },
        model: {
            version: 2,
            rows,
            changeBounds: Uint32Array.from(changeBounds || []),
            leftLineStarts: buildLineStarts(left),
            rightLineStarts: buildLineStarts(right),
            mismatchCount: rows.filter(function (row) { return row.type !== 'match'; }).length,
            stats: stats || {}
        }
    };
}

function setupView(callbacks) {
    const document = new FakeDocument();
    const left = document.createElement('div');
    const right = document.createElement('div');
    left.setAttribute('contenteditable', 'true');
    right.setAttribute('contenteditable', 'true');
    left.setAttribute('aria-label', 'Left text');
    right.setAttribute('aria-label', 'Right text');
    left.clientHeight = 840;
    right.clientHeight = 840;
    left.clientWidth = 600;
    right.clientWidth = 600;
    left.setBoundingClientRect({ top: 0, bottom: 840, left: 0, right: 600, width: 600, height: 840 });
    right.setBoundingClientRect({ top: 0, bottom: 840, left: 600, right: 1200, width: 600, height: 840 });
    document.body.appendChild(left);
    document.body.appendChild(right);
    const animation = createFakeAnimationFrame();
    const reductions = [];
    const view = virtual.createVirtualDiffViewForTest({
        leftElement: left,
        rightElement: right,
        document,
        requestAnimationFrame: animation.requestAnimationFrame,
        cancelAnimationFrame: animation.cancelAnimationFrame,
        stripInvisibleCharacters: virtual.stripInvisibleCharactersForTest,
        findEquivalentRanges: virtual.diffCoreForTest.findCanonicallyEquivalentRanges,
        now: callbacks && callbacks.now ? callbacks.now : animation.now,
        onRenderingReduced(message, reason) {
            reductions.push({ message, reason });
            if (callbacks && callbacks.onRenderingReduced) callbacks.onRenderingReduced(message, reason);
        },
        onViewChange() {
            if (callbacks && callbacks.onViewChange) callbacks.onViewChange();
        }
    });
    return { document, left, right, animation, reductions, view };
}

function mountedRows(element) {
    const windowElement = element.querySelector('.diff-window');
    return windowElement ? windowElement.children : [];
}

test('runtime scripts expose only one frozen diff namespace and the virtual view factory', function () {
    const sharedFilename = path.join(__dirname, '..', 'public', 'shared-diff.js');
    const virtualFilename = path.join(__dirname, '..', 'public', 'virtual-diff.js');
    const context = { Intl: Intl, performance: performance };
    const initialKeys = new Set(Object.keys(context));
    vm.createContext(context);

    vm.runInContext(fs.readFileSync(sharedFilename, 'utf8'), context);
    assert.deepEqual(
        Object.keys(context).filter(function (key) { return !initialKeys.has(key); }),
        ['DiffCore']
    );
    assert.equal(Object.isFrozen(context.DiffCore), true);
    assert.deepEqual(Object.keys(context.DiffCore).sort(), [
        'classifyDiffWork', 'computeDiffModel', 'createDiffWorkBudget', 'createUnifiedDiff',
        'decodeTextBytes', 'findCanonicallyEquivalentRanges', 'hasInvisibleCharacters', 'maxFileBytes',
        'mergeDiffRows', 'scanDiffInput', 'stripInvisibleCharacters', 'validateScannedDiffInput'
    ]);

    const sharedKeys = new Set(Object.keys(context));
    vm.runInContext(fs.readFileSync(virtualFilename, 'utf8'), context);
    assert.deepEqual(
        Object.keys(context).filter(function (key) { return !sharedKeys.has(key); }),
        ['createVirtualDiffView']
    );
});

test('computeVirtualWindow caps and clamps 25,000 rows at top, middle, and end', function () {
    const budgets = virtual.renderBudgetsForTest;
    const rowCount = 25000;
    const viewportHeight = 840;
    const rowHeight = 21;
    const positions = [0, Math.floor(rowCount * rowHeight / 2), rowCount * rowHeight];

    for (const scrollTop of positions) {
        const window = virtual.computeVirtualWindowForTest(
            rowCount,
            scrollTop,
            viewportHeight,
            rowHeight,
            budgets.overscanRows,
            budgets.maxMountedRowsPerPane
        );
        assert.ok(window.first >= 0);
        assert.ok(window.last <= rowCount);
        assert.ok(window.last - window.first <= 200);
    }
    assert.deepEqual(
        Object.assign({}, virtual.computeVirtualWindowForTest(0, 100, 840, 21, 24, 200)),
        { first: 0, last: 0 }
    );
});

test('the view exposes one canonical contract and requires its modern dependencies', function () {
    const document = new FakeDocument();
    const left = document.createElement('div');
    const right = document.createElement('div');
    const animation = createFakeAnimationFrame();
    const required = {
        document,
        requestAnimationFrame: animation.requestAnimationFrame,
        cancelAnimationFrame: animation.cancelAnimationFrame,
        stripInvisibleCharacters: virtual.stripInvisibleCharactersForTest
    };

    assert.throws(
        function () {
            virtual.createVirtualDiffViewForTest(Object.assign({ left, right }, required));
        },
        /requires left and right elements/
    );
    assert.throws(
        function () {
            virtual.createVirtualDiffViewForTest({
                leftElement: left,
                rightElement: right,
                document,
                cancelAnimationFrame: animation.cancelAnimationFrame,
                stripInvisibleCharacters: virtual.stripInvisibleCharactersForTest
            });
        },
        /requires requestAnimationFrame and cancelAnimationFrame/
    );
    assert.throws(
        function () {
            virtual.createVirtualDiffViewForTest({
                leftElement: left,
                rightElement: right,
                document,
                requestAnimationFrame: animation.requestAnimationFrame,
                cancelAnimationFrame: animation.cancelAnimationFrame
            });
        },
        /requires stripInvisibleCharacters/
    );

    const withoutSegmenter = loadVirtualDiff({ Intl: {} });
    assert.throws(
        function () {
            withoutSegmenter.createVirtualDiffViewForTest(Object.assign({
                leftElement: left,
                rightElement: right,
                stripInvisibleCharacters: withoutSegmenter.stripInvisibleCharactersForTest
            }, required));
        },
        /requires Intl\.Segmenter/
    );

    const fixture = equalFixture(1);
    const env = setupView();
    assert.deepEqual(Object.keys(env.view).sort(), [
        'copyToClipboardData', 'destroy', 'getChangeMarks', 'getChangeRows', 'getChangeSummary',
        'getCleanCopyText', 'getCopyText', 'getMountedNodeCount', 'getMountedRange', 'getScrollAnchor',
        'getSelectedText', 'getSelection', 'goToChange', 'isCollapsed', 'isUnified', 'resetToInput', 'selectAll',
        'setCollapsed', 'setResult', 'setSelection', 'setUnified'
    ]);
    assert.throws(function () { env.view.setResult({ sources: fixture.sources }); }, /requires \{ sources, model, selection \}/);
    env.view.setResult(fixture);
    assert.equal(env.view.setSelection({ side: 'left' }, false), null);
    assert.throws(
        function () { virtual.cleanCopyTextForTest(fixture.sources, 'left'); },
        /requires stripInvisibleCharacters/
    );
});

test('the view mounts the same bounded range and correct spacers at top, middle, and end', function () {
    const fixture = equalFixture(25000);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    for (const position of [0, Math.floor(25000 * 21 / 2), 25000 * 21]) {
        env.left.scrollTop = position;
        env.left.dispatchEvent(new FakeEvent('scroll'));
        assert.equal(env.animation.size, 1);
        env.animation.flushAll();
        const range = env.view.getMountedRange();
        const leftRows = mountedRows(env.left);
        const rightRows = mountedRows(env.right);
        assert.ok(leftRows.length <= 200);
        assert.equal(rightRows.length, leftRows.length);
        assert.deepEqual(
            leftRows.map(function (row) { return row.getAttribute('data-row-index'); }),
            rightRows.map(function (row) { return row.getAttribute('data-row-index'); })
        );
        assert.equal(leftRows[0].getAttribute('data-row-index'), String(range.first));
        assert.equal(leftRows.at(-1).getAttribute('data-row-index'), String(range.last - 1));
        assert.equal(env.left.querySelector('.diff-spacer-before').style.height, (range.first * 21) + 'px');
        assert.equal(env.left.querySelector('.diff-spacer-after').style.height, ((25000 - range.last) * 21) + 'px');
        assert.equal(env.right.scrollTop, position);
    }
    assert.equal(env.view.getMountedRange().last, 25000);
});

test('scroll rendering coalesces into one frame and reset/destroy cancels stale work and listeners', function () {
    const fixture = equalFixture(500);
    const env = setupView();
    env.view.setResult(fixture);
    assert.equal(env.animation.size, 1);
    for (const position of [1000, 2000, 3000, 4000]) {
        env.left.scrollTop = position;
        env.left.dispatchEvent(new FakeEvent('scroll'));
    }
    assert.equal(env.animation.size, 1);
    env.animation.flushAll();
    assert.equal(env.view.getMountedRange().first > 0, true);

    env.left.scrollTop = 800;
    env.left.dispatchEvent(new FakeEvent('scroll'));
    assert.equal(env.animation.size, 1);
    env.view.resetToInput({ left: 'plain left', right: 'plain right' });
    assert.equal(env.animation.size, 0);
    env.animation.flushAll();
    assert.equal(env.left.querySelector('.diff-window'), null);
    assert.equal(env.left.textContent, 'plain left');
    assert.equal(env.left.getAttribute('contenteditable'), 'true');

    assert.ok(env.left.listenerCount() > 0);
    assert.ok(env.document.listenerCount() > 0);
    env.view.destroy();
    assert.equal(env.left.listenerCount(), 0);
    assert.equal(env.right.listenerCount(), 0);
    assert.equal(env.document.listenerCount(), 0);
});

test('rendering yields across animation frames when the injected 8ms frame budget is exhausted', function () {
    let fakeTime = 0;
    const fixture = equalFixture(300);
    const env = setupView({
        now() {
            fakeTime += 5;
            return fakeTime;
        }
    });
    env.view.setResult(fixture);
    assert.equal(env.animation.size, 1);
    env.animation.flushOne();
    assert.equal(env.animation.size, 1, 'unfinished rendering should queue a continuation frame');
    assert.deepEqual(Object.assign({}, env.view.getMountedRange()), { first: 0, last: 0 }, 'partial windows stay detached');
    const frameCount = 1 + env.animation.flushAll();
    assert.ok(frameCount > 2);
    assert.ok(mountedRows(env.left).length > 0);
    assert.ok(mountedRows(env.left).length <= virtual.renderBudgetsForTest.maxMountedRowsPerPane);
    assert.ok(env.view.getMountedNodeCount() <= virtual.renderBudgetsForTest.maxDomNodesBothPanes);
});

test('one heavy row yields within the frame budget before either pane is committed', function () {
    let fakeTime = 0;
    const fixture = equalFixture(1, function () { return 'x'.repeat(20000); });
    const env = setupView({
        now() {
            fakeTime += 5;
            return fakeTime;
        }
    });
    env.view.setResult(fixture);
    env.animation.flushOne();

    assert.equal(env.animation.size, 1, 'intra-row work must queue a continuation frame');
    assert.deepEqual(Object.assign({}, env.view.getMountedRange()), { first: 0, last: 0 });
    assert.equal(mountedRows(env.left).length, 0, 'partial rows must remain detached');

    const continuationFrames = env.animation.flushAll();
    assert.ok(continuationFrames > 2);
    assert.equal(env.left.querySelector('.diff-content').textContent, fixture.sources.left);
});

test('untrusted text is only text while grouped invisible and confusable markers keep source offsets and ARIA', function () {
    const left = '<img src=x onerror=boom>&\u200B\u200B\u0410';
    const right = '<script>alert(1)</script>&\u200B\u200BA';
    const fixture = modelFixture(left, right, [{
        type: 'modified',
        leftLineIndex: 0,
        rightLineIndex: 0,
        leftRangeOffset: 0,
        leftRangeCount: 1,
        rightRangeOffset: 2,
        rightRangeCount: 1,
        detailMode: 'precise'
    }], [0, left.length, 0, right.length]);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    assert.equal(env.left.querySelector('img'), null);
    assert.equal(env.right.querySelector('script'), null);
    assert.match(env.left.textContent, /<imgsrc=xonerror=boom>/);
    assert.match(env.right.textContent, /<script>alert\(1\)<\/script>/);

    const marker = env.left.querySelector('.invisible-zwsp');
    assert.ok(marker);
    assert.deepEqual(Array.from(marker.attributes.keys()).sort(), [
        'aria-label', 'class', 'data-source-end', 'data-source-start', 'role', 'title'
    ]);
    assert.equal(marker.getAttribute('data-source-end') - marker.getAttribute('data-source-start'), 2);
    assert.match(marker.getAttribute('aria-label'), /repeated 2 times/);
    assert.equal(marker.getAttribute('role'), 'img');

    const confusable = env.left.querySelector('.confusable-cyrillic-a-cap');
    assert.ok(confusable);
    assert.match(confusable.getAttribute('aria-label'), /looks like Latin A/);
    assert.equal(confusable.textContent, '\u0410');
});

test('a carriage return is marked only where it is changed content, never as a line ending', function () {
    const left = 'a\rb\r\nsame\r\nonly\r\nend';
    const right = 'ab\nsame\nend';
    const fixture = modelFixture(left, right, [
        {
            type: 'modified',
            leftLineIndex: 0,
            rightLineIndex: 0,
            leftRangeOffset: 0,
            leftRangeCount: 1,
            rightRangeOffset: 2,
            rightRangeCount: 0,
            detailMode: 'precise'
        },
        { type: 'match', leftLineIndex: 1, rightLineIndex: 1 },
        { type: 'missing', leftLineIndex: 2 },
        { type: 'match', leftLineIndex: 3, rightLineIndex: 2 }
    ], [1, 2]);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    const markers = env.left.querySelectorAll('.invisible-cr');
    assert.equal(markers.length, 1);
    assert.equal(markers[0].getAttribute('data-source-start'), '1');
    assert.equal(markers[0].getAttribute('data-source-end'), '2');
    assert.match(markers[0].getAttribute('title'), /Carriage return/);
    assert.equal(env.right.querySelectorAll('.invisible-cr').length, 0);
});

test('a changed tab is marked with its own text so its width is kept', function () {
    const left = 'a\tb\tc';
    const right = 'a b\tc';
    const fixture = modelFixture(left, right, [{
        type: 'modified',
        leftLineIndex: 0,
        rightLineIndex: 0,
        leftRangeOffset: 0,
        leftRangeCount: 1,
        rightRangeOffset: 2,
        rightRangeCount: 1,
        detailMode: 'precise'
    }], [1, 2, 1, 2]);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    const tabs = env.left.querySelectorAll('.invisible-tab');
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].textContent, '\t');
    assert.equal(tabs[0].getAttribute('data-source-start'), '1');
    assert.equal(tabs[0].getAttribute('data-source-end'), '2');
    assert.match(tabs[0].getAttribute('title'), /Tab/);
    // The unchanged tab on either side is plain text.
    assert.equal(env.right.querySelectorAll('.invisible-tab').length, 0);
});

test('moved lines are styled apart from other changes and say where their counterpart is', function () {
    const left = 'keep\nmoved line one\nmoved line two\ngone';
    const right = 'moved line one\nmoved line two\nkeep\nnew';
    const fixture = modelFixture(left, right, [
        { type: 'added', rightLineIndex: 0, movedFrom: 1 },
        { type: 'added', rightLineIndex: 1, movedFrom: 2 },
        { type: 'match', leftLineIndex: 0, rightLineIndex: 2 },
        { type: 'missing', leftLineIndex: 1, movedTo: 0 },
        { type: 'missing', leftLineIndex: 2, movedTo: 1 },
        { type: 'missing', leftLineIndex: 3 },
        { type: 'added', rightLineIndex: 3 }
    ]);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    const movedLeft = env.left.querySelectorAll('.diff-line-moved');
    const movedRight = env.right.querySelectorAll('.diff-line-moved');
    assert.deepEqual(movedLeft.map(function (line) { return line.getAttribute('title'); }),
        ['Moved to line 1', 'Moved to line 2']);
    assert.deepEqual(movedRight.map(function (line) { return line.getAttribute('title'); }),
        ['Moved from line 2', 'Moved from line 3']);
    assert.deepEqual(movedLeft.map(function (line) { return line.getAttribute('data-line-index'); }), ['1', '2']);
    // Nothing inside a moved line is marked as changed, spaces included.
    assert.equal(movedRight[0].querySelectorAll('.invisible-regular-space').length, 0);
    assert.equal(movedRight[0].querySelectorAll('.diff-mismatch').length, 1);
    // Plain removals and additions keep the ordinary change styling.
    assert.equal(env.left.querySelectorAll('.diff-line-mismatch').length, 3);
    assert.equal(env.right.querySelectorAll('.diff-line-mismatch').length, 3);
});

test('a moved line that was also edited shows its changes inside the moved styling', function () {
    const left = "log.info('user', name);\nreturn user;\nkeep";
    const right = "keep\nlog.debug('user', name);\nreturn user;";
    const fixture = modelFixture(left, right, [
        { type: 'missing', leftLineIndex: 0, movedTo: 1, leftRangeOffset: 0, leftRangeCount: 1 },
        { type: 'missing', leftLineIndex: 1, movedTo: 2 },
        { type: 'match', leftLineIndex: 2, rightLineIndex: 0 },
        { type: 'added', rightLineIndex: 1, movedFrom: 0, rightRangeOffset: 2, rightRangeCount: 1 },
        { type: 'added', rightLineIndex: 2, movedFrom: 1 }
    ], [4, 8, 4, 9]);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    const changedLeft = env.left.querySelectorAll('.diff-line-moved-changed');
    const changedRight = env.right.querySelectorAll('.diff-line-moved-changed');
    assert.equal(changedLeft.length, 1);
    assert.equal(changedRight.length, 1);
    assert.equal(changedLeft[0].getAttribute('title'), 'Moved to line 2, with changes');
    assert.equal(changedRight[0].getAttribute('title'), 'Moved from line 1, with changes');
    // Only the edited part is a change; the line itself is not one whole change.
    assert.deepEqual(changedLeft[0].querySelectorAll('.diff-mismatch').map(function (span) {
        return span.textContent;
    }), ['info']);
    assert.deepEqual(changedRight[0].querySelectorAll('.diff-mismatch').map(function (span) {
        return span.textContent;
    }), ['debug']);
    assert.equal(changedLeft[0].querySelector('.diff-content').classList.contains('diff-mismatch'), false);
    assert.equal(changedRight[0].querySelector('.diff-content').classList.contains('diff-mismatch'), false);
    // The unchanged moved line next to it keeps the plain moved form.
    assert.equal(env.left.querySelectorAll('.diff-line-moved').length, 2);
    assert.equal(env.right.querySelectorAll('.diff-line-moved')[1].getAttribute('title'), 'Moved from line 2');
});

test('ranges that differ only in Unicode normalization are hinted by the rule the model counts with', function () {
    const left = 'Café au lait, 10 kpl';
    const right = 'Café au lait, 12 kpl';
    const model = virtual.diffCoreForTest.computeDiffModel(left, right);
    assert.equal(model.stats.normalizationRows, 1);

    const env = setupView();
    env.view.setResult({ sources: { left, right }, model });
    env.animation.flushAll();

    const hintedLeft = env.left.querySelectorAll('.diff-equivalent');
    const hintedRight = env.right.querySelectorAll('.diff-equivalent');
    assert.deepEqual(hintedLeft.map(function (span) { return span.textContent; }), ['é']);
    assert.deepEqual(hintedRight.map(function (span) { return span.textContent; }), ['é']);
    assert.match(hintedLeft[0].getAttribute('title'), /NFC\/NFD/);
    assert.equal(hintedLeft[0].classList.contains('diff-mismatch'), true);
    // The real edit on the same row is a plain change.
    const plain = env.left.querySelectorAll('.diff-mismatch').filter(function (span) {
        return !span.classList.contains('diff-equivalent');
    });
    assert.deepEqual(plain.map(function (span) { return span.textContent; }), ['10']);

    // A row that fell back to a whole-line highlight is counted and hinted the same way.
    const wholeLeft = 'r\u00e9sum\u00e9\r\nend';
    const wholeRight = 're\u0301sume\u0301\nend';
    const whole = virtual.diffCoreForTest.computeDiffModel(wholeLeft, wholeRight, {
        workBudget: virtual.diffCoreForTest.createDiffWorkBudget({ remainingCharEditDistance: 0 })
    });
    assert.equal(whole.rows[0].detailMode, 'whole-line');
    assert.equal(whole.stats.normalizationRows, 1);
    const wholeEnv = setupView();
    wholeEnv.view.setResult({ sources: { left: wholeLeft, right: wholeRight }, model: whole });
    wholeEnv.animation.flushAll();
    assert.equal(wholeEnv.left.querySelectorAll('.diff-equivalent').length > 0, true);
    assert.equal(wholeEnv.right.querySelectorAll('.diff-equivalent').length > 0, true);

    // No hint and no count when nothing is canonically equivalent.
    const other = virtual.diffCoreForTest.computeDiffModel('Café one', 'Cafe two');
    assert.equal(other.stats.normalizationRows, 0);
    const plainEnv = setupView();
    plainEnv.view.setResult({ sources: { left: 'Café one', right: 'Cafe two' }, model: other });
    plainEnv.animation.flushAll();
    assert.equal(plainEnv.left.querySelectorAll('.diff-equivalent').length, 0);
});

test('dense marker rows reduce once and stay below the global 8,000-node budget', function () {
    const alternating = Array.from({ length: 700 }, function (_, index) {
        return index % 2 ? '\u200B' : '\u200C';
    }).join('');
    const fixture = equalFixture(300, function (index) { return alternating + index; });
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    const actualNodes = countDescendants(env.left) + countDescendants(env.right);
    assert.ok(actualNodes <= virtual.renderBudgetsForTest.maxDomNodesBothPanes, actualNodes + ' nodes were mounted');
    assert.equal(env.view.getMountedNodeCount(), actualNodes);
    assert.equal(env.reductions.length, 1);
    assert.equal(env.reductions[0].message, 'Detailed rendering reduced for performance');
    for (const row of mountedRows(env.left)) {
        assert.ok(row.querySelectorAll('.invisible-char').length <= virtual.renderBudgetsForTest.maxSpecialMarkersPerRow);
    }

    env.left.scrollTop = 3000;
    env.left.dispatchEvent(new FakeEvent('scroll'));
    env.animation.flushAll();
    assert.ok(env.view.getMountedNodeCount() <= virtual.renderBudgetsForTest.maxDomNodesBothPanes);
    assert.equal(env.reductions.length, 1);
});

test('a span-budget fallback honestly replaces partial detail with the whole mismatching line', function () {
    const left = 'aX'.repeat(600);
    const right = 'aY'.repeat(600);
    const leftBounds = [];
    const rightBounds = [];
    for (let index = 0; index < 600; index++) {
        leftBounds.push(index * 2 + 1, index * 2 + 2);
        rightBounds.push(index * 2 + 1, index * 2 + 2);
    }
    const fixture = modelFixture(left, right, [{
        type: 'modified',
        leftLineIndex: 0,
        rightLineIndex: 0,
        leftRangeOffset: 0,
        leftRangeCount: 600,
        rightRangeOffset: leftBounds.length,
        rightRangeCount: 600,
        detailMode: 'precise'
    }], leftBounds.concat(rightBounds));
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    const leftContent = env.left.querySelector('.diff-content');
    const rightContent = env.right.querySelector('.diff-content');
    assert.equal(leftContent.textContent, left);
    assert.equal(rightContent.textContent, right);
    assert.equal(leftContent.children.length, 0, 'partial match/change spans must be removed');
    assert.equal(rightContent.children.length, 0, 'partial match/change spans must be removed');
    assert.ok(leftContent.classList.contains('diff-mismatch'));
    assert.ok(rightContent.classList.contains('diff-mismatch'));
    assert.equal(env.reductions.length, 1);
    assert.equal(env.reductions[0].reason, 'whole-line-render-budget');
});

test('dense overscan is dropped only after all visible rows render at middle and end', function () {
    const dense = Array.from({ length: 700 }, function (_, index) {
        return index % 2 ? '\u200B' : '\u200C';
    }).join('');
    const fixture = equalFixture(500, function (index) {
        return index === 249 || index === 497 ? dense : 'visible row ' + index;
    });
    const env = setupView();
    env.left.clientHeight = 42;
    env.right.clientHeight = 42;
    env.left.setBoundingClientRect({ top: 0, bottom: 42, left: 0, right: 600, width: 600, height: 42 });
    env.right.setBoundingClientRect({ top: 0, bottom: 42, left: 600, right: 1200, width: 600, height: 42 });
    env.view.setResult(fixture);
    env.animation.flushAll();

    for (const check of [
        { scrollTop: 250 * 21, denseRow: 249, visibleRows: [250, 251], expected: { first: 249, last: 252 } },
        { scrollTop: 500 * 21, denseRow: 497, visibleRows: [498, 499], expected: { first: 497, last: 500 } }
    ]) {
        env.left.scrollTop = check.scrollTop;
        env.left.dispatchEvent(new FakeEvent('scroll'));
        env.animation.flushAll();
        assert.deepEqual(Object.assign({}, env.view.getMountedRange()), check.expected);
        for (const rowIndex of check.visibleRows) {
            const row = mountedRows(env.left).find(function (candidate) {
                return candidate.getAttribute('data-row-index') === String(rowIndex);
            });
            assert.ok(row, 'visible row ' + rowIndex + ' must not be sacrificed');
            assert.ok(row.querySelector('.diff-match'), 'visible row ' + rowIndex + ' keeps detailed rendering');
        }
        const reducedRow = mountedRows(env.left).find(function (candidate) {
            return candidate.getAttribute('data-row-index') === String(check.denseRow);
        });
        assert.ok(reducedRow);
        assert.equal(reducedRow.querySelector('.diff-content').children.length, 0);
    }
    assert.equal(env.reductions.length, 1);
});

test('long precise lines render change-centered preview pages with working previous/next controls', function () {
    const left = 'a'.repeat(100) + 'X' + 'a'.repeat(39900) + 'Y' + 'a'.repeat(20000);
    const right = 'a'.repeat(100) + 'x' + 'a'.repeat(39900) + 'y' + 'a'.repeat(20000);
    const second = 40001;
    const fixture = modelFixture(left, right, [{
        type: 'modified',
        leftLineIndex: 0,
        rightLineIndex: 0,
        leftRangeOffset: 0,
        leftRangeCount: 2,
        rightRangeOffset: 4,
        rightRangeCount: 2,
        detailMode: 'precise'
    }], [100, 101, second, second + 1, 100, 101, second, second + 1]);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    let content = env.left.querySelector('.diff-content');
    assert.equal(content.getAttribute('data-preview-page'), '1');
    assert.equal(content.getAttribute('data-preview-pages'), '2');
    assert.match(content.textContent, /X/);
    assert.doesNotMatch(content.textContent, /Y/);
    assert.ok(content.textContent.length < 2000);
    assert.equal(env.reductions.length, 1);
    const next = content.querySelector('button[data-preview-direction="next"]');
    assert.ok(next);
    assert.equal(next.disabled, false);
    next.focus();
    next.click();
    env.animation.flushAll();

    content = env.left.querySelector('.diff-content');
    assert.equal(content.getAttribute('data-preview-page'), '2');
    assert.doesNotMatch(content.textContent, /X/);
    assert.match(content.textContent, /Y/);
    const previous = content.querySelector('button[data-preview-direction="previous"]');
    assert.ok(previous);
    assert.equal(previous.disabled, false);
    assert.equal(env.document.activeElement, previous, 'focus follows the remounted preview controls');
    const pageStart = Number(content.getAttribute('data-source-start'));
    assert.ok(pageStart > 0);
    env.left.dispatchEvent(new FakeEvent('pointerdown', {
        target: content,
        button: 0,
        localSourceOffset: 0,
        clientX: 0,
        clientY: 0
    }));
    assert.deepEqual(Object.assign({}, env.view.getSelection()), {
        side: 'left',
        anchorSourceOffset: pageStart,
        focusSourceOffset: pageStart
    });
    assert.equal(env.reductions.length, 1);
});

test('whole-line model fallback is explicit, budgeted, and reported once', function () {
    const left = 'left ' + 'x'.repeat(25000);
    const right = 'right ' + 'y'.repeat(25000);
    const fixture = modelFixture(left, right, [{
        type: 'modified',
        leftLineIndex: 0,
        rightLineIndex: 0,
        leftRangeOffset: 0,
        leftRangeCount: 0,
        rightRangeOffset: 0,
        rightRangeCount: 0,
        detailMode: 'whole-line'
    }], []);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    assert.equal(env.reductions.length, 1);
    assert.equal(env.reductions[0].reason, 'whole-line');
    assert.ok(env.left.querySelector('.diff-content').classList.contains('diff-mismatch'));
    assert.ok(env.left.querySelector('.diff-content-preview'));
    assert.ok(env.view.getMountedNodeCount() <= virtual.renderBudgetsForTest.maxDomNodesBothPanes);
});

test('logical selection copies exact source across unmounted rows in both directions and supports clean/full helpers', function () {
    const fixture = equalFixture(1200, function (index) {
        return index === 600 ? 'hidden\u200Bmarker\u00AD' : 'row ' + index;
    }, true);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();
    assert.ok(env.view.getMountedRange().last < fixture.model.rows.length);

    env.view.selectAll('left');
    assert.equal(env.view.getSelectedText('left'), fixture.sources.left);
    assert.equal(env.view.getCopyText('left'), fixture.sources.left);
    assert.equal(env.view.getCopyText('left', { wholeSource: true }), fixture.sources.left);

    const start = fixture.sources.left.indexOf('row 100');
    const end = fixture.sources.left.indexOf('row 1100') + 'row 1100'.length;
    env.view.setSelection({ side: 'left', anchorSourceOffset: end, focusSourceOffset: start }, false);
    assert.equal(env.view.getSelectedText('left'), fixture.sources.left.slice(start, end));

    const clipboardData = createClipboardData();
    const copyEvent = new FakeEvent('copy', { clipboardData });
    env.left.dispatchEvent(copyEvent);
    assert.equal(copyEvent.defaultPrevented, true);
    assert.equal(clipboardData.getData('text/plain'), fixture.sources.left.slice(start, end));
    assert.equal(env.view.getCleanCopyText('left').includes('\u200B'), false);
    assert.equal(env.view.getCleanCopyText('left').includes('\u00AD'), false);

    const cleanClipboard = createClipboardData();
    assert.equal(env.view.copyToClipboardData('left', cleanClipboard, { clean: true }), true);
    assert.equal(cleanClipboard.getData('text/plain'), env.view.getCleanCopyText('left'));
});

test('pointer and keyboard selection update logical UTF-16 offsets without depending on mounted DOM', function () {
    const fixture = equalFixture(800, function (index) { return index === 0 ? 'a😀b' : 'row ' + index; });
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    const far = fixture.sources.left.indexOf('row 700');
    env.left.dispatchEvent(new FakeEvent('pointerdown', { pointerId: 1, button: 0, sourceOffset: far }));
    assert.equal(env.document.activeElement, env.left, 'pointer selection focuses its result pane');
    env.document.dispatchEvent(new FakeEvent('pointermove', { pointerId: 1, sourceOffset: 1 }));
    env.document.dispatchEvent(new FakeEvent('pointerup', { pointerId: 1, sourceOffset: 1 }));
    assert.equal(env.view.getSelectedText('left'), fixture.sources.left.slice(1, far));

    env.left.dispatchEvent(new FakeEvent('keydown', { key: 'a', metaKey: true }));
    assert.equal(env.view.getSelectedText('left'), fixture.sources.left);
    env.view.setSelection({ side: 'left', anchorSourceOffset: 1, focusSourceOffset: 1 }, false);
    env.left.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    assert.deepEqual(Object.assign({}, env.view.getSelection()), {
        side: 'left',
        anchorSourceOffset: 1,
        focusSourceOffset: 3
    });
    assert.equal(env.view.getSelectedText('left'), '😀');
});

test('horizontal arrow movement follows grapheme boundaries for combining and ZWJ sequences', function () {
    const family = '👩‍👩‍👧‍👦';
    const firstLine = 'Ae\u0301' + family + 'Z';
    const fixture = equalFixture(2, function (index) { return index ? 'tail' : firstLine; });
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    env.view.setSelection({ side: 'left', anchorSourceOffset: 1, focusSourceOffset: 1 }, false);
    env.left.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    assert.equal(env.view.getSelection().focusSourceOffset, 3);
    assert.equal(env.view.getSelectedText('left'), 'e\u0301');

    env.view.setSelection({ side: 'left', anchorSourceOffset: 3, focusSourceOffset: 3 }, false);
    env.left.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    assert.equal(env.view.getSelection().focusSourceOffset, 3 + family.length);
    assert.equal(env.view.getSelectedText('left'), family);
    env.left.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowLeft' }));
    assert.equal(env.view.getSelection().focusSourceOffset, 3);
});

test('pointer offsets ignore the opposite pane and gutters map to their source line start', function () {
    const left = 'aa\nbb';
    const right = 'x'.repeat(100) + '\nyy';
    const fixture = modelFixture(left, right, [
        { type: 'match', leftLineIndex: 0, rightLineIndex: 0 },
        { type: 'match', leftLineIndex: 1, rightLineIndex: 1 }
    ]);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    const rightSecondContent = mountedRows(env.right)[1].querySelector('.diff-content');
    env.left.dispatchEvent(new FakeEvent('pointerdown', { pointerId: 7, button: 0, sourceOffset: 1 }));
    env.document.dispatchEvent(new FakeEvent('pointermove', {
        pointerId: 7,
        target: rightSecondContent,
        localSourceOffset: 1,
        clientX: 4,
        clientY: 22
    }));
    assert.equal(env.view.getSelection().focusSourceOffset, 4, 'selected-pane coordinates win over opposite-pane data offsets');
    env.document.dispatchEvent(new FakeEvent('pointerup', {
        pointerId: 7,
        target: rightSecondContent,
        localSourceOffset: 1,
        clientX: 4,
        clientY: 22
    }));

    const leftSecondGutter = mountedRows(env.left)[1].querySelector('.diff-gutter');
    env.left.dispatchEvent(new FakeEvent('pointerdown', {
        pointerId: 8,
        button: 0,
        target: leftSecondGutter,
        clientX: 599,
        clientY: 22
    }));
    assert.deepEqual(Object.assign({}, env.view.getSelection()), {
        side: 'left',
        anchorSourceOffset: 3,
        focusSourceOffset: 3
    });
});

test('selection highlighting translates absolute UTF-16 offsets on nonzero source lines', function () {
    const fixture = equalFixture(3, function (index) {
        return ['first', 'abcdef', 'last'][index];
    });
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();
    const lineStart = fixture.model.leftLineStarts[1];
    env.view.setSelection({
        side: 'left',
        anchorSourceOffset: lineStart + 2,
        focusSourceOffset: lineStart + 4
    }, false);
    env.animation.flushAll();
    const secondRow = mountedRows(env.left).find(function (row) {
        return row.getAttribute('data-line-index') === '1';
    });
    assert.equal(secondRow.querySelector('.diff-logical-selection').textContent, 'cd');
});

test('trailing newline, gap rows, spacers, list positions, and readonly regions have correct semantics', function () {
    const left = 'a\n';
    const right = 'a\nb';
    const fixture = modelFixture(left, right, [
        { type: 'match', leftLineIndex: 0, rightLineIndex: 0 },
        { type: 'missing', leftLineIndex: 1 },
        { type: 'added', rightLineIndex: 1 }
    ]);
    const env = setupView();
    env.view.setResult(fixture);
    env.animation.flushAll();

    assert.equal(env.left.getAttribute('role'), 'region');
    assert.equal(env.left.getAttribute('aria-readonly'), 'true');
    assert.equal(env.left.getAttribute('contenteditable'), 'false');
    assert.equal(env.left.getAttribute('tabindex'), '0');
    assert.equal(env.left.getAttribute('aria-multiline'), null);
    assert.equal(env.left.querySelector('.diff-window').getAttribute('role'), 'list');
    assert.equal(env.left.querySelector('.diff-spacer-before').getAttribute('aria-hidden'), 'true');
    assert.equal(env.left.querySelector('.diff-spacer-after').getAttribute('aria-hidden'), 'true');

    const leftRows = mountedRows(env.left);
    assert.equal(leftRows[0].getAttribute('aria-posinset'), '1');
    assert.equal(leftRows[0].getAttribute('aria-setsize'), '2');
    assert.equal(leftRows[1].getAttribute('aria-posinset'), '2');
    assert.ok(leftRows[1].classList.contains('diff-line-mismatch'));
    assert.ok(leftRows[1].querySelector('.diff-content').classList.contains('diff-mismatch'));
    assert.equal(leftRows[2].getAttribute('aria-hidden'), 'true');
    assert.equal(leftRows[2].hasAttribute('role'), false);
    assert.equal(mountedRows(env.right)[1].getAttribute('aria-hidden'), 'true');
    assert.ok(mountedRows(env.right)[2].classList.contains('diff-line-mismatch'));
    assert.ok(mountedRows(env.right)[2].querySelector('.diff-content').classList.contains('diff-mismatch'));
    assert.equal(leftRows[0].querySelector('.diff-gutter').getAttribute('aria-hidden'), 'true');

    env.view.selectAll('left');
    assert.equal(env.view.getSelectedText('left'), 'a\n');
    env.animation.flushAll();
    assert.ok(mountedRows(env.left)[0].classList.contains('diff-line-selected'));
    assert.equal(env.left.querySelector('[aria-selected]'), null);
    assert.equal(mountedRows(env.left)[0].getAttribute('data-logically-selected'), 'true');
});

test('top-level copy helpers normalize reversed selections and preserve trailing newlines', function () {
    const sources = { left: 'a\n', right: 'x\u200By\u00AD' };
    assert.equal(virtual.copyTextForTest(sources, {
        side: 'left',
        anchorSourceOffset: 2,
        focusSourceOffset: 0
    }, 'left', false), 'a\n');
    assert.equal(virtual.copyTextForTest(sources, null, 'left', true), 'a\n');
    assert.equal(
        virtual.cleanCopyTextForTest(sources, 'right', virtual.stripInvisibleCharactersForTest),
        'x y'
    );
});

// 200 lines with three changes: row 10 modified, rows 100-101 removed and row
// 152 added, 201 rows in all.
function changedFixture() {
    const leftLines = Array.from({ length: 200 }, function (_, index) {
        return 'line number ' + index + ' stays the same';
    });
    const rightLines = leftLines.slice();
    rightLines[10] = 'line number 10 was edited here';
    rightLines.splice(100, 2);
    rightLines.splice(150, 0, 'a brand new line');
    const left = leftLines.join('\n');
    const right = rightLines.join('\n');
    const core = virtual.diffCoreForTest;
    return {
        sources: { left, right },
        model: core.computeDiffModel(left, right, { workBudget: core.createDiffWorkBudget() })
    };
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

test('changes are indexed once per result and stepped through in both directions', function () {
    const fixture = changedFixture();
    let viewChanges = 0;
    const env = setupView({ onViewChange() { viewChanges++; } });
    env.view.setResult(fixture);
    env.animation.flushAll();
    assert.equal(fixture.model.rows.length, 201);
    assert.deepEqual(plain(env.view.getChangeSummary()), { total: 3, current: -1 });
    assert.equal(env.left.querySelectorAll('.diff-line-current').length, 0);

    assert.deepEqual(plain(env.view.goToChange('next')), { total: 3, current: 0 });
    assert.equal(env.left.scrollTop, 0);
    assert.equal(viewChanges, 1);
    assert.deepEqual(plain(env.view.goToChange('next')), { total: 3, current: 1 });
    // The change sits a quarter of the 40-row viewport from the top, on both sides.
    assert.equal(env.left.scrollTop, 90 * 21);
    assert.equal(env.right.scrollTop, 90 * 21);
    env.animation.flushAll();
    for (const pane of [env.left, env.right]) {
        assert.deepEqual(
            pane.querySelectorAll('.diff-line-current').map(function (row) { return row.getAttribute('data-row-index'); }),
            ['100', '101']
        );
    }

    assert.equal(env.view.goToChange('next').current, 2);
    assert.equal(env.view.goToChange('next').current, 0, 'next wraps to the first change');
    assert.equal(env.view.goToChange('previous').current, 2, 'previous wraps to the last change');

    // After scrolling away from the current change, stepping starts from what is on screen.
    env.view.goToChange(0);
    env.left.scrollTop = 120 * 21;
    env.left.dispatchEvent(new FakeEvent('scroll'));
    assert.equal(env.view.goToChange('previous').current, 1);
    env.view.goToChange(0);
    env.left.scrollTop = 120 * 21;
    env.left.dispatchEvent(new FakeEvent('scroll'));
    assert.equal(env.view.goToChange('next').current, 2);
    assert.equal(env.view.goToChange(99).current, 2);

    const marks = env.view.getChangeMarks();
    assert.equal(marks.rowCount, 201);
    assert.deepEqual(Array.from(marks.starts), [10, 100, 152]);
    assert.deepEqual(Array.from(marks.ends), [11, 102, 153]);
    assert.deepEqual(Array.from(marks.flags), [3, 1, 2]);

    // Alt with an arrow belongs to the page, not to the selection.
    env.left.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowDown', altKey: true }));
    assert.equal(env.view.getSelection(), null);

    env.view.resetToInput(fixture.sources);
    assert.deepEqual(plain(env.view.getChangeSummary()), { total: 0, current: -1 });
    assert.deepEqual(plain(env.view.goToChange('next')), { total: 0, current: -1 });
});

test('a change made only of moved lines is flagged as moved', function () {
    const source = 'moved block line\nstays\nstays too';
    const right = 'stays\nstays too\nmoved block line';
    const fixture = modelFixture(source, right, [
        { type: 'missing', leftLineIndex: 0, movedTo: 2 },
        { type: 'match', leftLineIndex: 1, rightLineIndex: 0 },
        { type: 'match', leftLineIndex: 2, rightLineIndex: 1 },
        { type: 'added', rightLineIndex: 2, movedFrom: 0 }
    ]);
    const env = setupView();
    env.view.setResult(fixture);
    assert.deepEqual(Array.from(env.view.getChangeMarks().flags), [5, 6]);
});

test('showing only changes folds unchanged runs into one row and opens them on request', function () {
    const fixture = changedFixture();
    let viewChanges = 0;
    const env = setupView({ onViewChange() { viewChanges++; } });
    env.view.setResult(fixture);
    env.animation.flushAll();
    assert.equal(env.view.isCollapsed(), false);
    assert.equal(mountedRows(env.left).length > 26, true);

    assert.equal(env.view.setCollapsed(true), true);
    assert.equal(viewChanges, 1);
    env.animation.flushAll();
    // Folds [0,7), [14,97), [105,149) and [156,201) leave 22 rows and 4 folds.
    let marks = env.view.getChangeMarks();
    assert.equal(marks.rowCount, 26);
    assert.deepEqual(Array.from(marks.starts), [4, 12, 21]);
    assert.deepEqual(Array.from(marks.ends), [5, 14, 22]);
    assert.deepEqual(plain(env.view.getMountedRange()), { first: 0, last: 26 });
    for (const pane of [env.left, env.right]) {
        const rows = mountedRows(pane);
        assert.equal(rows.length, 26);
        assert.equal(pane.querySelector('.diff-spacer-after').style.height, '0px');
        assert.deepEqual(
            pane.querySelectorAll('.diff-fold').map(function (row) { return row.textContent; }),
            ['7 unchanged lines', '83 unchanged lines', '44 unchanged lines', '45 unchanged lines']
        );
        assert.equal(rows[0].classList.contains('diff-fold'), true);
        assert.equal(rows[1].getAttribute('data-row-index'), '7');
        assert.equal(rows[4].getAttribute('data-row-index'), '10');
        const button = rows[0].querySelector('button');
        assert.equal(button.getAttribute('aria-label'), 'Show 7 unchanged lines');
    }
    assert.ok(env.view.getMountedNodeCount() <= virtual.renderBudgetsForTest.maxDomNodesBothPanes);

    // A pointer position is read through the folds: display row 4 is model row 10.
    env.left.dispatchEvent(new FakeEvent('pointerdown', { pointerId: 1, button: 0, clientX: 0, clientY: (4 * 21) + 5 }));
    env.document.dispatchEvent(new FakeEvent('pointerup', { pointerId: 1, clientX: 0, clientY: (4 * 21) + 5 }));
    assert.equal(env.view.getSelection().anchorSourceOffset, fixture.sources.left.indexOf('line number 10 '));

    // Stepping between changes uses display positions.
    assert.equal(env.view.goToChange(2).current, 2);
    assert.equal(env.left.scrollTop, (21 - 10) * 21);

    env.animation.flushAll();
    env.right.querySelectorAll('.diff-fold')[1].querySelector('button').click();
    env.animation.flushAll();
    marks = env.view.getChangeMarks();
    assert.equal(marks.rowCount, 26 + 83 - 1);
    assert.deepEqual(Array.from(marks.starts), [4, 94, 103]);
    // The opened rows are ordinary rows now; the folds below are outside the mounted window.
    assert.equal(env.left.querySelector('[data-row-index="14"]') !== null, true);
    assert.equal(env.left.querySelector('[data-fold-index="1"]'), null);

    // Moving the selection into a folded line opens that fold.
    env.view.setSelection({
        side: 'left',
        anchorSourceOffset: fixture.sources.left.indexOf('line number 120 '),
        focusSourceOffset: fixture.sources.left.indexOf('line number 120 ')
    });
    assert.equal(env.view.getChangeMarks().rowCount, 108 + 44 - 1);
    // With the first fold still closed, model row 120 is display row 114.
    assert.equal(env.left.scrollTop <= 114 * 21 && env.left.scrollTop + 840 >= 115 * 21, true);
    assert.equal(env.right.scrollTop, env.left.scrollTop);

    // The setting survives a new result; opened folds do not.
    env.view.setResult(fixture);
    env.animation.flushAll();
    assert.equal(env.view.isCollapsed(), true);
    assert.equal(env.view.getChangeMarks().rowCount, 26);

    env.left.scrollTop = 0;
    assert.equal(env.view.setCollapsed(false), false);
    env.animation.flushAll();
    assert.equal(env.view.getChangeMarks().rowCount, 201);
    assert.equal(env.left.querySelectorAll('.diff-fold').length, 0);
});

test('collapsing keeps the row at the top of the viewport in place and folds a result without changes', function () {
    const fixture = changedFixture();
    const env = setupView();
    env.view.setResult(fixture);
    env.left.scrollTop = (98 * 21) + 5;
    env.left.dispatchEvent(new FakeEvent('scroll'));
    env.animation.flushAll();
    env.view.setCollapsed(true);
    // Model row 98 is display row 10 once the two folds above it are closed.
    assert.equal(env.left.scrollTop, (10 * 21) + 5);
    assert.equal(env.right.scrollTop, (10 * 21) + 5);

    const equal = equalFixture(50);
    env.view.setResult(equal);
    env.animation.flushAll();
    assert.equal(env.view.getChangeMarks().rowCount, 1);
    assert.equal(mountedRows(env.left)[0].textContent, '50 unchanged lines');
});

test('a click inside a change selects it and its rows can be read for merging', function () {
    const fixture = changedFixture();
    let viewChanges = 0;
    const env = setupView({ onViewChange() { viewChanges++; } });
    env.view.setResult(fixture);
    env.animation.flushAll();
    assert.equal(env.view.getChangeRows(-1), null);
    assert.equal(env.view.getChangeRows(3), null);
    assert.deepEqual(plain(env.view.getChangeRows(1)), { first: 100, last: 102 });

    // Row 5 is unchanged: nothing is selected.
    env.left.dispatchEvent(new FakeEvent('pointerdown', { pointerId: 1, button: 0, clientX: 0, clientY: (5 * 21) + 3 }));
    env.document.dispatchEvent(new FakeEvent('pointerup', { pointerId: 1, clientX: 0, clientY: (5 * 21) + 3 }));
    assert.equal(env.view.getChangeSummary().current, -1);

    // Row 10 is the first change, also when clicked on the other side.
    env.right.dispatchEvent(new FakeEvent('pointerdown', { pointerId: 2, button: 0, clientX: 600, clientY: (10 * 21) + 3 }));
    env.document.dispatchEvent(new FakeEvent('pointerup', { pointerId: 2, clientX: 600, clientY: (10 * 21) + 3 }));
    assert.equal(env.view.getChangeSummary().current, 0);
    assert.equal(viewChanges, 1);
    assert.equal(env.left.scrollTop, 0, 'selecting by click does not scroll');
    env.animation.flushAll();
    assert.equal(env.right.querySelectorAll('.diff-line-current').length, 1);
});

test('a scroll anchor keeps the viewport on the same source line in the next result', function () {
    const fixture = changedFixture();
    const env = setupView();
    env.view.setResult(fixture);
    assert.equal(env.view.getScrollAnchor('middle'), null);
    env.left.scrollTop = (120 * 21) + 8;
    env.left.dispatchEvent(new FakeEvent('scroll'));
    // Model row 120 is left line 120 and, two removed lines later, right line 118.
    assert.deepEqual(plain(env.view.getScrollAnchor('left')), { side: 'left', lineIndex: 120, offset: 8 });
    const anchor = env.view.getScrollAnchor('right');
    assert.deepEqual(plain(anchor), { side: 'right', lineIndex: 118, offset: 8 });

    // The left text takes the right version of the first two changes: the
    // right text is unchanged, and its line 118 is now row 118.
    const core = virtual.diffCoreForTest;
    let left = core.mergeDiffRows(fixture.sources.left, fixture.sources.right, fixture.model, 100, 102, 'right');
    left = core.mergeDiffRows(left, fixture.sources.right,
        core.computeDiffModel(left, fixture.sources.right, { workBudget: core.createDiffWorkBudget() }), 10, 11, 'right');
    const merged = {
        sources: { left, right: fixture.sources.right },
        model: core.computeDiffModel(left, fixture.sources.right, { workBudget: core.createDiffWorkBudget() }),
        anchor
    };
    env.view.setResult(merged);
    assert.equal(env.view.getChangeSummary().total, 1);
    assert.equal(env.left.scrollTop, (118 * 21) + 8);
    assert.equal(env.right.scrollTop, (118 * 21) + 8);

    // An anchor that no longer exists falls back to the top.
    env.view.setResult(Object.assign({}, merged, { anchor: { side: 'right', lineIndex: 99999, offset: 0 } }));
    assert.equal(env.left.scrollTop, 0);
    env.view.resetToInput(merged.sources);
    assert.equal(env.view.getScrollAnchor('left'), null);
});

function gutterTexts(row) {
    return row.querySelectorAll('.diff-gutter').map(function (gutter) { return gutter.textContent; });
}

test('the unified view shows both texts in the left pane, removed lines above added lines', function () {
    const fixture = changedFixture();
    let viewChanges = 0;
    const env = setupView({ onViewChange() { viewChanges++; } });

    // The setting can be chosen before there is a result, but only a result is laid out as one pane.
    assert.equal(env.view.setUnified(true), true);
    assert.equal(env.view.isUnified(), true);
    assert.equal(env.left.classList.contains('diff-unified'), false);
    env.view.setResult(fixture);
    env.animation.flushAll();
    assert.equal(env.left.classList.contains('diff-unified'), true);
    assert.equal(env.right.classList.contains('diff-unified-hidden'), true);
    assert.equal(env.left.querySelector('.diff-window').getAttribute('aria-label'), 'Unified diff rows');
    assert.equal(mountedRows(env.right).length, 0);

    // 201 rows and one modified row that takes two lines.
    let marks = env.view.getChangeMarks();
    assert.equal(marks.rowCount, 202);
    assert.deepEqual(Array.from(marks.starts), [10, 101, 153]);
    assert.deepEqual(Array.from(marks.ends), [12, 103, 154]);

    const rows = mountedRows(env.left);
    assert.deepEqual(gutterTexts(rows[9]), ['10', '10']);
    assert.equal(rows[9].classList.contains('diff-line-removed') || rows[9].classList.contains('diff-line-added'), false);
    assert.equal(rows[10].getAttribute('data-row-index'), '10');
    assert.equal(rows[10].getAttribute('data-side'), 'left');
    assert.equal(rows[10].classList.contains('diff-line-removed'), true);
    assert.deepEqual(gutterTexts(rows[10]), ['11', '']);
    assert.match(rows[10].querySelector('.diff-content').textContent, /stays the same$/);
    assert.equal(rows[11].getAttribute('data-row-index'), '10');
    assert.equal(rows[11].getAttribute('data-side'), 'right');
    assert.equal(rows[11].classList.contains('diff-line-added'), true);
    assert.deepEqual(gutterTexts(rows[11]), ['', '11']);
    assert.match(rows[11].querySelector('.diff-content').textContent, /was edited here$/);
    assert.deepEqual(gutterTexts(rows[12]), ['12', '12']);
    assert.ok(env.view.getMountedNodeCount() <= virtual.renderBudgetsForTest.maxDomNodesBothPanes);

    // Stepping and the scroll anchor use the unified positions of each side's lines.
    assert.equal(env.view.goToChange(2).current, 2);
    assert.equal(env.left.scrollTop, (153 - 10) * 21);
    // Display row 143 is model row 142, which is right line 140.
    assert.deepEqual(plain(env.view.getScrollAnchor('right')), { side: 'right', lineIndex: 140, offset: 0 });

    // Together with folds: 4 folds, 22 unchanged or one-sided rows and the two-line change.
    env.view.setCollapsed(true);
    marks = env.view.getChangeMarks();
    assert.equal(marks.rowCount, 27);
    assert.deepEqual(Array.from(marks.starts), [4, 13, 22]);
    assert.deepEqual(Array.from(marks.ends), [6, 15, 23]);
    assert.equal(env.view.goToChange(1).current, 1);
    assert.equal(env.left.scrollTop, (13 - 10) * 21);

    // A new result keeps the layout and can start at a line of either text:
    // right line 150 is the added line, display row 22.
    env.view.setResult(Object.assign({}, fixture, { anchor: { side: 'right', lineIndex: 150, offset: 4 } }));
    assert.equal(env.left.classList.contains('diff-unified'), true);
    assert.equal(env.left.scrollTop, (22 * 21) + 4);
    env.view.setCollapsed(false);

    viewChanges = 0;
    assert.equal(env.view.setUnified(false), false);
    assert.equal(viewChanges, 1);
    env.animation.flushAll();
    assert.equal(env.left.classList.contains('diff-unified'), false);
    assert.equal(env.right.classList.contains('diff-unified-hidden'), false);
    assert.equal(env.view.getChangeMarks().rowCount, 201);
    assert.equal(mountedRows(env.right).length > 0, true);
    assert.equal(mountedRows(env.left)[0].getAttribute('data-side'), null);

    env.view.setUnified(true);
    env.view.resetToInput(fixture.sources);
    assert.equal(env.left.classList.contains('diff-unified'), false);
    assert.equal(env.right.classList.contains('diff-unified-hidden'), false);

    // Both panes are back for input after the view is destroyed, too.
    env.view.setResult(fixture);
    assert.equal(env.right.classList.contains('diff-unified-hidden'), true);
    env.view.destroy();
    assert.equal(env.left.classList.contains('diff-unified'), false);
    assert.equal(env.right.classList.contains('diff-unified-hidden'), false);
});

test('a unified selection stays inside the text of the line it starts on', function () {
    const fixture = changedFixture();
    const env = setupView();
    env.view.setUnified(true);
    env.view.setResult(fixture);
    env.animation.flushAll();
    const leftLine10 = fixture.sources.left.indexOf('line number 10 ');
    const rightLine10 = fixture.sources.right.indexOf('line number 10 ');
    const rightLine12 = fixture.sources.right.indexOf('line number 12 ');
    const at = function (displayIndex) { return { clientX: 0, clientY: (displayIndex * 21) + 4 }; };

    // Display row 11 is the added half of the modified row: the right text.
    env.left.dispatchEvent(new FakeEvent('pointerdown', Object.assign({ pointerId: 1, button: 0 }, at(11))));
    assert.deepEqual(plain(env.view.getSelection()), {
        side: 'right', anchorSourceOffset: rightLine10, focusSourceOffset: rightLine10
    });
    // Display row 13 is unchanged model row 12, read from the right text now.
    env.document.dispatchEvent(new FakeEvent('pointerup', Object.assign({ pointerId: 1 }, at(13))));
    assert.equal(env.view.getSelectedText('right'), fixture.sources.right.slice(rightLine10, rightLine12));
    env.animation.flushAll();
    assert.equal(mountedRows(env.left)[9].getAttribute('data-side'), 'right', 'unchanged lines follow the selection');
    assert.equal(mountedRows(env.left)[10].getAttribute('data-side'), 'left');
    assert.equal(mountedRows(env.left)[12].getAttribute('data-logically-selected'), 'true');

    // Copying and the keyboard act on that text, although the pane is the left one.
    const clipboard = createClipboardData();
    env.left.dispatchEvent(new FakeEvent('copy', { clipboardData: clipboard }));
    assert.equal(clipboard.getData('text/plain'), fixture.sources.right.slice(rightLine10, rightLine12));
    env.left.dispatchEvent(new FakeEvent('keydown', { key: 'Home' }));
    assert.deepEqual(plain(env.view.getSelection()), {
        side: 'right', anchorSourceOffset: rightLine12, focusSourceOffset: rightLine12
    });

    // A selection of the left text dragged over the added line stops at the
    // end of the change's last removed line.
    env.left.dispatchEvent(new FakeEvent('pointerdown', Object.assign({ pointerId: 2, button: 0 }, at(10))));
    env.document.dispatchEvent(new FakeEvent('pointerup', Object.assign({ pointerId: 2 }, at(11))));
    assert.equal(env.view.getSelection().side, 'left');
    assert.equal(env.view.getSelectedText('left'), 'line number 10 stays the same');
    assert.equal(env.view.getChangeSummary().current, 0, 'the click selected the change');

    // A selection of the right text dragged up over removed lines stops at the
    // start of the change's first added line: rows 101-102 are removed only, so
    // the next right line is the one after them.
    env.left.dispatchEvent(new FakeEvent('pointerdown', Object.assign({ pointerId: 3, button: 0 }, at(11))));
    env.document.dispatchEvent(new FakeEvent('pointerup', Object.assign({ pointerId: 3 }, at(10))));
    assert.deepEqual(plain(env.view.getSelection()), {
        side: 'right', anchorSourceOffset: rightLine10, focusSourceOffset: rightLine10
    });
    assert.equal(leftLine10, rightLine10);
});
