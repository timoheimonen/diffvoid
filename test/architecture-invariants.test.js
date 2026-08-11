'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('compared text is rendered without HTML string sinks', function () {
    const runtimeFiles = [
        'public/shared-diff.js',
        'public/diff-controller.js',
        'public/worker.js',
        'public/virtual-diff.js',
        'public/script.js'
    ];

    for (const file of runtimeFiles) {
        const source = read(file);
        assert.doesNotMatch(source, /insertAdjacentHTML|document\.write\s*\(|\.innerHTML\s*=/, file);
    }
});

test('the browser loads exactly one ordered classic-script application stack', function () {
    const html = read('public/index.html');
    const expectedScripts = [
        'theme.js',
        'shared-diff.js',
        'diff-controller.js',
        'virtual-diff.js',
        'script.js'
    ];
    const actualScripts = Array.from(
        html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g),
        function (match) { return match[1]; }
    );

    assert.deepEqual(actualScripts, expectedScripts);
    assert.doesNotMatch(html, /<script[^>]+type=['"]module['"]/);
});

test('classic core scripts expose only their canonical globals', function () {
    const cases = [
        {
            file: 'public/shared-diff.js',
            context: { Intl: Intl, performance: performance },
            expected: ['DiffCore']
        },
        {
            file: 'public/diff-controller.js',
            context: { performance: performance },
            expected: ['createDiffController']
        },
        {
            file: 'public/virtual-diff.js',
            context: { Intl: Intl, performance: performance },
            expected: ['createVirtualDiffView']
        }
    ];

    for (const entry of cases) {
        const initialKeys = new Set(Object.keys(entry.context));
        vm.createContext(entry.context);
        vm.runInContext(read(entry.file), entry.context, { filename: entry.file });
        const addedKeys = Object.keys(entry.context).filter(function (key) {
            return !initialKeys.has(key);
        });
        assert.deepEqual(addedKeys.sort(), entry.expected.slice().sort(), entry.file);
    }

    assert.equal(Object.isFrozen(cases[0].context.DiffCore), true);
});

test('the package has no external dependency graph', function () {
    const packageJson = JSON.parse(read('package.json'));

    assert.equal(Object.hasOwn(packageJson, 'dependencies'), false);
    assert.equal(Object.hasOwn(packageJson, 'devDependencies'), false);
    assert.equal(Object.hasOwn(packageJson, 'optionalDependencies'), false);
});

test('the published application version is consistent', function () {
    const version = JSON.parse(read('package.json')).version;

    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.ok(read('public/index.html').includes('<meta name="version" content="' + version + '">'));
    assert.ok(read('public/about.html').includes('<div class="meta">Version ' + version + '</div>'));
});
