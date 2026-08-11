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

        for (const side of ['left', 'right']) {
            if (!panes[side].textContent.trim()) panes[side].replaceChildren();
        }

        const state = {
            sources: {
                left: panes.left.textContent || '',
                right: panes.right.textContent || ''
            },
            mode: 'input'
        };

        const view = createVirtualDiffView({
            leftElement: panes.left,
            rightElement: panes.right,
            document: document,
            requestAnimationFrame: window.requestAnimationFrame.bind(window),
            cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
            stripInvisibleCharacters: window.DiffCore.stripInvisibleCharacters,
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
            if (!counter) return;
            counter.style.display = 'none';
            counter.classList.remove('all-match');
        }

        function setCounter(mismatchCount) {
            if (!counter) return;
            if (mismatchCount > 0) {
                counter.textContent = mismatchCount + ' difference row' + (mismatchCount === 1 ? '' : 's');
                counter.classList.remove('all-match');
            } else {
                counter.textContent = '100% Match';
                counter.classList.add('all-match');
            }
            counter.style.display = 'block';
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
        }

        function showResultControls() {
            for (const side of ['left', 'right']) {
                setButtonVisible(copyButtons[side], true);
                setButtonVisible(cleanCopyButtons[side], window.DiffCore.hasInvisibleCharacters(state.sources[side]));
            }
        }

        function updateEmptyState() {
            for (const side of ['left', 'right']) {
                panes[side].classList.toggle('is-empty', state.mode === 'input' && !state.sources[side].length);
            }
        }

        function resetToInput() {
            state.mode = 'input';
            view.resetToInput(state.sources);
            hideResultControls();
            hideRenderNotice();
            updateEmptyState();
        }

        function showResult(model) {
            try {
                state.mode = 'diff';
                hideRenderNotice();
                view.setResult({ sources: state.sources, model: model, selection: null });
            } catch (err) {
                showComparisonError({
                    message: err && err.message ? err.message : 'The comparison result could not be displayed.'
                });
                return;
            }

            setCounter(model.mismatchCount);
            showResultControls();
            hideProgress();
            updateEmptyState();
        }

        function showComparisonError(error) {
            resetToInput();
            hideCounter();
            showProgress(error && error.message ? error.message : 'Comparison failed.');
        }

        function computeModel(leftText, rightText) {
            return window.DiffCore.computeDiffModel(leftText, rightText, {
                workBudget: window.DiffCore.createDiffWorkBudget()
            });
        }

        function compare() {
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
            hideCounter();
            hideResultControls();
            hideRenderNotice();
            controller.start({
                left: leftText,
                right: rightText,
                isSyncSafe: classification.isSyncSafe
            });
        }

        function replaceSource(side, text) {
            controller.cancel({ invalidate: true, reason: 'input-changed' });
            state.sources[side] = text;
            resetToInput();
            compare();
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
            element.addEventListener('drop', function (event) {
                if (!event.dataTransfer) return;
                event.preventDefault();
                replaceSource(side, event.dataTransfer.getData('text/plain'));
            });
            element.addEventListener('input', function () {
                if (state.mode !== 'input') return;
                state.sources[side] = element.textContent || '';
                compare();
            });
        }

        bindInput('left');
        bindInput('right');

        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.addEventListener('click', window.diffvoidTheme.toggleTheme);

        const clearButton = document.getElementById('clear-button');
        if (clearButton) {
            clearButton.addEventListener('click', function () {
                controller.cancel({ invalidate: true, reason: 'clear' });
                state.sources.left = '';
                state.sources.right = '';
                resetToInput();
                hideCounter();
                hideProgress();
                resetDivider();
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
