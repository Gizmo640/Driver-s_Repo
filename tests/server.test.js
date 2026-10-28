import test from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../server.js';

test('the actual server serves the app and refuses private files and unsupported methods', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base);
    assert.equal(response.status, 200); assert.match(await response.text(), /Commonplace/);
    assert.match(response.headers.get('content-type'), /text\/html/);
    for (const file of ['app.js', 'model.js', 'sample-data.js', 'styles.css', 'favicon.svg']) assert.equal((await fetch(`${base}/${file}`)).status, 200, file);
    for (const file of ['.git/config', 'package.json', 'server.js', '%2e%2e%2fserver.js']) assert.equal((await fetch(`${base}/${file}`)).status, 404, file);
    const head = await fetch(base, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
