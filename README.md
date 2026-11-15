# diffvoid.com

A secure, browser-based text comparison tool. Compare two texts or files side by side, step through the changes, merge them, and export a patch, without uploading anything. All comparison work stays inside your browser.

**Live:** [diffvoid.com](https://diffvoid.com)

## Features

- **100% client-side**: Compared text is processed only by the page and its same-origin Web Worker. It is never sent to a server.
- **Line-aware Myers diff**: A first-party Myers implementation preserves exact matching-line anchors when lines are inserted or removed. Lines that occur on only one side are set aside before the search, so wholesale rewrites, re-indentation, and line-ending changes are compared rather than rejected.
- **Blocks settle on natural boundaries**: A run of added or removed lines that could sit in several equivalent places is placed where it cuts the text least: next to blank lines, and never between a block and its own closing line. A function that was added, removed, or swapped keeps its own braces.
- **Moved lines**: Removed lines that reappear unchanged among the added lines are shown as moved, in their own colour and with the line number of their counterpart. A move needs at least 20 letters or digits in total, so a lone brace or blank line is never called a move, and a single line is a move only when it occurs once in each text. A moved block may also have been edited on the way: an edited line belongs to the move when it sits between unchanged moved lines, or at the end of a block that has at least two unchanged lines for each edited one, and its changes are highlighted inside the moved line. Moved lines still count as difference rows.
- **Graceful degradation on hard input**: The line diff is a shortest edit script while its step budget allows. For heavily reordered text it then anchors on lines that are unique on both sides and returns a valid, possibly non-minimal diff instead of an error.
- **Bounded row alignment**: Unmatched hunks use deterministic full or banded dynamic programming to pair similar modified lines, including long lines changed at both ends and lines extended with a single added run. If the shared work budget cannot support a reliable pairing, the hunk is conservatively shown as missing and added lines.
- **Word-aware character diff**: Modified lines are segmented into user-perceived characters with `Intl.Segmenter` and compared word by word, so a changed number or identifier is highlighted as one piece instead of scattered letters. Decimals and version numbers such as `1.2.3` count as one word. Words that share most of their start and end keep the shared part unmarked; punctuation and whitespace still diff character by character. Changes are stored as compact UTF-16 ranges rather than per-character objects.
- **Line endings compared apart from content**: A carriage return directly before a line feed is treated as part of the line ending, so a CRLF text and an LF text match line by line. The number of rows whose line endings differ is reported in one notice instead of marking every row. Any other carriage return is content and is marked `[CR]` when it differs. A changed tab is highlighted at its full width.
- **Optional whitespace-insensitive comparison**: The **ignore whitespace** toggle sets aside indentation, trailing spaces and tabs, and the length of inner runs of spaces and tabs. Whitespace that separates words still counts (`a b` differs from `ab`), and only the ordinary space and tab are ignored: non-breaking and other Unicode spaces remain differences. The toggle is off on every visit and the number of affected rows is shown.
- **Optional case-insensitive comparison**: The **ignore case** toggle treats upper and lower case letters as the same, using locale-independent Unicode lower-casing. Look-alike letters of different scripts remain differences. Off on every visit; the number of rows that differ only in case is shown.
- **Unicode normalization hint**: Text that is the same characters in a different normalization form (a precomposed `é` against `e` plus a combining accent) is underlined with an explanation, such lines are always paired, and the affected rows are counted. Only canonical equivalence (NFC) counts; compatibility forms such as the `ﬁ` ligature remain ordinary differences.
- **Invisible character detection**: Zero-width spaces, non-breaking spaces, soft hyphens, directional marks, and other hidden Unicode characters receive visible markers.
- **Confusable character detection**: Common Greek and Cyrillic homographs that resemble Latin letters receive a marker and an explanatory tooltip.
- **Local files**: Drop a file on a pane or use **open left** / **open right**. Two files dropped together fill both sides. The file is read by the page with the File API and is never uploaded. UTF-8 is expected and its byte order mark is kept as a visible `[BOM]`; UTF-16 is recognised by its byte order mark, other bytes are read as Windows-1252 and labelled so, and binary files are refused.
- **Change navigation**: The arrow buttons, `Alt+Down` / `Alt+Up` and `F7` / `Shift+F7` step through the changes, where a change is a run of consecutive difference rows. The current change is marked in the gutter and counted (`3 / 12`); a click inside a change selects it too.
- **Overview map**: A strip beside the panes marks every change over the whole result, the left text in its left half and the right text in its right half, moved blocks in violet, with a frame for the part on screen. Click or drag it to jump.
- **Changes only**: The **changes only** toggle folds every unchanged run into one row and keeps three lines of context around each change. A fold opens when clicked, or when the selection moves into it.
- **Unified view**: The **unified** toggle shows both texts in one column instead of two panes: the removed lines of a change above its added lines, a `-` or `+` sign before each, and the old and new line numbers in two gutters. Navigation, **changes only**, merging and copying work the same way, and the overview map uses its whole width for the single column. A selection stays within one text, the one its first line belongs to.
- **Merge with undo**: **use left** and **use right** keep one version of the selected change: its lines replace the lines of the other text, with their own line endings. The result stays where it was on screen, **undo** (or `Ctrl+Z`) takes back up to 20 merges within 8,000,000 characters of kept text, and Copy L/R returns the merged text.
- **Unified diff export**: **copy diff** and **save .patch** produce a standard unified diff with three lines of context, file names when files were opened, and `\ No newline at end of file` markers. It describes the exact texts: rows that an ignore option or the line-ending rule shows as matching are still part of it, so applying it to the left text always gives the right text.
- **Swap**: One button exchanges the two sides.
- **Exact and clean copying**: Copy L/R returns the complete original source, including unmounted rows and trailing newlines. Clean L/R additionally normalizes detected invisible spacing characters and removes soft hyphens and BOM characters.
- **Virtualized rendering**: Only the visible diff window is mounted. Rendering is capped at 200 rows per pane and 8,000 DOM nodes across both panes, and work is split across animation frames.
- **Reduced long-line previews**: Dense lines over 20,000 code units are shown as paged previews around changes. Copying still uses the complete original source.
- **Cost-based worker routing**: Comparisons normally run in a Web Worker. A synchronous fallback is allowed only for input proven small enough when a worker cannot be created; worker-required input is never retried on the main thread.
- **Input and work limits**: Each side supports up to 25,000 lines, 2,000,000 characters, and 100,000 characters per line. Shared Myers, alignment, character-diff, range, and rendering budgets prevent unbounded work.
- **Adjustable divider**: Drag the divider to resize the panels. Double-click it or select Clear to restore the 50/50 layout.
- **Dark/light mode**: Follows the system theme until you pick one; the selected theme is stored locally.
- **Privacy-first**: No ads, analytics, cookies, tracking, or transmission of compared text.

## How to Use

1. Paste text into the left and right panels, or drop or open a file on each side.
2. The comparison starts automatically.
3. Read the aligned result:
   - **Matching lines** have no background highlight.
   - **Modified, added, and missing content** is highlighted in red. A one-sided source line is aligned with a highlighted empty gap in the other pane.
   - **Character highlights** identify precise changes inside paired modified lines.
   - **Invisible characters** appear as markers such as `|`, `[ZWSP]`, `[NBSP]`, or `[LRM]`.
   - **Confusable characters** have a dotted marker and tooltip naming the actual Unicode character.
   - **Moved lines** have a violet background; hover a line to see where its counterpart is. Edits made to a moved line are marked in red inside it.
   - **Dotted underlines** inside a change mark text that differs only in Unicode normalization (NFC/NFD).
   - **Ignored differences** are counted next to the result: rows whose line endings (CRLF/LF) differ, with **ignore whitespace** on, rows that differ only in spaces and tabs, and with **ignore case** on, rows that differ only in letter case. When nothing else differs the counter reads **0 difference rows** rather than **100% Match**.
4. Use **Copy L/R** for the exact source text. When invisible characters are present, **Clean L/R** also appears; it turns detected hidden spacing characters into ordinary spaces, collapses adjacent normalized spaces, and removes soft hyphens and BOM characters.
5. Step through the changes with the arrow buttons, `Alt+Down` / `Alt+Up` or `F7` / `Shift+F7`, or click the overview map. Turn on **changes only** to hide unchanged lines, or **unified** to read both texts in one column.
6. Select a change and choose **use left** or **use right** to keep that version on both sides. **undo** takes a merge back.
7. Use **copy diff** or **save .patch** for a unified diff of the two texts.
8. Drag the divider to resize the panes, or use Clear to reset the comparison.

## Invisible Characters Detected

| Code | Name | Display |
|------|------|---------|
| U+200B | Zero Width Space | `\|` |
| U+200C | Zero Width Non-Joiner | `[ZWNJ]` |
| U+200D | Zero Width Joiner | `[ZWJ]` |
| U+FEFF | BOM / ZWNBSP | `[BOM]` |
| U+00A0 | Non-Breaking Space | `[NBSP]` |
| U+202F | Narrow No-Break Space | `[NNBSP]` |
| U+200A | Hair Space | `[HS]` |
| U+2009 | Thin Space | `[THIN]` |
| U+3000 | Ideographic Space | `[IDEO]` |
| U+2002 | En Space | `[EN]` |
| U+2003 | Em Space | `[EM]` |
| U+2007 | Figure Space | `[FIG]` |
| U+2008 | Punctuation Space | `[PUNCT]` |
| U+205F | Medium Mathematical Space | `[MMSP]` |
| U+00AD | Soft Hyphen | `[SHY]` |
| U+200E | Left-to-Right Mark | `[LRM]` |
| U+200F | Right-to-Left Mark | `[RLM]` |
| U+180E | Mongolian Vowel Separator | `[MVS]` |
| U+2060 | Word Joiner | `[WJ]` |

## Confusable Characters Detected

Invisible characters are hidden or spacing-related code points. Confusable characters are visible letters from another script that can resemble Latin letters. diffvoid.com marks common Greek and Cyrillic lookalikes such as:

| Example | Name | Looks like |
|---------|------|------------|
| U+0410 | Cyrillic capital a | Latin `A` |
| U+0430 | Cyrillic small a | Latin `a` |
| U+03BF | Greek small omicron | Latin `o` |
| U+0441 | Cyrillic small es | Latin `c` |
| U+0425 | Cyrillic capital ha | Latin `X` |

## Technical Details

### Comparison pipeline

1. A linear scan validates input limits and estimates the work without first constructing line arrays.
2. Only provably small input is eligible for a synchronous fallback. All other accepted input requires a Web Worker.
3. Each line is separated from its line ending: a carriage return before the line feed is recorded per line and left out of the compared text. With whitespace ignored, the line diff and row alignment run on lines whose edges are trimmed and whose inner runs of spaces and tabs are reduced to one space, while character ranges stay offsets into the original lines. With case ignored, lines and characters are compared lower-cased in the same way. Lines are interned as integers, and lines without a counterpart on the other side are left out of the search and restored afterwards as deletions or insertions. Myers line diff establishes exact anchors on the rest, and each run of removed or added lines between two matching stretches is then slid to the position that cuts the text least. Once the exact search has used its share of the step budget, a split that has already cost 256 edits is replaced by the longest in-order chain of lines unique to both sides, or failing that by the furthest point reached.
4. Unmatched delete/insert hunks are aligned with deterministic bounded full or banded dynamic programming. Short lines are scored by exact edit distance; longer lines by shared content and position, where content alone can admit a pair but a candidate that also agrees in position ranks higher.
5. Removed lines that reappear unchanged among the added lines are linked as moves. The rows stay removed and added rows; each only records the line index of its counterpart. Similar removed and added lines next to such a block are then linked as moved and edited, and carry their own character ranges.
6. Only the selected modified pairs receive a character diff. Graphemes are grouped into words (letters, digits, underscore) and single punctuation or whitespace characters, the groups are compared with Myers, and a word replaced by a similar word is narrowed to the part between their common start and end. The changes become UTF-16 offsets in a shared `Uint32Array` pool.
7. The worker returns one atomic, source-free `DiffModelV2` result with transferable typed-array buffers. Original text remains the single source of truth on the main thread.
8. The virtual view creates DOM nodes only for the shared visible row window. User content is assigned through DOM APIs and `textContent`, not generated HTML.
9. Navigation, the overview map, folds, the unified view, merging and the unified diff are derived on the main thread from the model and the original texts. The worker protocol and `DiffModelV2` are unchanged by them, and a merge is an ordinary new comparison of the changed text.

The comparison shares explicit work budgets across line diffing, row alignment, character diffing, compact ranges, and rendering. If a detail budget is exhausted, the UI uses a whole-line highlight or a paged preview and displays **Detailed rendering reduced for performance**. It never invents a modified-line pairing when reliable alignment cannot be completed.

The implementation has no diff library or other runtime dependency.

### Verification

```bash
npm test       # correctness, protocol, race, routing, virtual DOM, copy, and architecture checks
npm run perf   # isolated large-input model and memory checks
```

`npm run perf` starts every fixture in a separate Node process with garbage collection exposed and a 256 MiB JavaScript heap limit. It checks advertised maximum-size inputs, including fully different, re-indented, trailing-whitespace, CRLF-versus-LF, shuffled, block-moved, moved-and-edited, and case-insensitive 25,000-line texts, plus compact-model structure, exact source reconstruction, typed-array and range budgets, bounded alignment, and conservative fallback behavior. Timing is reported for information rather than enforced as a machine-dependent threshold.

### Browser Compatibility

The interface requires a modern browser with ES6 JavaScript, `Intl.Segmenter` including `Segments.prototype.containing()`, typed arrays, Pointer Events, the Clipboard API, `requestAnimationFrame`, CSS variables, and Local Storage. Opening files uses the File API and `TextDecoder`, the overview map a 2D canvas, and saving a patch a `Blob` download. Worker-required comparisons additionally need Web Worker support.

## Privacy

- No collection or storage of compared text
- No analytics, advertising, cookies, or third-party tracking
- Compared text is passed only between the page and an in-browser same-origin Worker
- Opened and dropped files are read inside the page; a saved patch is created inside the page
- Merged texts and the undo history exist only in the memory of the open page
- Theme preference is the only value stored in Local Storage

See the [Privacy Policy](https://diffvoid.com/privacy), [Terms of Service](https://diffvoid.com/tos), and [About](https://diffvoid.com/about) pages for details.

## Development

### Project Structure

```text
public/
├── index.html           # Main UI, accessibility markup, and copy controls
├── script.js            # Input state, files, toolbar, overview map, and controller/view orchestration
├── shared-diff.js       # Validation, Myers, budgets, DP alignment, DiffModelV2, unified diff, and merge
├── diff-controller.js   # Worker jobs, timeouts, cancellation, and stale-result protection
├── virtual-diff.js      # Virtual DOM rendering, previews, logical selection, change index, and folds
├── worker.js            # Worker protocol and transferable atomic results
├── theme.js             # Theme toggle and local persistence
├── style.css            # Main application and virtual diff styles
├── shared.css           # Styles shared by static pages
├── about.html           # About page
├── privacy.html         # Privacy policy
└── tos.html             # Terms of service
wrangler.jsonc           # Cloudflare static-asset deployment
scripts/
└── perf-diff.js         # Isolated 256 MiB performance and memory assertions
test/
├── shared-diff.test.js
├── diff-controller.test.js
├── diff-routing.test.js
├── worker-protocol.test.js
├── virtual-diff.test.js
├── unified-diff.test.js
└── architecture-invariants.test.js
```

### Running Locally

Serve `public/` over HTTP for the complete application:

```bash
python3 -m http.server 8000 --directory public
```

Then visit `http://localhost:8000`. The static pages are linked without the `.html` extension (`/about`, `/privacy`, `/tos`), which Cloudflare resolves in production; a plain local server needs the extension, so open e.g. `http://localhost:8000/about.html` there.

Opening `public/index.html` directly with a `file://` URL is not recommended because browsers commonly block local Web Workers. A comparison classified as safely small can fall back to synchronous processing if worker creation fails. A larger comparison deliberately stops with an instruction to use HTTP or compare smaller sections; it is never moved to the main thread.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

Timo Heimonen <timo.heimonen@proton.me>
