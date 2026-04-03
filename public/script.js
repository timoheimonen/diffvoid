(function () {
    const STORAGE_KEY = 'diffvoidcom_theme';

    function initTheme() {
        const saved = localStorage.getItem(STORAGE_KEY);
        document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(STORAGE_KEY, next);
    }

    function renderWithInvisibles(text, isMismatch) {
        var result = '';
        for (var i = 0; i < text.length; i++) {
            var char = text[i];
            var code = char.charCodeAt(0);

            if (code === 0x0020 && isMismatch) {
                result += '<span class="invisible-char invisible-regular-space" title="Space (U+0020)"></span>';
            } else if (code === 0x200B) {
                result += '<span class="invisible-char invisible-zwsp" title="Zero-width space (U+200B)"></span>';
            } else if (code === 0x200C) {
                result += '<span class="invisible-char invisible-zwnj" title="Zero-width non-joiner (U+200C)"></span>';
            } else if (code === 0x200D) {
                result += '<span class="invisible-char invisible-zwj" title="Zero-width joiner (U+200D)"></span>';
            } else if (code === 0x200A) {
                result += '<span class="invisible-char invisible-hair" title="Hair space (U+200A)"></span>';
            } else if (code === 0x00A0) {
                result += '<span class="invisible-char invisible-nbsp" title="Non-breaking space (U+00A0)"></span>';
            } else if (code === 0x202F) {
                result += '<span class="invisible-char invisible-nnbsp" title="Narrow no-break space (U+202F)"></span>';
            } else if (code === 0x00AD) {
                result += '<span class="invisible-char invisible-shy" title="Soft hyphen (U+00AD)"></span>';
            } else if (code === 0x2002) {
                result += '<span class="invisible-char invisible-ensp" title="En space (U+2002)"></span>';
            } else if (code === 0x2003) {
                result += '<span class="invisible-char invisible-emsp" title="Em space (U+2003)"></span>';
            } else if (code === 0x2009) {
                result += '<span class="invisible-char invisible-thin" title="Thin space (U+2009)"></span>';
            } else if (code === 0x2007) {
                result += '<span class="invisible-char invisible-figure" title="Figure space (U+2007)"></span>';
            } else if (code === 0x2008) {
                result += '<span class="invisible-char invisible-punct" title="Punctuation space (U+2008)"></span>';
            } else if (code === 0x205F) {
                result += '<span class="invisible-char invisible-mmsp" title="Medium mathematical space (U+205F)"></span>';
            } else if (code === 0x2060) {
                result += '<span class="invisible-char invisible-wj" title="Word joiner (U+2060)"></span>';
            } else if (code === 0xFEFF) {
                result += '<span class="invisible-char invisible-bom" title="Zero-width no-break space / BOM (U+FEFF)"></span>';
            } else if (code === 0x3000) {
                result += '<span class="invisible-char invisible-ideo" title="Ideographic space (U+3000)"></span>';
            } else if (code === 0x200E) {
                result += '<span class="invisible-char invisible-lrm" title="Left-to-right mark (U+200E)"></span>';
            } else if (code === 0x200F) {
                result += '<span class="invisible-char invisible-rlm" title="Right-to-left mark (U+200F)"></span>';
            } else if (code === 0x180E) {
                result += '<span class="invisible-char invisible-mvs" title="Mongolian vowel separator (U+180E)"></span>';
            } else if (code >= 0x2000 && code <= 0x200A) {
                result += '<span class="invisible-char invisible-space" title="Unicode space (U+' + code.toString(16).toUpperCase() + ')"></span>';
            } else {
                result += escapeHtml(char);
            }
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

        var matched = new Set();
        for (var k = 0; k < prefix; k++) matched.add(k);
        for (var k = n - suffix; k < n; k++) matched.add(k);

        var ml = m - prefix - suffix;
        var nl = n - prefix - suffix;
        if (ml === 0 || nl === 0) return matched;

        var leftCore = left.slice(prefix, m - suffix);
        var rightCore = right.slice(prefix, n - suffix);

        if (ml * nl > 1000000) {
            var charPairs = [];
            collectLcsPairsHirschberg(leftCore, rightCore, 0, leftCore.length, 0, rightCore.length, charPairs);
            for (var p = 0; p < charPairs.length; p++) {
                matched.add(prefix + charPairs[p][1]);
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
                    matched.add(prefix + j - 1);
                    i--; j--;
                } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                    i--;
                } else {
                    j--;
                }
            }
        }

        return matched;
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
                    chars: buildCharArray(rightLines[j], charMatched)
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
                var charMatchedFallback = computeCharDiff(leftLines[i], rightLines[j]);
                diff.push({
                    type: 'modified',
                    leftLineIndex: i,
                    rightLineIndex: j,
                    chars: buildCharArray(rightLines[j], charMatchedFallback)
                });
                i++;
                j++;
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
        var leftLines = left.split('\n');
        var rightLines = right.split('\n');
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

    function buildDiffHtml(diffResult) {
        var html = '';
        var lineNum = 1;

        for (var i = 0; i < diffResult.diff.length; i++) {
            var item = diffResult.diff[i];

            if (item.type === 'match') {
                var line = diffResult.rightLines[item.rightLineIndex];
                html += '<div class="diff-line">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content diff-match">' + renderWithInvisibles(line) + '</span>';
                html += '</div>';
                lineNum++;
            } else if (item.type === 'modified') {
                var line = diffResult.rightLines[item.rightLineIndex];
                html += '<div class="diff-line diff-line-mismatch">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content">';
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
                html += '</span></div>';
                lineNum++;
            } else if (item.type === 'added') {
                var line = diffResult.rightLines[item.lineIndex];
                html += '<div class="diff-line diff-line-mismatch">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content"><span class="diff-mismatch">' + renderWithInvisibles(line, true) + '</span></span>';
                html += '</div>';
                lineNum++;
            } else if (item.type === 'missing') {
                html += '<div class="diff-line diff-line-missing">';
                html += '<span class="diff-gutter"></span>';
                html += '<span class="diff-content"></span>';
                html += '</div>';
            }
        }

        return html;
    }

    function buildLeftPanelHtml(diffResult) {
        var html = '';
        var lineNum = 1;

        for (var i = 0; i < diffResult.diff.length; i++) {
            var item = diffResult.diff[i];

            if (item.type === 'match') {
                var line = diffResult.leftLines[item.leftLineIndex];
                html += '<div class="diff-line">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content">' + renderWithInvisibles(line) + '</span>';
                html += '</div>';
                lineNum++;
            } else if (item.type === 'modified') {
                var line = diffResult.leftLines[item.leftLineIndex];
                html += '<div class="diff-line">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content">' + renderWithInvisibles(line) + '</span>';
                html += '</div>';
                lineNum++;
            } else if (item.type === 'added') {
                html += '<div class="diff-line">';
                html += '<span class="diff-gutter"></span>';
                html += '<span class="diff-content"></span>';
                html += '</div>';
            } else if (item.type === 'missing') {
                var line = diffResult.leftLines[item.lineIndex];
                html += '<div class="diff-line">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content">' + renderWithInvisibles(line) + '</span>';
                html += '</div>';
                lineNum++;
            }
        }

        return html;
    }

    document.addEventListener('DOMContentLoaded', function () {
        initTheme();

        var left = document.getElementById('input-left');
        var right = document.getElementById('input-right');
        var rendering = false;

        var toggle = document.getElementById('theme-toggle');
        if (toggle) toggle.addEventListener('click', toggleTheme);

        var clearBtn = document.getElementById('clear-button');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                left.innerHTML = '';
                right.innerHTML = '';
                updateEmpty(left);
                updateEmpty(right);
                var counter = document.getElementById('mismatch-counter');
                if (counter) {
                    counter.style.display = 'none';
                    counter.classList.remove('all-match');
                }
                resetToDefault();
            });
        }

        function updateEmpty(el) {
            el.classList.toggle('is-empty', !el.textContent.trim());
        }

        function getFieldText(el) {
            var diffLines = el.querySelectorAll('.diff-line');
            if (diffLines.length === 0) return el.innerText || '';
            var parts = [];
            diffLines.forEach(function (line) {
                var gutter = line.querySelector('.diff-gutter');
                if (gutter && gutter.textContent !== '') {
                    var content = line.querySelector('.diff-content');
                    parts.push(content ? (content.textContent || '') : '');
                }
            });
            return parts.join('\n');
        }

        function compare() {
            var lt = getFieldText(left);
            var rt = getFieldText(right);

            if (!lt.length || !rt.length) {
                if (rt.length && right.querySelector('.diff-line')) {
                    rendering = true;
                    right.innerHTML = '';
                    rendering = false;
                }
                updateEmpty(right);
                var counter = document.getElementById('mismatch-counter');
                if (counter) {
                    counter.style.display = 'none';
                    counter.classList.remove('all-match');
                }
                return;
            }

            var diffResult = computeLineDiff(lt, rt);
            var rightHtml = buildDiffHtml(diffResult);
            var leftHtml = buildLeftPanelHtml(diffResult);

            var mismatchCount = 0;
            for (var i = 0; i < diffResult.diff.length; i++) {
                var type = diffResult.diff[i].type;
                if (type === 'added' || type === 'missing' || type === 'modified') {
                    mismatchCount++;
                }
            }

            var counter = document.getElementById('mismatch-counter');
            if (counter) {
                if (mismatchCount > 0) {
                    counter.textContent = mismatchCount + ' line' + (mismatchCount === 1 ? '' : 's') + ' with mismatch';
                    counter.classList.remove('all-match');
                    counter.style.display = 'block';
                } else {
                    counter.textContent = '100% Match';
                    counter.classList.add('all-match');
                    counter.style.display = 'block';
                }
            }

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

        left.addEventListener('paste', function (e) {
            e.preventDefault();
            var text = e.clipboardData.getData('text/plain');
            left.textContent = text;
            updateEmpty(left);
            compare();
        });

        right.addEventListener('paste', function (e) {
            e.preventDefault();
            var text = e.clipboardData.getData('text/plain');
            right.textContent = text;
            updateEmpty(right);
            compare();
        });

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

        left.addEventListener('copy', function (e) { copyWithoutGutters(e, left); });
        right.addEventListener('copy', function (e) { copyWithoutGutters(e, right); });

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

        if (divider) {
            divider.addEventListener('mousedown', function (e) {
                isDragging = true;
                document.body.classList.add('resizing');
                divider.classList.add('dragging');
                e.preventDefault();
            });

            divider.addEventListener('touchstart', function (e) {
                isDragging = true;
                document.body.classList.add('resizing');
                divider.classList.add('dragging');
                e.preventDefault();
            }, { passive: false });

            divider.addEventListener('dblclick', function () {
                resetToDefault();
            });
        }

        document.addEventListener('mousemove', function (e) {
            if (!isDragging) return;
            var mainRect = mainEl.getBoundingClientRect();
            var x = e.clientX - mainRect.left;
            var percent = (x / mainRect.width) * 100;
            if (percent < 15) percent = 15;
            if (percent > 85) percent = 85;
            left.style.width = 'calc(' + percent + '% - 2.5px)';
            right.style.width = 'calc(' + (100 - percent) + '% - 2.5px)';
        });

        document.addEventListener('touchmove', function (e) {
            if (!isDragging) return;
            var touch = e.touches[0];
            var mainRect = mainEl.getBoundingClientRect();
            var x = touch.clientX - mainRect.left;
            var percent = (x / mainRect.width) * 100;
            if (percent < 15) percent = 15;
            if (percent > 85) percent = 85;
            left.style.width = 'calc(' + percent + '% - 2.5px)';
            right.style.width = 'calc(' + (100 - percent) + '% - 2.5px)';
        }, { passive: false });

        document.addEventListener('mouseup', function () {
            if (isDragging) {
                isDragging = false;
                document.body.classList.remove('resizing');
                if (divider) divider.classList.remove('dragging');
            }
        });

        document.addEventListener('touchend', function () {
            if (isDragging) {
                isDragging = false;
                document.body.classList.remove('resizing');
                if (divider) divider.classList.remove('dragging');
            }
        });

        if (!left.textContent.trim()) left.innerHTML = '';
        if (!right.textContent.trim()) right.innerHTML = '';

        updateEmpty(left);
        updateEmpty(right);
    });
})();
