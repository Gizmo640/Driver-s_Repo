# Optional development instructions

These instructions are for editing and testing the source. **Linux desktop users do not need these tools.** The committed `artifacts/Commonplace.html` is the ready-to-use app; see [README.md](README.md).

## Edit and rebuild

The application uses native JavaScript and CSS with no third-party runtime dependencies. If you choose to develop it, Node.js 20 or newer can regenerate the standalone file directly. No npm installation or invocation is needed.

```sh
node build.js
```

This writes `artifacts/Commonplace.html`. The standalone script is embedded at the end of the document; it makes no module imports or external asset requests. Repackage the portable ZIP with this HTML and `PORTABLE-README.txt` renamed to `START-HERE.txt` after changes. Do not ship a stale ZIP.

## Optional source server

```sh
node server.js
```

The source server listens on port 3000. Set `PORT` to choose another port. It serves the source edition, not private documents, and has no authentication. Stop it with Ctrl+C. Running it is unnecessary for the standalone app.

## Tests for maintainers

```sh
node --test tests/*.test.js
```

These check source-line accuracy, literal search, safe highlighting, TF-IDF suggestions, import validation, backup validation, Markdown export, and server behavior.

The primary user-facing test is the **standalone Linux desktop workflow**:

```sh
python3 tests/portable_desktop.py
```

This developer-only test requires Python Playwright and system Chromium, available in the prepared cloud environment. It uses the committed HTML and portable ZIP with no Node process, npm command, or HTTP server. The cloud Chromium policy prohibits `file://` navigation, so Playwright fulfills one local test URL with the exact artifact. It checks imports, exact source citations, notes, reload persistence, exports, backup/restore, keyboard navigation, no external requests, and package consistency. Direct file-manager opening and Firefox remain unverified here.

`python3 tests/browser.py` additionally tests the source edition with `node server.js` running. Its phone-size layout checks are secondary coverage; they are not the target user's setup instructions.

## Files

- `app.js`: browser storage, backup merge, reader, quote collection, notes, drag-and-drop, and UI.
- `model.js`: paragraph coordinates, search, safe highlighting, TF-IDF similarity, import validation, citation snapshots, and Markdown export.
- `sample-data.js`: explicitly fictional starter documents.
- `index.html`, `styles.css`, `favicon.svg`: source interface and embedded artwork.
- `build.js`: dependency-free standalone HTML builder.
- `server.js`: optional source development server.
- `artifacts/Commonplace.html`, `artifacts/Commonplace-portable.zip`: committed, ready-to-use desktop distribution.

There is no language-model integration. Related-source suggestions are lexical comparisons, not generated interpretations. User material is stored by the browser and is never uploaded to an external service.
