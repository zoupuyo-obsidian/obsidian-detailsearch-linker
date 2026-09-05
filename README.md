# DetailSearch Linker

[日本語 README](README.ja.md)

DetailSearch Linker searches **other note bodies on demand** for terms from the **current note** (auto-extracted or selected), highlights anchors in the **current note**, and lets you insert `[[path#heading|display]]` wikilinks after previewing matches.

This is **not** a full-text index. Nothing scans the whole vault at startup. Your notes stay local; the plugin does not send content elsewhere.

## Features

### Selection search (plan 2)

- **Search selection in vault bodies** — run a command with text selected, or enter a term when nothing is selected.
- **Spot Linker-style highlight** — the search term in the current note is decorated with an optional candidate-count badge.
- **Hover / tap preview** — see target note, nearest ATX heading, and a short excerpt around each match (desktop hover, mobile tap).
- **Heading wikilinks** — inserts `[[linktext#heading|original]]`; links to note start when no heading precedes the hit.

### Auto-extract (plan 1)

- **Find body link candidates from current note** — extracts candidate terms from headings, bold, highlights, and optionally prose or CJK n-grams.
- **Conservative defaults** — focused extraction on, broad n-gram off, stop words, min/max length, and hard cap (200). Priority: emphasis/highlight (1200) > heading (1000) > prose (400+length) > n-gram (100+length).
- **Zero-hit terms are not highlighted** — only terms with matches in other notes get decorations.

### Unified session (plan 3)

- **Per-term result groups** — each anchor belongs to one query group; popover and link insertion use that group only (no cross-term mixing).
- **Multi-read-once search** — many terms share one `cachedRead` per target file; Aho–Corasick scans all patterns in one pass per file.
- **Per-term query cache** — warm terms skip reads; stale paths are batched; cancel does not mark incomplete scans as complete.

Shared: scoped search, query cache, cancel & progress, generation-based invalidation.

## Install

### Manual install

1. Build or download `main.js`, `manifest.json`, and `styles.css`.
2. Create `.obsidian/plugins/detailsearch-linker/` in your vault.
3. Copy the three files into that folder.
4. Enable **DetailSearch Linker** under **Settings -> Community plugins**.

Requires Obsidian **1.13.0** or newer (desktop and mobile).

## Usage

### Unified search (recommended)

1. Open a note.
2. Run **Find body link candidates in current note** (command palette, ribbon, or mobile toolbar).
3. **With a selection** — searches that term in other note bodies (same as selection mode).
4. **Without a selection** — auto-extracts candidate terms from the current note (no input modal).
5. Hover (desktop) or tap (mobile) a highlight to preview candidates and create links.

The ribbon uses the same logic: selection → search (even if highlights exist); no selection + highlights → clear; no selection + no highlights → auto-extract.

Legacy commands **Search selection in other note bodies** and **Find body link candidates from current note** remain for backward compatibility and diagnostics.

### Selection mode (legacy command)

1. Open a note and select a phrase (or leave the selection empty).
2. Run **Search selection in other note bodies** (command palette). The ribbon runs the unified action instead.
3. Hover (desktop) or tap (mobile) the highlight to preview candidates.
4. Choose one and click **Create link**.

When nothing is selected, this legacy command opens an input modal. The unified command does not.

### Auto-extract mode (legacy command)

1. Open a note (no selection required).
2. Run **Find body link candidates from current note**.
3. Terms with matches are highlighted; each anchor shows its own candidate count.
4. Hover/tap an anchor to preview **that term’s** candidates only.

Clear highlights via the ribbon (when nothing is selected), status bar, or **Clear highlights**. Use **Cancel search** during long scans.

### Ignore list (Spot Linker–style)

- **Ignored terms** apply to **auto-extract only**. Explicit selection search (including re-selecting an ignored term) always runs.
- In the preview popover, **Ignore this term** adds the trimmed term to **Ignored terms** in settings and removes that term’s highlights from the current session. Other terms stay highlighted.
- **Stop words** tune general extraction defaults; **Ignored terms** are terms you chose to exclude from future auto-extract.
- Removing a term from the settings list does not re-scan the active session; the next auto-extract can pick it up again.

### Mobile

- The **ribbon** (search icon) is available via `addRibbonIcon` and follows the unified action above.
- Add **Find body link candidates in current note** from Obsidian’s standard **Mobile toolbar** settings. The plugin does not force a bottom toolbar placement.

### Modal input (selection command only)

If you run the selection command without a selection, a modal asks for the search term. **The term must appear in the current note** (outside protected spans). If it does not, the plugin shows a notice and **does not scan** other notes.

### Link syntax in search terms

Search terms cannot contain `|`, `[`, or `]` (wikilink-breaking characters). Japanese punctuation such as `、` is allowed. Target note headings that contain `|` are not escaped; such links may render incorrectly (known limitation).

## Settings overview

| Setting | Purpose |
|--------|---------|
| Include / exclude folders | Limit which notes are scanned |
| Search scope | All, recently modified, workset, or both |
| Focused extraction / prose / broad n-gram | Auto-extract sources and breadth |
| Min/max term length, max auto candidates, stop words | Tune extraction |
| Ignored terms | User blocklist for auto-extract (selection search unaffected) |
| Max files / max file size | Safety caps |
| Cache mode / cache limit | Memory-only vs persistent LRU |
| Max matches per note / max candidate notes | Prevent result explosion |

## Cold / Warm search

- **Cold** — reads via `vault.cachedRead`, scans in ~64 KiB chunks with UI yield.
- **Warm** — per-term cache keyed by query, case, and scope fingerprint; only changed paths are rescanned.
- **Multi-term** — one read per file per batch; all pending terms for that path are matched together.

## Limitations

- **Not exhaustive** — folder, scope, count, and size limits may skip notes.
- **No startup index** — cost scales with scope and term count.
- **Heading links only** — no block IDs written to target notes.
- **Protected spans** — matches inside existing links, code, math, frontmatter are excluded. **Selection inside protected spans is rejected** before search.
- **Search term link syntax** — `|`, `[`, `]` are rejected in queries. Target headings with `|` are not escaped (known limitation).
- **Broad n-gram is opt-in** — can increase false positives; no unlimited extraction mode.

## Privacy

All reads and cache stay local. Cache stores paths, headings, excerpts, and mtimes — not full note bodies.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
npm install
npm test
npm run build
npm run lint
```

After updating a development build (including vault junction/symlink installs), **disable and re-enable the plugin** or **reload Obsidian** once. Obsidian keeps the loaded `main.js` in memory; replacing files on disk does not hot-swap the bundle.

## License

[0-BSD](LICENSE)
