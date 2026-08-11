const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadVirtualDiff() {
    const filename = path.join(__dirname, '..', 'public', 'virtual-diff.js');
    assert.equal(fs.existsSync(filename), true, 'public/virtual-diff.js must exist');
    const context = {};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(filename, 'utf8') + `
this.computeVirtualWindowForTest = computeVirtualWindow;
this.renderBudgetsForTest = RENDER_BUDGETS;
`, context);
    return context;
}

test('a 25,000-row result mounts at most 200 rows at top, middle, and end', function () {
    const virtual = loadVirtualDiff();
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
});
