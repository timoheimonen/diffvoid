const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadRoutingFunctions() {
    const filename = path.join(__dirname, '..', 'public', 'shared-diff.js');
    const context = { Intl: Intl };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context);
    return context.DiffCore;
}

test('an accepted 20-line near-limit input is classified as worker-only before line splitting', function () {
    const routing = loadRoutingFunctions();
    const side = Array.from({ length: 20 }, function (_, index) {
        return String(index % 10) + 'x'.repeat(99998);
    }).join('\n');
    const scan = routing.scanDiffInput(side, side);

    assert.equal(scan.leftChars, 1999999);
    assert.equal(scan.rightChars, 1999999);
    assert.equal(scan.leftLines, 20);
    assert.equal(scan.rightLines, 20);
    assert.equal(scan.maxLineChars, 99999);

    const classification = routing.classifyDiffWork(side, side, scan);
    assert.equal(classification.isSyncSafe, false);
    assert.equal(classification.lineEditLowerBound, null);
    assert.match(classification.reason, /character|cost|line/i);

    const mainScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
    assert.match(mainScript, /DiffCore\.scanDiffInput\(leftText, rightText\)/);
    assert.match(mainScript, /DiffCore\.classifyDiffWork\(leftText, rightText, scan\)/);
    assert.match(mainScript, /isSyncSafe:\s*classification\.isSyncSafe/);
});

test('result-only copy controls are genuinely hidden from focus and accessibility APIs', function () {
    const publicDir = path.join(__dirname, '..', 'public');
    const markup = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    const script = fs.readFileSync(path.join(publicDir, 'script.js'), 'utf8');
    const styles = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');

    for (const id of ['copy-left', 'copy-right', 'copy-clean-left', 'copy-clean-right']) {
        const button = markup.match(new RegExp('<button\\s+id="' + id + '"[^>]*>', 'i'));
        assert.ok(button, id + ' must exist');
        assert.match(button[0], /\shidden(?:\s|>)/i);
        assert.match(button[0], /\sdisabled(?:\s|>)/i);
        assert.match(button[0], /aria-hidden="true"/i);
    }
    assert.match(script, /button\.hidden\s*=\s*!isVisible/);
    assert.match(script, /button\.disabled\s*=\s*!isVisible/);
    assert.match(script, /button\.removeAttribute\(['"]aria-hidden['"]\)/);
    assert.match(styles, /\.copy-clean-btn\[hidden\]\s*\{[^}]*display:\s*none/s);
});
