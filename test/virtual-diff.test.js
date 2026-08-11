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
        now: callbacks && callbacks.now ? callbacks.now : animation.now,
        onRenderingReduced(message, reason) {
            reductions.push({ message, reason });
            if (callbacks && callbacks.onRenderingReduced) callbacks.onRenderingReduced(message, reason);
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
        'classifyDiffWork', 'computeDiffModel', 'createDiffWorkBudget',
        'hasInvisibleCharacters', 'scanDiffInput', 'stripInvisibleCharacters',
        'validateScannedDiffInput'
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
        'copyToClipboardData', 'destroy', 'getCleanCopyText', 'getCopyText',
        'getMountedNodeCount', 'getMountedRange', 'getSelectedText', 'getSelection',
        'resetToInput', 'selectAll', 'setResult', 'setSelection'
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
