'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const childProcess = require('node:child_process');
const { performance } = require('node:perf_hooks');

const CHILD_FLAG = '--case';
const CHILD_TIMEOUT_MS = 60000;
const HEAP_LIMIT_MIB = 256;
const MAX_RANGE_PAIRS = 200000;
const MAX_RANGE_BYTES = MAX_RANGE_PAIRS * 2 * Uint32Array.BYTES_PER_ELEMENT;
const CASE_NAMES = [
    '25k-identical-lines',
    'near-limit-20x100k-lines',
    '100k-single-line-edit',
    'range-heavy-edits',
    'near-alignment-budget',
    'conservative-fallback',
    '25k-every-fifth-line-edited',
    '25k-crlf-vs-lf',
    '25k-trailing-space',
    '25k-short-lines-trailing-space',
    '25k-reindented',
    '25k-unrelated-2m-chars',
    '25k-shuffled-lines',
    '25k-repeated-block-moved',
    '25k-moved-block-every-fifth-edited',
    '25k-ignore-case',
    '25k-non-ascii-trailing-space',
    '25k-nfc-vs-nfd'
];

function runSuite() {
    let failures = 0;

    for (let i = 0; i < CASE_NAMES.length; i++) {
        const caseName = CASE_NAMES[i];
        const result = childProcess.spawnSync(
            process.execPath,
            [
                '--expose-gc',
                '--max-old-space-size=' + HEAP_LIMIT_MIB,
                __filename,
                CHILD_FLAG,
                caseName
            ],
            {
                cwd: path.join(__dirname, '..'),
                encoding: 'utf8',
                timeout: CHILD_TIMEOUT_MS,
                maxBuffer: 1024 * 1024
            }
        );

        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);

        if (result.error || result.status !== 0) {
            failures++;
            if (result.error) {
                console.error(caseName + ': ' + result.error.message);
            } else {
                console.error(caseName + ': child exited with status ' + result.status + '.');
            }
        }
    }

    if (failures > 0) {
        throw new Error(failures + ' isolated performance case(s) failed.');
    }

    console.log('All ' + CASE_NAMES.length + ' isolated 256 MiB performance cases passed.');
}

function loadComputeDiffModel() {
    const filename = path.join(__dirname, '..', 'public', 'shared-diff.js');
    const code = fs.readFileSync(filename, 'utf8');
    const context = { Intl: Intl, performance: performance };
    vm.createContext(context);
    vm.runInContext(code, context, { filename: filename });
    assert.equal(typeof context.DiffCore.computeDiffModel, 'function');
    return context.DiffCore.computeDiffModel;
}

function runCase(caseName) {
    assert.equal(typeof global.gc, 'function', 'performance children require --expose-gc');
    const fixture = createFixture(caseName);
    const computeDiffModel = loadComputeDiffModel();

    global.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const started = performance.now();
    const model = computeDiffModel(fixture.left, fixture.right, fixture.options);
    const elapsed = performance.now() - started;

    assertCompactModel(model, fixture.left, fixture.right);
    fixture.verify(model);

    global.gc();
    const heapAfter = process.memoryUsage().heapUsed;
    const heapLimitBytes = HEAP_LIMIT_MIB * 1024 * 1024;
    assert.ok(
        heapAfter < heapLimitBytes,
        'retained heap exceeds the configured ' + HEAP_LIMIT_MIB + ' MiB limit'
    );

    const retainedDelta = Math.max(0, heapAfter - heapBefore) / (1024 * 1024);
    console.log(
        caseName.padEnd(29)
        + Math.round(elapsed).toString().padStart(6) + 'ms  '
        + model.rows.length.toString().padStart(6) + ' rows  '
        + (model.changeBounds.length / 2).toString().padStart(6) + ' ranges  '
        + retainedDelta.toFixed(1).padStart(6) + ' MiB retained'
    );
}

function createFixture(caseName) {
    if (caseName === '25k-identical-lines') {
        const source = numberedLines(25000, 'line-');
        return fixture(source, source, function (model) {
            assert.equal(model.rows.length, 25000);
            assert.equal(model.mismatchCount, 0);
            assert.equal(model.changeBounds.length, 0);
        });
    }

    if (caseName === 'near-limit-20x100k-lines') {
        const left = nearLimitText();
        const right = nearLimitText();
        return fixture(left, right, function (model) {
            assert.equal(left.length, 2000000);
            assert.equal(right.length, 2000000);
            assert.equal(model.rows.length, 20);
            assert.equal(model.mismatchCount, 0);
        });
    }

    if (caseName === '100k-single-line-edit') {
        const prefix = 'a'.repeat(49999);
        const suffix = 'b'.repeat(50000);
        return fixture(prefix + 'X' + suffix, prefix + 'Y' + suffix, function (model) {
            assert.equal(model.rows.length, 1);
            assert.equal(model.rows[0].type, 'modified');
            assert.equal(model.rows[0].detailMode, 'precise');
            assert.ok(model.changeBounds.length >= 4);
        });
    }

    if (caseName === 'range-heavy-edits') {
        const sides = rangeHeavySources(750, 16);
        return fixture(sides.left, sides.right, function (model) {
            assert.equal(model.stats.modifiedRows, 750);
            assert.ok(model.stats.rangePairs >= 20000, 'fixture did not produce enough compact ranges');
            assert.equal(model.stats.wholeLineRows, 0);
        });
    }

    if (caseName === 'near-alignment-budget') {
        const count = 500;
        const left = alignmentLines(count, 'L');
        const right = alignmentLines(count, 'R');
        const cellBudget = (count + 1) * (count + 1) + 999;
        return fixture(left, right, function (model) {
            assert.equal(model.stats.alignment.fullHunks, 1);
            assert.equal(model.stats.alignment.fallbackHunks, 0);
            assert.equal(model.stats.alignment.cellsUsed, (count + 1) * (count + 1));
            assert.ok(model.stats.alignment.cellsUsed / cellBudget > 0.99);
        }, {
            workBudget: {
                remainingAlignmentCells: cellBudget
            }
        });
    }

    if (caseName === 'conservative-fallback') {
        return fixture(
            'alpha-one\nalpha-two',
            'alpha-uno\nalpha-dos',
            function (model) {
                assert.equal(model.stats.alignment.fallbackHunks, 1);
                assert.equal(model.stats.modifiedRows, 0);
                assert.equal(model.stats.missingRows, 2);
                assert.equal(model.stats.addedRows, 2);
                assert.equal(model.stats.alignment.cellsUsed, 0);
            },
            {
                workBudget: {
                    remainingAlignmentCells: 0
                }
            }
        );
    }

    if (caseName === '25k-every-fifth-line-edited') {
        const lines = codeLines(25000);
        const edited = lines.map(function (line, index) {
            return index % 5 === 0 ? line.replace('compute', 'calc') : line;
        });
        return fixture(lines.join('\n'), edited.join('\n'), function (model) {
            assert.equal(model.rows.length, 25000);
            assert.equal(model.stats.matchedRows, 20000);
            assert.equal(model.stats.modifiedRows, 5000);
        });
    }

    if (caseName === '25k-crlf-vs-lf') {
        const lines = codeLines(25000);
        return fixture(lines.join('\r\n'), lines.join('\n'), function (model) {
            assert.equal(model.rows.length, 25000);
            assert.equal(model.stats.matchedRows, 25000);
            assert.equal(model.stats.lineEndingRows, 24999);
            assert.equal(model.mismatchCount, 0);
        });
    }

    if (caseName === '25k-trailing-space' || caseName === '25k-short-lines-trailing-space') {
        const lines = caseName === '25k-trailing-space'
            ? codeLines(25000)
            : Array.from({ length: 25000 }, function (_, index) {
                return 'const v' + index + ' = compute(' + index + ');';
            });
        return fixture(lines.join(' \n'), lines.join('\n'), function (model) {
            assert.equal(model.rows.length, 25000);
            assert.equal(model.stats.matchedRows, 1);
            assert.equal(model.stats.modifiedRows, 24999);
            assert.equal(model.stats.alignment.fallbackHunks, 0);
            assert.ok(model.stats.alignment.leftProfilesBuilt <= 25000);
            assert.ok(model.stats.alignment.rightProfilesBuilt <= 25000);
        });
    }

    if (caseName === '25k-reindented') {
        const lines = codeLines(25000);
        const indented = lines.map(function (line) { return '  ' + line; });
        return fixture(lines.join('\n'), indented.join('\n'), function (model) {
            assert.equal(model.rows.length, 25000);
            assert.equal(model.stats.modifiedRows, 25000);
            assert.equal(model.stats.alignment.fallbackHunks, 0);
        });
    }

    if (caseName === '25k-repeated-block-moved') {
        // Thousands of identical lines leave one place and reappear in another:
        // every one of them is a candidate for every other.
        const lines = codeLines(15000);
        const repeated = Array.from({ length: 10000 }, function () { return 'repeated filler line of text'; });
        const left = repeated.concat(lines).join('\n');
        const right = lines.concat(repeated).join('\n');
        return fixture(left, right, function (model) {
            assert.equal(model.rows.length, 35000);
            assert.equal(model.stats.matchedRows, 15000);
            assert.equal(model.stats.movedRows, 10000);
        });
    }

    if (caseName === '25k-moved-block-every-fifth-edited') {
        // A large block moves and every fifth line in it is edited on the way:
        // each edited line has to be scored and diffed as part of the move.
        const lines = codeLines(25000);
        const block = lines.slice(0, 10000);
        const rest = lines.slice(10000);
        const edited = block.map(function (line, index) {
            return index % 5 === 2 ? line.replace('compute', 'calc') : line;
        });
        return fixture(block.concat(rest).join('\n'), rest.concat(edited).join('\n'), function (model) {
            assert.equal(model.rows.length, 35000);
            assert.equal(model.stats.matchedRows, 15000);
            assert.equal(model.stats.movedRows, 10000);
            assert.equal(model.stats.movedChangedRows, 2000);
        });
    }

    if (caseName === '25k-ignore-case') {
        const lines = codeLines(25000);
        const upper = lines.map(function (line, index) {
            return index % 2 === 0 ? line.toUpperCase() : line;
        });
        return fixture(lines.join('\n'), upper.join('\n'), function (model) {
            assert.equal(model.rows.length, 25000);
            assert.equal(model.stats.matchedRows, 25000);
            assert.equal(model.stats.caseRows, 12500);
            assert.equal(model.mismatchCount, 0);
        }, { ignoreCase: true });
    }

    if (caseName === '25k-non-ascii-trailing-space' || caseName === '25k-nfc-vs-nfd') {
        // Accented and Cyrillic text takes the normalization-aware paths that
        // plain ASCII fixtures never reach.
        const lines = Array.from({ length: 25000 }, function (_, index) {
            return 'm\u00e4\u00e4r\u00e4 ' + index + ' = \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435(\u00f6ljy' + (index % 97) + ', \u00e9t\u00e9);';
        });
        if (caseName === '25k-non-ascii-trailing-space') {
            return fixture(lines.join(' \n'), lines.join('\n'), function (model) {
                assert.equal(model.rows.length, 25000);
                assert.equal(model.stats.modifiedRows, 24999);
                assert.equal(model.stats.normalizationRows, 0);
                assert.equal(model.stats.alignment.fallbackHunks, 0);
            });
        }
        const decomposed = lines.map(function (line) { return line.normalize('NFD'); });
        return fixture(lines.join('\n'), decomposed.join('\n'), function (model) {
            assert.equal(model.rows.length, 25000);
            assert.equal(model.stats.modifiedRows, 25000);
            assert.equal(model.stats.normalizationRows, 25000);
            assert.equal(model.stats.alignment.fallbackHunks, 0);
        });
    }

    if (caseName === '25k-unrelated-2m-chars') {
        const left = randomLines(25000, 79, 1);
        const right = randomLines(25000, 79, 2);
        return fixture(left, right, function (model) {
            assert.equal(left.length, 1999999);
            assert.equal(right.length, 1999999);
            assert.equal(model.rows.length, 50000);
            assert.equal(model.stats.matchedRows, 0);
            assert.equal(model.stats.missingRows, 25000);
            assert.equal(model.stats.addedRows, 25000);
        });
    }

    if (caseName === '25k-shuffled-lines') {
        const lines = codeLines(25000);
        const random = createRandom(3);
        const reordered = lines.slice();
        for (let i = reordered.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            const swap = reordered[i];
            reordered[i] = reordered[j];
            reordered[j] = swap;
        }
        return fixture(lines.join('\n'), reordered.join('\n'), function (model) {
            assert.ok(model.stats.matchedRows >= 250, 'reordered lines lost their common order');
            assert.ok(model.stats.workBudget.remainingMyersSteps > 0);
        });
    }

    throw new Error('Unknown performance case: ' + caseName);
}

function createRandom(seed) {
    let value = seed >>> 0;
    return function () {
        value = ((value * 1664525) + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}

function codeLines(count) {
    const random = createRandom(7);
    return Array.from({ length: count }, function (_, index) {
        const value = Math.floor(random() * 0x100000000);
        return '    const value_' + (value % 5000).toString(36)
            + ' = compute(' + index + ', "' + value.toString(36) + '"); // some trailing comment text';
    });
}

function randomLines(count, lineLength, seed) {
    const random = createRandom(seed);
    return Array.from({ length: count }, function () {
        let line = '';
        while (line.length < lineLength) {
            line += Math.floor(random() * 0x100000000).toString(36);
        }
        return line.slice(0, lineLength);
    }).join('\n');
}

function fixture(left, right, verify, options) {
    return {
        left: left,
        right: right,
        options: options || undefined,
        verify: verify
    };
}

function numberedLines(count, prefix) {
    return Array.from({ length: count }, function (_, index) {
        return prefix + index.toString(36).padStart(5, '0');
    }).join('\n');
}

function nearLimitText() {
    const lines = new Array(20).fill('n'.repeat(99999));
    lines[lines.length - 1] = 'n'.repeat(100000);
    return lines.join('\n');
}

function rangeHeavySources(rowCount, changesPerRow) {
    const left = [];
    const right = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const label = rowIndex.toString(36).padStart(4, '0');
        left.push(rangeHeavyLine(label, 'x', changesPerRow));
        right.push(rangeHeavyLine(label, 'y', changesPerRow));
        left.push('anchor-' + label);
        right.push('anchor-' + label);
    }

    return { left: left.join('\n'), right: right.join('\n') };
}

function rangeHeavyLine(label, marker, changesPerRow) {
    let value = 'row-' + label + ':' + 'common-prefix-'.repeat(4);
    for (let index = 0; index < changesPerRow; index++) {
        value += 'field-' + index + '=' + marker + ';';
    }
    return value + 'common-suffix-'.repeat(4);
}

function alignmentLines(count, side) {
    return Array.from({ length: count }, function (_, index) {
        return 'alignment-entry-'
            + index.toString(36).padStart(5, '0')
            + '-common-padding-'
            + side;
    }).join('\n');
}

function assertCompactModel(model, left, right) {
    assert.ok(model && typeof model === 'object');
    assert.equal(model.version, 2);
    assert.deepEqual(Object.keys(model).sort(), [
        'changeBounds',
        'leftLineStarts',
        'mismatchCount',
        'rightLineStarts',
        'rows',
        'stats',
        'version'
    ]);
    assert.equal(Array.isArray(model.rows), true);

    assertExactUint32Array(model.changeBounds, 'changeBounds');
    assertExactUint32Array(model.leftLineStarts, 'leftLineStarts');
    assertExactUint32Array(model.rightLineStarts, 'rightLineStarts');
    assertLineStarts(model.leftLineStarts, left, 'leftLineStarts');
    assertLineStarts(model.rightLineStarts, right, 'rightLineStarts');

    assert.equal(model.changeBounds.length % 2, 0);
    assert.ok(model.changeBounds.length / 2 <= MAX_RANGE_PAIRS);
    assert.ok(model.changeBounds.byteLength <= MAX_RANGE_BYTES);
    assertSourceFreeModel(model);
    assertRowsAndReconstruction(model, left, right);
}

function assertExactUint32Array(value, label) {
    assert.equal(Object.prototype.toString.call(value), '[object Uint32Array]', label + ' must be Uint32Array');
    assert.equal(value.byteOffset, 0, label + ' must own its exact buffer');
    assert.equal(value.byteLength, value.buffer.byteLength, label + ' buffer must not be an oversized view');
    assert.equal(value.byteLength, value.length * Uint32Array.BYTES_PER_ELEMENT);
}

function assertLineStarts(starts, source, label) {
    assert.equal(starts[0], 0, label + ' must start at zero');
    let expectedLength = 1;

    for (let index = 0; index < source.length; index++) {
        if (source.charCodeAt(index) !== 0x000A) continue;
        assert.equal(starts[expectedLength], index + 1, label + ' contains an incorrect source offset');
        expectedLength++;
    }

    assert.equal(starts.length, expectedLength, label + ' must have one entry per source line');
    assert.equal(
        starts.byteLength,
        expectedLength * Uint32Array.BYTES_PER_ELEMENT,
        label + ' storage must remain proportional to line count'
    );
}

function assertSourceFreeModel(model) {
    const allowedStrings = new Set([
        'added', 'banded', 'full', 'match', 'missing', 'modified', 'precise', 'whole-line'
    ]);
    const pending = [{ value: model, path: 'model' }];
    const seen = new Set();

    while (pending.length > 0) {
        const current = pending.pop();
        const value = current.value;

        if (typeof value === 'string') {
            assert.ok(allowedStrings.has(value), current.path + ' contains source text or an unexpected string');
            continue;
        }
        if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) continue;
        if (seen.has(value)) continue;
        seen.add(value);

        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            pending.push({ value: value[key], path: current.path + '.' + key });
        }
    }
}

function assertRowsAndReconstruction(model, left, right) {
    let nextLeftLine = 0;
    let nextRightLine = 0;
    let nextRangeOffset = 0;
    let mismatchCount = 0;
    // Ranges of moved lines that were also edited, stored after all others.
    const movedSegments = [];
    const leftParts = [];
    const rightParts = [];

    for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex++) {
        const row = model.rows[rowIndex];
        const label = 'rows[' + rowIndex + ']';
        assert.ok(row && typeof row === 'object', label + ' must be an object');

        if (row.type === 'match') {
            assertRowKeys(row, ['leftLineIndex', 'rightLineIndex', 'type'], label);
        } else if (row.type === 'missing') {
            assertRowKeys(row, ['leftLineIndex', 'type'], label);
            mismatchCount++;
            if (Object.hasOwn(row, 'leftRangeOffset')) {
                assertRanges(model.changeBounds, row.leftRangeOffset, row.leftRangeCount,
                    sourceLineLength(left, model.leftLineStarts, row.leftLineIndex), label + '.leftRanges');
                movedSegments.push([row.leftRangeOffset, row.leftRangeCount * 2]);
            }
        } else if (row.type === 'added') {
            assertRowKeys(row, ['rightLineIndex', 'type'], label);
            mismatchCount++;
            if (Object.hasOwn(row, 'rightRangeOffset')) {
                assertRanges(model.changeBounds, row.rightRangeOffset, row.rightRangeCount,
                    sourceLineLength(right, model.rightLineStarts, row.rightLineIndex), label + '.rightRanges');
                movedSegments.push([row.rightRangeOffset, row.rightRangeCount * 2]);
            }
        } else if (row.type === 'modified') {
            assertRowKeys(row, [
                'detailMode', 'leftLineIndex', 'leftRangeCount', 'leftRangeOffset',
                'rightLineIndex', 'rightRangeCount', 'rightRangeOffset', 'type'
            ], label);
            mismatchCount++;

            assert.equal(row.leftRangeOffset, nextRangeOffset, label + ' left ranges must be packed');
            assertRanges(
                model.changeBounds,
                row.leftRangeOffset,
                row.leftRangeCount,
                sourceLineLength(left, model.leftLineStarts, row.leftLineIndex),
                label + '.leftRanges'
            );
            nextRangeOffset += row.leftRangeCount * 2;
            assert.equal(row.rightRangeOffset, nextRangeOffset, label + ' right ranges must be packed');
            assertRanges(
                model.changeBounds,
                row.rightRangeOffset,
                row.rightRangeCount,
                sourceLineLength(right, model.rightLineStarts, row.rightLineIndex),
                label + '.rightRanges'
            );
            nextRangeOffset += row.rightRangeCount * 2;

            if (row.detailMode === 'whole-line') {
                assert.equal(row.leftRangeCount, 0);
                assert.equal(row.rightRangeCount, 0);
            } else {
                assert.equal(row.detailMode, 'precise');
            }
        } else {
            assert.fail(label + ' has unknown type ' + row.type);
        }

        if (Object.prototype.hasOwnProperty.call(row, 'leftLineIndex')) {
            assert.equal(row.leftLineIndex, nextLeftLine, label + ' must consume left lines monotonically');
            leftParts.push(sourceLine(left, model.leftLineStarts, row.leftLineIndex));
            nextLeftLine++;
        }
        if (Object.prototype.hasOwnProperty.call(row, 'rightLineIndex')) {
            assert.equal(row.rightLineIndex, nextRightLine, label + ' must consume right lines monotonically');
            rightParts.push(sourceLine(right, model.rightLineStarts, row.rightLineIndex));
            nextRightLine++;
        }
    }

    assert.equal(nextLeftLine, model.leftLineStarts.length);
    assert.equal(nextRightLine, model.rightLineStarts.length);
    movedSegments.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    for (let index = 0; index < movedSegments.length; index++) {
        assert.equal(movedSegments[index][0], nextRangeOffset, 'moved-line ranges must be packed after the others');
        nextRangeOffset += movedSegments[index][1];
    }
    assert.equal(nextRangeOffset, model.changeBounds.length, 'every compact range must be referenced exactly once');
    assert.equal(leftParts.join('\n'), left, 'rows must reconstruct the exact left source');
    assert.equal(rightParts.join('\n'), right, 'rows must reconstruct the exact right source');
    assert.equal(model.mismatchCount, mismatchCount);
    assert.equal(model.stats.rangePairs, model.changeBounds.length / 2);
}

function assertRowKeys(row, expected, label) {
    // A moved line also carries the line index of its counterpart.
    const optional = row.type === 'missing' ? 'movedTo' : (row.type === 'added' ? 'movedFrom' : null);
    // A moved line that was also edited carries its changed ranges as well.
    const side = row.type === 'missing' ? 'left' : 'right';
    const ranges = optional && Object.hasOwn(row, optional) ? [side + 'RangeOffset', side + 'RangeCount'] : [];
    assert.equal(Object.hasOwn(row, ranges[0] || 'type'), Object.hasOwn(row, ranges[1] || 'type'));
    const keys = Object.keys(row).filter(function (key) { return key !== optional && ranges.indexOf(key) < 0; });
    assert.deepEqual(keys.sort(), expected.slice().sort(), label + ' has non-compact fields');
    if (optional && Object.hasOwn(row, optional)) {
        assert.equal(Number.isSafeInteger(row[optional]) && row[optional] >= 0, true,
            label + ' ' + optional + ' must be a line index');
    }
}

function assertRanges(bounds, offset, count, lineLength, label) {
    assert.equal(Number.isSafeInteger(offset), true, label + ' offset must be an integer');
    assert.equal(Number.isSafeInteger(count), true, label + ' count must be an integer');
    assert.ok(offset >= 0 && count >= 0);
    assert.equal(offset % 2, 0, label + ' offset must be pair-aligned');
    assert.ok(offset + (count * 2) <= bounds.length, label + ' exceeds the shared range pool');

    let previousEnd = 0;
    for (let rangeIndex = 0; rangeIndex < count; rangeIndex++) {
        const start = bounds[offset + (rangeIndex * 2)];
        const end = bounds[offset + (rangeIndex * 2) + 1];
        assert.ok(start >= previousEnd, label + ' ranges must be ordered and non-overlapping');
        assert.ok(end >= start && end <= lineLength, label + ' range is outside its source line');
        previousEnd = end;
    }
}

function sourceLine(source, starts, lineIndex) {
    const start = starts[lineIndex];
    const end = lineIndex + 1 < starts.length ? starts[lineIndex + 1] - 1 : source.length;
    return source.slice(start, end);
}

function sourceLineLength(source, starts, lineIndex) {
    return sourceLine(source, starts, lineIndex).length;
}

const childFlagIndex = process.argv.indexOf(CHILD_FLAG);
if (childFlagIndex >= 0) {
    const caseName = process.argv[childFlagIndex + 1];
    assert.ok(CASE_NAMES.includes(caseName), 'unknown isolated performance case');
    runCase(caseName);
} else {
    runSuite();
}
