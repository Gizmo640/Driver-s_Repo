import test from 'node:test';
import assert from 'node:assert/strict';
import { paragraphs, searchDocuments, highlight, relatedDocuments, makePin, exportBrief, importDocument, validateState, MAX_FILE_BYTES, wordCount } from '../model.js';
import { sampleDocuments } from '../sample-data.js';

const docs = sampleDocuments();
test('all starter documents are explicitly fictional and have unique IDs', () => {
  assert.equal(docs.length, 9);
  assert.equal(new Set(docs.map(d => d.id)).size, docs.length);
  assert.ok(docs.every(d => d.sample && /fictional|invented|imagined/i.test(d.content)));
});
test('every saved paragraph can be recovered verbatim at its original line numbers', () => {
  for (const doc of docs) for (const part of paragraphs(doc.content)) {
    const pin = makePin(doc, part);
    assert.equal(doc.content.split('\n').slice(pin.line - 1, pin.endLine).join('\n'), pin.quote);
    assert.equal(pin.title, doc.title);
  }
});
test('paragraph coordinates survive empty lines, headings, and CRLF', () => {
  assert.deepEqual(paragraphs('# Title\r\n\r\nFirst line\r\nsecond line\r\n\r\n\r\nLast'), [
    { text: '# Title', line: 1, endLine: 1, heading: true },
    { text: 'First line\nsecond line', line: 3, endLine: 4, heading: false },
    { text: 'Last', line: 7, endLine: 7, heading: false },
  ]);
});
test('search requires every term and handles exact phrases case-insensitively', () => {
  const results = searchDocuments(docs, '"public space" library', 'all', 'relevance');
  assert.ok(results.length > 0);
  for (const { doc } of results) {
    assert.match(doc.content.toLowerCase(), /public space/);
    assert.match(doc.content.toLowerCase(), /library/);
  }
  assert.equal(searchDocuments(docs, '"public library impossible phrase"').length, 0);
  assert.ok(searchDocuments(docs, '"PUBLIC SPACE"').length > 0);
  assert.equal(searchDocuments(docs, 'city definitelynotpresent').length, 0);
});
test('collection filters and title sorting apply to the actual matching sources', () => {
  const filtered = searchDocuments(docs, '', 'design', 'title');
  assert.equal(filtered.length, 3);
  assert.ok(filtered.every(r => r.doc.collection === 'design'));
  assert.deepEqual(filtered.map(r => r.doc.title), filtered.map(r => r.doc.title).sort((a, b) => a.localeCompare(b)));
  assert.equal(searchDocuments(docs, '', 'imported').length, 0);
});
test('highlighting escapes HTML and treats regex characters literally', () => {
  assert.equal(highlight('<img src=x onerror=alert(1)> [a+b]', '[a+b]'), '&lt;img src=x onerror=alert(1)&gt; <mark>[a+b]</mark>');
  assert.equal(highlight('A & B', '&'), 'A <mark>&amp;</mark> B');
  assert.equal(highlight('nothing', '('), 'nothing');
});
test('related suggestions are ranked by content and expose real shared terms', () => {
  const source = { ...docs[0], id: 'a', title: 'Orchard', content: 'apple harvest orchard fruit' };
  const related = { ...docs[1], id: 'b', title: 'Fruit', content: 'apple orchard harvest season' };
  const unrelated = { ...docs[2], id: 'c', title: 'Ocean', content: 'deep blue ocean waves' };
  const result = relatedDocuments(source, [source, related, unrelated]);
  assert.equal(result[0].doc.id, 'b');
  assert.ok(result[0].score > 0 && result[0].score <= 1 + 1e-9);
  assert.ok(result[0].terms.includes('orchard'));
  assert.ok(!result.some(r => ['a', 'c'].includes(r.doc.id)));
});
test('brief export keeps notes distinct and cites original source lines', () => {
  const doc = docs[0], part = paragraphs(doc.content).find(p => !p.heading);
  const pin = makePin(doc, part, 'My interpretation, not the author’s.');
  const output = exportBrief('Test brief', [pin]);
  assert.match(output, /^# Test brief/);
  assert.ok(output.includes(`> ${part.text}`));
  assert.ok(output.includes(`lines ${part.line}–${part.endLine}`));
  assert.match(output, /\*\*Your note:\*\* My interpretation/);
  assert.match(output, /Fictional sample document/);
  assert.equal(exportBrief('', []), '# Untitled research brief\n\nCollected in Commonplace. Quotes are verbatim source excerpts; notes are written by you.\n');
});
test('imports support text formats without executing or rewriting their content', () => {
  const content = '# A real source\n\n<script>window.bad=true</script>\n\nExact words.';
  const doc = importDocument('my-notes.md', content);
  assert.equal(doc.title, 'A real source'); assert.equal(doc.content, content);
  assert.equal(doc.sample, false); assert.equal(doc.filename, 'my-notes.md');
  assert.equal(importDocument('raw-data.csv', 'name,count\nA,3').type, 'Dataset');
  assert.equal(importDocument('a.json', '{"ok":true}').type, 'JSON');
});
test('empty, oversized, binary, invalid JSON, and unsupported imports fail with useful errors', () => {
  for (const [name, text, size, message] of [
    ['empty.txt', '  ', undefined, /empty/], ['huge.txt', 'abc', MAX_FILE_BYTES + 1, /2 MB/],
    ['binary.txt', 'a\0b', undefined, /UTF-8/], ['bad.json', '{nope}', undefined, /invalid JSON/], ['paper.pdf', 'abc', undefined, /TXT/],
  ]) assert.throws(() => importDocument(name, text, size), message);
});
test('backup validation rejects invalid types and duplicate source identifiers', () => {
  const valid = { version: 1, docs, pins: [makePin(docs[0], paragraphs(docs[0].content)[2])], briefTitle: 'Brief' };
  assert.ok(validateState(JSON.parse(JSON.stringify(valid))));
  assert.equal(validateState({ ...valid, docs: [...docs, docs[0]] }), false);
  assert.equal(validateState({ ...valid, pins: [{ ...valid.pins[0], line: -1 }] }), false);
  assert.equal(validateState({ ...valid, docs: [{ ...docs[0], title: {} }] }), false);
  assert.equal(validateState({}), false);
});
test('word counts support non-ASCII source text', () => {
  assert.equal(wordCount('Café déjà vu — naïve façade.'), 5);
});
