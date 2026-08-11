# diffvoid.com

A secure, browser-based text comparison tool. Compare two texts side by side and inspect exact differences without uploading either text. All comparison work stays inside your browser.

**Live:** [diffvoid.com](https://diffvoid.com)

## Features

- **100% client-side**: Compared text is processed only by the page and its same-origin Web Worker. It is never sent to a server.
- **Line-aware Myers diff**: A first-party Myers implementation preserves exact matching-line anchors when lines are inserted or removed.
- **Bounded row alignment**: Unmatched hunks use deterministic full or banded dynamic programming to pair similar modified lines. If the shared work budget cannot support a reliable pairing, the hunk is conservatively shown as missing and added lines.
- **Grapheme-aware character diff**: Modified lines are segmented into user-perceived characters when `Intl.Segmenter` is available, then stored as compact UTF-16 change ranges rather than per-character objects.
- **Invisible character detection**: Zero-width spaces, non-breaking spaces, soft hyphens, directional marks, and other hidden Unicode characters receive visible markers.
- **Confusable character detection**: Common Greek and Cyrillic homographs that resemble Latin letters receive a marker and an explanatory tooltip.
- **Exact and clean copying**: Copy L/R returns the complete original source, including unmounted rows and trailing newlines. Clean L/R additionally normalizes detected invisible spacing characters and removes soft hyphens and BOM characters.
- **Virtualized rendering**: Only the visible diff window is mounted. Rendering is capped at 200 rows per pane and 8,000 DOM nodes across both panes, and work is split across animation frames.
- **Reduced long-line previews**: Dense lines over 20,000 code units are shown as paged previews around changes. Copying still uses the complete original source.
- **Cost-based worker routing**: Comparisons normally run in a Web Worker. A synchronous fallback is allowed only for input proven small enough when a worker cannot be created; worker-required input is never retried on the main thread.
- **Input and work limits**: Each side supports up to 25,000 lines, 2,000,000 characters, and 100,000 characters per line. Shared Myers, alignment, character-diff, range, and rendering budgets prevent unbounded work.
- **Adjustable divider**: Drag the divider to resize the panels. Double-click it or select Clear to restore the 50/50 layout.
- **Dark/light mode**: The selected theme is stored locally.
- **Privacy-first**: No ads, analytics, cookies, tracking, or transmission of compared text.

## How to Use

1. Paste text into the left and right panels.
2. The comparison starts automatically.
3. Read the aligned result:
   - **Matching lines** have no background highlight.
   - **Modified, added, and missing content** is highlighted in red. A one-sided source line is aligned with a highlighted empty gap in the other pane.
   - **Character highlights** identify precise changes inside paired modified lines.
   - **Invisible characters** appear as markers such as `|`, `[ZWSP]`, `[NBSP]`, or `[LRM]`.
   - **Confusable characters** have a dotted marker and tooltip naming the actual Unicode character.
4. Use **Copy L/R** for the exact source text. When invisible characters are present, **Clean L/R** also appears; it turns detected hidden spacing characters into ordinary spaces, collapses adjacent normalized spaces, and removes soft hyphens and BOM characters.
5. Drag the divider to resize the panes, or use Clear to reset the comparison.

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

Invisible characters are hidden or spacing-related code points. Confusable characters are visible letters from another script that can resemble Latin letters. diffvoid marks common Greek and Cyrillic lookalikes such as:

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
3. Myers line diff establishes exact anchors. Unmatched delete/insert hunks are aligned with deterministic bounded full or banded dynamic programming.
4. Only the selected modified pairs receive a grapheme-aware character diff. Their changes become UTF-16 offsets in a shared `Uint32Array` pool.
5. The worker returns one atomic, source-free `DiffModelV2` result with transferable typed-array buffers. Original text remains the single source of truth on the main thread.
6. The virtual view creates DOM nodes only for the shared visible row window. User content is assigned through DOM APIs and `textContent`, not generated HTML.

The comparison shares explicit work budgets across line diffing, row alignment, character diffing, compact ranges, and rendering. If a detail budget is exhausted, the UI uses a whole-line highlight or a paged preview and displays **Detailed rendering reduced for performance**. It never invents a modified-line pairing when reliable alignment cannot be completed.

The implementation has no diff library or other runtime dependency.

### Verification

```bash
npm test       # correctness, protocol, race, routing, virtual DOM, copy, and cleanup checks
npm run perf   # isolated large-input model and memory checks
```

`npm run perf` starts every fixture in a separate Node process with garbage collection exposed and a 256 MiB JavaScript heap limit. It checks advertised maximum-size inputs, compact-model structure, exact source reconstruction, typed-array and range budgets, bounded alignment, and conservative fallback behavior. Timing is reported for information rather than enforced as a machine-dependent threshold.

### Browser Compatibility

The interface requires a modern browser with ES6 JavaScript, typed arrays, `requestAnimationFrame`, CSS variables, and Local Storage. Worker-required comparisons additionally need Web Worker support. `Intl.Segmenter` is used when available; the comparison retains a Unicode code-point fallback.

## Privacy

- No collection or storage of compared text
- No analytics, advertising, cookies, or third-party tracking
- Compared text is passed only between the page and an in-browser same-origin Worker
- Theme preference is the only value stored in Local Storage

See the [Privacy Policy](https://diffvoid.com/privacy.html), [Terms of Service](https://diffvoid.com/tos.html), and [About](https://diffvoid.com/about.html) pages for details.

## Development

### Project Structure

```text
public/
├── index.html           # Main UI, accessibility markup, and copy controls
├── script.js            # Input state and controller/view orchestration
├── shared-diff.js       # Validation, Myers, budgets, DP alignment, and DiffModelV2
├── diff-controller.js   # Worker jobs, timeouts, cancellation, and stale-result protection
├── virtual-diff.js      # Virtual DOM rendering, previews, and logical selection
├── worker.js            # Worker protocol and transferable atomic results
├── theme.js             # Theme toggle and local persistence
├── style.css            # Main application and virtual diff styles
├── shared.css           # Styles shared by static pages
├── about.html           # About page
├── privacy.html         # Privacy policy
└── tos.html             # Terms of service
scripts/
└── perf-diff.js         # Isolated 256 MiB performance and memory assertions
test/
├── shared-diff.test.js
├── diff-controller.test.js
├── diff-routing.test.js
├── worker-protocol.test.js
├── virtual-diff.test.js
└── legacy-cleanup.test.js
```

### Running Locally

Serve `public/` over HTTP for the complete application:

```bash
python3 -m http.server 8000 --directory public
```

Then visit `http://localhost:8000`.

Opening `public/index.html` directly with a `file://` URL is not recommended because browsers commonly block local Web Workers. A comparison classified as safely small can fall back to synchronous processing if worker creation fails. A larger comparison deliberately stops with an instruction to use HTTP or compare smaller sections; it is never moved to the main thread.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

Timo Heimonen <timo.heimonen@proton.me>
