// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

const RENDER_BUDGETS = Object.freeze({
    overscanRows: 24,
    maxMountedRowsPerPane: 200,
    maxDomNodesBothPanes: 8000,
    maxDecoratedSpansPerRow: 512,
    maxSpecialMarkersPerRow: 256,
    denseLinePreviewThreshold: 20000,
    frameBudgetMs: 8
});

const VIRTUAL_DIFF_ROW_HEIGHT = 21;
const VIRTUAL_DIFF_PREVIEW_CONTEXT = 256;
const VIRTUAL_DIFF_RENDER_CHUNK_UNITS = 32;

const VIRTUAL_INVISIBLE_META = Object.freeze({
    0x00A0: { cls: 'invisible-nbsp', title: 'Non-breaking space (U+00A0)', marker: '[NBSP]' },
    0x00AD: { cls: 'invisible-shy', title: 'Soft hyphen (U+00AD)', marker: '[SHY]' },
    0x180E: { cls: 'invisible-mvs', title: 'Mongolian vowel separator (U+180E)', marker: '[MVS]' },
    0x2002: { cls: 'invisible-ensp', title: 'En space (U+2002)', marker: '[EN]' },
    0x2003: { cls: 'invisible-emsp', title: 'Em space (U+2003)', marker: '[EM]' },
    0x2007: { cls: 'invisible-figure', title: 'Figure space (U+2007)', marker: '[FIG]' },
    0x2008: { cls: 'invisible-punct', title: 'Punctuation space (U+2008)', marker: '[PUNCT]' },
    0x2009: { cls: 'invisible-thin', title: 'Thin space (U+2009)', marker: '[THIN]' },
    0x200A: { cls: 'invisible-hair', title: 'Hair space (U+200A)', marker: '[HS]' },
    0x200B: { cls: 'invisible-zwsp', title: 'Zero-width space (U+200B)', marker: '|' },
    0x200C: { cls: 'invisible-zwnj', title: 'Zero-width non-joiner (U+200C)', marker: '[ZWNJ]' },
    0x200D: { cls: 'invisible-zwj', title: 'Zero-width joiner (U+200D)', marker: '[ZWJ]' },
    0x200E: { cls: 'invisible-lrm', title: 'Left-to-right mark (U+200E)', marker: '[LRM]' },
    0x200F: { cls: 'invisible-rlm', title: 'Right-to-left mark (U+200F)', marker: '[RLM]' },
    0x202F: { cls: 'invisible-nnbsp', title: 'Narrow no-break space (U+202F)', marker: '[NNBSP]' },
    0x205F: { cls: 'invisible-mmsp', title: 'Medium mathematical space (U+205F)', marker: '[MMSP]' },
    0x2060: { cls: 'invisible-wj', title: 'Word joiner (U+2060)', marker: '[WJ]' },
    0x3000: { cls: 'invisible-ideo', title: 'Ideographic space (U+3000)', marker: '[IDEO]' },
    0xFEFF: { cls: 'invisible-bom', title: 'Zero-width no-break space / BOM (U+FEFF)', marker: '[BOM]' }
});

const VIRTUAL_CONFUSABLE_META = Object.freeze({
    0x0391: { cls: 'confusable-greek-alpha-cap', title: 'Greek capital alpha (U+0391), looks like Latin A' },
    0x0392: { cls: 'confusable-greek-beta-cap', title: 'Greek capital beta (U+0392), looks like Latin B' },
    0x0395: { cls: 'confusable-greek-epsilon-cap', title: 'Greek capital epsilon (U+0395), looks like Latin E' },
    0x0396: { cls: 'confusable-greek-zeta-cap', title: 'Greek capital zeta (U+0396), looks like Latin Z' },
    0x0397: { cls: 'confusable-greek-eta-cap', title: 'Greek capital eta (U+0397), looks like Latin H' },
    0x0399: { cls: 'confusable-greek-iota-cap', title: 'Greek capital iota (U+0399), looks like Latin I' },
    0x039A: { cls: 'confusable-greek-kappa-cap', title: 'Greek capital kappa (U+039A), looks like Latin K' },
    0x039C: { cls: 'confusable-greek-mu-cap', title: 'Greek capital mu (U+039C), looks like Latin M' },
    0x039D: { cls: 'confusable-greek-nu-cap', title: 'Greek capital nu (U+039D), looks like Latin N' },
    0x039F: { cls: 'confusable-greek-omicron-cap', title: 'Greek capital omicron (U+039F), looks like Latin O' },
    0x03A1: { cls: 'confusable-greek-rho-cap', title: 'Greek capital rho (U+03A1), looks like Latin P' },
    0x03A4: { cls: 'confusable-greek-tau-cap', title: 'Greek capital tau (U+03A4), looks like Latin T' },
    0x03A7: { cls: 'confusable-greek-chi-cap', title: 'Greek capital chi (U+03A7), looks like Latin X' },
    0x03BF: { cls: 'confusable-greek-omicron', title: 'Greek small omicron (U+03BF), looks like Latin o' },
    0x03C1: { cls: 'confusable-greek-rho', title: 'Greek small rho (U+03C1), looks like Latin p' },
    0x03C7: { cls: 'confusable-greek-chi', title: 'Greek small chi (U+03C7), looks like Latin x' },
    0x0406: { cls: 'confusable-cyrillic-i-cap', title: 'Cyrillic capital byelorussian-ukrainian i (U+0406), looks like Latin I' },
    0x0410: { cls: 'confusable-cyrillic-a-cap', title: 'Cyrillic capital a (U+0410), looks like Latin A' },
    0x0412: { cls: 'confusable-cyrillic-ve-cap', title: 'Cyrillic capital ve (U+0412), looks like Latin B' },
    0x0415: { cls: 'confusable-cyrillic-ie-cap', title: 'Cyrillic capital ie (U+0415), looks like Latin E' },
    0x041A: { cls: 'confusable-cyrillic-ka-cap', title: 'Cyrillic capital ka (U+041A), looks like Latin K' },
    0x041C: { cls: 'confusable-cyrillic-em-cap', title: 'Cyrillic capital em (U+041C), looks like Latin M' },
    0x041D: { cls: 'confusable-cyrillic-en-cap', title: 'Cyrillic capital en (U+041D), looks like Latin H' },
    0x041E: { cls: 'confusable-cyrillic-o-cap', title: 'Cyrillic capital o (U+041E), looks like Latin O' },
    0x0420: { cls: 'confusable-cyrillic-er-cap', title: 'Cyrillic capital er (U+0420), looks like Latin P' },
    0x0421: { cls: 'confusable-cyrillic-es-cap', title: 'Cyrillic capital es (U+0421), looks like Latin C' },
    0x0422: { cls: 'confusable-cyrillic-te-cap', title: 'Cyrillic capital te (U+0422), looks like Latin T' },
    0x0425: { cls: 'confusable-cyrillic-ha-cap', title: 'Cyrillic capital ha (U+0425), looks like Latin X' },
    0x0430: { cls: 'confusable-cyrillic-a', title: 'Cyrillic small a (U+0430), looks like Latin a' },
    0x0435: { cls: 'confusable-cyrillic-ie', title: 'Cyrillic small ie (U+0435), looks like Latin e' },
    0x043E: { cls: 'confusable-cyrillic-o', title: 'Cyrillic small o (U+043E), looks like Latin o' },
    0x0440: { cls: 'confusable-cyrillic-er', title: 'Cyrillic small er (U+0440), looks like Latin p' },
    0x0441: { cls: 'confusable-cyrillic-es', title: 'Cyrillic small es (U+0441), looks like Latin c' },
    0x0445: { cls: 'confusable-cyrillic-ha', title: 'Cyrillic small ha (U+0445), looks like Latin x' },
    0x0456: { cls: 'confusable-cyrillic-i', title: 'Cyrillic small byelorussian-ukrainian i (U+0456), looks like Latin i' },
    0x04CF: { cls: 'confusable-cyrillic-palochka', title: 'Cyrillic small palochka (U+04CF), looks like Latin l' }
});

let virtualGraphemeSegmenter = null;

function virtualGraphemeSegmentAt(text, offset) {
    if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function' || !text.length) return null;
    if (!virtualGraphemeSegmenter) {
        virtualGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    }
    const segments = virtualGraphemeSegmenter.segment(text);
    const target = virtualClamp(offset, 0, text.length - 1);
    if (typeof segments.containing === 'function') return segments.containing(target) || null;
    for (const segment of segments) {
        if (segment.index <= target && target < segment.index + segment.segment.length) return segment;
    }
    return null;
}

function virtualFiniteInteger(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function virtualClamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function computeVirtualWindow(rowCount, scrollTop, clientHeight, rowHeight, overscanRows, maxMountedRows) {
    const count = Math.max(0, virtualFiniteInteger(rowCount, 0));
    const height = Math.max(1, virtualFiniteInteger(rowHeight, VIRTUAL_DIFF_ROW_HEIGHT));
    const viewport = Math.max(0, Number.isFinite(clientHeight) ? clientHeight : 0);
    const overscan = Math.max(0, virtualFiniteInteger(overscanRows, RENDER_BUDGETS.overscanRows));
    const maximum = Math.max(1, virtualFiniteInteger(maxMountedRows, RENDER_BUDGETS.maxMountedRowsPerPane));
    if (!count) return { first: 0, last: 0 };

    const totalHeight = count * height;
    const maximumScroll = Math.max(0, totalHeight - viewport);
    const top = virtualClamp(Number.isFinite(scrollTop) ? scrollTop : 0, 0, maximumScroll);
    const visibleFirst = virtualClamp(Math.floor(top / height), 0, count - 1);
    const visibleLast = virtualClamp(Math.ceil((top + viewport) / height), visibleFirst + 1, count);
    const visibleCount = Math.min(maximum, visibleLast - visibleFirst);
    const availableOverscan = Math.max(0, maximum - visibleCount);
    const before = Math.min(overscan, Math.floor(availableOverscan / 2));
    let first = Math.max(0, visibleFirst - before);
    let last = Math.min(count, visibleLast + Math.min(overscan, availableOverscan - before));

    if (last - first > maximum) last = first + maximum;
    return { first: first, last: last };
}

function virtualLineBounds(source, lineStarts, lineIndex) {
    if (!lineStarts || !Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lineStarts.length) {
        return null;
    }
    const start = virtualClamp(lineStarts[lineIndex], 0, source.length);
    const end = lineIndex + 1 < lineStarts.length
        ? virtualClamp(lineStarts[lineIndex + 1] - 1, start, source.length)
        : source.length;
    return { start: start, end: end };
}

function virtualNormalizeSources(sources) {
    const value = sources || {};
    return {
        left: typeof value.left === 'string' ? value.left : '',
        right: typeof value.right === 'string' ? value.right : ''
    };
}

function virtualNormalizeSelection(selection, sources) {
    if (!selection || (selection.side !== 'left' && selection.side !== 'right')) return null;
    const source = sources[selection.side];
    const anchorValue = Number.isInteger(selection.anchorSourceOffset)
        ? selection.anchorSourceOffset
        : selection.anchor;
    const focusValue = Number.isInteger(selection.focusSourceOffset)
        ? selection.focusSourceOffset
        : selection.focus;
    if (!Number.isFinite(anchorValue) || !Number.isFinite(focusValue)) return null;
    return {
        side: selection.side,
        anchorSourceOffset: virtualClamp(Math.floor(anchorValue), 0, source.length),
        focusSourceOffset: virtualClamp(Math.floor(focusValue), 0, source.length)
    };
}

function virtualSelectionInterval(selection, side) {
    if (!selection || selection.side !== side) return null;
    const start = Math.min(selection.anchorSourceOffset, selection.focusSourceOffset);
    const end = Math.max(selection.anchorSourceOffset, selection.focusSourceOffset);
    return start === end ? null : { start: start, end: end };
}

function getVirtualDiffCopyText(sources, selection, side, wholeSource) {
    const normalizedSources = virtualNormalizeSources(sources);
    if (side !== 'left' && side !== 'right') return '';
    const source = normalizedSources[side];
    const normalizedSelection = virtualNormalizeSelection(selection, normalizedSources);
    const interval = wholeSource ? null : virtualSelectionInterval(normalizedSelection, side);
    return interval ? source.slice(interval.start, interval.end) : source;
}

function stripVirtualDiffInvisibleCharacters(text) {
    const removeCodes = { 0x00AD: true, 0xFEFF: true };
    const spaceCodes = {
        0x00A0: true, 0x180E: true, 0x200B: true, 0x200C: true,
        0x200D: true, 0x200E: true, 0x200F: true, 0x202F: true,
        0x205F: true, 0x2060: true, 0x3000: true
    };
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (removeCodes[code]) continue;
        if (spaceCodes[code] || (code >= 0x2000 && code <= 0x200B)) {
            if (result.slice(-1) !== ' ') result += ' ';
        } else {
            result += text[i];
        }
    }
    return result;
}

function getVirtualDiffCleanCopyText(sources, side, cleaner) {
    const source = getVirtualDiffCopyText(sources, null, side, true);
    const clean = typeof cleaner === 'function' ? cleaner : stripVirtualDiffInvisibleCharacters;
    return clean(source);
}

function createVirtualDiffView(options) {
    const settings = options || {};
    const leftElement = settings.leftElement || settings.left;
    const rightElement = settings.rightElement || settings.right;
    if (!leftElement || !rightElement) throw new TypeError('VirtualDiffView requires left and right elements.');

    const documentRef = settings.document || leftElement.ownerDocument
        || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) throw new TypeError('VirtualDiffView requires a document.');

    const requestFrame = settings.requestAnimationFrame
        || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (callback) {
            return setTimeout(function () { callback(Date.now()); }, 16);
        });
    const cancelFrame = settings.cancelAnimationFrame
        || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout);
    const now = settings.now || (typeof performance !== 'undefined' && performance
        && typeof performance.now === 'function'
        ? function () { return performance.now(); }
        : function () { return Date.now(); });
    const cleanText = settings.stripInvisibleCharacters
        || (typeof stripInvisibleCharacters === 'function' ? stripInvisibleCharacters : stripVirtualDiffInvisibleCharacters);
    const onSelectionChange = typeof settings.onSelectionChange === 'function'
        ? settings.onSelectionChange : function () {};
    const onRenderingReduced = typeof settings.onRenderingReduced === 'function'
        ? settings.onRenderingReduced : function () {};
    const estimatedCharacterWidth = Math.max(1, Number(settings.estimatedCharacterWidth) || 8);
    const paneElements = { left: leftElement, right: rightElement };
    const originalAttributes = {
        left: capturePaneAttributes(leftElement),
        right: capturePaneAttributes(rightElement)
    };
    const listeners = [];
    const previewPageBySide = { left: new Map(), right: new Map() };

    let paneStructures = null;
    let sources = { left: '', right: '' };
    let model = null;
    let selection = null;
    let rowByLine = { left: null, right: null };
    let mountedRange = { first: 0, last: 0 };
    let scheduledFrame = null;
    let renderTask = null;
    let autoscrollFrame = null;
    let generation = 0;
    let renderRequest = 0;
    let destroyed = false;
    let reductionNotified = false;
    let pointerSelection = null;
    let latestPointerEvent = null;
    let pendingPreviewFocus = null;

    function capturePaneAttributes(element) {
        const names = ['contenteditable', 'role', 'aria-readonly', 'tabindex', 'aria-label', 'aria-multiline'];
        const values = {};
        for (const name of names) values[name] = element.getAttribute(name);
        return values;
    }

    function restorePaneAttributes(element, values) {
        for (const name of Object.keys(values)) {
            if (values[name] === null) element.removeAttribute(name);
            else element.setAttribute(name, values[name]);
        }
    }

    function listen(target, type, listener, listenerOptions) {
        target.addEventListener(type, listener, listenerOptions);
        listeners.push({ target: target, type: type, listener: listener, options: listenerOptions });
    }

    function addText(parent, value, context, optionalReserve) {
        const text = String(value);
        if (!text) return null;
        if (context && context.created + 1 + context.reserved + (optionalReserve || 0) > context.limit) return null;
        const node = documentRef.createTextNode(text);
        if (context) context.created++;
        parent.appendChild(node);
        return node;
    }

    function addElement(parent, tagName, context, optionalReserve) {
        if (context && context.created + 1 + context.reserved + (optionalReserve || 0) > context.limit) return null;
        const element = documentRef.createElement(tagName);
        if (context) context.created++;
        if (parent) parent.appendChild(element);
        return element;
    }

    function notifyReduction(reason) {
        if (reductionNotified) return;
        reductionNotified = true;
        onRenderingReduced('Detailed rendering reduced for performance', reason);
    }

    function createPaneStructure(side) {
        const root = paneElements[side];
        const before = documentRef.createElement('div');
        const windowElement = documentRef.createElement('div');
        const after = documentRef.createElement('div');
        before.className = 'diff-spacer-before';
        before.setAttribute('aria-hidden', 'true');
        windowElement.className = 'diff-window';
        windowElement.setAttribute('role', 'list');
        windowElement.setAttribute('aria-label', side === 'left' ? 'Left diff rows' : 'Right diff rows');
        after.className = 'diff-spacer-after';
        after.setAttribute('aria-hidden', 'true');
        root.replaceChildren(before, windowElement, after);
        root.classList.add('diff-mode');
        root.setAttribute('contenteditable', 'false');
        root.setAttribute('role', 'region');
        root.setAttribute('aria-readonly', 'true');
        root.setAttribute('tabindex', '0');
        root.removeAttribute('aria-multiline');
        if (!root.getAttribute('aria-label')) {
            root.setAttribute('aria-label', side === 'left' ? 'Left comparison result' : 'Right comparison result');
        }
        if (root.style && typeof root.style.setProperty === 'function') {
            root.style.setProperty('--diff-row-height', VIRTUAL_DIFF_ROW_HEIGHT + 'px');
        }
        return { root: root, before: before, window: windowElement, after: after };
    }

    function activateStructures() {
        paneStructures = {
            left: createPaneStructure('left'),
            right: createPaneStructure('right')
        };
    }

    function validateModel(nextModel) {
        if (!nextModel || nextModel.version !== 2 || !Array.isArray(nextModel.rows)
            || !nextModel.changeBounds || !nextModel.leftLineStarts || !nextModel.rightLineStarts) {
            throw new TypeError('VirtualDiffView requires a DiffModelV2 result.');
        }
    }

    function sourceLineIndex(row, side) {
        const value = side === 'left' ? row.leftLineIndex : row.rightLineIndex;
        return Number.isInteger(value) ? value : null;
    }

    function buildRowMaps() {
        const maps = {
            left: new Int32Array(model.leftLineStarts.length),
            right: new Int32Array(model.rightLineStarts.length)
        };
        maps.left.fill(-1);
        maps.right.fill(-1);
        for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex++) {
            const row = model.rows[rowIndex];
            const leftIndex = sourceLineIndex(row, 'left');
            const rightIndex = sourceLineIndex(row, 'right');
            if (leftIndex !== null && leftIndex < maps.left.length) maps.left[leftIndex] = rowIndex;
            if (rightIndex !== null && rightIndex < maps.right.length) maps.right[rightIndex] = rowIndex;
        }
        rowByLine = maps;
    }

    function cancelScheduledRendering() {
        if (scheduledFrame !== null) {
            cancelFrame(scheduledFrame);
            scheduledFrame = null;
        }
        renderTask = null;
    }

    function cancelAutoscroll() {
        if (autoscrollFrame !== null) {
            cancelFrame(autoscrollFrame);
            autoscrollFrame = null;
        }
    }

    function queueRenderFrame() {
        if (!model || destroyed) return;
        if (scheduledFrame !== null) return;
        const expectedGeneration = generation;
        scheduledFrame = requestFrame(function () {
            scheduledFrame = null;
            if (destroyed || expectedGeneration !== generation || !model) return;
            renderCurrentWindow();
        });
    }

    function scheduleRender() {
        if (!model || destroyed) return;
        renderRequest++;
        renderTask = null;
        queueRenderFrame();
    }

    function syncScrollTop(sourceSide) {
        if (!model) return;
        const sourcePane = paneElements[sourceSide];
        const targetSide = sourceSide === 'left' ? 'right' : 'left';
        const targetPane = paneElements[targetSide];
        const top = Math.max(0, Number(sourcePane.scrollTop) || 0);
        if (targetPane.scrollTop !== top) targetPane.scrollTop = top;
    }

    function handleScroll(side) {
        if (!model) return;
        syncScrollTop(side);
        scheduleRender();
    }

    function setResult(first, second) {
        if (destroyed) throw new Error('VirtualDiffView has been destroyed.');
        let nextSources;
        let nextModel;
        let nextSelection = null;
        if (first && first.model && first.sources) {
            nextSources = first.sources;
            nextModel = first.model;
            nextSelection = first.selection || null;
        } else if (first && first.version === 2) {
            nextModel = first;
            nextSources = second;
        } else {
            nextSources = first;
            nextModel = second;
        }
        validateModel(nextModel);
        generation++;
        cancelScheduledRendering();
        cancelAutoscroll();
        sources = virtualNormalizeSources(nextSources);
        model = nextModel;
        selection = virtualNormalizeSelection(nextSelection, sources);
        previewPageBySide.left.clear();
        previewPageBySide.right.clear();
        pendingPreviewFocus = null;
        reductionNotified = false;
        mountedRange = { first: 0, last: 0 };
        activateStructures();
        buildRowMaps();
        leftElement.scrollTop = 0;
        rightElement.scrollTop = 0;
        leftElement.scrollLeft = 0;
        rightElement.scrollLeft = 0;
        for (const row of model.rows) {
            if (row.type === 'modified' && row.detailMode === 'whole-line') {
                notifyReduction('whole-line');
                break;
            }
        }
        scheduleRender();
        return api;
    }

    function getRowRanges(row, side, lineLength) {
        if (row.type === 'added' && side === 'right') return lineLength ? [{ start: 0, end: lineLength }] : [];
        if (row.type !== 'modified') return [];
        if (row.detailMode !== 'precise') return lineLength ? [{ start: 0, end: lineLength }] : [];
        const offsetName = side === 'left' ? 'leftRangeOffset' : 'rightRangeOffset';
        const countName = side === 'left' ? 'leftRangeCount' : 'rightRangeCount';
        const offset = virtualFiniteInteger(row[offsetName], 0);
        const count = Math.max(0, virtualFiniteInteger(row[countName], 0));
        const ranges = [];
        for (let i = 0; i < count; i++) {
            const poolOffset = offset + (i * 2);
            if (poolOffset + 1 >= model.changeBounds.length) break;
            const start = virtualClamp(model.changeBounds[poolOffset], 0, lineLength);
            const end = virtualClamp(model.changeBounds[poolOffset + 1], start, lineLength);
            if (end > start) ranges.push({ start: start, end: end });
        }
        return ranges;
    }

    function previewPagesFor(lineLength, ranges) {
        const threshold = RENDER_BUDGETS.denseLinePreviewThreshold;
        if (lineLength <= threshold) return [{ start: 0, end: lineLength }];
        const expanded = [];
        if (ranges.length) {
            for (const range of ranges) {
                const start = Math.max(0, range.start - VIRTUAL_DIFF_PREVIEW_CONTEXT);
                const end = Math.min(lineLength, range.end + VIRTUAL_DIFF_PREVIEW_CONTEXT);
                const previous = expanded[expanded.length - 1];
                if (previous && start <= previous.end) previous.end = Math.max(previous.end, end);
                else expanded.push({ start: start, end: end });
            }
        } else {
            expanded.push({ start: 0, end: Math.min(lineLength, threshold) });
        }

        const pages = [];
        for (const range of expanded) {
            let start = range.start;
            while (start < range.end) {
                const end = Math.min(range.end, start + threshold);
                pages.push({ start: start, end: end });
                start = end;
            }
        }
        return pages.length ? pages : [{ start: 0, end: Math.min(lineLength, threshold) }];
    }

    function specialMeta(code, changed) {
        if (code === 0x0020 && changed) {
            return { cls: 'invisible-regular-space', title: 'Space (U+0020)', marker: 'space' };
        }
        if (VIRTUAL_INVISIBLE_META[code]) return VIRTUAL_INVISIBLE_META[code];
        if (code >= 0x2000 && code <= 0x200A) {
            return {
                cls: 'invisible-space',
                title: 'Unicode space (U+' + code.toString(16).toUpperCase() + ')',
                marker: '[SP]'
            };
        }
        return null;
    }

    function codePointLengthAt(text, index) {
        const first = text.charCodeAt(index);
        return first >= 0xD800 && first <= 0xDBFF && index + 1 < text.length
            && text.charCodeAt(index + 1) >= 0xDC00 && text.charCodeAt(index + 1) <= 0xDFFF ? 2 : 1;
    }

    function rangeStateAt(ranges, position, cursor) {
        while (cursor.index < ranges.length && ranges[cursor.index].end <= position) cursor.index++;
        const range = ranges[cursor.index];
        if (!range) return { changed: false, next: Infinity };
        if (position < range.start) return { changed: false, next: range.start };
        return { changed: true, next: range.end };
    }

    function selectionStateAt(interval, absolutePosition, lineStart) {
        if (!interval) return { selected: false, next: Infinity };
        if (absolutePosition < interval.start) {
            return { selected: false, next: Math.max(0, interval.start - lineStart) };
        }
        if (absolutePosition < interval.end) {
            return { selected: true, next: Math.max(0, interval.end - lineStart) };
        }
        return { selected: false, next: Infinity };
    }

    function setSourceAttributes(element, start, end) {
        element.setAttribute('data-source-start', String(start));
        element.setAttribute('data-source-end', String(end));
    }

    function removeChildrenFrom(parent, childIndex, context) {
        while (parent.childNodes.length > childIndex) {
            const child = parent.childNodes[childIndex];
            context.created = Math.max(0, context.created - 1 - countNodeTree(child));
            parent.removeChild(child);
        }
    }

    function renderWholeSliceFallback(parent, source, displayStart, displayEnd, context, childIndex, mismatch) {
        removeChildrenFrom(parent, childIndex, context);
        if (mismatch) parent.classList.add('diff-mismatch');
        addText(parent, source.slice(displayStart, displayEnd), context);
        context.reduced = true;
        notifyReduction('whole-line-render-budget');
    }

    function* renderSourceSlice(parent, side, source, lineStart, displayStart, displayEnd, ranges,
        context, rowState, fallbackChildIndex, fallbackMismatch) {
        const interval = virtualSelectionInterval(selection, side);
        const rangeCursor = { index: 0 };
        while (rangeCursor.index < ranges.length && ranges[rangeCursor.index].end <= displayStart) rangeCursor.index++;
        let position = displayStart;
        let decoratedSpans = 0;
        let specialMarkers = 0;
        let workUnits = 0;

        while (position < displayEnd) {
            const rangeState = rangeStateAt(ranges, position, rangeCursor);
            const selectedState = selectionStateAt(interval, lineStart + position, lineStart);
            const code = source.codePointAt(position);
            const charLength = codePointLengthAt(source, position);
            const invisible = specialMeta(code, rangeState.changed);
            const confusable = VIRTUAL_CONFUSABLE_META[code];

            if (invisible) {
                let groupEnd = position + charLength;
                let count = 1;
                while (groupEnd < displayEnd) {
                    const nextRange = rangeStateAt(ranges, groupEnd, rangeCursor);
                    const nextSelected = selectionStateAt(interval, lineStart + groupEnd, lineStart);
                    const nextCode = source.codePointAt(groupEnd);
                    if (nextCode !== code || nextRange.changed !== rangeState.changed
                        || nextSelected.selected !== selectedState.selected) break;
                    groupEnd += codePointLengthAt(source, groupEnd);
                    count++;
                    workUnits++;
                    if (workUnits >= VIRTUAL_DIFF_RENDER_CHUNK_UNITS) {
                        workUnits = 0;
                        yield null;
                    }
                }
                if (specialMarkers >= RENDER_BUDGETS.maxSpecialMarkersPerRow
                    || decoratedSpans >= RENDER_BUDGETS.maxDecoratedSpansPerRow) {
                    renderWholeSliceFallback(parent, source, displayStart, displayEnd, context,
                        fallbackChildIndex, fallbackMismatch);
                    return;
                }
                const marker = addElement(parent, 'span', context, 1);
                if (!marker) {
                    renderWholeSliceFallback(parent, source, displayStart, displayEnd, context,
                        fallbackChildIndex, fallbackMismatch);
                    return;
                }
                marker.classList.add('invisible-char', invisible.cls);
                if (rangeState.changed) marker.classList.add('diff-mismatch');
                if (selectedState.selected) marker.classList.add('diff-logical-selection');
                marker.setAttribute('title', invisible.title + (count > 1 ? ' × ' + count : ''));
                marker.setAttribute('aria-label', invisible.title + (count > 1 ? ', repeated ' + count + ' times' : ''));
                marker.setAttribute('role', 'img');
                marker.setAttribute('data-char', source.slice(position, groupEnd));
                marker.setAttribute('data-count', String(count));
                setSourceAttributes(marker, lineStart + position, lineStart + groupEnd);
                if (count > 1) addText(marker, ' × ' + count, context);
                specialMarkers++;
                decoratedSpans++;
                position = groupEnd;
                workUnits++;
                if (workUnits >= VIRTUAL_DIFF_RENDER_CHUNK_UNITS) {
                    workUnits = 0;
                    yield null;
                }
                continue;
            }

            if (confusable) {
                if (specialMarkers >= RENDER_BUDGETS.maxSpecialMarkersPerRow
                    || decoratedSpans >= RENDER_BUDGETS.maxDecoratedSpansPerRow) {
                    renderWholeSliceFallback(parent, source, displayStart, displayEnd, context,
                        fallbackChildIndex, fallbackMismatch);
                    return;
                }
                const span = addElement(parent, 'span', context, 1);
                if (!span) {
                    renderWholeSliceFallback(parent, source, displayStart, displayEnd, context,
                        fallbackChildIndex, fallbackMismatch);
                    return;
                }
                span.classList.add('confusable-char', confusable.cls);
                if (rangeState.changed) span.classList.add('diff-mismatch');
                if (selectedState.selected) span.classList.add('diff-logical-selection');
                span.setAttribute('title', confusable.title);
                span.setAttribute('aria-label', confusable.title);
                span.setAttribute('data-char', source.slice(position, position + charLength));
                setSourceAttributes(span, lineStart + position, lineStart + position + charLength);
                if (!addText(span, source.slice(position, position + charLength), context)) {
                    span.parentNode.removeChild(span);
                    context.created--;
                    renderWholeSliceFallback(parent, source, displayStart, displayEnd, context,
                        fallbackChildIndex, fallbackMismatch);
                    return;
                }
                specialMarkers++;
                decoratedSpans++;
                position += charLength;
                workUnits++;
                if (workUnits >= VIRTUAL_DIFF_RENDER_CHUNK_UNITS) {
                    workUnits = 0;
                    yield null;
                }
                continue;
            }

            let end = Math.min(displayEnd, rangeState.next, selectedState.next);
            if (!Number.isFinite(end) || end <= position) end = position + charLength;
            let scan = position + charLength;
            while (scan < end) {
                const nextCode = source.codePointAt(scan);
                if (specialMeta(nextCode, rangeState.changed) || VIRTUAL_CONFUSABLE_META[nextCode]) break;
                scan += codePointLengthAt(source, scan);
                workUnits++;
                if (workUnits >= VIRTUAL_DIFF_RENDER_CHUNK_UNITS) {
                    workUnits = 0;
                    yield null;
                }
            }
            end = Math.min(end, scan);
            if (decoratedSpans >= RENDER_BUDGETS.maxDecoratedSpansPerRow) {
                renderWholeSliceFallback(parent, source, displayStart, displayEnd, context,
                    fallbackChildIndex, fallbackMismatch);
                return;
            }
            const span = addElement(parent, 'span', context, 1);
            if (!span) {
                renderWholeSliceFallback(parent, source, displayStart, displayEnd, context,
                    fallbackChildIndex, fallbackMismatch);
                return;
            }
            if (rangeState.changed) span.classList.add('diff-mismatch');
            else span.classList.add('diff-match');
            if (selectedState.selected) span.classList.add('diff-logical-selection');
            setSourceAttributes(span, lineStart + position, lineStart + end);
            if (!addText(span, source.slice(position, end), context)) {
                span.parentNode.removeChild(span);
                context.created--;
                renderWholeSliceFallback(parent, source, displayStart, displayEnd, context,
                    fallbackChildIndex, fallbackMismatch);
                return;
            }
            decoratedSpans++;
            position = end;
            workUnits++;
            if (workUnits >= VIRTUAL_DIFF_RENDER_CHUNK_UNITS) {
                workUnits = 0;
                yield null;
            }
        }
        rowState.specialMarkers += specialMarkers;
        rowState.decoratedSpans += decoratedSpans;
    }

    function appendPreviewAffordance(parent, kind, text, context, sourceOffset) {
        const span = addElement(parent, 'span', context, 1);
        if (!span) return null;
        span.className = kind;
        span.setAttribute('aria-hidden', 'true');
        if (Number.isFinite(sourceOffset)) setSourceAttributes(span, sourceOffset, sourceOffset);
        if (!addText(span, text, context)) {
            span.parentNode.removeChild(span);
            context.created--;
            return null;
        }
        return span;
    }

    function setPreviewPage(side, rowIndex, pageIndex) {
        if (!model || (side !== 'left' && side !== 'right') || rowIndex < 0 || rowIndex >= model.rows.length) return false;
        previewPageBySide[side].set(rowIndex, Math.max(0, pageIndex));
        scheduleRender();
        return true;
    }

    function appendPreviewButton(parent, side, rowIndex, direction, enabled, context) {
        const button = addElement(parent, 'button', context, 1);
        if (!button) return null;
        button.className = 'diff-preview-button diff-preview-' + direction;
        button.setAttribute('type', 'button');
        button.setAttribute('data-preview-direction', direction);
        button.setAttribute('aria-label', direction === 'previous' ? 'Previous change preview' : 'Next change preview');
        button.disabled = !enabled;
        if (!enabled) button.setAttribute('disabled', '');
        addText(button, direction === 'previous' ? '‹' : '›', context);
        button.addEventListener('click', function (event) {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            if (!enabled) return;
            const current = previewPageBySide[side].get(rowIndex) || 0;
            pendingPreviewFocus = { side: side, rowIndex: rowIndex, direction: direction };
            setPreviewPage(side, rowIndex, current + (direction === 'previous' ? -1 : 1));
        });
        return button;
    }

    function* renderContent(content, side, row, rowIndex, source, bounds, context) {
        const line = source.slice(bounds.start, bounds.end);
        const ranges = getRowRanges(row, side, line.length);
        const pages = previewPagesFor(line.length, ranges);
        let pageIndex = virtualClamp(previewPageBySide[side].get(rowIndex) || 0, 0, pages.length - 1);
        previewPageBySide[side].set(rowIndex, pageIndex);
        const page = pages[pageIndex];
        const rowState = { decoratedSpans: 0, specialMarkers: 0 };
        setSourceAttributes(content, bounds.start + page.start, bounds.start + page.end);

        if (line.length > RENDER_BUDGETS.denseLinePreviewThreshold) {
            notifyReduction('dense-line-preview');
            content.classList.add('diff-content-preview');
            content.setAttribute('data-preview-page', String(pageIndex + 1));
            content.setAttribute('data-preview-pages', String(pages.length));
            if (pages.length > 1) {
                appendPreviewButton(content, side, rowIndex, 'previous', pageIndex > 0, context);
            }
            if (page.start > 0) {
                appendPreviewAffordance(content, 'diff-preview-ellipsis', '…', context, bounds.start + page.start);
            }
        }

        const sourceChildIndex = content.childNodes.length;
        const fallbackMismatch = row.type === 'modified'
            || (row.type === 'missing' && side === 'left')
            || (row.type === 'added' && side === 'right');
        yield* renderSourceSlice(content, side, line, bounds.start, page.start, page.end, ranges,
            context, rowState, sourceChildIndex, fallbackMismatch);

        if (line.length > RENDER_BUDGETS.denseLinePreviewThreshold) {
            if (page.end < line.length) {
                appendPreviewAffordance(content, 'diff-preview-ellipsis', '…', context, bounds.start + page.end);
            }
            if (pages.length > 1) {
                appendPreviewButton(content, side, rowIndex, 'next', pageIndex + 1 < pages.length, context);
            }
        }
    }

    function minimumNodesForRow() {
        return 5;
    }

    function* renderRow(side, row, rowIndex, context) {
        context.reserved = Math.max(0, context.reserved - minimumNodesForRow());
        const lineElement = addElement(null, 'div', context);
        const gutter = addElement(lineElement, 'span', context);
        const content = addElement(lineElement, 'span', context);
        lineElement.className = 'diff-line';
        lineElement.setAttribute('data-row-index', String(rowIndex));
        gutter.className = 'diff-gutter';
        gutter.setAttribute('aria-hidden', 'true');
        content.className = 'diff-content';

        const lineIndex = sourceLineIndex(row, side);
        if (lineIndex === null) {
            lineElement.setAttribute('aria-hidden', 'true');
            if (side === 'right' && row.type === 'missing') lineElement.classList.add('diff-line-missing');
            return lineElement;
        }

        const lineStarts = side === 'left' ? model.leftLineStarts : model.rightLineStarts;
        const source = sources[side];
        const bounds = virtualLineBounds(source, lineStarts, lineIndex);
        lineElement.setAttribute('role', 'listitem');
        lineElement.setAttribute('aria-posinset', String(lineIndex + 1));
        lineElement.setAttribute('aria-setsize', String(lineStarts.length));
        lineElement.setAttribute('data-line-index', String(lineIndex));
        setSourceAttributes(gutter, bounds.start, bounds.start);
        addText(gutter, String(lineIndex + 1), context);

        const wholeLineMismatch = (row.type === 'missing' && side === 'left')
            || (row.type === 'added' && side === 'right');
        if ((side === 'right' && row.type === 'modified') || wholeLineMismatch) {
            lineElement.classList.add('diff-line-mismatch');
        }
        if (row.type === 'match' && side === 'right') content.classList.add('diff-match');
        if ((row.type === 'modified' && row.detailMode !== 'precise') || wholeLineMismatch) {
            content.classList.add('diff-mismatch');
        }

        const interval = virtualSelectionInterval(selection, side);
        if (interval && interval.start < bounds.end && interval.end > bounds.start) {
            lineElement.setAttribute('data-logically-selected', 'true');
            if (interval.start <= bounds.start && interval.end >= bounds.end) {
                lineElement.classList.add('diff-line-selected');
            }
        }
        yield* renderContent(content, side, row, rowIndex, source, bounds, context);
        return lineElement;
    }

    function createRenderTask() {
        const rowCount = model.rows.length;
        const viewportHeight = Math.max(leftElement.clientHeight || 0, rightElement.clientHeight || 0);
        const top = Math.max(0, Number(leftElement.scrollTop) || Number(rightElement.scrollTop) || 0);
        const visibleRange = computeVirtualWindow(
            rowCount,
            top,
            viewportHeight,
            VIRTUAL_DIFF_ROW_HEIGHT,
            0,
            RENDER_BUDGETS.maxMountedRowsPerPane
        );
        const desiredRange = computeVirtualWindow(
            rowCount,
            top,
            viewportHeight,
            VIRTUAL_DIFF_ROW_HEIGHT,
            RENDER_BUDGETS.overscanRows,
            RENDER_BUDGETS.maxMountedRowsPerPane
        );
        const visibleIndices = [];
        for (let rowIndex = visibleRange.first; rowIndex < visibleRange.last; rowIndex++) {
            visibleIndices.push(rowIndex);
        }
        const visibleRows = visibleRange.last - visibleRange.first;
        return {
            request: renderRequest,
            generation: generation,
            rowCount: rowCount,
            desiredRange: desiredRange,
            visibleRange: visibleRange,
            phase: 'visible',
            workIndices: visibleIndices,
            workPosition: 0,
            currentRow: null,
            leftRows: new Map(),
            rightRows: new Map(),
            firstRendered: null,
            lastRendered: null,
            context: {
                created: 6,
                limit: RENDER_BUDGETS.maxDomNodesBothPanes,
                reserved: visibleRows * 2 * minimumNodesForRow(),
                reduced: false
            }
        };
    }

    function prepareOverscan(task) {
        if (task.context.reduced) {
            task.phase = 'done';
            task.context.reserved = 0;
            return;
        }

        const indices = [];
        let before = task.visibleRange.first - 1;
        let after = task.visibleRange.last;
        while (before >= task.desiredRange.first || after < task.desiredRange.last) {
            if (before >= task.desiredRange.first) indices.push(before--);
            if (after < task.desiredRange.last) indices.push(after++);
        }

        const baseNodesPerRowPair = minimumNodesForRow() * 2;
        const affordable = Math.max(0, Math.floor(
            (task.context.limit - task.context.created) / baseNodesPerRowPair
        ));
        if (indices.length > affordable) {
            indices.length = affordable;
            notifyReduction('overscan-budget');
        }

        task.phase = indices.length ? 'overscan' : 'done';
        task.workIndices = indices;
        task.workPosition = 0;
        task.context.reserved = indices.length * baseNodesPerRowPair;
    }

    function beginCurrentRow(task) {
        const rowIndex = task.workIndices[task.workPosition];
        const row = model.rows[rowIndex];
        task.currentRow = {
            rowIndex: rowIndex,
            side: 'left',
            iterator: renderRow('left', row, rowIndex, task.context),
            left: null,
            right: null
        };
    }

    function advanceCurrentRow(task) {
        if (!task.currentRow) beginCurrentRow(task);
        const current = task.currentRow;
        const result = current.iterator.next();
        if (!result.done) return false;

        if (current.side === 'left') {
            current.left = result.value;
            current.side = 'right';
            current.iterator = renderRow(
                'right',
                model.rows[current.rowIndex],
                current.rowIndex,
                task.context
            );
            return false;
        }

        current.right = result.value;
        task.leftRows.set(current.rowIndex, current.left);
        task.rightRows.set(current.rowIndex, current.right);
        task.firstRendered = task.firstRendered === null
            ? current.rowIndex : Math.min(task.firstRendered, current.rowIndex);
        task.lastRendered = task.lastRendered === null
            ? current.rowIndex + 1 : Math.max(task.lastRendered, current.rowIndex + 1);
        task.currentRow = null;
        task.workPosition++;
        return true;
    }

    function restorePreviewFocus() {
        if (!pendingPreviewFocus || !paneStructures) return;
        const pending = pendingPreviewFocus;
        pendingPreviewFocus = null;
        const row = paneStructures[pending.side].window.querySelector(
            '[data-row-index="' + pending.rowIndex + '"]'
        );
        if (!row) return;
        let button = row.querySelector('[data-preview-direction="' + pending.direction + '"]');
        if (!button || button.disabled) {
            const alternate = pending.direction === 'next' ? 'previous' : 'next';
            button = row.querySelector('[data-preview-direction="' + alternate + '"]');
        }
        if (button && !button.disabled && typeof button.focus === 'function') {
            button.focus({ preventScroll: true });
        }
    }

    function commitRenderTask(task) {
        if (destroyed || task.generation !== generation || task.request !== renderRequest || task !== renderTask) {
            renderTask = null;
            queueRenderFrame();
            return;
        }
        const range = {
            first: task.firstRendered === null ? 0 : task.firstRendered,
            last: task.lastRendered === null ? 0 : task.lastRendered
        };
        const leftFragment = documentRef.createDocumentFragment();
        const rightFragment = documentRef.createDocumentFragment();
        for (let rowIndex = range.first; rowIndex < range.last; rowIndex++) {
            if (task.leftRows.has(rowIndex)) leftFragment.appendChild(task.leftRows.get(rowIndex));
            if (task.rightRows.has(rowIndex)) rightFragment.appendChild(task.rightRows.get(rowIndex));
        }
        paneStructures.left.before.style.height = (range.first * VIRTUAL_DIFF_ROW_HEIGHT) + 'px';
        paneStructures.right.before.style.height = (range.first * VIRTUAL_DIFF_ROW_HEIGHT) + 'px';
        paneStructures.left.after.style.height = ((task.rowCount - range.last) * VIRTUAL_DIFF_ROW_HEIGHT) + 'px';
        paneStructures.right.after.style.height = ((task.rowCount - range.last) * VIRTUAL_DIFF_ROW_HEIGHT) + 'px';
        paneStructures.left.window.replaceChildren(leftFragment);
        paneStructures.right.window.replaceChildren(rightFragment);
        mountedRange = { first: range.first, last: range.last };
        renderTask = null;
        restorePreviewFocus();
    }

    function renderCurrentWindow() {
        if (!model || !paneStructures) return;
        if (!renderTask || renderTask.generation !== generation || renderTask.request !== renderRequest) {
            renderTask = createRenderTask();
        }
        const task = renderTask;
        const frameStartedAt = now();
        let didWork = false;
        while (task.phase !== 'done') {
            if (task !== renderTask || task.generation !== generation || task.request !== renderRequest) {
                renderTask = null;
                queueRenderFrame();
                return;
            }

            if (task.workPosition >= task.workIndices.length) {
                if (task.phase === 'visible') prepareOverscan(task);
                else task.phase = 'done';
                continue;
            }

            advanceCurrentRow(task);
            didWork = true;
            if (task.phase === 'overscan' && task.context.reduced && !task.currentRow) {
                task.phase = 'done';
                task.context.reserved = 0;
            }
            if (task.phase !== 'done' && didWork
                && now() - frameStartedAt >= RENDER_BUDGETS.frameBudgetMs) {
                queueRenderFrame();
                return;
            }
        }
        commitRenderTask(task);
    }

    function emitSelectionChange() {
        onSelectionChange(selection ? {
            side: selection.side,
            anchorSourceOffset: selection.anchorSourceOffset,
            focusSourceOffset: selection.focusSourceOffset
        } : null);
    }

    function setSelection(nextSelection, shouldScroll) {
        selection = virtualNormalizeSelection(nextSelection, sources);
        emitSelectionChange();
        if (selection && shouldScroll !== false) scrollOffsetIntoView(selection.side, selection.focusSourceOffset);
        scheduleRender();
        return getSelection();
    }

    function getSelection() {
        return selection ? {
            side: selection.side,
            anchorSourceOffset: selection.anchorSourceOffset,
            focusSourceOffset: selection.focusSourceOffset
        } : null;
    }

    function selectAll(side) {
        if (side !== 'left' && side !== 'right') return null;
        return setSelection({
            side: side,
            anchorSourceOffset: 0,
            focusSourceOffset: sources[side].length
        }, false);
    }

    function getSelectedText(side) {
        const interval = virtualSelectionInterval(selection, side);
        return interval ? sources[side].slice(interval.start, interval.end) : '';
    }

    function getCopyText(side, copyOptions) {
        const opts = copyOptions || {};
        return getVirtualDiffCopyText(sources, selection, side, !!opts.wholeSource);
    }

    function getCleanCopyText(side) {
        return getVirtualDiffCleanCopyText(sources, side, cleanText);
    }

    function copyToClipboardData(side, clipboardData, copyOptions) {
        if (!clipboardData || typeof clipboardData.setData !== 'function') return false;
        const opts = copyOptions || {};
        const text = opts.clean ? getCleanCopyText(side) : getCopyText(side, opts);
        clipboardData.setData('text/plain', text);
        return true;
    }

    function handleCopy(side, event) {
        if (!model) return;
        const interval = virtualSelectionInterval(selection, side);
        if (!interval || !event.clipboardData) return;
        event.clipboardData.setData('text/plain', sources[side].slice(interval.start, interval.end));
        if (typeof event.preventDefault === 'function') event.preventDefault();
    }

    function lineIndexForOffset(side, offset) {
        const starts = side === 'left' ? model.leftLineStarts : model.rightLineStarts;
        let low = 0;
        let high = starts.length;
        while (low + 1 < high) {
            const middle = Math.floor((low + high) / 2);
            if (starts[middle] <= offset) low = middle;
            else high = middle;
        }
        return low;
    }

    function scrollOffsetIntoView(side, offset) {
        if (!model || !rowByLine[side] || !rowByLine[side].length) return;
        const lineIndex = lineIndexForOffset(side, offset);
        const rowIndex = rowByLine[side][lineIndex];
        if (rowIndex < 0) return;
        const pane = paneElements[side];
        const rowTop = rowIndex * VIRTUAL_DIFF_ROW_HEIGHT;
        const rowBottom = rowTop + VIRTUAL_DIFF_ROW_HEIGHT;
        let top = pane.scrollTop || 0;
        if (rowTop < top) top = rowTop;
        else if (rowBottom > top + pane.clientHeight) top = rowBottom - pane.clientHeight;
        if (top !== pane.scrollTop) {
            pane.scrollTop = Math.max(0, top);
            syncScrollTop(side);
        }
    }

    function moveOffsetByGrapheme(source, offset, delta) {
        const segment = delta < 0
            ? virtualGraphemeSegmentAt(source, offset - 1)
            : virtualGraphemeSegmentAt(source, offset);
        if (segment) {
            return delta < 0 ? segment.index : segment.index + segment.segment.length;
        }
        if (delta < 0) {
            if (offset <= 0) return 0;
            let next = offset - 1;
            if (next > 0 && source.charCodeAt(next) >= 0xDC00 && source.charCodeAt(next) <= 0xDFFF
                && source.charCodeAt(next - 1) >= 0xD800 && source.charCodeAt(next - 1) <= 0xDBFF) next--;
            return next;
        }
        if (offset >= source.length) return source.length;
        return Math.min(source.length, offset + codePointLengthAt(source, offset));
    }

    function snapToGraphemeBoundary(source, offset) {
        if (offset <= 0 || offset >= source.length) return virtualClamp(offset, 0, source.length);
        const segment = virtualGraphemeSegmentAt(source, offset);
        if (!segment || offset === segment.index) return offset;
        const end = segment.index + segment.segment.length;
        return offset - segment.index <= end - offset ? segment.index : end;
    }

    function moveVertical(side, offset, deltaLines) {
        const starts = side === 'left' ? model.leftLineStarts : model.rightLineStarts;
        const lineIndex = lineIndexForOffset(side, offset);
        const bounds = virtualLineBounds(sources[side], starts, lineIndex);
        const column = virtualClamp(offset - bounds.start, 0, bounds.end - bounds.start);
        const nextLine = virtualClamp(lineIndex + deltaLines, 0, starts.length - 1);
        const nextBounds = virtualLineBounds(sources[side], starts, nextLine);
        return snapToGraphemeBoundary(
            sources[side],
            nextBounds.start + Math.min(column, nextBounds.end - nextBounds.start)
        );
    }

    function handleKeyDown(side, event) {
        if (!model) return;
        const command = !!(event.ctrlKey || event.metaKey);
        if (command && String(event.key).toLowerCase() === 'a') {
            if (typeof event.preventDefault === 'function') event.preventDefault();
            selectAll(side);
            return;
        }
        if (event.key === 'Escape') {
            selection = null;
            emitSelectionChange();
            scheduleRender();
            return;
        }

        const supported = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
        if (!supported.includes(event.key)) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        const currentSelection = selection && selection.side === side ? selection : {
            side: side,
            anchorSourceOffset: 0,
            focusSourceOffset: 0
        };
        let focus = currentSelection.focusSourceOffset;
        if (event.key === 'ArrowLeft') focus = moveOffsetByGrapheme(sources[side], focus, -1);
        else if (event.key === 'ArrowRight') focus = moveOffsetByGrapheme(sources[side], focus, 1);
        else if (event.key === 'ArrowUp') focus = moveVertical(side, focus, -1);
        else if (event.key === 'ArrowDown') focus = moveVertical(side, focus, 1);
        else if (event.key === 'PageUp') {
            focus = moveVertical(side, focus, -Math.max(1, Math.floor(paneElements[side].clientHeight / VIRTUAL_DIFF_ROW_HEIGHT)));
        } else if (event.key === 'PageDown') {
            focus = moveVertical(side, focus, Math.max(1, Math.floor(paneElements[side].clientHeight / VIRTUAL_DIFF_ROW_HEIGHT)));
        } else {
            const lineIndex = lineIndexForOffset(side, focus);
            const bounds = virtualLineBounds(sources[side], side === 'left' ? model.leftLineStarts : model.rightLineStarts, lineIndex);
            focus = event.key === 'Home' ? bounds.start : bounds.end;
        }
        setSelection({
            side: side,
            anchorSourceOffset: event.shiftKey ? currentSelection.anchorSourceOffset : focus,
            focusSourceOffset: focus
        });
    }

    function sourceOffsetFromDataElement(side, element, event) {
        const pane = paneElements[side];
        if (!element || !pane.contains(element)) return null;
        let current = element && element.nodeType === 3 ? element.parentElement : element;
        while (current && pane.contains(current)) {
            if (current.getAttribute && current.hasAttribute('data-source-start')) {
                const start = Number(current.getAttribute('data-source-start'));
                const end = Number(current.getAttribute('data-source-end'));
                if (Number.isFinite(event.localSourceOffset)) {
                    return virtualClamp(start + event.localSourceOffset, start, end);
                }
                if (current.getBoundingClientRect && Number.isFinite(event.clientX)) {
                    const rect = current.getBoundingClientRect();
                    if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.right) && rect.right > rect.left) {
                        const ratio = virtualClamp((event.clientX - rect.left) / (rect.right - rect.left), 0, 1);
                        return Math.round(start + ((end - start) * ratio));
                    }
                }
                return start;
            }
            current = current.parentElement;
        }
        return null;
    }

    function nearestSourceLineForRow(side, rowIndex, direction) {
        if (!model.rows.length) return null;
        let index = virtualClamp(rowIndex, 0, model.rows.length - 1);
        const step = direction < 0 ? -1 : 1;
        while (index >= 0 && index < model.rows.length) {
            const lineIndex = sourceLineIndex(model.rows[index], side);
            if (lineIndex !== null) return lineIndex;
            index += step;
        }
        return null;
    }

    function sourceOffsetFromEvent(side, event) {
        if (Number.isFinite(event.sourceOffset)) {
            return virtualClamp(Math.floor(event.sourceOffset), 0, sources[side].length);
        }
        if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
            const caret = typeof documentRef.caretPositionFromPoint === 'function'
                ? documentRef.caretPositionFromPoint(event.clientX, event.clientY)
                : (typeof documentRef.caretRangeFromPoint === 'function'
                    ? documentRef.caretRangeFromPoint(event.clientX, event.clientY) : null);
            const caretNode = caret && (caret.offsetNode || caret.startContainer);
            const caretOffset = caret && (caret.offset !== undefined ? caret.offset : caret.startOffset);
            if (caretNode && paneElements[side].contains(caretNode) && Number.isFinite(caretOffset)) {
                const fromCaret = sourceOffsetFromDataElement(side, caretNode, {
                    localSourceOffset: caretOffset,
                    clientX: event.clientX
                });
                if (fromCaret !== null) return fromCaret;
            }
        }
        const fromData = sourceOffsetFromDataElement(side, event.target, event);
        if (fromData !== null) return fromData;
        const pane = paneElements[side];
        const rect = pane.getBoundingClientRect ? pane.getBoundingClientRect() : { top: 0, left: 0 };
        const localY = (Number(event.clientY) || rect.top) - rect.top + (pane.scrollTop || 0);
        const rowIndex = virtualClamp(Math.floor(localY / VIRTUAL_DIFF_ROW_HEIGHT), 0, model.rows.length - 1);
        let lineIndex = sourceLineIndex(model.rows[rowIndex], side);
        if (lineIndex === null) lineIndex = nearestSourceLineForRow(side, rowIndex, 1);
        if (lineIndex === null) lineIndex = nearestSourceLineForRow(side, rowIndex, -1);
        if (lineIndex === null) return 0;
        const starts = side === 'left' ? model.leftLineStarts : model.rightLineStarts;
        const bounds = virtualLineBounds(sources[side], starts, lineIndex);
        const localX = Math.max(0, (Number(event.clientX) || rect.left) - rect.left + (pane.scrollLeft || 0));
        return bounds.start + Math.min(bounds.end - bounds.start, Math.round(localX / estimatedCharacterWidth));
    }

    function isInteractiveTarget(target) {
        let current = target && target.nodeType === 3 ? target.parentElement : target;
        while (current && current !== documentRef) {
            if (current.tagName === 'BUTTON' || current.tagName === 'A') return true;
            current = current.parentElement;
        }
        return false;
    }

    function handlePointerDown(side, event) {
        if (!model || isInteractiveTarget(event.target) || (event.button !== undefined && event.button !== 0)) return;
        if (typeof paneElements[side].focus === 'function') paneElements[side].focus({ preventScroll: true });
        const offset = sourceOffsetFromEvent(side, event);
        pointerSelection = { side: side, anchor: offset, pointerId: event.pointerId };
        latestPointerEvent = event;
        if (event.currentTarget && event.currentTarget.setPointerCapture && event.pointerId !== undefined) {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        setSelection({ side: side, anchorSourceOffset: offset, focusSourceOffset: offset }, false);
        if (typeof event.preventDefault === 'function') event.preventDefault();
    }

    function updatePointerSelection(event) {
        if (!pointerSelection || !model) return;
        if (pointerSelection.pointerId !== undefined && event.pointerId !== undefined
            && pointerSelection.pointerId !== event.pointerId) return;
        latestPointerEvent = event;
        const offset = sourceOffsetFromEvent(pointerSelection.side, event);
        setSelection({
            side: pointerSelection.side,
            anchorSourceOffset: pointerSelection.anchor,
            focusSourceOffset: offset
        }, false);
        const pane = paneElements[pointerSelection.side];
        const rect = pane.getBoundingClientRect ? pane.getBoundingClientRect() : null;
        if (rect && Number.isFinite(event.clientY) && (event.clientY < rect.top || event.clientY > rect.bottom)) {
            scheduleAutoscroll();
        } else {
            cancelAutoscroll();
        }
        if (typeof event.preventDefault === 'function') event.preventDefault();
    }

    function scheduleAutoscroll() {
        if (autoscrollFrame !== null || !pointerSelection) return;
        const expectedGeneration = generation;
        autoscrollFrame = requestFrame(function runAutoscroll() {
            autoscrollFrame = null;
            if (!pointerSelection || !latestPointerEvent || expectedGeneration !== generation || destroyed) return;
            const side = pointerSelection.side;
            const pane = paneElements[side];
            const rect = pane.getBoundingClientRect ? pane.getBoundingClientRect() : null;
            if (!rect || !Number.isFinite(latestPointerEvent.clientY)) return;
            let delta = 0;
            if (latestPointerEvent.clientY < rect.top) delta = -VIRTUAL_DIFF_ROW_HEIGHT * 3;
            else if (latestPointerEvent.clientY > rect.bottom) delta = VIRTUAL_DIFF_ROW_HEIGHT * 3;
            if (!delta) return;
            pane.scrollTop = Math.max(0, (pane.scrollTop || 0) + delta);
            syncScrollTop(side);
            scheduleRender();
            const rowIndex = virtualClamp(
                Math.floor(((pane.scrollTop || 0) + (delta < 0 ? 0 : pane.clientHeight - 1)) / VIRTUAL_DIFF_ROW_HEIGHT),
                0,
                model.rows.length - 1
            );
            let lineIndex = sourceLineIndex(model.rows[rowIndex], side);
            if (lineIndex === null) lineIndex = nearestSourceLineForRow(side, rowIndex, delta < 0 ? -1 : 1);
            if (lineIndex !== null) {
                const bounds = virtualLineBounds(sources[side], side === 'left' ? model.leftLineStarts : model.rightLineStarts, lineIndex);
                setSelection({
                    side: side,
                    anchorSourceOffset: pointerSelection.anchor,
                    focusSourceOffset: delta < 0 ? bounds.start : bounds.end
                }, false);
            }
            scheduleAutoscroll();
        });
    }

    function finishPointerSelection(event) {
        if (!pointerSelection) return;
        if (event) updatePointerSelection(event);
        pointerSelection = null;
        latestPointerEvent = null;
        cancelAutoscroll();
    }

    function resetToInput(nextSources) {
        generation++;
        cancelScheduledRendering();
        cancelAutoscroll();
        pointerSelection = null;
        latestPointerEvent = null;
        pendingPreviewFocus = null;
        if (nextSources) sources = virtualNormalizeSources(nextSources);
        model = null;
        selection = null;
        rowByLine = { left: null, right: null };
        mountedRange = { first: 0, last: 0 };
        previewPageBySide.left.clear();
        previewPageBySide.right.clear();
        paneStructures = null;
        for (const side of ['left', 'right']) {
            const element = paneElements[side];
            element.classList.remove('diff-mode');
            restorePaneAttributes(element, originalAttributes[side]);
            element.scrollTop = 0;
            element.scrollLeft = 0;
            const textNode = sources[side] ? documentRef.createTextNode(sources[side]) : null;
            if (textNode) element.replaceChildren(textNode);
            else element.replaceChildren();
            if (element.style && typeof element.style.removeProperty === 'function') {
                element.style.removeProperty('--diff-row-height');
            }
        }
        emitSelectionChange();
        return api;
    }

    function countNodeTree(node) {
        let count = 0;
        const children = node && node.childNodes ? node.childNodes : [];
        for (let i = 0; i < children.length; i++) {
            count++;
            count += countNodeTree(children[i]);
        }
        return count;
    }

    function getMountedNodeCount() {
        return countNodeTree(leftElement) + countNodeTree(rightElement);
    }

    function destroy() {
        if (destroyed) return;
        resetToInput(sources);
        destroyed = true;
        generation++;
        for (const entry of listeners) {
            entry.target.removeEventListener(entry.type, entry.listener, entry.options);
        }
        listeners.length = 0;
    }

    listen(leftElement, 'scroll', function () { handleScroll('left'); });
    listen(rightElement, 'scroll', function () { handleScroll('right'); });
    listen(leftElement, 'copy', function (event) { handleCopy('left', event); });
    listen(rightElement, 'copy', function (event) { handleCopy('right', event); });
    listen(leftElement, 'keydown', function (event) { handleKeyDown('left', event); });
    listen(rightElement, 'keydown', function (event) { handleKeyDown('right', event); });
    listen(leftElement, 'pointerdown', function (event) { handlePointerDown('left', event); });
    listen(rightElement, 'pointerdown', function (event) { handlePointerDown('right', event); });
    listen(documentRef, 'pointermove', updatePointerSelection);
    listen(documentRef, 'pointerup', finishPointerSelection);
    listen(documentRef, 'pointercancel', finishPointerSelection);

    const api = {
        setResult: setResult,
        show: setResult,
        render: setResult,
        resetToInput: resetToInput,
        destroy: destroy,
        selectAll: selectAll,
        setSelection: setSelection,
        getSelection: getSelection,
        getSelectedText: getSelectedText,
        getCopyText: getCopyText,
        getCleanCopyText: getCleanCopyText,
        copyToClipboardData: copyToClipboardData,
        setPreviewPage: setPreviewPage,
        previousPreview: function (side, rowIndex) {
            return setPreviewPage(side, rowIndex, (previewPageBySide[side].get(rowIndex) || 0) - 1);
        },
        nextPreview: function (side, rowIndex) {
            return setPreviewPage(side, rowIndex, (previewPageBySide[side].get(rowIndex) || 0) + 1);
        },
        getMountedRange: function () { return { first: mountedRange.first, last: mountedRange.last }; },
        getMountedNodeCount: getMountedNodeCount,
        getSources: function () { return { left: sources.left, right: sources.right }; }
    };
    return api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.RENDER_BUDGETS = RENDER_BUDGETS;
    globalThis.computeVirtualWindow = computeVirtualWindow;
    globalThis.createVirtualDiffView = createVirtualDiffView;
    globalThis.getVirtualDiffCopyText = getVirtualDiffCopyText;
    globalThis.getVirtualDiffCleanCopyText = getVirtualDiffCleanCopyText;
}
