const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadRoutingFunctions() {
    const filename = path.join(__dirname, '..', 'public', 'shared-diff.js');
    const context = { Intl: Intl };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(filename, 'utf8') + `
this.scanDiffInputForTest = typeof scanDiffInput === 'function' ? scanDiffInput : undefined;
this.classifyDiffWorkForTest = typeof classifyDiffWork === 'function' ? classifyDiffWork : undefined;
`, context);
    return context;
}

test('an accepted 20-line near-limit input is classified as worker-only before line splitting', function () {
    const routing = loadRoutingFunctions();
    assert.equal(typeof routing.scanDiffInputForTest, 'function');
    assert.equal(typeof routing.classifyDiffWorkForTest, 'function');

    const side = Array.from({ length: 20 }, function (_, index) {
        return String(index % 10) + 'x'.repeat(99998);
    }).join('\n');
    const scan = routing.scanDiffInputForTest(side, side);

    assert.equal(scan.leftChars, 1999999);
    assert.equal(scan.rightChars, 1999999);
    assert.equal(scan.leftLines, 20);
    assert.equal(scan.rightLines, 20);
    assert.equal(scan.maxLineChars, 99999);

    const classification = routing.classifyDiffWorkForTest(side, side, scan);
    assert.equal(classification.isSyncSafe, false);
    assert.equal(classification.lineEditLowerBound, null);
    assert.match(classification.reason, /character|cost|line/i);
});
