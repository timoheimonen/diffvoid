// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const panes = {
            left: document.getElementById('input-left'),
            right: document.getElementById('input-right')
        };
        const counter = document.getElementById('mismatch-counter');
        const progressEl = document.getElementById('progress-indicator');
        const renderNotice = document.getElementById('render-notice');
        const compareNotice = document.getElementById('compare-notice');
        const whitespaceToggle = document.getElementById('whitespace-toggle');
        const caseToggle = document.getElementById('case-toggle');
        const copyButtons = {
            left: document.getElementById('copy-left'),
            right: document.getElementById('copy-right')
        };
        const cleanCopyButtons = {
            left: document.getElementById('copy-clean-left'),
            right: document.getElementById('copy-clean-right')
        };
        const divider = document.getElementById('divider');
        const mainEl = document.querySelector('main');
        const openButtons = {
            left: document.getElementById('open-left'),
            right: document.getElementById('open-right')
        };
        const openLabels = {
            left: document.getElementById('open-left-label'),
            right: document.getElementById('open-right-label')
        };
        const fileInput = document.getElementById('file-input');
        const swapButton = document.getElementById('swap-button');
        const changeNav = document.getElementById('change-nav');
        const prevChangeButton = document.getElementById('prev-change');
        const nextChangeButton = document.getElementById('next-change');
        const changePosition = document.getElementById('change-position');
        const changeStats = document.getElementById('change-stats');
        const useButtons = {
            left: document.getElementById('use-left'),
            right: document.getElementById('use-right')
        };
        const undoButton = document.getElementById('undo-merge');
        const MAX_UNDO_STEPS = 20;
        const MAX_UNDO_CHARS = 8000000;
        const resultTools = document.getElementById('result-tools');
        const collapseToggle = document.getElementById('collapse-toggle');
        const unifiedToggle = document.getElementById('unified-toggle');
        const copyPatchButton = document.getElementById('copy-patch');
        const downloadPatchButton = document.getElementById('download-patch');
        const changeMap = document.getElementById('change-map');
        const changeMapCanvas = document.getElementById('change-map-canvas');
        const changeMapViewport = document.getElementById('change-map-viewport');
        const ROW_HEIGHT = 21;

        for (const side of ['left', 'right']) {
            if (!panes[side].textContent.trim()) panes[side].replaceChildren();
        }

        const state = {
            sources: {
                left: panes.left.textContent || '',
                right: panes.right.textContent || ''
            },
            mode: 'input',
            model: null,
            // File names are used for the diff headers only.
            names: { left: null, right: null },
            encodings: { left: null, right: null },
            // Texts replaced by merging, newest last. Kept in memory only.
            history: [],
            // Where to show the next result, after a merge kept one side as it was.
            pendingAnchor: null,
            // Not remembered between visits: a forgotten setting would hide
            // differences without the user noticing.
            ignoreWhitespace: false,
            ignoreCase: false
        };

        const view = createVirtualDiffView({
            leftElement: panes.left,
            rightElement: panes.right,
            document: document,
            requestAnimationFrame: window.requestAnimationFrame.bind(window),
            cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
            stripInvisibleCharacters: window.DiffCore.stripInvisibleCharacters,
            findEquivalentRanges: window.DiffCore.findCanonicallyEquivalentRanges,
            onViewChange: function () {
                updateChangePosition();
                scheduleChangeMap();
            },
            onRenderingReduced: function (message) {
                if (!renderNotice) return;
                renderNotice.textContent = message;
                renderNotice.style.display = 'block';
            }
        });

        const controller = createDiffController({
            WorkerCtor: typeof Worker === 'function' ? Worker : null,
            visibility: document,
            onStateChange: function (update) {
                if (update.state === 'starting') {
                    showProgress('Starting comparison...');
                } else if (update.state === 'computing') {
                    showProgress('Computing diff...');
                }
            },
            onProgress: function (message) {
                if (message.phase === 'line-diff') {
                    showProgress('Comparing lines...');
                } else if (message.phase === 'intraline') {
                    showProgress('Computing detailed changes...');
                }
            },
            onResult: showResult,
            onError: showComparisonError,
            syncFallback: computeModel
        });

        function showProgress(text) {
            if (!progressEl) return;
            progressEl.textContent = text;
            progressEl.style.display = 'block';
        }

        function hideProgress() {
            if (!progressEl) return;
            progressEl.style.display = 'none';
        }

        function hideCounter() {
            hideCompareNotice();
            if (!counter) return;
            counter.style.display = 'none';
            counter.classList.remove('all-match');
        }

        function rowCountText(count) {
            return count.toLocaleString() + ' row' + (count === 1 ? '' : 's');
        }

        function setCounter(model) {
            if (!counter) return;
            const mismatchCount = model.mismatchCount;
            const lineEndingRows = model.stats.lineEndingRows || 0;
            const whitespaceRows = model.stats.whitespaceRows || 0;
            const caseRows = model.stats.caseRows || 0;
            if (mismatchCount > 0) {
                counter.textContent = mismatchCount + ' difference row' + (mismatchCount === 1 ? '' : 's');
                counter.classList.remove('all-match');
            } else {
                // Rows that differ only in what the comparison sets aside are
                // not differences, but the texts are not identical either.
                counter.textContent = whitespaceRows > 0 || caseRows > 0 || lineEndingRows > 0
                    ? '0 difference rows'
                    : '100% Match';
                counter.classList.add('all-match');
            }
            counter.style.display = 'block';

            if (!compareNotice) return;
            const ignored = [];
            if (caseRows > 0) ignored.push('case ' + rowCountText(caseRows));
            if (whitespaceRows > 0) ignored.push('whitespace ' + rowCountText(whitespaceRows));
            if (lineEndingRows > 0) ignored.push('line endings ' + rowCountText(lineEndingRows));
            const notes = [];
            const movedRows = model.stats.movedRows || 0;
            const normalizationRows = model.stats.normalizationRows || 0;
            const movedChangedRows = model.stats.movedChangedRows || 0;
            if (movedRows > 0) {
                notes.push(movedRows.toLocaleString() + ' line' + (movedRows === 1 ? '' : 's') + ' moved'
                    + (movedChangedRows > 0 ? ' (' + movedChangedRows.toLocaleString() + ' changed)' : ''));
            }
            if (normalizationRows > 0) notes.push('NFC/NFD: ' + rowCountText(normalizationRows));
            if (ignored.length) notes.push('Ignored: ' + ignored.join(', '));
            compareNotice.textContent = notes.join(' · ');
            compareNotice.style.display = notes.length ? 'block' : 'none';
        }

        function hideCompareNotice() {
            if (!compareNotice) return;
            compareNotice.textContent = '';
            compareNotice.style.display = 'none';
        }

        function hideRenderNotice() {
            if (!renderNotice) return;
            renderNotice.textContent = '';
            renderNotice.style.display = 'none';
        }

        function setButtonVisible(button, visible) {
            if (!button) return;
            const isVisible = !!visible;
            button.classList.toggle('visible', isVisible);
            button.hidden = !isVisible;
            button.disabled = !isVisible;
            if (isVisible) button.removeAttribute('aria-hidden');
            else button.setAttribute('aria-hidden', 'true');
        }

        function hideResultControls() {
            for (const side of ['left', 'right']) {
                setButtonVisible(copyButtons[side], false);
                setButtonVisible(cleanCopyButtons[side], false);
            }
            if (changeNav) changeNav.hidden = true;
            if (resultTools) resultTools.hidden = true;
            if (changeMap) changeMap.hidden = true;
            changeMapRows = 0;
        }

        function showResultControls() {
            for (const side of ['left', 'right']) {
                setButtonVisible(copyButtons[side], true);
                setButtonVisible(cleanCopyButtons[side], window.DiffCore.hasInvisibleCharacters(state.sources[side]));
            }
            if (changeNav) changeNav.hidden = false;
            if (resultTools) resultTools.hidden = false;
            if (changeMap) changeMap.hidden = false;
            // A diff of the exact texts exists whenever they are not identical,
            // also when every difference is one the comparison sets aside.
            const identical = state.sources.left === state.sources.right;
            if (copyPatchButton) copyPatchButton.disabled = identical;
            if (downloadPatchButton) downloadPatchButton.disabled = identical;
            updateChangeStats();
            updateChangePosition();
            scheduleChangeMap();
        }

        function countText(count, noun) {
            return count.toLocaleString() + ' ' + noun;
        }

        function updateChangeStats() {
            if (!changeStats || !state.model) return;
            const stats = state.model.stats;
            const parts = [];
            if (stats.modifiedRows > 0) parts.push(countText(stats.modifiedRows, 'changed'));
            if (stats.missingRows > 0) parts.push(countText(stats.missingRows, 'removed'));
            if (stats.addedRows > 0) parts.push(countText(stats.addedRows, 'added'));
            changeStats.replaceChildren();
            for (const part of parts) {
                const item = document.createElement('span');
                item.textContent = part;
                changeStats.appendChild(item);
            }
            changeStats.title = parts.length ? 'Rows: ' + parts.join(', ') : '';
        }

        function updateChangePosition() {
            if (!changePosition || state.mode !== 'diff') return;
            const summary = view.getChangeSummary();
            if (!summary.total) changePosition.textContent = 'no changes';
            else if (summary.current < 0) {
                changePosition.textContent = countText(summary.total, summary.total === 1 ? 'change' : 'changes');
            } else {
                changePosition.textContent = (summary.current + 1).toLocaleString() + ' / ' + summary.total.toLocaleString();
            }
            if (prevChangeButton) prevChangeButton.disabled = !summary.total;
            if (nextChangeButton) nextChangeButton.disabled = !summary.total;
            updateMergeControls();
        }

        function updateMergeControls() {
            // Without a model the shown result is being replaced after a merge.
            const selected = state.mode === 'diff' && !!state.model && view.getChangeSummary().current >= 0;
            for (const side of ['left', 'right']) {
                if (useButtons[side]) useButtons[side].disabled = !selected;
            }
            if (undoButton) undoButton.hidden = !state.history.length;
        }

        function clearHistory() {
            state.history.length = 0;
            updateMergeControls();
        }

        // Replaces one text after a merge or an undo. The other text is
        // unchanged, so the result stays on screen and keeps its place.
        function applyMergedSource(side, text) {
            const anchor = state.mode === 'diff' ? view.getScrollAnchor(side === 'left' ? 'right' : 'left') : null;
            controller.cancel({ invalidate: true, reason: 'merge' });
            sourceRevision[side]++;
            state.sources[side] = text;
            if (state.mode !== 'diff') {
                resetToInput();
                compare();
                return;
            }
            state.model = null;
            state.pendingAnchor = anchor;
            updateMergeControls();
            compare(true);
        }

        function mergeCurrentChange(fromSide) {
            if (state.mode !== 'diff' || !state.model) return;
            const rows = view.getChangeRows(view.getChangeSummary().current);
            if (!rows) return;
            const target = fromSide === 'left' ? 'right' : 'left';
            const text = window.DiffCore.mergeDiffRows(
                state.sources.left, state.sources.right, state.model, rows.first, rows.last, fromSide
            );
            state.history.push({ side: target, text: state.sources[target] });
            // The history is bounded in steps and in the text it keeps alive.
            let kept = 0;
            for (const entry of state.history) kept += entry.text.length;
            while (state.history.length > 1
                && (state.history.length > MAX_UNDO_STEPS || kept > MAX_UNDO_CHARS)) {
                kept -= state.history.shift().text.length;
            }
            applyMergedSource(target, text);
        }

        function undoMerge() {
            const entry = state.history.pop();
            if (!entry) return;
            applyMergedSource(entry.side, entry.text);
        }

        let changeMapFrame = null;
        // The number of display rows the map was last drawn for, so that
        // scrolling does not have to ask the view for its changes again.
        let changeMapRows = 0;

        function scheduleChangeMap() {
            if (!changeMap || changeMapFrame !== null) return;
            changeMapFrame = window.requestAnimationFrame(function () {
                changeMapFrame = null;
                drawChangeMap();
                updateChangeMapViewport();
            });
        }

        function themeColor(name, fallback) {
            const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return value || fallback;
        }

        function drawChangeMap() {
            if (!changeMapCanvas || state.mode !== 'diff' || changeMap.hidden) return;
            const context = changeMapCanvas.getContext('2d');
            if (!context) return;
            const scale = window.devicePixelRatio || 1;
            const width = Math.max(1, Math.round(changeMap.clientWidth * scale));
            const height = Math.max(1, Math.round(changeMap.clientHeight * scale));
            if (changeMapCanvas.width !== width) changeMapCanvas.width = width;
            if (changeMapCanvas.height !== height) changeMapCanvas.height = height;
            context.clearRect(0, 0, width, height);
            const marks = view.getChangeMarks();
            changeMapRows = marks.rowCount;
            if (!marks.rowCount) return;
            // Short results keep the row height of the panes; long ones are
            // scaled to the height of the map.
            const rowHeight = Math.min(ROW_HEIGHT * scale, height / marks.rowCount);
            const minimum = Math.max(2, Math.round(2 * scale));
            const half = Math.floor(width / 2);
            const changed = themeColor('--diff-mismatch', '#dc2626');
            const moved = themeColor('--diff-moved', '#7c3aed');
            // One column has no left and right half to tell apart.
            const wholeWidth = view.isUnified();
            for (let i = 0; i < marks.starts.length; i++) {
                const top = Math.floor(marks.starts[i] * rowHeight);
                const size = Math.max(minimum, Math.ceil((marks.ends[i] - marks.starts[i]) * rowHeight));
                context.fillStyle = (marks.flags[i] & 4) ? moved : changed;
                if (wholeWidth) {
                    context.fillRect(1, top, width - 2, size);
                    continue;
                }
                if (marks.flags[i] & 1) context.fillRect(1, top, half - 1, size);
                if (marks.flags[i] & 2) context.fillRect(half + 1, top, width - half - 2, size);
            }
        }

        function changeMapScale() {
            const mapHeight = changeMap.clientHeight;
            if (!changeMapRows || !mapHeight) return null;
            return { rowHeight: Math.min(ROW_HEIGHT, mapHeight / changeMapRows), mapHeight: mapHeight };
        }

        function updateChangeMapViewport() {
            if (!changeMapViewport || state.mode !== 'diff' || changeMap.hidden) return;
            const mapScale = changeMapScale();
            if (!mapScale) return;
            const ratio = mapScale.rowHeight / ROW_HEIGHT;
            const top = Math.min(mapScale.mapHeight, panes.left.scrollTop * ratio);
            const height = Math.min(mapScale.mapHeight - top, panes.left.clientHeight * ratio);
            changeMapViewport.style.top = top + 'px';
            changeMapViewport.style.height = Math.max(0, height) + 'px';
        }

        function scrollFromChangeMap(event) {
            const mapScale = changeMapScale();
            if (!mapScale) return;
            const rect = changeMap.getBoundingClientRect();
            const row = (event.clientY - rect.top) / mapScale.rowHeight;
            // Scrolling the pane makes the view follow and keeps both sides in step.
            panes.left.scrollTop = Math.max(0, (row * ROW_HEIGHT) - (panes.left.clientHeight / 2));
        }

        function updateEmptyState() {
            for (const side of ['left', 'right']) {
                panes[side].classList.toggle('is-empty', state.mode === 'input' && !state.sources[side].length);
            }
        }

        function resetToInput() {
            state.mode = 'input';
            state.model = null;
            state.pendingAnchor = null;
            view.resetToInput(state.sources);
            hideResultControls();
            hideRenderNotice();
            updateEmptyState();
        }

        function showResult(model) {
            try {
                state.mode = 'diff';
                state.model = model;
                hideRenderNotice();
                const anchor = state.pendingAnchor;
                state.pendingAnchor = null;
                view.setResult({ sources: state.sources, model: model, selection: null, anchor: anchor });
            } catch (err) {
                showComparisonError({
                    message: err && err.message ? err.message : 'The comparison result could not be displayed.'
                });
                return;
            }

            setCounter(model);
            showResultControls();
            hideProgress();
            updateEmptyState();
        }

        function showComparisonError(error) {
            resetToInput();
            hideCounter();
            showProgress(error && error.message ? error.message : 'Comparison failed.');
        }

        function computeModel(leftText, rightText, request) {
            return window.DiffCore.computeDiffModel(leftText, rightText, {
                workBudget: window.DiffCore.createDiffWorkBudget(),
                ignoreWhitespace: !!(request && request.ignoreWhitespace),
                ignoreCase: !!(request && request.ignoreCase)
            });
        }

        // keepResult leaves the shown result in place until the new one arrives.
        function compare(keepResult) {
            const leftText = state.sources.left;
            const rightText = state.sources.right;

            if (!leftText.length || !rightText.length) {
                controller.cancel({ invalidate: true, reason: 'incomplete-input' });
                resetToInput();
                hideCounter();
                hideProgress();
                return;
            }

            const scan = window.DiffCore.scanDiffInput(leftText, rightText);
            const validation = window.DiffCore.validateScannedDiffInput(scan);
            if (!validation.ok) {
                controller.cancel({ invalidate: true, reason: 'invalid-input' });
                resetToInput();
                hideCounter();
                showProgress(validation.message);
                return;
            }

            const classification = window.DiffCore.classifyDiffWork(leftText, rightText, scan);
            if (!keepResult) {
                hideCounter();
                hideResultControls();
                hideRenderNotice();
            }
            controller.start({
                left: leftText,
                right: rightText,
                isSyncSafe: classification.isSyncSafe,
                ignoreWhitespace: state.ignoreWhitespace,
                ignoreCase: state.ignoreCase
            });
        }

        // Each new text for a side makes a file still being read for it stale.
        const sourceRevision = { left: 0, right: 0 };

        function replaceSource(side, text, name, encoding) {
            controller.cancel({ invalidate: true, reason: 'input-changed' });
            sourceRevision[side]++;
            state.sources[side] = text;
            state.names[side] = name || null;
            state.encodings[side] = encoding || null;
            clearHistory();
            updateFileLabels();
            resetToInput();
            compare();
        }

        function updateFileLabels() {
            for (const side of ['left', 'right']) {
                const name = state.names[side];
                const encoding = state.encodings[side];
                const note = encoding && encoding !== 'UTF-8' ? ' (' + encoding + ')' : '';
                if (openLabels[side]) openLabels[side].textContent = name ? name + note : 'open ' + side;
                if (!openButtons[side]) continue;
                openButtons[side].classList.toggle('has-file', !!name);
                openButtons[side].title = (name ? name + note + '. ' : '')
                    + 'Open a file as the ' + side + ' text. It is read in your browser and never uploaded.';
            }
        }

        function hasFiles(dataTransfer) {
            if (!dataTransfer) return false;
            if (dataTransfer.files && dataTransfer.files.length) return true;
            return !!dataTransfer.types && Array.from(dataTransfer.types).indexOf('Files') !== -1;
        }

        // Reads a local file into one side. The bytes stay in this page.
        function readFile(side, file) {
            if (!file) return;
            if (file.size > window.DiffCore.maxFileBytes) {
                showProgress('"' + file.name + '" is too large to compare.');
                return;
            }
            const revision = ++sourceRevision[side];
            file.arrayBuffer().then(function (buffer) {
                if (revision !== sourceRevision[side]) return;
                const decoded = window.DiffCore.decodeTextBytes(new Uint8Array(buffer));
                if (!decoded.ok) {
                    showProgress('"' + file.name + '": ' + decoded.message);
                    return;
                }
                replaceSource(side, decoded.text, file.name, decoded.encoding);
            }).catch(function () {
                if (revision === sourceRevision[side]) showProgress('"' + file.name + '" could not be read.');
            });
        }

        // One dropped file fills the pane it lands on; two fill both sides in order.
        function readDroppedFiles(side, files) {
            if (files.length >= 2) {
                readFile('left', files[0]);
                readFile('right', files[1]);
            } else {
                readFile(side, files[0]);
            }
        }

        function bindInput(side) {
            const element = panes[side];
            element.addEventListener('keydown', function (event) {
                if (state.mode !== 'input' || event.ctrlKey || event.metaKey || event.altKey) return;
                event.preventDefault();
            });
            element.addEventListener('paste', function (event) {
                if (!event.clipboardData) return;
                event.preventDefault();
                replaceSource(side, event.clipboardData.getData('text/plain'));
            });
            element.addEventListener('dragover', function (event) {
                if (!hasFiles(event.dataTransfer)) return;
                // Without this a pane showing a result does not accept a drop.
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                element.classList.add('drag-over');
            });
            element.addEventListener('dragleave', function () {
                element.classList.remove('drag-over');
            });
            element.addEventListener('drop', function (event) {
                element.classList.remove('drag-over');
                if (!event.dataTransfer) return;
                event.preventDefault();
                const files = event.dataTransfer.files;
                if (files && files.length) {
                    readDroppedFiles(side, files);
                    return;
                }
                replaceSource(side, event.dataTransfer.getData('text/plain'));
            });
            element.addEventListener('input', function () {
                if (state.mode !== 'input') return;
                sourceRevision[side]++;
                state.sources[side] = element.textContent || '';
                state.names[side] = null;
                state.encodings[side] = null;
                clearHistory();
                updateFileLabels();
                compare();
            });
            element.addEventListener('scroll', updateChangeMapViewport, { passive: true });
        }

        bindInput('left');
        bindInput('right');

        // A file dropped beside the panes must not replace the page.
        for (const type of ['dragover', 'drop']) {
            document.addEventListener(type, function (event) {
                if (!event.defaultPrevented && hasFiles(event.dataTransfer)) event.preventDefault();
            });
        }

        let fileInputSide = 'left';
        for (const side of ['left', 'right']) {
            if (!openButtons[side] || !fileInput) continue;
            openButtons[side].addEventListener('click', function () {
                fileInputSide = side;
                fileInput.value = '';
                fileInput.click();
            });
        }
        if (fileInput) {
            fileInput.addEventListener('change', function () {
                if (fileInput.files && fileInput.files.length) readFile(fileInputSide, fileInput.files[0]);
            });
        }

        if (swapButton) {
            swapButton.addEventListener('click', function () {
                if (!state.sources.left.length && !state.sources.right.length) return;
                controller.cancel({ invalidate: true, reason: 'swap' });
                for (const values of [state.sources, state.names, state.encodings, sourceRevision]) {
                    const left = values.left;
                    values.left = values.right;
                    values.right = left;
                }
                sourceRevision.left++;
                sourceRevision.right++;
                clearHistory();
                updateFileLabels();
                resetToInput();
                hideCounter();
                hideProgress();
                compare();
            });
        }

        function goToChange(direction) {
            if (state.mode !== 'diff') return;
            view.goToChange(direction);
        }

        if (prevChangeButton) prevChangeButton.addEventListener('click', function () { goToChange('previous'); });
        if (nextChangeButton) nextChangeButton.addEventListener('click', function () { goToChange('next'); });

        for (const side of ['left', 'right']) {
            if (useButtons[side]) useButtons[side].addEventListener('click', function () { mergeCurrentChange(side); });
        }
        if (undoButton) undoButton.addEventListener('click', undoMerge);

        document.addEventListener('keydown', function (event) {
            const overlay = document.getElementById('info-overlay');
            if (overlay && overlay.classList.contains('open')) return;
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
                && String(event.key).toLowerCase() === 'z' && state.history.length) {
                event.preventDefault();
                undoMerge();
                return;
            }
            if (state.mode !== 'diff' || event.ctrlKey || event.metaKey) return;
            let direction = null;
            if (event.altKey && !event.shiftKey && event.key === 'ArrowDown') direction = 'next';
            else if (event.altKey && !event.shiftKey && event.key === 'ArrowUp') direction = 'previous';
            else if (!event.altKey && event.key === 'F7') direction = event.shiftKey ? 'previous' : 'next';
            if (!direction) return;
            event.preventDefault();
            goToChange(direction);
        });

        if (unifiedToggle) {
            unifiedToggle.addEventListener('click', function () {
                const unified = view.setUnified(!view.isUnified());
                unifiedToggle.setAttribute('aria-pressed', String(unified));
            });
        }

        if (collapseToggle) {
            collapseToggle.addEventListener('click', function () {
                const collapsed = view.setCollapsed(!view.isCollapsed());
                collapseToggle.setAttribute('aria-pressed', String(collapsed));
            });
        }

        function createPatch() {
            if (!state.model) return '';
            return window.DiffCore.createUnifiedDiff(state.sources.left, state.sources.right, state.model, {
                leftName: state.names.left || 'left',
                rightName: state.names.right || 'right'
            });
        }

        if (copyPatchButton) {
            copyPatchButton.addEventListener('click', function () {
                const patch = createPatch();
                if (patch) copyText(patch, 'diff', copyPatchButton);
            });
        }

        if (downloadPatchButton) {
            downloadPatchButton.addEventListener('click', function () {
                const patch = createPatch();
                if (!patch) return;
                // The file is made from a Blob in this page; nothing is sent anywhere.
                const url = URL.createObjectURL(new Blob([patch], { type: 'text/plain;charset=utf-8' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = (state.names.right || state.names.left || 'comparison') + '.patch';
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                showCopyFeedback(downloadPatchButton);
            });
        }

        if (changeMap) {
            let mapPointerId = null;
            changeMap.addEventListener('pointerdown', function (event) {
                if (event.button !== 0 || state.mode !== 'diff') return;
                mapPointerId = event.pointerId;
                changeMap.setPointerCapture(event.pointerId);
                scrollFromChangeMap(event);
                event.preventDefault();
            });
            changeMap.addEventListener('pointermove', function (event) {
                if (event.pointerId === mapPointerId) scrollFromChangeMap(event);
            });
            const releaseMap = function (event) {
                if (event.pointerId === mapPointerId) mapPointerId = null;
            };
            changeMap.addEventListener('pointerup', releaseMap);
            changeMap.addEventListener('pointercancel', releaseMap);
            window.addEventListener('resize', scheduleChangeMap);
            // The marks use the theme colours.
            new MutationObserver(scheduleChangeMap).observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['data-theme']
            });
        }

        function bindOptionToggle(button, option) {
            if (!button) return;
            button.addEventListener('click', function () {
                state[option] = !state[option];
                button.setAttribute('aria-pressed', String(state[option]));
                controller.cancel({ invalidate: true, reason: 'options-changed' });
                resetToInput();
                compare();
            });
        }

        bindOptionToggle(whitespaceToggle, 'ignoreWhitespace');
        bindOptionToggle(caseToggle, 'ignoreCase');

        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.addEventListener('click', window.diffvoidTheme.toggleTheme);

        const clearButton = document.getElementById('clear-button');
        if (clearButton) {
            clearButton.addEventListener('click', function () {
                controller.cancel({ invalidate: true, reason: 'clear' });
                state.sources.left = '';
                state.sources.right = '';
                for (const side of ['left', 'right']) {
                    sourceRevision[side]++;
                    state.names[side] = null;
                    state.encodings[side] = null;
                }
                clearHistory();
                updateFileLabels();
                resetToInput();
                hideCounter();
                hideProgress();
                resetDivider();
            });
        }

        const infoButton = document.getElementById('info-btn');
        const infoOverlay = document.getElementById('info-overlay');
        const infoWindow = document.getElementById('info-window');
        const infoCloseButton = document.getElementById('info-close-btn');

        if (infoButton && infoOverlay && infoWindow && infoCloseButton) {
            let infoReturnFocus = null;
            let pointerDownOnBackdrop = false;

            function isInfoOpen() {
                return infoOverlay.classList.contains('open');
            }

            function openInfo() {
                infoReturnFocus = document.activeElement;
                infoOverlay.classList.add('open');
                infoButton.setAttribute('aria-expanded', 'true');
                infoCloseButton.focus({ preventScroll: true });
            }

            function closeInfo() {
                infoOverlay.classList.remove('open');
                infoButton.setAttribute('aria-expanded', 'false');
                const canReturn = infoReturnFocus && infoReturnFocus !== document.body && document.contains(infoReturnFocus);
                const target = canReturn ? infoReturnFocus : infoButton;
                target.focus({ preventScroll: true });
                infoReturnFocus = null;
            }

            infoButton.addEventListener('click', openInfo);
            infoCloseButton.addEventListener('click', closeInfo);

            // Keep Tab focus inside the dialog while it is open
            infoWindow.addEventListener('keydown', function (event) {
                if (event.key !== 'Tab') return;
                const focusables = infoWindow.querySelectorAll('button, a[href]');
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            });

            document.addEventListener('keydown', function (event) {
                if (event.key === 'Escape' && isInfoOpen()) closeInfo();
            });

            // Close on a click that both starts and ends on the backdrop, so a
            // text selection dragged out of the dialog does not close it
            infoOverlay.addEventListener('pointerdown', function (event) {
                pointerDownOnBackdrop = event.target === infoOverlay;
            });
            infoOverlay.addEventListener('click', function (event) {
                if (pointerDownOnBackdrop && event.target === infoOverlay) closeInfo();
                pointerDownOnBackdrop = false;
            });
        }

        async function copyText(text, side, button) {
            try {
                await navigator.clipboard.writeText(text);
                showCopyFeedback(button);
            } catch (err) {
                console.error('Failed to copy ' + side + ' text:', err);
            }
        }

        function showCopyFeedback(button) {
            if (!button) return;
            button.classList.add('copy-success');
            setTimeout(function () {
                button.classList.remove('copy-success');
            }, 1200);
        }

        for (const side of ['left', 'right']) {
            if (copyButtons[side]) {
                copyButtons[side].addEventListener('click', function () {
                    copyText(state.sources[side], side, copyButtons[side]);
                });
            }
            if (cleanCopyButtons[side]) {
                cleanCopyButtons[side].addEventListener('click', function () {
                    copyText(
                        window.DiffCore.stripInvisibleCharacters(state.sources[side]),
                        side,
                        cleanCopyButtons[side]
                    );
                });
            }
        }

        let activePointerId = null;

        function setDividerPercent(percent) {
            const value = Math.max(15, Math.min(85, percent));
            panes.left.style.width = 'calc(' + value + '% - 2.5px)';
            panes.right.style.width = 'calc(' + (100 - value) + '% - 2.5px)';
            if (divider) divider.setAttribute('aria-valuenow', String(Math.round(value)));
        }

        function resetDivider() {
            setDividerPercent(50);
        }

        function startDragging(event) {
            if (event.isPrimary === false || event.button !== 0 || activePointerId !== null) return;
            activePointerId = event.pointerId;
            document.body.classList.add('resizing');
            divider.classList.add('dragging');
            updateSplitFromClientX(event.clientX);
            event.preventDefault();
        }

        function stopDragging(event) {
            if (event.pointerId !== activePointerId) return;
            activePointerId = null;
            document.body.classList.remove('resizing');
            divider.classList.remove('dragging');
        }

        function updateSplitFromClientX(clientX) {
            const mainRect = mainEl.getBoundingClientRect();
            setDividerPercent(((clientX - mainRect.left) / mainRect.width) * 100);
        }

        if (divider) {
            divider.addEventListener('pointerdown', startDragging);
            divider.addEventListener('dblclick', resetDivider);
            divider.addEventListener('keydown', function (event) {
                const current = Number(divider.getAttribute('aria-valuenow')) || 50;
                if (event.key === 'ArrowLeft') setDividerPercent(current - 2);
                else if (event.key === 'ArrowRight') setDividerPercent(current + 2);
                else if (event.key === 'Home') setDividerPercent(15);
                else if (event.key === 'End') setDividerPercent(85);
                else return;
                event.preventDefault();
            });
        }

        document.addEventListener('pointermove', function (event) {
            if (event.pointerId === activePointerId) updateSplitFromClientX(event.clientX);
        });
        document.addEventListener('pointerup', stopDragging);
        document.addEventListener('pointercancel', stopDragging);

        window.addEventListener('beforeunload', function () {
            controller.destroy();
            view.destroy();
        });

        hideResultControls();
        hideRenderNotice();
        resetDivider();
        updateEmptyState();
    });
})();
