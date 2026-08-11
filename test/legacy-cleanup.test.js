'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('the shared core no longer exposes legacy rows or HTML renderers', function () {
    const source = read('public/shared-diff.js');
    const removedNames = [
        'buildUnitArray',
        'computeCharDiff',
        'createLegacyDiffRow',
        'computeLineDiff',
        'renderMatchedUnits',
        'renderPanelEntry',
        'buildPanelHtmlRange',
        'buildPanelHtml',
        'itemConsumesLineNumber',
        'getPanelLineNumberAt',
        'getModelSourceLine',
        'renderModelRanges',
        'getModelPanelLineNumberAt',
        'renderModelPanelEntry',
        'validateModelSources',
        'buildPanelHtmlRangeFromModel',
        'buildPanelHtmlFromModel',
        'renderInvisibleSpan',
        'renderConfusableSpan',
        'renderWithInvisibles',
        'escapeHtml',
        'escapeAttribute',
        'ALIGN_LOOKAHEAD'
    ];

    for (const name of removedNames) {
        assert.doesNotMatch(source, new RegExp('\\b' + name + '\\b'), name + ' must stay removed');
    }
    assert.doesNotMatch(source, /insertAdjacentHTML|innerHTML/);
});

test('the runtime contains only the atomic v2 result path', function () {
    const controller = read('public/diff-controller.js');
    const worker = read('public/worker.js');
    const application = read('public/script.js');
    const view = read('public/virtual-diff.js');

    for (const source of [controller, worker, application, view]) {
        assert.doesNotMatch(source, /insertAdjacentHTML|leftHtml|rightHtml/);
    }
    assert.doesNotMatch(worker, /CHUNK_SIZE|diff:chunk/);
    assert.doesNotMatch(controller, /message\.type\s*===\s*['"](?:computing|chunk|diff:chunk|done|error|cancelled)['"]/);
    assert.doesNotMatch(application, /\b(?:chunkBuffer|extractText|getFieldText|computeLineDiff|buildPanelHtml)\b/);
    assert.doesNotMatch(application, /\.innerHTML\s*=/);
    assert.doesNotMatch(view, /\.innerHTML\s*=/);
});

test('classic browser scripts retain dependency order and the package stays dependency-free', function () {
    const html = read('public/index.html');
    const packageJson = JSON.parse(read('package.json'));
    const orderedScripts = [
        'shared-diff.js',
        'diff-controller.js',
        'virtual-diff.js',
        'script.js'
    ];
    let previousIndex = -1;

    for (const script of orderedScripts) {
        const match = '<script src="' + script + '"></script>';
        const index = html.indexOf(match);
        assert.ok(index > previousIndex, script + ' must load after its dependencies');
        previousIndex = index;
    }
    assert.doesNotMatch(html, /<script[^>]+type=['"]module['"]/);
    assert.equal(Object.hasOwn(packageJson, 'dependencies'), false);
    assert.equal(Object.hasOwn(packageJson, 'devDependencies'), false);
    assert.equal(Object.hasOwn(packageJson, 'optionalDependencies'), false);
});
