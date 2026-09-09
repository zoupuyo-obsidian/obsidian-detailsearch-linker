# DetailSearch Linker

## 1.0.6-beta.10

- Search a wider internal pool before selecting visible body-link candidates, with adaptive density control and a fixed-cap fallback.
- Prioritize focused text, user dictionary terms, and lexical single words after candidate-note hits are known.
- Add a local, editable dictionary that learns only after a link is successfully created; no data is sent outside the Vault.
- Preserve adjacent word highlights while letting final candidate ranking resolve ordinary prose overlaps.

## 1.0.5

Search other note bodies on demand from a selection or from terms extracted in the current note. Preview the destination excerpt and nearest heading, then insert a heading link in the configured internal-link format.

## Highlights

- Selection search and auto-extract share one command; the ribbon clears highlights when nothing is selected
- Highlights stay on the source note; opening a destination does not copy invert marks onto that note
- Persistent cache stores query, path, heading, offset, and mtime only — not excerpts or full note bodies
- Hover preview takes keyboard focus; Tab cycles inside it; ignored terms apply to auto-extract only
- Japanese and English UI, desktop and mobile
