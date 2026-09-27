# Changelog

All notable changes to diffvoid.com are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
