# User and delivery requirements

- The primary user runs a **Linux desktop** with an existing web browser and does **not want npm**. The finished application must run without npm, Node.js, Python, a terminal, package installation, or a local server.
- Lead user instructions with the already-built `artifacts/Commonplace.html` and portable ZIP. Do not tell the user to rebuild the app or open the source `index.html`. Keep optional maintainer instructions in `DEVELOPING.md`.
- Desktop mouse/keyboard use is the primary verification target. Responsive layout checks are secondary; do not present mobile testing as evidence for the user's desktop workflow.
- Keep `artifacts/Commonplace.html` and `artifacts/Commonplace-portable.zip` synchronized with source changes. The ZIP must contain the current HTML and `PORTABLE-README.txt` named `START-HERE.txt`.
- Maintainers may use preinstalled development tools to build and test. That does not make those tools prerequisites for the user. `node build.js` rebuilds the HTML without npm. `python3 tests/portable_desktop.py` checks the packaged desktop workflow without a development server.
- Be precise about validation: managed Chromium blocks `file://` navigation, so direct file-manager opening and untested browsers cannot be claimed as verified. Test the exact standalone artifact and preserve the user's data and citation accuracy.
