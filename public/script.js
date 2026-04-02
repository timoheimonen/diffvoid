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

    function computeCharDiff(left, right) {
        const m = left.length, n = right.length;

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

        if (ml * nl > 5000000) return matched;

        var dp = [];
        for (var i = 0; i <= ml; i++) dp[i] = new Uint16Array(nl + 1);

        for (var i = 1; i <= ml; i++) {
            for (var j = 1; j <= nl; j++) {
                if (left[prefix + i - 1] === right[prefix + j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        var i = ml, j = nl;
        while (i > 0 && j > 0) {
            if (left[prefix + i - 1] === right[prefix + j - 1]) {
                matched.add(prefix + j - 1);
                i--; j--;
            } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }

        return matched;
    }


    function computeLineDiff(left, right) {
        var leftLines = left.split('\n');
        var rightLines = right.split('\n');

        var lm = leftLines.length;
        var rm = rightLines.length;

        if (lm === 0 && rm === 0) return { leftLines: [], rightLines: [], diff: [] };
        if (lm === 0) return { leftLines: [], rightLines: rightLines, diff: rightLines.map(function (_, i) { return { type: 'added', lineIndex: i }; }) };
        if (rm === 0) return { leftLines: leftLines, rightLines: [], diff: leftLines.map(function (_, i) { return { type: 'missing', lineIndex: i }; }) };

        var dp = [];
        for (var i = 0; i <= lm; i++) dp[i] = new Uint16Array(rm + 1);

        for (var i = 1; i <= lm; i++) {
            for (var j = 1; j <= rm; j++) {
                if (leftLines[i - 1] === rightLines[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        var matchedLeft = new Set();
        var matchedRight = new Set();

        var i = lm, j = rm;
        while (i > 0 && j > 0) {
            if (leftLines[i - 1] === rightLines[j - 1]) {
                matchedLeft.add(i - 1);
                matchedRight.add(j - 1);
                i--; j--;
            } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }

        var diff = [];
        var leftIdx = 0, rightIdx = 0;
        var leftMissingStart = -1;

        while (leftIdx < lm || rightIdx < rm) {
            var leftMatched = leftIdx < lm && matchedLeft.has(leftIdx);
            var rightMatched = rightIdx < rm && matchedRight.has(rightIdx);

            if (leftIdx >= lm) {
                diff.push({ type: 'added', lineIndex: rightIdx });
                rightIdx++;
            } else if (rightIdx >= rm) {
                diff.push({ type: 'missing', lineIndex: leftIdx });
                leftIdx++;
            } else if (leftMatched && rightMatched) {
                diff.push({ type: 'match', leftLineIndex: leftIdx, rightLineIndex: rightIdx });
                leftIdx++;
                rightIdx++;
            } else if (!leftMatched && rightMatched) {
                var charMatched = computeCharDiff(leftLines[leftIdx], rightLines[rightIdx]);
                diff.push({ type: 'modified', leftLineIndex: leftIdx, rightLineIndex: rightIdx, chars: buildCharArray(rightLines[rightIdx], charMatched) });
                leftIdx++;
                rightIdx++;
            } else if (leftMatched && !rightMatched) {
                diff.push({ type: 'missing', lineIndex: leftIdx });
                leftIdx++;
            } else {
                var charMatched = computeCharDiff(leftLines[leftIdx], rightLines[rightIdx]);
                diff.push({ type: 'modified', leftLineIndex: leftIdx, rightLineIndex: rightIdx, chars: buildCharArray(rightLines[rightIdx], charMatched) });
                leftIdx++;
                rightIdx++;
            }
        }

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
                html += '<span class="diff-content diff-match">' + escapeHtml(line) + '</span>';
                html += '</div>';
                lineNum++;
            } else if (item.type === 'modified') {
                var line = diffResult.rightLines[item.rightLineIndex];
                html += '<div class="diff-line diff-line-mismatch">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content diff-mismatch">';
                for (var j = 0; j < item.chars.length; j++) {
                    var cls = item.chars[j].match ? 'diff-match' : 'diff-mismatch';
                    html += '<span class="' + cls + '">' + escapeHtml(item.chars[j].c) + '</span>';
                }
                html += '</span></div>';
                lineNum++;
            } else if (item.type === 'added') {
                var line = diffResult.rightLines[item.lineIndex];
                html += '<div class="diff-line diff-line-mismatch">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content diff-mismatch">' + escapeHtml(line) + '</span>';
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
                html += '<span class="diff-content">' + escapeHtml(line) + '</span>';
                html += '</div>';
                lineNum++;
            } else if (item.type === 'modified') {
                var line = diffResult.leftLines[item.leftLineIndex];
                html += '<div class="diff-line">';
                html += '<span class="diff-gutter">' + lineNum + '</span>';
                html += '<span class="diff-content">' + escapeHtml(line) + '</span>';
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
                html += '<span class="diff-content">' + escapeHtml(line) + '</span>';
                html += '</div>';
                lineNum++;
            }
        }

        return html;
    }

    function getRightLineCount(diffResult) {
        var count = 0;
        for (var i = 0; i < diffResult.diff.length; i++) {
            if (diffResult.diff[i].type !== 'missing') {
                count++;
            }
        }
        return count;
    }

    function getLeftLineCount(diffResult) {
        var count = 0;
        for (var i = 0; i < diffResult.diff.length; i++) {
            if (diffResult.diff[i].type !== 'added') {
                count++;
            }
        }
        return count;
    }

    function saveCaret(el) {
        var sel = window.getSelection();
        if (!sel.rangeCount || !el.contains(sel.focusNode)) return -1;
        var range = sel.getRangeAt(0).cloneRange();
        range.selectNodeContents(el);
        range.setEnd(sel.focusNode, sel.focusOffset);
        return range.toString().length;
    }

    function restoreCaret(el, offset) {
        if (offset < 0) return;
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        var pos = 0;
        while (walker.nextNode()) {
            var node = walker.currentNode;
            if (pos + node.length >= offset) {
                var range = document.createRange();
                range.setStart(node, offset - pos);
                range.collapse(true);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                return;
            }
            pos += node.length;
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initTheme();

        var toggle = document.getElementById('theme-toggle');
        if (toggle) toggle.addEventListener('click', toggleTheme);

        var left = document.getElementById('input-left');
        var right = document.getElementById('input-right');
        var rendering = false;
        var timer = null;

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

            if (!lt.trim() || !rt.trim()) {
                if (rt.trim() && right.querySelector('.diff-line')) {
                    rendering = true;
                    right.innerHTML = '';
                    rendering = false;
                }
                updateEmpty(right);
                return;
            }

            var diffResult = computeLineDiff(lt, rt);
            var rightHtml = buildDiffHtml(diffResult);
            var leftHtml = buildLeftPanelHtml(diffResult);

            var focused = document.activeElement === right;
            var pos = focused ? saveCaret(right) : -1;

            rendering = true;
            right.innerHTML = rightHtml;
            left.innerHTML = leftHtml;
            rendering = false;

            if (focused) restoreCaret(right, pos);
            updateEmpty(right);
            updateEmpty(left);
        }

        function scheduleCompare() {
            clearTimeout(timer);
            timer = setTimeout(compare, 300);
        }

        left.addEventListener('input', function () {
            updateEmpty(left);
            scheduleCompare();
        });

        right.addEventListener('input', function () {
            if (rendering) return;
            updateEmpty(right);
            scheduleCompare();
        });

        left.addEventListener('paste', function (e) {
            e.preventDefault();
            var text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        });

        right.addEventListener('paste', function (e) {
            e.preventDefault();
            var text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        });

        function copyWithoutGutters(e, el) {
            var sel = window.getSelection();
            if (!sel || sel.isCollapsed) return;
            // Walk selected nodes; skip .diff-gutter nodes
            var range = sel.getRangeAt(0);
            var fragment = range.cloneContents();
            fragment.querySelectorAll('.diff-gutter').forEach(function (g) { g.remove(); });
            var text = fragment.textContent;
            e.clipboardData.setData('text/plain', text);
            e.preventDefault();
        }

        left.addEventListener('copy', function (e) { copyWithoutGutters(e, left); });
        right.addEventListener('copy', function (e) { copyWithoutGutters(e, right); });

        function syncScroll(src, dst) {
            dst.scrollTop = src.scrollTop;
        }

        left.addEventListener('scroll', function () {
            syncScroll(left, right);
        });

        right.addEventListener('scroll', function () {
            syncScroll(right, left);
        });

        updateEmpty(left);
        updateEmpty(right);
    });
})();