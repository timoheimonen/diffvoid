// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

(function () {
    function initTheme() {
        if (window.diffvoidTheme && typeof window.diffvoidTheme.initTheme === 'function') {
            window.diffvoidTheme.initTheme();
        }
    }

    function toggleTheme() {
        if (window.diffvoidTheme && typeof window.diffvoidTheme.toggleTheme === 'function') {
            window.diffvoidTheme.toggleTheme();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initTheme();

        const left = document.getElementById('input-left');
        const right = document.getElementById('input-right');
        let rendering = false;
        const counter = document.getElementById('mismatch-counter');
        const copyCleanLeftBtn = document.getElementById('copy-clean-left');
        const copyCleanRightBtn = document.getElementById('copy-clean-right');
        const progressEl = document.getElementById('progress-indicator');

        let chunkBuffer = { left: '', right: '' };
        let chunkBatchCount = 0;
        let isProcessing = false;
        let storedLeftText = '';
        let storedRightText = '';
        const controller = createDiffController({
            WorkerCtor: typeof Worker === 'function' ? Worker : null,
            visibility: document,
            onStateChange: function (update) {
                if (update.state === 'starting') {
                    isProcessing = true;
                    showProgress('Starting comparison...');
                } else if (update.state === 'computing') {
                    showProgress('Computing diff...');
                } else if (update.state === 'cancelled') {
                    isProcessing = false;
                }
            },
            onProgress: function (message) {
                if (message.type === 'diff:chunk') {
                    chunkBuffer.left += message.leftHtml;
                    chunkBuffer.right += message.rightHtml;
                    chunkBatchCount++;
                    showProgress('Processing ' + message.processed + ' of ' + message.total + ' entries...');

                    if (chunkBatchCount >= 3) flushChunkBuffer();
                    return;
                }

                if (message.phase === 'diff') {
                    showProgress('Computing diff...');
                }
            },
            onResult: function (model) {
                if (model && model.leftHtml !== undefined && model.rightHtml !== undefined) {
                    rendering = true;
                    left.innerHTML = model.leftHtml;
                    right.innerHTML = model.rightHtml;
                    rendering = false;
                } else {
                    flushChunkBuffer();
                }

                setCounter(model && Number.isFinite(model.mismatchCount) ? model.mismatchCount : 0);
                hideProgress();
                isProcessing = false;
                updateEmpty(right);
                updateEmpty(left);
            },
            onError: function (error) {
                resetChunkBuffer();
                hideCounter();
                showProgress(error && error.message ? error.message : 'Comparison failed.');
                isProcessing = false;
            },
            syncFallback: computeLegacyResult
        });

        function setCopyButtonVisibility(leftText, rightText) {
            if (copyCleanLeftBtn) {
                copyCleanLeftBtn.classList.toggle('visible', hasInvisibleCharacters(leftText));
            }
            if (copyCleanRightBtn) {
                copyCleanRightBtn.classList.toggle('visible', hasInvisibleCharacters(rightText));
            }
        }

        function showProgress(text) {
            if (!progressEl) return;
            progressEl.textContent = text;
            progressEl.style.display = 'block';
        }

        function hideProgress() {
            if (!progressEl) return;
            progressEl.style.display = 'none';
        }

        function resetChunkBuffer() {
            chunkBuffer = { left: '', right: '' };
            chunkBatchCount = 0;
        }

        function cancelComparison(invalidate) {
            controller.cancel({ invalidate: invalidate !== false });
            resetChunkBuffer();
        }

        function flushChunkBuffer() {
            if (!chunkBuffer.left && !chunkBuffer.right) return;
            rendering = true;
            left.insertAdjacentHTML('beforeend', chunkBuffer.left);
            right.insertAdjacentHTML('beforeend', chunkBuffer.right);
            rendering = false;
            resetChunkBuffer();
        }

        const toggle = document.getElementById('theme-toggle');
        if (toggle) toggle.addEventListener('click', toggleTheme);

        const clearBtn = document.getElementById('clear-button');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                cancelComparison(true);
                storedLeftText = '';
                storedRightText = '';
                left.innerHTML = '';
                right.innerHTML = '';
                updateEmpty(left);
                updateEmpty(right);
                hideCounter();
                hideProgress();
                if (copyCleanLeftBtn) copyCleanLeftBtn.classList.remove('visible');
                if (copyCleanRightBtn) copyCleanRightBtn.classList.remove('visible');
                resetToDefault();
            });
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

        function updateEmpty(el) {
            el.classList.toggle('is-empty', !el.textContent.trim());
        }

        function extractText(node) {
            let text = '';
            for (let i = 0; i < node.childNodes.length; i++) {
                const child = node.childNodes[i];
                if (child.nodeType === Node.TEXT_NODE) {
                    text += child.nodeValue;
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    if (child.hasAttribute('data-char')) {
                        text += child.getAttribute('data-char');
                    } else {
                        text += extractText(child);
                    }
                }
            }
            return text;
        }

        function getFieldText(el) {
            const diffLines = el.querySelectorAll('.diff-line');
            if (diffLines.length === 0) return el.textContent || '';
            const parts = [];
            diffLines.forEach(function (line) {
                const gutter = line.querySelector('.diff-gutter');
                if (gutter && gutter.textContent !== '') {
                    const content = line.querySelector('.diff-content');
                    parts.push(content ? extractText(content) : '');
                }
            });
            return parts.join('\n');
        }

        function compare() {
            const lt = storedLeftText || getFieldText(left);
            const rt = storedRightText || getFieldText(right);

            setCopyButtonVisibility(lt, rt);

            if (!lt.length || !rt.length) {
                cancelComparison(true);
                rendering = true;
                if (lt.length) {
                    left.textContent = lt;
                    storedLeftText = lt;
                } else {
                    left.innerHTML = '';
                    storedLeftText = '';
                }
                if (rt.length) {
                    right.textContent = rt;
                    storedRightText = rt;
                } else {
                    right.innerHTML = '';
                    storedRightText = '';
                }
                rendering = false;
                updateEmpty(left);
                updateEmpty(right);
                hideCounter();
                hideProgress();
                return;
            }

            const validation = validateDiffInput(lt, rt);
            if (!validation.ok) {
                cancelComparison(true);
                hideCounter();
                showProgress(validation.message);
                return;
            }

            const estimatedLines = validation.estimatedLines;
            cancelComparison(false);
            rendering = true;
            left.innerHTML = '';
            right.innerHTML = '';
            rendering = false;
            hideCounter();

            controller.start({
                left: lt,
                right: rt,
                isSyncSafe: estimatedLines <= 100,
                syncFallback: computeLegacyResult
            });
        }

        function computeLegacyResult(lt, rt) {
            let diffResult;
            diffResult = computeLineDiff(lt, rt);
            const rightHtml = buildPanelHtml(diffResult, 'right');
            const leftHtml = buildPanelHtml(diffResult, 'left');
            const mismatchCount = countDifferenceRows(diffResult);

            return {
                version: 1,
                leftHtml: leftHtml,
                rightHtml: rightHtml,
                mismatchCount: mismatchCount
            };
        }

        function preventTyping(e) {
            if (e.ctrlKey || e.metaKey) return;
            e.preventDefault();
        }

        left.addEventListener('keydown', preventTyping);
        right.addEventListener('keydown', preventTyping);

        function bindPaste(el) {
            el.addEventListener('paste', function (e) {
                e.preventDefault();
                const text = e.clipboardData.getData('text/plain');
                el.textContent = text;
                updateEmpty(el);
                if (el === left) {
                    storedLeftText = text;
                } else {
                    storedRightText = text;
                }
                compare();
            });
        }

        bindPaste(left);
        bindPaste(right);

        function copyWithoutGutters(e, el) {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) return;
            const range = sel.getRangeAt(0);
            const fragment = range.cloneContents();
            const diffLines = fragment.querySelectorAll('.diff-line');
            let text = '';
            if (diffLines.length) {
                const parts = [];
                diffLines.forEach(function (line) {
                    const gutter = line.querySelector('.diff-gutter');
                    const content = line.querySelector('.diff-content');
                    if (gutter && gutter.textContent === '' && (!content || content.textContent === '')) return;
                    parts.push(content ? extractText(content) : '');
                });
                text = parts.join('\n');
            } else {
                fragment.querySelectorAll('.diff-gutter').forEach(function (g) { g.remove(); });
                text = extractText(fragment);
            }
            e.clipboardData.setData('text/plain', text);
            e.preventDefault();
        }

        function bindCopy(el) {
            el.addEventListener('copy', function (e) { copyWithoutGutters(e, el); });
        }

        bindCopy(left);
        bindCopy(right);

        let isSyncing = false;

        function syncScroll(src, dst) {
            if (isSyncing) return;
            isSyncing = true;

            const srcHeight = src.scrollHeight - src.clientHeight;
            const dstHeight = dst.scrollHeight - dst.clientHeight;

            if (srcHeight <= 0) {
                isSyncing = false;
                return;
            }

            const scrollRatio = src.scrollTop / srcHeight;
            dst.scrollTop = scrollRatio * dstHeight;

            setTimeout(function () {
                isSyncing = false;
            }, 10);
        }

        left.addEventListener('scroll', function () {
            syncScroll(left, right);
        });

        right.addEventListener('scroll', function () {
            syncScroll(right, left);
        });

        const divider = document.getElementById('divider');
        let isDragging = false;
        const mainEl = document.querySelector('main');

        function resetToDefault() {
            left.style.width = 'calc(50% - 2.5px)';
            right.style.width = 'calc(50% - 2.5px)';
        }

        function startDragging(e) {
            isDragging = true;
            document.body.classList.add('resizing');
            divider.classList.add('dragging');
            e.preventDefault();
        }

        function stopDragging() {
            if (!isDragging) return;
            isDragging = false;
            document.body.classList.remove('resizing');
            if (divider) divider.classList.remove('dragging');
        }

        function updateSplitFromClientX(clientX) {
            const mainRect = mainEl.getBoundingClientRect();
            const x = clientX - mainRect.left;
            let percent = (x / mainRect.width) * 100;
            if (percent < 15) percent = 15;
            if (percent > 85) percent = 85;
            left.style.width = 'calc(' + percent + '% - 2.5px)';
            right.style.width = 'calc(' + (100 - percent) + '% - 2.5px)';
        }

        if (divider) {
            divider.addEventListener('mousedown', startDragging);
            divider.addEventListener('touchstart', startDragging, { passive: false });

            divider.addEventListener('dblclick', function () {
                resetToDefault();
            });
        }

        document.addEventListener('mousemove', function (e) {
            if (!isDragging) return;
            updateSplitFromClientX(e.clientX);
        });

        document.addEventListener('touchmove', function (e) {
            if (!isDragging) return;
            const touch = e.touches[0];
            updateSplitFromClientX(touch.clientX);
        }, { passive: false });

        document.addEventListener('mouseup', stopDragging);
        document.addEventListener('touchend', stopDragging);

        async function copyCleanText(side) {
            const el = side === 'left' ? left : right;
            const text = getFieldText(el);
            const cleanText = stripInvisibleCharacters(text);

            if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(cleanText);
                    showCopyFeedback(side);
                } catch (err) {
                    fallbackCopy(cleanText, side);
                }
            } else {
                fallbackCopy(cleanText, side);
            }
        }

        function fallbackCopy(text, side) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                showCopyFeedback(side);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
            document.body.removeChild(textarea);
        }

        function showCopyFeedback(side) {
            const btn = document.getElementById('copy-clean-' + side);
            if (!btn) return;
            btn.classList.add('copy-success');
            setTimeout(function () {
                btn.classList.remove('copy-success');
            }, 1200);
        }

        if (copyCleanLeftBtn) {
            copyCleanLeftBtn.addEventListener('click', function () {
                copyCleanText('left');
            });
        }

        if (copyCleanRightBtn) {
            copyCleanRightBtn.addEventListener('click', function () {
                copyCleanText('right');
            });
        }

        if (!left.textContent.trim()) left.innerHTML = '';
        if (!right.textContent.trim()) right.innerHTML = '';

        updateEmpty(left);
        updateEmpty(right);

        window.addEventListener('beforeunload', function () {
            controller.destroy();
        });
    });
})();
