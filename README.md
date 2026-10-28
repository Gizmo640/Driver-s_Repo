# Commonplace

A private research desk by Driver. Import your material, search it, follow shared language, and collect verbatim quotes into a brief with source references.

**[Download the portable app](artifacts/Commonplace-portable.zip)** · [Single-file edition](artifacts/Commonplace.html) · [Start guide](PORTABLE-README.txt)

![Commonplace research workspace](artifacts/commonplace-desktop.png)

## Run

**Portable edition: no installation.** Extract `Commonplace-portable.zip` and open `Commonplace.html` in a current browser. Everything is included. See [the portable guide](PORTABLE-README.txt) for storage and backup details.

**Development server:** requires Node.js 20 or newer. No package dependencies, install step, API keys, build step, or external services.

For a portable edition, run `npm run build`, then open `artifacts/Commonplace.html` directly in a browser. It contains the entire application and sample library, with no external assets. This file has its own browser storage origin; use a workspace JSON backup to move data between editions. If the browser restricts storage for local files, export a backup before closing.

```sh
npm start
```

Open port **3000** with your environment's port viewer, or `http://localhost:3000` when running locally. Set `PORT` to use another port. The development server listens on all interfaces; it has no authentication and should not be exposed as a public production service. Source documents are held by the browser, not the server.

```sh
npm test
```

## Try the workflow

1. Open **The city after dark** in the sample library. All nine sample documents are fictional, explicitly labeled, and written for this demo.
2. Press **＋** beside a passage. Open **Your brief**, add your interpretation, and use the source title to jump back to the original paragraph.
3. Search for `"public space" library`. All terms must appear; quoted phrases match exactly. Matches include original line references.
4. Open a source's **Follow a thread** suggestions. Shared terms explain why another document appeared. Suggestions measure lexical overlap with TF-IDF cosine similarity; they are not AI interpretations or claims that sources agree.
5. Add your own UTF-8 TXT, Markdown, CSV, or JSON by file picker or drag and drop. Files stay in this browser. Maximum 2 MB per source and 8 MB total source text, subject to browser storage limits. CSV and JSON are read as source text, not spreadsheet visualizations. PDF is not supported.
6. Export your brief as Markdown. Quotes, personal notes, titles, authors, filenames, and original line references are kept distinct.
7. Open **Your desk. Your data.** and download a workspace backup. Import that JSON to merge documents, notes, and quote order back into a workspace. Re-importing an unchanged backup skips existing documents and passages.

Keyboard: **/** or **Ctrl/Cmd K** focuses search. **Escape** closes a reader. All paragraph-save, collection, reorder, and export actions are keyboard accessible. Grid and list layouts are available.

## Data and privacy

Data uses the browser's `localStorage`, scoped to this origin. This is not encryption, cloud sync, or automatic backup. A different browser or port has a separate workspace. Clearing browser data removes the local copy. Export important work. If saving fails, an explicit warning appears; the current session stays in memory and the app warns before navigation.

Removing a source preserves already saved quotes, notes, and citation snapshots. Missing originals are marked in the brief. Source removal and quote removal offer a ten-second undo. Markdown is displayed as escaped text with headings and preserved paragraphs; raw HTML never executes. Imported sources are not sent to any third-party service. The application makes no external network requests.

## Implementation

- Native ES modules and CSS; dependency-free Node static server.
- `model.js`: paragraph coordinates, literal full-text search, safe highlighting, TF-IDF similarity, import validation, citation snapshots, and Markdown export.
- `sample-data.js`: the clearly labeled fictional collection.
- `app.js`: browser storage, backup merge, document reader, quote collection, notes, drag-and-drop, and UI.
- `tests/`: source accuracy, search, similarity, import safety, backup validation, exports, and server behavior.

End-to-end browser checks: with the app running, execute `python3 tests/browser.py`. This optional check requires Python Playwright and a system Chromium at `/usr/bin/chromium`, both available in the prepared cloud environment. It tests the full workflow and saves desktop, reader, brief, and phone screenshots under `artifacts/`.

There is no language model integration. Every “connection” is a reproducible comparison of document vocabulary. A person supplies the interpretation.
