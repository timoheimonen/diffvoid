const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared-diff.js'), 'utf8');
const context = { Intl, performance };
vm.createContext(context);
vm.runInContext(code + '\nthis.computeLineDiff = computeLineDiff;', context);

function lines(count, prefix) {
    return Array.from({ length: count }, function (_, index) {
        return prefix + ' ' + index;
    }).join('\n');
}

function measure(label, left, right) {
    const started = performance.now();
    const result = context.computeLineDiff(left, right);
    const elapsed = Math.round(performance.now() - started);
    console.log(label.padEnd(28) + String(elapsed).padStart(6) + 'ms  entries=' + result.diff.length);
}

measure('1k identical rows', lines(1000, 'line'), lines(1000, 'line'));
measure('5k identical rows', lines(5000, 'line'), lines(5000, 'line'));
measure('25k identical rows', lines(25000, 'line'), lines(25000, 'line'));
measure('1k disjoint rows', lines(1000, 'left'), lines(1000, 'right'));
measure('5k disjoint rows', lines(5000, 'left'), lines(5000, 'right'));
measure('large single-line edit', 'a'.repeat(99999) + 'x', 'a'.repeat(99999) + 'y');
measure(
    'many small edits',
    Array.from({ length: 5000 }, function (_, index) { return 'key' + index + '=1'; }).join('\n'),
    Array.from({ length: 5000 }, function (_, index) { return 'key' + index + '=2'; }).join('\n')
);
