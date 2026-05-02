# diffvoid.com

A secure, browser-based text comparison tool. Compare two texts side-by-side to see differences instantly. All processing happens locally in your browser — your text never leaves your device.

**Live:** [diffvoid.com](https://diffvoid.com)

## Features

- **100% Client-Side**: All text comparison happens in your browser. No data is sent to any server.
- **Line-Aware Myers Diff**: Aligns line sequences with a first-party Myers shortest edit script implementation so inserted or removed lines do not shift the entire comparison.
- **Character-Level Myers Diff**: Highlights exact grapheme-level differences within modified lines using the same Myers core.
- **Invisible Character Detection**: Automatically highlights invisible Unicode characters (zero-width spaces, non-breaking spaces, soft hyphens, directional marks, etc.) with visual indicators.
- **Confusable Character Detection**: Marks common Greek and Cyrillic homographs that look like Latin letters, with tooltips explaining the actual Unicode character.
- **Copy Without Invisible Characters**: When invisible characters are detected, copy buttons appear next to the comparison result. Zero-width characters are removed completely, while special spaces (NBSP, En/Em space, etc.) are replaced with standard spaces to preserve word separation.
- **Adjustable Divider**: Drag the center divider to adjust the width of left and right panels. Double-click divider or click Clear to reset to 50/50.
- **Dark/Light Mode**: Toggle between dark and light themes. Preference is saved locally.
- **Web Worker Processing**: Comparison runs in a background Web Worker to keep the UI responsive. Falls back to synchronous processing if workers are unavailable.
- **Chunked Rendering**: Large diffs are rendered in batches to prevent browser freezing.
- **Input Limits**: Maximum 25,000 lines, 2,000,000 characters per side, 100,000 characters per line, and safe Myers edit-work limits enforced before comparison.
- **Friendly Safety Warnings**: Inputs that are too large or too different for safe browser-side processing are rejected with a clear message instead of starting an unstable comparison.
- **Privacy-First**: No ads, no analytics, no tracking. Open source and auditable.

## How to Use

1. Paste text into the left panel
2. Paste text into the right panel
3. Differences are highlighted automatically:
   - **Green background**: Matching text
   - **Red background**: Different, added, or deleted text
   - **Invisible characters**: Shown as `[ZWSP]`, `|`, `[NBSP]`, `[LRM]`, or red boxes for spaces in diffs
   - **Confusable characters**: Underlined with a small marker and tooltip when a character looks like a Latin letter but is not one
4. When invisible characters are detected, **copy buttons (L/R)** appear next to the mismatch counter:
   - **Zero-width characters** (like `[ZWSP]`, `[LRM]`) are removed completely
   - **Special spaces** (like `[NBSP]`, `[EM]`, `[EN]`) are replaced with standard spaces to prevent word merging
5. Drag the center divider to adjust panel widths
6. Click the trash icon to clear both panels

## Invisible Characters Detected

The tool highlights these commonly problematic invisible Unicode characters:

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

Invisible characters are hidden or spacing-related code points. Confusable characters are visible letters from another
script that can look identical to Latin letters. diffvoid marks common Greek and Cyrillic lookalikes such as:

| Example | Name | Looks like |
|---------|------|------------|
| U+0410 | Cyrillic capital a | Latin `A` |
| U+0430 | Cyrillic small a | Latin `a` |
| U+03BF | Greek small omicron | Latin `o` |
| U+0441 | Cyrillic small es | Latin `c` |
| U+0425 | Cyrillic capital ha | Latin `X` |

## Technical Details

### Diff Algorithm

Uses a first-party Myers shortest edit script implementation:
- **Line-level Myers diff**: Matching blocks stay aligned even when lines are inserted or deleted
- **Modified-row presentation**: Adjacent Myers delete/insert ranges are paired into modified rows when their content is similar
- **Short-line handling**: Compact edits such as `x=1` to `x=2` stay aligned as modified rows instead of add/remove pairs
- **Character-level Myers diff**: For modified lines, detailed grapheme-aware character comparison shows exact differences
- **Difference rows**: The counter reports changed visual diff rows, including modified, added, and missing rows
- **No diff libraries**: The Myers algorithm is implemented directly in `public/shared-diff.js`
- **Grapheme segmentation**: Uses `Intl.Segmenter` when available so emoji and combining-mark edits are not split into broken UTF-16 halves.
- **Confusable rendering**: Common Greek and Cyrillic homographs are wrapped with explanatory tooltips while preserving the original character for copy operations.
- **Browser safety limits**: The tool estimates edit distance and enforces work limits before and during Myers processing to keep the app responsive.

### Verification

```bash
npm test       # behavior and rendering tests
npm run perf   # performance checks for large and high-change inputs
```

### Browser Compatibility

Works in all modern browsers that support:
- ES6 JavaScript
- LocalStorage
- CSS Variables

## Privacy

- No data collection
- No cookies
- No third-party tracking
- Optional: Theme preference stored in localStorage only

See [Privacy Policy](https://diffvoid.com/privacy.html), [Terms of Service](https://diffvoid.com/tos.html), and [About](https://diffvoid.com/about.html) for details.

## Development

### Project Structure

```
public/
├── index.html       # Main HTML structure
├── script.js        # Comparison logic and UI
├── shared-diff.js   # Shared diff rendering (invisibles, HTML generation)
├── worker.js        # Web Worker for off-thread diff rendering
├── theme.js         # Theme toggle and persistence
├── style.css        # Styling with CSS variables
├── shared.css       # Shared styles for static pages
├── favicon.svg      # Site favicon
├── tos.html         # Terms of Service
├── privacy.html     # Privacy Policy
├── about.html       # About page
├── robots.txt       # Robots exclusion rules
└── sitemap.xml      # Sitemap
```

### Running Locally

Simply open `public/index.html` in a browser, or serve with any static file server:

```bash
# Using Python 3
python -m http.server 8000 --directory public

# Using Node.js
npx serve public
```

Then visit `http://localhost:8000`

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

Timo Heimonen  <timo.heimonen@proton.me>
