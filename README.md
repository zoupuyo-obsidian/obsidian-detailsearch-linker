# DetailSearch Linker

[日本語 README](README.ja.md)

DetailSearch Linker finds a phrase in **other note bodies**, highlights that phrase in the **note you are editing**, and lets you insert a heading link after you preview the destination.

Search starts only when you run a command or click the ribbon search icon. The plugin does not index the vault at startup and does not send note contents anywhere.

Inserted links follow Obsidian's **Use Wikilinks** setting (wikilink or Markdown link).

## What's improved

- **Selection search in Obsidian desktop no longer needs a copy step.** Select a phrase and click the **DSL: Search selection** icon, or run the same command.
- **Obsidian mobile uses copied-text search.** Copy a phrase and run **DSL: Search copied text** without manually clearing the selection.
- **Reading mode is restored after you clear candidates** if the plugin temporarily switched modes to show them. This also applies when switching tabs clears the candidates.
- **Japanese automatic candidates have fewer incomplete endings**, such as phrases ending in a separate `の`, `を`, or `し`. This is not a guarantee of perfect word boundaries.
- **Dictionaries and automatic candidate counts help surface useful terms.** Register important words yourself, or enable learning from links you actually create. Automatic count adjustment reduces overcrowding.

Searching and showing candidates do not insert links into note text. A link is written only when you choose **Create link**.

## How this differs from Spot Linker

[Spot Linker](https://github.com/zoupuyo-obsidian/obsidian-spot-linker) and DetailSearch Linker can sit side by side. They answer different questions.

| | Spot Linker | DetailSearch Linker |
|--|-------------|---------------------|
| What is searched | The **open note** | **Other notes' bodies** |
| Where terms come from | File names, titles, aliases, optional title fragments | Terms **heuristically extracted from** the open note, or an explicit **selection** command |
| What a match means | “This wording looks like another note’s name.” | “This wording also appears in another note’s body.” |
| Typical link | `[[Note name]]` to that note | A heading link toward the paragraph that matched |
| Ignore list | Hides that wording in the open note | Skips that wording in **auto-extract** only |

Use Spot Linker when a concept already has its own note (`認知負荷.md`) and you want the same words in a sentence to become a link to that note.

Use DetailSearch Linker when the destination is a passage inside another note, not the note’s title. A research log, a quote, or a meeting note can mention `認知負荷` without being named that.

The ignore lists are separate. Adding a term in one plugin does not change the other.

## What a successful run looks like

1. You run a search from the current note.
2. Phrases that appear in other note bodies are highlighted **here**.
3. You open the preview on one highlight, pick a destination, and create a link.
4. The highlighted phrase is replaced with a heading link. The rest of the sentence stays as it was.

A highlight appears only when at least one other note body matched. A term with zero hits is not decorated.

## Install

Requires Obsidian **1.13.0** or newer (Obsidian desktop and Obsidian mobile).

### Community plugins

After DetailSearch Linker is accepted into the Obsidian community directory:

1. Open **Settings -> Community plugins**.
2. Turn off **Restricted mode** if needed.
3. Browse community plugins, search for **DetailSearch Linker**, and install it.
4. Enable the plugin.

### GitHub release

1. Download the latest `main.js`, `manifest.json`, and `styles.css` from [GitHub Releases](https://github.com/zoupuyo-obsidian/obsidian-detailsearch-linker/releases).
2. Create `.obsidian/plugins/detailsearch-linker/` in your vault.
3. Copy the three files into that folder.
4. Enable **DetailSearch Linker** under **Settings -> Community plugins**.

To update manually, replace all three files with files from the same release, then disable and re-enable the plugin or restart Obsidian. Keep `data.json` to retain settings.

## Basic operations

The command you will use most is **DSL: Find body candidates**. The ribbon search icon runs the same auto-extract action. Both ignore any text selection and never read the clipboard. In Obsidian desktop, the adjacent selection icon runs the same action as **DSL: Search selection**. `DSL` is the short label for DetailSearch Linker.

### Search copied text in Obsidian mobile

Register both **DSL: Find body candidates** and **DSL: Search copied text** in the mobile toolbar. **DSL: Find body candidates** ignores any selected text and never reads the clipboard. For an explicit copied-term search, select text, copy it, then run **DSL: Search copied text**. If the selection remains active, the plugin reads the clipboard first and then collapses the selection; its previous location still identifies the intended occurrence. If it is already inactive, the closest matching occurrence to the cursor is used. Repeating the same copied term in the same open note clears that clipboard result; run it again to search again.

### Test a prerelease with BRAT

If this repository is already registered in BRAT, update it there; do not add it again. If you pinned a version, check that selection as well. For a new registration, use `zoupuyo-obsidian/obsidian-detailsearch-linker`. Beta and stable builds use the same plugin ID, not separate installations.

### Search a selection explicitly

1. In Obsidian desktop, open a note in an editable view and select a phrase such as `cognitive load`. You do not need to copy it.
2. Run **DSL: Search selection**. In Obsidian desktop, you can use the ribbon selection icon instead. The primary command and ribbon search icon ignore the selection and auto-extract instead.
3. The plugin searches **other note bodies** for that phrase. It does not extract other terms from the note.
4. Only the selected occurrence is highlighted (except inside links, code, math, or frontmatter). Other occurrences are not selected by this command.
5. Hover the highlight in Obsidian desktop, or tap it in Obsidian mobile. The preview lists destination notes, the nearest heading, and a short excerpt.
6. Click **Create link** on the destination you want. The selected occurrence becomes a heading link.

Selection search always runs, even if the phrase is on the ignore list. Use this when you already know the wording and only want body matches for that wording.

The selection must appear in the current note outside a protected span. A selection that sits inside an existing link or a code block is rejected before any other note is read.

### Find body candidates (auto-extract)

1. Open a note. Any remaining text selection is ignored, and the clipboard is never read.
2. Run **DSL: Find body candidates**, or click the ribbon.
3. The plugin uses its current heuristic extraction: headings, bold, highlights, and, depending on settings, ordinary sentences and n-grams.
4. Each extracted phrase is searched in other note bodies.
5. Only phrases that hit at least one other note are highlighted. Each highlight belongs to **that phrase only**.
6. Open the preview on a highlight. You see destinations for that phrase, not a mix of every extracted term.
7. Click **Create link** to replace that occurrence.

Auto-extract does not open an input box and is not a full-recall scan of every possible phrase. If you need to search a phrase explicitly, use **DSL: Search selection** or **DSL: Search copied text**.

### Ribbon versus primary command

| Situation | Ribbon search icon | **DSL: Find body candidates** |
|-----------|--------------------|-----------------------------------------------|
| No highlights (selection can remain) | Auto-extract; selection is ignored | Auto-extract; selection is ignored |
| Same open note already has highlights | **Clear** highlights first | **Clear** highlights first |
| After that clear, next press | Auto-extract | Auto-extract |

The ribbon search icon and **DSL: Find body candidates** do the same body-candidate search. On the same open note, an existing result set makes the first press clear the highlights; the next press starts auto-extraction again.

Clear highlights at any time with **DSL: Clear highlights** or the status bar label. The primary command and ribbon search icon also clear the existing result on their first press for the same open note.

### After the preview opens

- **Create link** inserts a heading link at the highlight. If the destination has no heading before the hit, the link points at the note itself.
- **Open note** opens the destination so you can read it. Returning to the source note keeps the highlights.
- **Ignore this term** is described in the next section.
- **Clear highlights** ends the current result set.

In Obsidian desktop, the preview takes keyboard focus when it appears. Tab and arrow keys move inside it. Move the mouse off the highlight, or press Escape, to type in the note again. After you click the preview, it stays open until Escape or a click in the note.

### Keyboard commands

`Tab` and `Enter` still type in the editor while you are editing. To move between highlights without the mouse, assign hotkeys to:

- **Go to next highlight**
- **Go to previous highlight**
- **Open link candidates at cursor**

These work even when the candidate-count badge is hidden. They have no default hotkeys.

### Additional command options

**DSL: Search selection** is the explicit selection command. Without a selection, it opens a modal. The typed phrase must already exist in the current note, and an explicit search highlights only the selected occurrence or the occurrence found for the typed phrase.

**DSL: Auto-extract and search** is the diagnostic command. It force-runs auto-extraction, regardless of the remaining selection or current highlights.

For everyday use, choose **DSL: Find body candidates** for automatic suggestions, **DSL: Search selection** for a phrase in Obsidian desktop, or **DSL: Search copied text** in Obsidian mobile.

### Obsidian mobile

Add **DSL: Find body candidates** and **DSL: Search copied text** to Obsidian’s **Mobile toolbar**. The search icon finds automatic candidates; the mobile clipboard icon searches copied text. Tap a highlight to open the preview.

## Ignore list and stop words

Two lists can hide wording. They are not interchangeable.

**Ignored terms** are phrases you removed on purpose. They apply to **auto-extract only**. The next auto-extract will not search them. Selecting the same phrase and running a search still works.

**Stop words** are common function words used while extracting (`the`, `and`, `の`, `は`). They reduce noise in automatic candidates. They do not block an explicit selection search.

From the preview, **Ignore this term** trims the phrase, adds it to **Ignored terms** in settings, and removes that phrase’s highlights from the current note. Other highlights stay.

Removing a term from settings does not rescan the current note. The next auto-extract can pick it up again.

## Settings and what they change

Settings fall into three groups: **which other notes are read**, **which phrases are taken from the current note**, and **how results look**.

Folder and scope settings never change what is extracted from the current note. They only change which other notes can become destinations.

### Which notes are searched

| Setting | If you change it |
|---------|------------------|
| **Include folders** | One folder per line. Empty means the whole vault minus excluded folders. Notes **outside** these folders are never destinations. |
| **Exclude folders** | Notes here are never read. Use this for templates, attachments, or raw exports. |
| **Search scope** | **All included notes**, **recently modified**, **recently opened (workset)**, or **recent + workset**. A smaller scope finishes faster and misses older notes. |
| **Recent days** | Used by the recent scopes. `0` means no date limit inside that scope. |
| **Workset size** | How many recently opened notes to remember. `0` means no cap. |
| **Max files** | Hard stop on how many notes are read in one run. Extra notes are skipped, not queued. |
| **Max file size** | Notes larger than this are skipped. Default is 512 KB. |

### Which phrases are extracted (auto-extract only)

| Setting | If you change it |
|---------|------------------|
| **Prefer headings and emphasis** | On (default): take phrases from ATX headings, bold, and `==highlights==`. Off: those sources are skipped. |
| **Extract phrases from ordinary prose** | On (default): take both words and phrases from sentences without letting phrases consume every line's budget. Repeated wording ranks higher. Off: only headings and emphasis (when enabled). |
| **Broad n-gram extraction** | Off (default). On: cut overlapping short runs from continuous Japanese or similar text. More candidates, more weak matches. |
| **Minimum / maximum term length** | Discard extracted phrases outside this range. Raising the minimum removes short particles and two-character noise. |
| **N-gram min / max / span** | Used only when broad n-gram is on. Wider spans produce more fragments. |
| **Auto-candidate baseline** | Default 40. Adaptive mode explores 120 terms by default (up to 200 if the baseline is raised), then displays roughly 20–60 matched terms according to highlight density. Fixed mode uses this value as the display cap. |
| **Candidate count mode** | Adaptive (default) uses highlights in the current note, not destination-note count, to avoid a dense result. Fixed mode remains available. |
| **Manual dictionary terms** | One term per line. Prioritized terms can also be found inside longer compound words. |
| **Learn terms from created links** | Only safe terms from successfully created links are stored locally in this Vault. The learned list is editable, clearable, and capped at 200 terms. |
| **Stop words** | Removed during extraction. |
| **Ignored terms** | Removed during extraction. Selection search still runs. |
| **Case sensitive** | Off (default): English matches ignore case. Japanese is largely unaffected. |

Priority when too many phrases are extracted: emphasis and highlights first, then headings, then prose, then n-grams. Repeated prose wording ranks higher within the prose tier.

### How results look and how far they go

| Setting | If you change it |
|---------|------------------|
| **Highlight style** | Invert, marker, text color, or underline in the current note. |
| **Candidate-count badge** | Shows how many destination notes that phrase has. Hide it if you prefer keyboard commands only. |
| **Clear highlights when switching notes** | On (default): leaving the note clears decorations. Off: they remain on that note only. Opening a destination with **Open note** still keeps the source highlights. |
| **Excerpt length** | How much destination text the preview shows. It is not stored in the on-disk cache. |
| **Max matches per note** | Caps hits inside one destination. You still get the note; later hits in that file are omitted. |
| **Max candidate notes** | Caps how many destination notes a phrase may collect. |
| **Cache** | **Persistent** (default) remembers queries, paths, headings, offsets, and mtimes in `data.json` so a repeat search can skip unchanged files. **Memory only** forgets the cache when Obsidian closes. Excerpts and full note bodies are not written to disk. |
| **Cache limit (MB)** | Oldest cached queries are dropped first when the limit is hit. |
| **UI language** | Plugin labels only. |

## Examples

### Search a phrase in Obsidian desktop

In a research note, select `cognitive load`, then click the **DSL: Search selection** icon. No copying is required. If another note's body contains that phrase, the selected occurrence lights up. Hover over it, read the excerpt, and choose **Create link** only if the destination is relevant.

The magnifying-glass icon has a different purpose: it finds candidates from the whole note, even when text is selected.

### Search copied text in Obsidian mobile

Select `cognitive load` in the current note, copy it, and run **DSL: Search copied text**. Leave the selection as it is: the plugin reads the clipboard and clears the selection before searching. Tap the highlight to inspect the result.

The copied phrase must exist in the current note. If the selection is already cleared, the matching occurrence closest to the cursor is used. Repeating the same copied query in the same note clears its result; another run searches again.

### Return to reading after checking candidates

1. Start in Reading view and run **DSL: Find body candidates**.
2. The plugin temporarily switches to an editing view to show highlights.
3. Inspect the candidates, then run **DSL: Clear highlights**.
4. The note returns to Reading view.

With **Clear highlights when switching notes** enabled (the default), leaving for another note or tab clears the candidates and restores the original note's reading mode. Starting in an editing view leaves that mode unchanged. A manual mode change made after the search is respected.

Using **Open note** inside the preview is an exception: source highlights are kept so you can return and continue checking them.

### Make a short specialist term a candidate

Add `漸進` to **Manual dictionary terms**, one term per line. Close settings, open a note containing the term, clear any old highlights, and run **DSL: Find body candidates**.

Dictionary words are prioritized, including inside compounds such as `漸進性`. They still need a match in another eligible note to be highlighted; folder filters and search limits still apply.

Enable **Learn terms from created links** to remember eligible terms after a link is successfully created. Searching alone does not teach the dictionary. Edit or remove entries under **Learned dictionary terms**.

### Reduce awkward Japanese fragments

Automatic extraction checks word boundaries to reduce phrases ending in separate particles or fragments such as `の`, `を`, and `し`. It does not simply remove every word ending in those characters. Some awkward candidates can still remain.

This filter does not remove terms explicitly selected or copied, dictionary entries, or phrases taken from headings and emphasis. To hide an unwanted automatic candidate, open its preview and choose **Ignore this term**. Explicit selection and copied-text searches still work for ignored terms.

### Limit a large vault

Set **Include folders** to useful destination folders and exclude templates or generated notes. Start with the default file limit of 500, and leave broad n-gram extraction off. Use a recently modified scope for current work, or **All included notes** when older notes matter.

A file skipped because of a folder, date, count, or size limit is not searched in that run.

## Troubleshooting

### A phrase does not light up

- Check the action: selection search in Obsidian desktop uses **DSL: Search selection**, not the magnifying glass.
- A copied phrase must also occur in the current note.
- Another eligible note must contain the phrase in its body; a title alone is not enough.
- Check include/exclude folders, search scope, and file count/size limits.
- Existing links, code, math, and frontmatter are protected.
- If automatic search misses a term, try selecting or copying it explicitly, or add it to the manual dictionary.

If highlights already exist, the primary search action clears them first. Run it again to search.

### Results came from the cache

This means earlier results were reused, not that the search failed. If results seem wrong, use **Clear search cache** and search again to help isolate the issue. Clearing the cache does not delete note text.

After changing dictionary or extraction settings, return to the note and search again; settings changes do not automatically show new candidates.

### Copied text could not be read

Copy the phrase again and immediately run **DSL: Search copied text**. If the device asks for permission to paste, allow it and retry.

## Protected text and rejected queries

The plugin does not search or extract inside existing Markdown links, wikilinks, code, math, or frontmatter. A selection that overlaps those regions is rejected with a notice.

Search phrases cannot contain `|`, `[`, or `]`. Ordinary Japanese punctuation such as `、` is allowed.

Links are heading links only. The plugin does not write block IDs into the destination.

A run is not guaranteed to see every note. Folder filters, scope, file caps, and size caps can skip files. There is no unlimited extraction mode.

## Privacy

Reads and caches stay on the device. The default persistent cache writes search queries and matching paths, headings, offsets, and mtimes next to settings in the plugin `data.json`. Excerpts and full note bodies are not stored. Use **Memory only** or **Clear search cache** if you do not want those details on disk.

Manual and learned dictionary entries are also stored in the vault's plugin settings. Learned terms can be edited, removed, or cleared, with a maximum of 200 entries. **Memory only** affects the search cache, not dictionary storage. Your vault sync or backup tools may include the plugin settings file.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
npm install
npm test
npm run build
npm run lint
```

After replacing a development build (including a vault junction or symlink), **disable and re-enable the plugin** or reload Obsidian. The loaded `main.js` stays in memory until you do.

`npm run verify:release` checks version metadata and writes `SHA256SUMS` for `main.js`, `manifest.json`, and `styles.css`.

## License

[0-BSD](LICENSE)
