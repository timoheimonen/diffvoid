# diffvoid.com

A secure, browser-based text comparison tool. Compare two texts side-by-side to see differences instantly. All processing happens locally in your browser — your text never leaves your device.

## Features

- **100% Client-Side**: All text comparison happens in your browser. No data is sent to any server.
- **Character-Level Diff**: Highlights exact character differences between texts using the LCS (Longest Common Subsequence) algorithm.
- **Invisible Character Detection**: Automatically highlights invisible Unicode characters (zero-width spaces, non-breaking spaces, soft hyphens, directional marks, etc.) with visual indicators.
- **Dark/Light Mode**: Toggle between dark and light themes. Preference is saved locally.
- **Privacy-First**: No ads, no analytics, no tracking. Open source and auditable.

## How to Use

1. Paste text into the left panel ("To this...")
2. Paste text into the right panel ("From this...")
3. Differences are highlighted automatically:
   - **Green background**: Matching text
   - **Red background**: Different or added text
   - **Invisible characters**: Shown as `[ZWSP]`, `|`, `[NBSP]`, `[LRM]`, etc.

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

## Technical Details

### Diff Algorithm

Uses a combination of:
- **Line-level diff**: LCS algorithm for matching lines
- **Character-level diff**: Detailed character comparison for modified lines
- **Hirschberg's algorithm**: Memory-efficient O(n) space variant for large inputs (>1M characters)

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

See [Privacy Policy](https://diffvoid.com/privacy.html) and [Terms of Service](https://diffvoid.com/tos.html) for details.

## Development

### Project Structure

```
public/
├── index.html      # Main HTML structure
├── script.js       # Comparison logic and diff algorithms
├── style.css       # Styling with CSS variables
├── tos.html        # Terms of Service
└── privacy.html    # Privacy Policy
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

