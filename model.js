// All discovery is local and lexical. No network calls, embeddings, or generated claims.
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 8 * 1024 * 1024;
export const STORAGE_KEY = 'driver.commonplace.v1';
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function tokens(text) { return String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []; }
export function wordCount(text) { return tokens(text).length; }
export function readingTime(text) { return Math.max(1, Math.ceil(wordCount(text) / 220)); }
export function paragraphs(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const result = [];
  let buffer = [], start = 1;
  const flush = () => { if (buffer.length) result.push({ text: buffer.join('\n'), line: start, endLine: start + buffer.length - 1, heading: /^#{1,6}\s/.test(buffer[0]) }); buffer = []; };
  lines.forEach((line, i) => {
    if (!line.trim()) { flush(); return; }
    if (/^#{1,6}\s/.test(line)) { flush(); start = i + 1; buffer.push(line); flush(); return; }
    if (!buffer.length) start = i + 1;
    buffer.push(line);
  });
  flush(); return result;
}
export function queryTerms(query) {
  return [...query.matchAll(/"([^"]+)"|([^\s"]+)/g)].map(m => (m[1] || m[2]).toLowerCase()).filter(Boolean);
}
export function searchDocuments(documents, query = '', collection = 'all', sort = 'recent') {
  const terms = queryTerms(query);
  return documents.filter(d => collection === 'all' || (collection === 'imported' ? !d.sample : d.collection === collection)).map(doc => {
    const title = doc.title.toLowerCase(), tags = doc.tags.join(' ').toLowerCase();
    const body = doc.content.toLowerCase(), haystack = `${title}\n${tags}\n${body}`;
    if (!terms.every(term => haystack.includes(term))) return null;
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 12 : 0) + (tags.includes(term) ? 5 : 0) + Math.min(10, body.split(term).length - 1), 0);
    const match = terms.length ? paragraphs(doc.content).find(p => !p.heading && terms.some(t => p.text.toLowerCase().includes(t))) : null;
    return { doc, score, match };
  }).filter(Boolean).sort((a, b) => {
    if (terms.length && sort === 'relevance') return b.score - a.score || a.doc.title.localeCompare(b.doc.title);
    if (sort === 'title') return a.doc.title.localeCompare(b.doc.title);
    return new Date(b.doc.added) - new Date(a.doc.added) || a.doc.id.localeCompare(b.doc.id);
  });
}
export function highlight(text, query) {
  const terms = queryTerms(query).sort((a, b) => b.length - a.length);
  if (!terms.length) return escapeHTML(text);
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  // Split raw text, then escape every part: imported HTML can never execute.
  return String(text).split(regex).map((part, i) => i % 2 ? `<mark>${escapeHTML(part)}</mark>` : escapeHTML(part)).join('');
}
const stopwords = new Set('the a an and or but to of in on at for from by with as is are was were be been it its this that these those we our you your they their them he she his her not no can could would should will have has had do does did about into over more less than when where what which how who also one two some all each through between after before only there here so if then while very just same may most'.split(' '));
function termFrequency(doc) {
  const terms = tokens(`${doc.title} ${doc.title} ${doc.content}`).filter(t => t.length > 2 && !stopwords.has(t));
  const freq = new Map();
  terms.forEach(t => freq.set(t, (freq.get(t) ?? 0) + 1));
  return freq;
}
export function relatedDocuments(source, docs) {
  const corpus = docs.map(doc => ({ doc, freq: termFrequency(doc) }));
  const df = new Map();
  for (const { freq } of corpus) for (const term of freq.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  const vector = freq => new Map([...freq].map(([term, n]) => [term, (1 + Math.log(n)) * (1 + Math.log((docs.length + 1) / ((df.get(term) ?? 0) + 1)))]));
  const base = vector(termFrequency(source));
  const norm = v => Math.sqrt([...v.values()].reduce((s, n) => s + n * n, 0));
  const baseNorm = norm(base);
  return corpus.filter(({ doc }) => doc.id !== source.id).map(({ doc, freq }) => {
    const v = vector(freq);
    const shared = [...base].filter(([term]) => v.has(term)).map(([term, weight]) => ({ term, weight: weight * v.get(term) })).sort((a, b) => b.weight - a.weight);
    return { doc, score: baseNorm && norm(v) ? shared.reduce((s, t) => s + t.weight, 0) / (baseNorm * norm(v)) : 0, terms: shared.slice(0, 3).map(t => t.term) };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}
export function makePin(doc, paragraph, note = '') {
  return { id: crypto.randomUUID(), docId: doc.id, title: doc.title, author: doc.author, filename: doc.filename ?? null, sample: doc.sample, line: paragraph.line, endLine: paragraph.endLine, quote: paragraph.text, note, created: new Date().toISOString() };
}
const md = text => String(text).replace(/[\\`*_{}\[\]<>#!|]/g, '\\$&');
export function exportBrief(title, pins) {
  const header = `# ${md(title || 'Untitled research brief')}\n\nCollected in Commonplace. Quotes are verbatim source excerpts; notes are written by you.\n`;
  return header + pins.map((p, i) => `\n## ${i + 1}. ${md(p.title)}\n\n${p.quote.split('\n').map(line => `> ${md(line)}`).join('\n')}\n\n${p.note ? `**Your note:** ${md(p.note)}\n\n` : ''}**Source:** ${md(p.author)} · ${p.filename ? `${md(p.filename)} · ` : ''}lines ${p.line}–${p.endLine}${p.sample ? ' · Fictional sample document' : ''}\n`).join('');
}
export function importDocument(name, text, size = new TextEncoder().encode(text).length) {
  if (size > MAX_FILE_BYTES || new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error(`${name}: the limit is 2 MB per file.`);
  const extension = name.split('.').at(-1).toLowerCase();
  if (!['txt', 'md', 'markdown', 'csv', 'json'].includes(extension)) throw new Error(`${name}: use TXT, Markdown, CSV, or JSON.`);
  if (!text.trim()) throw new Error(`${name}: this file is empty.`);
  if (text.includes('\0') || text.includes('\ufffd')) throw new Error(`${name}: please use a UTF-8 text file.`);
  if (extension === 'json') { try { JSON.parse(text); } catch { throw new Error(`${name}: invalid JSON.`); } }
  const heading = text.match(/^#\s+(.+)$/m)?.[1];
  const title = (heading || name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')).slice(0, 160);
  return { id: crypto.randomUUID(), title, author: 'Your document', collection: 'research', type: extension === 'csv' ? 'Dataset' : extension === 'json' ? 'JSON' : 'Document', tags: ['Imported', extension.toUpperCase()], content: text.replace(/\r\n?/g, '\n'), added: new Date().toISOString(), sample: false, cover: 'paper', filename: name };
}
export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.docs) || !Array.isArray(value.pins)) return false;
  const str = x => typeof x === 'string';
  const ids = new Set();
  for (const d of value.docs) {
    if (!d || !['id', 'title', 'author', 'collection', 'type', 'content', 'added', 'cover'].every(k => str(d[k])) || !Array.isArray(d.tags) || !d.tags.every(str) || typeof d.sample !== 'boolean' || ids.has(d.id) || (d.filename != null && !str(d.filename))) return false;
    ids.add(d.id);
  }
  const pinIds = new Set();
  return value.pins.every(p => {
    if (!p || !['id', 'docId', 'title', 'author', 'quote', 'note', 'created'].every(k => str(p[k])) || typeof p.sample !== 'boolean' || (p.filename != null && !str(p.filename)) || !Number.isInteger(p.line) || !Number.isInteger(p.endLine) || p.line <= 0 || p.endLine < p.line || pinIds.has(p.id)) return false;
    pinIds.add(p.id); return true;
  }) && str(value.briefTitle);
}
