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

    var INVISIBLE_RENDER_META = {
        0x00A0: { cls: 'invisible-nbsp', title: 'Non-breaking space (U+00A0)' },
        0x00AD: { cls: 'invisible-shy', title: 'Soft hyphen (U+00AD)' },
        0x180E: { cls: 'invisible-mvs', title: 'Mongolian vowel separator (U+180E)' },
        0x2002: { cls: 'invisible-ensp', title: 'En space (U+2002)' },
        0x2003: { cls: 'invisible-emsp', title: 'Em space (U+2003)' },
        0x2007: { cls: 'invisible-figure', title: 'Figure space (U+2007)' },
        0x2008: { cls: 'invisible-punct', title: 'Punctuation space (U+2008)' },
        0x2009: { cls: 'invisible-thin', title: 'Thin space (U+2009)' },
        0x200A: { cls: 'invisible-hair', title: 'Hair space (U+200A)' },
        0x200B: { cls: 'invisible-zwsp', title: 'Zero-width space (U+200B)' },
        0x200C: { cls: 'invisible-zwnj', title: 'Zero-width non-joiner (U+200C)' },
        0x200D: { cls: 'invisible-zwj', title: 'Zero-width joiner (U+200D)' },
        0x200E: { cls: 'invisible-lrm', title: 'Left-to-right mark (U+200E)' },
        0x200F: { cls: 'invisible-rlm', title: 'Right-to-left mark (U+200F)' },
        0x202F: { cls: 'invisible-nnbsp', title: 'Narrow no-break space (U+202F)' },
        0x205F: { cls: 'invisible-mmsp', title: 'Medium mathematical space (U+205F)' },
        0x2060: { cls: 'invisible-wj', title: 'Word joiner (U+2060)' },
        0x3000: { cls: 'invisible-ideo', title: 'Ideographic space (U+3000)' },
        0xFEFF: { cls: 'invisible-bom', title: 'Zero-width no-break space / BOM (U+FEFF)' }
    };

    function renderInvisibleSpan(code, cls, title) {
        return '<span data-char="&#x' + code.toString(16) + ';" class="invisible-char ' + cls + '" title="' + title + '"></span>';
    }

    function renderWithInvisibles(text, isMismatch) {
        var result = '';
        for (var i = 0; i < text.length; i++) {
            var char = text[i];
            var code = char.charCodeAt(0);
            var meta = INVISIBLE_RENDER_META[code];

            if (code === 0x0020 && isMismatch) {
                result += renderInvisibleSpan(code, 'invisible-regular-space', 'Space (U+0020)');
            } else if (meta) {
                result += renderInvisibleSpan(code, meta.cls, meta.title);
            } else if (code >= 0x2000 && code <= 0x200A) {
                result += renderInvisibleSpan(code, 'invisible-space', 'Unicode space (U+' + code.toString(16).toUpperCase() + ')');
            } else {
                result += escapeHtml(char);
            }
        }
        return result;
    }

    var REMOVE_ON_COPY_CODES = {
        0x00AD: true,
        0xFEFF: true
    };

    var SPACE_ON_COPY_CODES = {
        0x00A0: true, 0x180E: true, 0x200B: true, 0x200C: true,
        0x200D: true, 0x200E: true, 0x200F: true, 0x202F: true,
        0x205F: true, 0x2060: true, 0x3000: true
    };

    function isInvisibleCode(code) {
        return REMOVE_ON_COPY_CODES[code]
            || SPACE_ON_COPY_CODES[code]
            || (code >= 0x2000 && code <= 0x200A);
    }

    function hasInvisibleCharacters(text) {
        for (var i = 0; i < text.length; i++) {
            if (isInvisibleCode(text.charCodeAt(i))) {
                return true;
            }
        }
        return false;
    }

    function stripInvisibleCharacters(text) {
        var result = '';
        for (var i = 0; i < text.length; i++) {
            var char = text[i];
            var code = char.charCodeAt(0);

            if (REMOVE_ON_COPY_CODES[code]) {
                continue;
            }

            if (SPACE_ON_COPY_CODES[code] || (code >= 0x2000 && code <= 0x200B)) {
                if (result.slice(-1) !== ' ') {
                    result += ' ';
                }
                continue;
            }

            result += char;
        }
        return result;
    }

    var MODIFIED_SIMILARITY_THRESHOLD = 0.65;
    var ALIGN_LOOKAHEAD = 4;

    function computeLCSLengthsRange(left, leftStart, leftEnd, right, rightStart, rightEnd, reverseLeft, reverseRight) {
        var m = leftEnd - leftStart;
        var n = rightEnd - rightStart;
        var prev = new Uint32Array(n + 1);
        var curr = new Uint32Array(n + 1);

        for (var i = 1; i <= m; i++) {
            curr[0] = 0;
            var leftIndex = reverseLeft ? (leftEnd - i) : (leftStart + i - 1);
            var leftValue = left[leftIndex];
            for (var j = 1; j <= n; j++) {
                var rightIndex = reverseRight ? (rightEnd - j) : (rightStart + j - 1);
                if (leftValue === right[rightIndex]) {
                    curr[j] = prev[j - 1] + 1;
                } else if (prev[j] > curr[j - 1]) {
                    curr[j] = prev[j];
                } else {
                    curr[j] = curr[j - 1];
                }
            }
            var tmp = prev;
            prev = curr;
            curr = tmp;
        }
        return prev;
    }

    function collectLcsPairsHirschberg(left, right, leftStart, leftEnd, rightStart, rightEnd, pairs) {
        var m = leftEnd - leftStart;
        var n = rightEnd - rightStart;
        if (m === 0 || n === 0) return;

        if (m === 1) {
            var leftValue = left[leftStart];
            for (var j = rightStart; j < rightEnd; j++) {
                if (leftValue === right[j]) {
                    pairs.push([leftStart, j]);
                    return;
                }
            }
            return;
        }

        var midOffset = Math.floor(m / 2);
        var leftMid = leftStart + midOffset;
        var leftLcs = computeLCSLengthsRange(left, leftStart, leftMid, right, rightStart, rightEnd, false, false);
        var rightLcs = computeLCSLengthsRange(left, leftMid, leftEnd, right, rightStart, rightEnd, true, true);

        var maxSum = -1;
        var bestJOffset = 0;
        for (var jOffset = 0; jOffset <= n; jOffset++) {
            var sum = leftLcs[jOffset] + rightLcs[n - jOffset];
            if (sum > maxSum) {
                maxSum = sum;
                bestJOffset = jOffset;
            }
        }

        var rightMid = rightStart + bestJOffset;
        collectLcsPairsHirschberg(left, right, leftStart, leftMid, rightStart, rightMid, pairs);
        collectLcsPairsHirschberg(left, right, leftMid, leftEnd, rightMid, rightEnd, pairs);
    }

    function computeCharDiff(left, right) {
        var m = left.length, n = right.length;

        var prefix = 0;
        while (prefix < m && prefix < n && left[prefix] === right[prefix]) prefix++;

        var suffix = 0;
        while (suffix < m - prefix && suffix < n - prefix
            && left[m - 1 - suffix] === right[n - 1 - suffix]) suffix++;

        var leftMatched = new Set();
        var rightMatched = new Set();
        for (var k = 0; k < prefix; k++) {
            leftMatched.add(k);
            rightMatched.add(k);
        }
        for (var k = m - suffix; k < m; k++) leftMatched.add(k);
        for (var k = n - suffix; k < n; k++) rightMatched.add(k);

        var ml = m - prefix - suffix;
        var nl = n - prefix - suffix;
        if (ml === 0 || nl === 0) return { left: leftMatched, right: rightMatched };

        var leftCore = left.slice(prefix, m - suffix);
        var rightCore = right.slice(prefix, n - suffix);

        if (ml * nl > 1000000) {
            var charPairs = [];
            collectLcsPairsHirschberg(leftCore, rightCore, 0, leftCore.length, 0, rightCore.length, charPairs);
            for (var p = 0; p < charPairs.length; p++) {
                leftMatched.add(prefix + charPairs[p][0]);
                rightMatched.add(prefix + charPairs[p][1]);
            }
        } else {
            var dp = [];
            for (var i = 0; i <= ml; i++) dp[i] = new Uint32Array(nl + 1);

            for (var i = 1; i <= ml; i++) {
                for (var j = 1; j <= nl; j++) {
                    if (leftCore[i - 1] === rightCore[j - 1]) {
                        dp[i][j] = dp[i - 1][j - 1] + 1;
                    } else if (dp[i - 1][j] > dp[i][j - 1]) {
                        dp[i][j] = dp[i - 1][j];
                    } else {
                        dp[i][j] = dp[i][j - 1];
                    }
                }
            }

            var i = ml, j = nl;
            while (i > 0 && j > 0) {
                if (leftCore[i - 1] === rightCore[j - 1]) {
                    leftMatched.add(prefix + i - 1);
                    rightMatched.add(prefix + j - 1);
                    i--; j--;
                } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                    i--;
                } else {
                    j--;
                }
            }
        }

        return { left: leftMatched, right: rightMatched };
    }


    function collectLineLcsPairs(leftLines, rightLines, pairs) {
        collectLcsPairsHirschberg(leftLines, rightLines, 0, leftLines.length, 0, rightLines.length, pairs);
    }

    function getBigrams(text) {
        var map = Object.create(null);
        if (text.length < 2) return { map: map, total: 0 };
        for (var i = 0; i < text.length - 1; i++) {
            var gram = text[i] + text[i + 1];
            map[gram] = (map[gram] || 0) + 1;
        }
        return { map: map, total: text.length - 1 };
    }

    function lineSimilarity(leftLine, rightLine) {
        if (leftLine === rightLine) return 1;
        if (!leftLine.length || !rightLine.length) return 0;

        var leftLen = leftLine.length;
        var rightLen = rightLine.length;
        var maxLen = Math.max(leftLen, rightLen);
        var minLen = Math.min(leftLen, rightLen);
        var lengthRatio = minLen / maxLen;
        if (lengthRatio < 0.4) return 0;

        var prefix = 0;
        while (prefix < minLen && leftLine[prefix] === rightLine[prefix]) prefix++;

        var suffix = 0;
        while (
            suffix < minLen - prefix
            && leftLine[leftLen - 1 - suffix] === rightLine[rightLen - 1 - suffix]
        ) {
            suffix++;
        }

        var edgeRatio = (prefix + suffix) / maxLen;
        var leftBigrams = getBigrams(leftLine);
        var rightBigrams = getBigrams(rightLine);
        var intersection = 0;
        for (var gram in leftBigrams.map) {
            if (rightBigrams.map[gram]) {
                var leftCount = leftBigrams.map[gram];
                var rightCount = rightBigrams.map[gram];
                intersection += leftCount < rightCount ? leftCount : rightCount;
            }
        }

        var denominator = leftBigrams.total + rightBigrams.total;
        var dice = denominator > 0 ? (2 * intersection) / denominator : 0;
        var weighted = (dice * 0.65) + (edgeRatio * 0.35);
        return weighted * (0.6 + 0.4 * lengthRatio);
    }

    function appendAlignedRange(leftLines, rightLines, leftStart, leftEnd, rightStart, rightEnd, diff) {
        var leftCount = leftEnd - leftStart;
        var rightCount = rightEnd - rightStart;

        if (leftCount === 0) {
            for (var ri = rightStart; ri < rightEnd; ri++) {
                diff.push({ type: 'added', lineIndex: ri });
            }
            return;
        }

        if (rightCount === 0) {
            for (var li = leftStart; li < leftEnd; li++) {
                diff.push({ type: 'missing', lineIndex: li });
            }
            return;
        }

        var i = leftStart;
        var j = rightStart;
        while (i < leftEnd && j < rightEnd) {
            var s00 = lineSimilarity(leftLines[i], rightLines[j]);

            var bestRightScore = -1;
            var bestRightSkip = 0;
            for (var rSkip = 1; rSkip <= ALIGN_LOOKAHEAD && j + rSkip < rightEnd; rSkip++) {
                var rScore = lineSimilarity(leftLines[i], rightLines[j + rSkip]);
                if (rScore > bestRightScore) {
                    bestRightScore = rScore;
                    bestRightSkip = rSkip;
                }
            }

            var bestLeftScore = -1;
            var bestLeftSkip = 0;
            for (var lSkip = 1; lSkip <= ALIGN_LOOKAHEAD && i + lSkip < leftEnd; lSkip++) {
                var lScore = lineSimilarity(leftLines[i + lSkip], rightLines[j]);
                if (lScore > bestLeftScore) {
                    bestLeftScore = lScore;
                    bestLeftSkip = lSkip;
                }
            }

            if (s00 >= MODIFIED_SIMILARITY_THRESHOLD && s00 >= bestRightScore && s00 >= bestLeftScore) {
                var charMatched = computeCharDiff(leftLines[i], rightLines[j]);
                diff.push({
                    type: 'modified',
                    leftLineIndex: i,
                    rightLineIndex: j,
                    leftChars: buildCharArray(leftLines[i], charMatched.left),
                    chars: buildCharArray(rightLines[j], charMatched.right)
                });
                i++;
                j++;
                continue;
            }

            if (bestRightScore >= MODIFIED_SIMILARITY_THRESHOLD && bestRightScore >= bestLeftScore) {
                for (var add = 0; add < bestRightSkip; add++) {
                    diff.push({ type: 'added', lineIndex: j });
                    j++;
                }
                continue;
            }

            if (bestLeftScore >= MODIFIED_SIMILARITY_THRESHOLD) {
                for (var miss = 0; miss < bestLeftSkip; miss++) {
                    diff.push({ type: 'missing', lineIndex: i });
                    i++;
                }
                continue;
            }

            var leftRemaining = leftEnd - i;
            var rightRemaining = rightEnd - j;
            if (rightRemaining > leftRemaining) {
                diff.push({ type: 'added', lineIndex: j });
                j++;
            } else if (leftRemaining > rightRemaining) {
                diff.push({ type: 'missing', lineIndex: i });
                i++;
            } else {
                var fallbackSim = lineSimilarity(leftLines[i], rightLines[j]);
                if (fallbackSim >= MODIFIED_SIMILARITY_THRESHOLD) {
                    var charMatchedFallback = computeCharDiff(leftLines[i], rightLines[j]);
                    diff.push({
                        type: 'modified',
                        leftLineIndex: i,
                        rightLineIndex: j,
                        leftChars: buildCharArray(leftLines[i], charMatchedFallback.left),
                        chars: buildCharArray(rightLines[j], charMatchedFallback.right)
                    });
                } else if (rightRemaining > leftRemaining) {
                    diff.push({ type: 'added', lineIndex: j });
                    j++;
                } else {
                    diff.push({ type: 'missing', lineIndex: i });
                    i++;
                }
            }
        }

        while (i < leftEnd) {
            diff.push({ type: 'missing', lineIndex: i });
            i++;
        }

        while (j < rightEnd) {
            diff.push({ type: 'added', lineIndex: j });
            j++;
        }
    }

    function computeLineDiff(left, right) {
        var leftTrailing = left.endsWith('\n');
        var rightTrailing = right.endsWith('\n');
        var leftLines = (leftTrailing ? left.slice(0, -1) : left).split('\n');
        var rightLines = (rightTrailing ? right.slice(0, -1) : right).split('\n');
        var diff = [];
        var pairs = [];

        collectLineLcsPairs(leftLines, rightLines, pairs);

        var leftPos = 0;
        var rightPos = 0;
        for (var p = 0; p < pairs.length; p++) {
            var pair = pairs[p];
            var leftMatch = pair[0];
            var rightMatch = pair[1];

            appendAlignedRange(leftLines, rightLines, leftPos, leftMatch, rightPos, rightMatch, diff);
            diff.push({ type: 'match', leftLineIndex: leftMatch, rightLineIndex: rightMatch });

            leftPos = leftMatch + 1;
            rightPos = rightMatch + 1;
        }

        appendAlignedRange(leftLines, rightLines, leftPos, leftLines.length, rightPos, rightLines.length, diff);

        return { leftLines: leftLines, rightLines: rightLines, diff: diff };
    }

    function buildCharArray(text, matched) {
        var result = [];
        for (var i = 0; i < text.length; i++) {
            result.push({ c: text[i], match: matched.has(i) });
        }
        return result;
    }

    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function buildPanelHtml(diffResult, side) {
        var html = '';
        var lineNum = 1;
        var isRight = side === 'right';

        for (var i = 0; i < diffResult.diff.length; i++) {
            var item = diffResult.diff[i];

            if (item.type === 'match') {
                var line = isRight ? diffResult.rightLines[item.rightLineIndex] : diffResult.leftLines[item.leftLineIndex];
                html += '<div class="diff-line">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content';
                if (isRight) html += ' diff-match';
                html += '">' + renderWithInvisibles(line) + '</span>';
                html += '</div>';
                lineNum++;
            } else if (item.type === 'modified') {
                html += '<div class="diff-line';
                if (isRight) html += ' diff-line-mismatch';
                html += '">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content">';
                if (isRight) {
                    var j = 0;
                    while (j < item.chars.length) {
                        var match = item.chars[j].match;
                        var segment = '';
                        while (j < item.chars.length && item.chars[j].match === match) {
                            segment += item.chars[j].c;
                            j++;
                        }
                        var cls = match ? 'diff-match' : 'diff-mismatch';
                        html += '<span class="' + cls + '">' + renderWithInvisibles(segment, !match) + '</span>';
                    }
                } else {
                    var lj = 0;
                    while (lj < item.leftChars.length) {
                        var lmatch = item.leftChars[lj].match;
                        var lsegment = '';
                        while (lj < item.leftChars.length && item.leftChars[lj].match === lmatch) {
                            lsegment += item.leftChars[lj].c;
                            lj++;
                        }
                        var lcls = lmatch ? 'diff-match' : 'diff-mismatch';
                        html += '<span class="' + lcls + '">' + renderWithInvisibles(lsegment, !lmatch) + '</span>';
                    }
                }
                html += '</span>';
                html += '</div>';
                lineNum++;
            } else if (item.type === 'added') {
                if (isRight) {
                    var addedLine = diffResult.rightLines[item.lineIndex];
                    html += '<div class="diff-line diff-line-mismatch">';
                    html += '<span class="diff-gutter">' + lineNum + '</span>';
                    html += '<span class="diff-content"><span class="diff-mismatch">' + renderWithInvisibles(addedLine, true) + '</span></span>';
                    html += '</div>';
                    lineNum++;
                } else {
                    html += '<div class="diff-line">';
                    html += '<span class="diff-gutter"></span>';
                    html += '<span class="diff-content"></span>';
                    html += '</div>';
                }
            } else if (item.type === 'missing') {
                if (isRight) {
                    html += '<div class="diff-line diff-line-missing">';
                    html += '<span class="diff-gutter"></span>';
                    html += '<span class="diff-content"></span>';
                    html += '</div>';
                } else {
                    var missingLine = diffResult.leftLines[item.lineIndex];
                    html += '<div class="diff-line">';
                    html += '<span class="diff-gutter">' + lineNum + '</span>';
                    html += '<span class="diff-content">' + renderWithInvisibles(missingLine) + '</span>';
                    html += '</div>';
                    lineNum++;
                }
            }
        }

        return html;
    }

    document.addEventListener('DOMContentLoaded', function () {
        initTheme();

        var left = document.getElementById('input-left');
        var right = document.getElementById('input-right');
        var rendering = false;
        var counter = document.getElementById('mismatch-counter');
        var copyCleanLeftBtn = document.getElementById('copy-clean-left');
        var copyCleanRightBtn = document.getElementById('copy-clean-right');
        var progressEl = document.getElementById('progress-indicator');

        var workerEnabled = typeof Worker !== 'undefined';
        var worker = null;
        var workerActive = false;
        var chunkBuffer = { left: '', right: '' };
        var chunkBatchCount = 0;
        var isProcessing = false;
        var storedLeftText = '';
        var storedRightText = '';
        var MAX_LINES = 25000;

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

        function cancelWorker() {
            if (worker) {
                worker.postMessage({ type: 'cancel' });
                worker.terminate();
                worker = null;
            }
            workerActive = false;
            chunkBuffer = { left: '', right: '' };
            chunkBatchCount = 0;
        }

        function initWorker(fallbackLeft, fallbackRight) {
            if (!workerEnabled) return null;
            try {
                var w = new Worker('worker.js');
                w.onmessage = handleWorkerMessage;
                w.onerror = function() {
                    workerActive = false;
                    worker = null;
                    hideProgress();
                    showProgress('Worker failed. Using fallback...');
                    setTimeout(function() {
                        hideProgress();
                        compareSync(fallbackLeft, fallbackRight);
                    }, 1500);
                };
                return w;
            } catch (e) {
                return null;
            }
        }

        function handleWorkerMessage(e) {
            var data = e.data;
            if (data.type === 'chunk') {
                chunkBuffer.left += data.leftHtml;
                chunkBuffer.right += data.rightHtml;
                chunkBatchCount++;

                showProgress('Processing ' + data.processed + ' of ' + data.total + ' entries...');

                if (chunkBatchCount >= 3) {
                    flushChunkBuffer();
                }
            } else if (data.type === 'done') {
                flushChunkBuffer();
                setCounter(data.mismatchCount);
                hideProgress();
                workerActive = false;
                isProcessing = false;

                updateEmpty(right);
                updateEmpty(left);
            } else if (data.type === 'cancelled') {
                hideProgress();
                workerActive = false;
                isProcessing = false;
            }
        }

        function flushChunkBuffer() {
            if (!chunkBuffer.left && !chunkBuffer.right) return;
            rendering = true;
            left.insertAdjacentHTML('beforeend', chunkBuffer.left);
            right.insertAdjacentHTML('beforeend', chunkBuffer.right);
            rendering = false;
            chunkBuffer = { left: '', right: '' };
            chunkBatchCount = 0;
        }

        var toggle = document.getElementById('theme-toggle');
        if (toggle) toggle.addEventListener('click', toggleTheme);

        var clearBtn = document.getElementById('clear-button');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                cancelWorker();
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
                counter.textContent = mismatchCount + ' line' + (mismatchCount === 1 ? '' : 's') + ' different';
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
            var text = '';
            for (var i = 0; i < node.childNodes.length; i++) {
                var child = node.childNodes[i];
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
            var diffLines = el.querySelectorAll('.diff-line');
            if (diffLines.length === 0) return el.textContent || '';
            var parts = [];
            diffLines.forEach(function (line) {
                var gutter = line.querySelector('.diff-gutter');
                if (gutter && gutter.textContent !== '') {
                    var content = line.querySelector('.diff-content');
                    parts.push(content ? extractText(content) : '');
                }
            });
            return parts.join('\n');
        }

        function compare() {
            var lt = storedLeftText || getFieldText(left);
            var rt = storedRightText || getFieldText(right);

            setCopyButtonVisibility(lt, rt);

            if (!lt.length || !rt.length) {
                if (rt.length && right.querySelector('.diff-line')) {
                    rendering = true;
                    right.innerHTML = '';
                    rendering = false;
                }
                if (!lt.length) { storedLeftText = ''; }
                if (!rt.length) { storedRightText = ''; }
                updateEmpty(right);
                hideCounter();
                hideProgress();
                return;
            }

            var leftLines = lt.split('\n').length;
            var rightLines = rt.split('\n').length;
            var estimatedLines = Math.max(leftLines, rightLines);

            if (estimatedLines > MAX_LINES) {
                cancelWorker();
                showProgress('File too large. Maximum ' + MAX_LINES.toLocaleString() + ' lines supported.');
                return;
            }

            if (workerEnabled && estimatedLines > 100) {
                cancelWorker();
                rendering = true;
                left.innerHTML = '';
                right.innerHTML = '';
                rendering = false;
                hideCounter();

                worker = initWorker(lt, rt);
                if (!worker) {
                    compareSync(lt, rt);
                    return;
                }

                workerActive = true;
                isProcessing = true;
                showProgress('Starting comparison...');
                worker.postMessage({ type: 'diff', left: lt, right: rt });
            } else {
                cancelWorker();
                compareSync(lt, rt);
            }
        }

        function compareSync(lt, rt) {
            var diffResult = computeLineDiff(lt, rt);
            var rightHtml = buildPanelHtml(diffResult, 'right');
            var leftHtml = buildPanelHtml(diffResult, 'left');

            var mismatchCount = 0;
            for (var i = 0; i < diffResult.diff.length; i++) {
                var type = diffResult.diff[i].type;
                if (type === 'added' || type === 'missing' || type === 'modified') {
                    mismatchCount++;
                }
            }

            setCounter(mismatchCount);

            rendering = true;
            right.innerHTML = rightHtml;
            left.innerHTML = leftHtml;
            rendering = false;

            updateEmpty(right);
            updateEmpty(left);
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
                var text = e.clipboardData.getData('text/plain');
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
            var sel = window.getSelection();
            if (!sel || sel.isCollapsed) return;
            var range = sel.getRangeAt(0);
            var fragment = range.cloneContents();
            fragment.querySelectorAll('.diff-gutter').forEach(function (g) { g.remove(); });
            var text = fragment.textContent;
            e.clipboardData.setData('text/plain', text);
            e.preventDefault();
        }

        function bindCopy(el) {
            el.addEventListener('copy', function (e) { copyWithoutGutters(e, el); });
        }

        bindCopy(left);
        bindCopy(right);

        var isSyncing = false;

        function syncScroll(src, dst) {
            if (isSyncing) return;
            isSyncing = true;

            var srcHeight = src.scrollHeight - src.clientHeight;
            var dstHeight = dst.scrollHeight - dst.clientHeight;

            if (srcHeight <= 0) {
                isSyncing = false;
                return;
            }

            var scrollRatio = src.scrollTop / srcHeight;
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

        var divider = document.getElementById('divider');
        var isDragging = false;
        var mainEl = document.querySelector('main');

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
            var mainRect = mainEl.getBoundingClientRect();
            var x = clientX - mainRect.left;
            var percent = (x / mainRect.width) * 100;
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
            var touch = e.touches[0];
            updateSplitFromClientX(touch.clientX);
        }, { passive: false });

        document.addEventListener('mouseup', stopDragging);
        document.addEventListener('touchend', stopDragging);

        function copyCleanText(side) {
            var el = side === 'left' ? left : right;
            var text = getFieldText(el);
            var cleanText = stripInvisibleCharacters(text);

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(cleanText).then(function () {
                    showCopyFeedback(side);
                }).catch(function () {
                    fallbackCopy(cleanText, side);
                });
            } else {
                fallbackCopy(cleanText, side);
            }
        }

        function fallbackCopy(text, side) {
            var textarea = document.createElement('textarea');
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
            var btn = document.getElementById('copy-clean-' + side);
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
    });
})();
