# Changelog

All notable changes to diffvoid.com are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2026-11-15

### Added

- Local files: drop a file on a pane or use **open left** / **open right**.
  Two files dropped together fill both sides. Files are read in the browser
  and never uploaded. UTF-8 and UTF-16 are recognised, other bytes are read as
  Windows-1252, and binary files are refused.
- Change navigation: arrow buttons, `Alt+Down` / `Alt+Up` and `F7` /
  `Shift+F7` step through the changes. The current change is marked in the
  gutter and counted, and a click inside a change selects it.
- Overview map beside the panes that marks every change over the whole result
  and the part on screen. Click or drag it to jump.
- **changes only** toggle: folds unchanged lines away and keeps three lines of
  context around each change. A fold opens when clicked.
- **unified** toggle: shows both texts in one column, the removed lines of a
  change above its added lines, with old and new line numbers.
- Merging: **use left** and **use right** keep one version of the selected
  change on both sides. **undo** or `Ctrl+Z` takes merges back.
- **copy diff** and **save .patch**: the differences as a standard unified
  diff that applies to the left text and gives the right text.
- **Swap** button that exchanges the two sides.
- A summary of changed, removed and added rows in the toolbar.

### Changed

- The service is called diffvoid.com everywhere: wordmark, page titles, help
  dialog and static pages.
- The help dialog, the About page and the README describe the new features,
  and the privacy policy says that opened files, patches and the undo history
  stay in the browser.

## [2.2.0] - 2026-10-15

### Added

- Moved lines: removed lines that reappear among the added lines are shown in
  their own colour with the line number of their counterpart. Lines of a moved
  block that were also edited stay part of the move, with the edits marked.
- **Ignore whitespace** toggle: sets aside indentation, trailing spaces and
  tabs, and the amount of spacing between words. Off on every visit.
- **Ignore case** toggle: treats upper and lower case letters as the same. Off
  on every visit.
- Hint for text that differs only in Unicode normalization (NFC/NFD).
- A notice next to the counter for moved lines, normalization-only rows and
  ignored differences (line endings, whitespace, case).
- Markers for a changed tab and for a carriage return that is not part of a
  line ending.

### Changed

- CRLF and LF texts match line by line instead of every row being marked as
  changed.
- Texts that differ on most lines are compared instead of being rejected as
  "too different". Heavily reordered text gets a valid diff that may not be
  the shortest one.
- More changed lines are paired as one modified row: long lines changed at
  both ends, and lines extended with a comment or extra arguments.
- Added and removed blocks settle on natural boundaries, so a new, removed or
  swapped function keeps its own closing brace.
- Character highlights follow word boundaries: a changed number, version
  number or identifier is highlighted as one piece instead of scattered
  letters.
- The header wraps its status and copy controls when they do not fit, and
  gives them a row of their own on narrow screens.

### Fixed

- Large blocks of short changed lines no longer hit the comparison time limit.
- Memory use stays bounded when one changed block spans two maximum-size texts.

## [2.1.0] - 2026-09-27

### Added

- "help" button in the top bar that opens a help dialog with usage steps, a
  legend of the diff colors and markers, tips, links and the version number.
  On phones it opens as a bottom sheet.
- GitHub link in the page footer.
- The About page has numbered usage steps and a visual legend that shows how
  matches, changes, gaps, invisible and confusable characters look in the diff.

### Changed

- Redesigned the app to match writevoid.com:
  - Frosted top bar with the diffvoid wordmark and tagline.
  - Copy, clear and theme controls are compact rounded buttons with new icons.
  - The difference counter and status messages are rounded badges.
  - Text panes use the page background and a thin divider that highlights
    while you drag it.
  - A slimmer footer with lowercase links.
- On phones the top bar wraps onto two rows with larger touch targets.
- Redesigned the About, Privacy and Terms pages with a shared layout: top bar,
  serif headings, cards and a footer with site links.
- The theme follows the system setting until you choose one with the theme
  button.
- The static pages are linked and listed in the sitemap without the `.html`
  extension (`/about`, `/privacy`, `/tos`).

## [2.0.0] - 2026-08-11

### Changed

- Rebuilt the comparison engine: a line-aware Myers diff, bounded row alignment
  for modified lines, and a compact result model with UTF-16 change ranges.
- Comparisons run in a Web Worker with cancellation and stale-result
  protection; only safely small input falls back to the main thread.
- The result view is virtualized and renders only the visible rows, with paged
  previews for very long lines.

### Removed

- Backward-compatibility layers from the previous diff system.
