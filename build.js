// Produce a dependency-free, single-file edition that also opens from disk.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const [html, css, model, samples, app, favicon] = await Promise.all(['index.html', 'styles.css', 'model.js', 'sample-data.js', 'app.js', 'favicon.svg'].map(read));
const unexport = source => source.replace(/^export /gm, '');
const script = `${unexport(model)}\n${unexport(samples)}\nconst esc = escapeHTML;\n${app.replace(/^import .+;\n/gm, '')}`;
const output = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
  .replace('<script type="module" src="app.js"></script>', '')
  .replace('</body>', () => `<script>(() => {\n'use strict';\n${script.replace(/<\/script/gi, '<\\/script')}\n})();</script></body>`)
  .replace('href="favicon.svg"', () => `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`);
await mkdir(new URL('artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('artifacts/Commonplace.html', import.meta.url), output);
console.log('Built artifacts/Commonplace.html — a portable, single-file edition.');
