import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const publicFiles = new Set(['index.html', 'styles.css', 'app.js', 'model.js', 'sample-data.js', 'favicon.svg']);
export const server = http.createServer(async (req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html'; }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  if (!publicFiles.has(name)) { res.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(path.join(root, name));
    res.writeHead(200, { 'Content-Type': `${types[path.extname(name)]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500).end('Unable to read application file'); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => console.log(`Commonplace listening on port ${port}`));
}
