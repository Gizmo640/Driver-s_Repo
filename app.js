import { escapeHTML as esc, paragraphs, searchDocuments, highlight, readingTime, wordCount, relatedDocuments, makePin, exportBrief, importDocument, validateState, MAX_LIBRARY_BYTES, STORAGE_KEY } from './model.js';
import { sampleDocuments } from './sample-data.js';

const $ = id => document.getElementById(id);
const icons = {
  library: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="16" rx="1"/><path d="m17 5 4 14-3 1-4-14"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  home: '<path d="m3 10 9-7 9 7v10h-6v-6H9v6H3Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  grid: '<rect x="3" y="3" width="6" height="6" rx=".5"/><rect x="15" y="3" width="6" height="6" rx=".5"/><rect x="3" y="15" width="6" height="6" rx=".5"/><rect x="15" y="15" width="6" height="6" rx=".5"/>',
  list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h2M3 12h2M3 19h2"/>',
  book: '<path d="M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v16"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  link: '<path d="m9 15 6-6m-8 4-2 2a4 4 0 0 0 6 6l3-3a4 4 0 0 0 0-6m-4 0a4 4 0 0 1 0-6l3-3a4 4 0 0 1 6 6l-2 2"/>',
  quote: '<path d="M4 6h6v8H5c0 3 2 4 4 4M14 6h6v8h-5c0 3 2 4 4 4"/>',
  file: '<path d="M5 2h9l5 5v15H5Zm9 0v6h5M8 12h8M8 16h8"/>',
  arrow: '<path d="M6 18 18 6M6 6h12v12"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? icons.file}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
// Draw arrows as vectors; minimal Linux font sets do not always include ↗.
const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
const arrowTextNodes = [];
while (textWalker.nextNode()) if (textWalker.currentNode.textContent.includes('↗')) arrowTextNodes.push(textWalker.currentNode);
for (const node of arrowTextNodes) {
  const fragment = document.createDocumentFragment();
  node.textContent.split('↗').forEach((text, i) => {
    if (i) { const span = document.createElement('span'); span.className = 'inline-arrow'; span.innerHTML = icon('arrow'); fragment.append(span); }
    fragment.append(document.createTextNode(text));
  });
  node.replaceWith(fragment);
}

let state = { version: 1, docs: sampleDocuments(), pins: [], briefTitle: 'Notes on a more thoughtful world' };
let collection = 'all', view = 'library', layout = 'grid', currentDocId = null, toastTimer, pendingUndo = null;
let unsaved = false, persistenceBlocked = false, storageWarned = false;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (!validateState(parsed)) throw new Error('Invalid saved workspace');
    state = parsed;
  }
} catch {
  persistenceBlocked = true; unsaved = true;
  setTimeout(() => toast('Stored data could not be read. Working in memory; the stored copy is untouched. Export to keep new work.'), 100);
}

function save() {
  try {
    if (persistenceBlocked) throw new Error('Stored workspace unreadable');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); unsaved = false;
  } catch {
    unsaved = true;
    if (!storageWarned) { toast('Browser storage is unavailable or full. Your work is in memory. Export a workspace backup to keep it.'); storageWarned = true; }
  }
  $('storage-status').textContent = unsaved ? 'Not saved — export a backup' : 'Saved on this device';
  return !unsaved;
}
if (persistenceBlocked) $('storage-status').textContent = 'Memory only — export a backup';
window.addEventListener('beforeunload', event => { if (unsaved) { event.preventDefault(); event.returnValue = ''; } });

function toast(message, undo = null) {
  clearTimeout(toastTimer); pendingUndo = undo;
  if (unsaved && !/memory|backup/i.test(message)) message += ' Session only — export a workspace backup to keep this change.';
  $('toast').innerHTML = `<span>${esc(message)}</span>${undo ? '<button id="undo-action">Undo</button>' : ''}`;
  if (undo) $('undo-action').onclick = () => { const action = pendingUndo; pendingUndo = null; $('toast').hidePopover?.(); $('toast').hidden = true; action?.(); };
  $('toast').hidden = false;
  $('toast').showPopover?.();
  toastTimer = setTimeout(() => { $('toast').hidePopover?.(); $('toast').hidden = true; pendingUndo = null; }, undo ? 10000 : 6500);
}

const categories = { culture: 'Culture & community', design: 'Design & attention', research: 'Research & observations' };
const descriptions = {
  night: 'On the quiet places that keep a neighborhood awake.', third: 'The ordinary rooms that make us feel at home.', between: 'A little room for the thought that hasn’t formed yet.', ritual: 'A conversation about showing up for one another.', time: 'Notes on waiting, lingering, and finding a place to stay.', slow: 'Not every good tool needs to make us faster.', listen: 'The small permissions that make belonging possible.', library: 'A shelf, a chair, and a different kind of catalog.', serendipity: 'Finding the question you didn’t know to ask.',
};

function coverArt(type) {
  const artworks = {
    night: '<rect width="320" height="190" fill="#334a42"/><circle cx="233" cy="46" r="23" fill="#d4cf9d"/><path d="M0 157V88h30v-25h41v59h28V45h34v95h30V80h36v66h25v-36h34v40h32V97h30v93H0" fill="#243c34"/><path d="M18 99h5m17-23h6m63-12h6m-6 19h6m60 9h6m0 21h6m64 9h5m47-12h5" stroke="#d5c68b" stroke-width="5"/><path d="M0 166h320M0 180h320" stroke="#8b9b7b" stroke-width=".5" opacity=".4"/>',
    arches: '<rect width="320" height="190" fill="#b5b8a2"/><path d="M0 190V71a67 67 0 0 1 134 0v119" fill="#d8d7bc"/><path d="M34 190V75a33 33 0 0 1 66 0v115" fill="#83937c"/><path d="M128 190V98a67 67 0 0 1 134 0v92" fill="#677e68"/><path d="M160 190V98a35 35 0 0 1 70 0v92" fill="#2f4e40"/><path d="M256 0h64v190h-64" fill="#a5ad92"/><circle cx="195" cy="112" r="12" fill="#d4ceaa"/><path d="M145 190h105" stroke="#d5ceb1" stroke-width="1"/>',
    stairs: '<rect width="320" height="190" fill="#c3baa1"/><path d="M0 190V157h46v-30h46V97h46V67h46V37h46V7h90v183Z" fill="#e0d8bc"/><path d="M46 157h46v-30h46V97h46V67h46V37h90" stroke="#a49f80" stroke-width="1"/><path d="m230 7 40 34v149H46l-46-33h46v-30h46V97h46V67h46V37h46Z" fill="#f0ead0" opacity=".16"/><circle cx="76" cy="45" r="19" fill="#6c7c5f"/>',
    sun: '<rect width="320" height="190" fill="#c6a48b"/><circle cx="160" cy="95" r="65" fill="#dcd0ae"/><path d="M0 150q80-70 160 0t160 0v40H0" fill="#7d896a"/><path d="M0 175q80-70 160 0t160 0v15H0" fill="#4e6a51"/><circle cx="160" cy="88" r="30" fill="#d19768"/><path d="M160 32v14m0 84v14m-56-56h14m84 0h14m-96-40 10 10m60 60 10 10m0-80-10 10m-60 60-10 10" stroke="#b5a17a" stroke-width="1"/>',
    atlas: '<rect width="320" height="190" fill="#748773"/><g stroke="#b2bca0" stroke-width=".8" fill="none" opacity=".65"><ellipse cx="162" cy="102" rx="24" ry="19"/><ellipse cx="162" cy="102" rx="44" ry="35"/><ellipse cx="162" cy="102" rx="65" ry="51"/><ellipse cx="162" cy="102" rx="86" ry="69"/><ellipse cx="162" cy="102" rx="107" ry="86"/><ellipse cx="162" cy="102" rx="128" ry="104"/><ellipse cx="162" cy="102" rx="150" ry="122"/><path d="M0 102h320M162 0v190" opacity=".5"/></g><circle cx="162" cy="102" r="5" fill="#e7ddba"/>',
    orbit: '<rect width="320" height="190" fill="#b4bca7"/><circle cx="162" cy="95" r="49" fill="#dfe0c5"/><g fill="none" stroke="#6d8364" stroke-width="1"><ellipse cx="162" cy="95" rx="103" ry="29" transform="rotate(-25 162 95)"/><ellipse cx="162" cy="95" rx="103" ry="29" transform="rotate(35 162 95)"/><ellipse cx="162" cy="95" rx="103" ry="29" transform="rotate(95 162 95)"/></g><circle cx="78" cy="64" r="7" fill="#556d51"/><circle cx="244" cy="55" r="4" fill="#b18158"/>',
    windows: '<rect width="320" height="190" fill="#656e5e"/><path d="M0 0h320v190H0Z" fill="#53624f"/><g fill="#b2ac81"><path d="M36 30h53v62H36zM133 30h53v62h-53zM231 30h53v62h-53zM36 124h53v66H36zM133 124h53v66h-53zM231 124h53v66h-53z"/></g><path d="M62 30v62m-26-31h53m70-31v62m-26-31h53m71-31v62m-26-31h53M62 124v66m97-66v66m98-66v66" stroke="#7c805f" stroke-width="4"/><path d="M40 128h18v50H40m98-50h17v44h-17" fill="#d3c393"/>',
    shelf: '<rect width="320" height="190" fill="#bec4aa"/><path d="M30 147h260v7H30" fill="#738368"/><path d="M54 147V54h23v93" fill="#5b755b"/><path d="M83 147V39h29v108" fill="#d1c49a"/><path d="M118 147V65h19v82" fill="#8d987a"/><path d="m146 147 24-95 27 7-24 88" fill="#c19d7b"/><path d="M205 147V73h30v74" fill="#6b8062"/><path d="M242 147V59h20v88" fill="#e0d8b9"/><path d="M58 68h15m15-13h20m14 27h12m76 10h20m16-15h12" stroke="#f2ebcf" opacity=".6"/>',
    shapes: '<rect width="320" height="190" fill="#ddd5bd"/><path d="M45 144V70a52 52 0 0 1 104 0v74Z" fill="#8c9c7d"/><circle cx="211" cy="76" r="45" fill="#bd9c79"/><path d="m152 163 47-92 47 92Z" fill="#526e54"/><path d="M33 162h253M271 25v142" stroke="#8b977b" stroke-width=".7"/><circle cx="103" cy="115" r="24" fill="#e7dfc4"/>',
    paper: '<rect width="320" height="190" fill="#b7c0a5"/><rect x="99" y="23" width="126" height="151" rx="2" fill="#eae7d5" transform="rotate(8 162 95)"/><g stroke="#aab399" stroke-width="1"><path d="m125 68 74 10m-77 9 74 10m-77 9 74 10m-77 9 53 7"/></g><path d="m140 33 55 7" stroke="#7c9169" stroke-width="3"/>',
  };
  return `<svg viewBox="0 0 320 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${artworks[type] || artworks.paper}</svg>`;
}

function updateCounts() {
  $('library-count').textContent = state.docs.length; $('brief-count').textContent = state.pins.length;
  $('count-all').textContent = state.docs.length;
  for (const key of Object.keys(categories)) $(`count-${key}`).textContent = state.docs.filter(d => d.collection === key).length;
  $('count-imported').textContent = state.docs.filter(d => !d.sample).length;
  $('export-brief').disabled = !state.pins.length;
}
function renderLibrary() {
  const query = $('search').value;
  const results = searchDocuments(state.docs, query, collection, $('sort').value);
  $('collection-title').textContent = collection === 'all' ? 'The collection' : collection === 'imported' ? 'Your imports' : categories[collection];
  $('result-count').textContent = `${results.length} ${results.length === 1 ? 'source' : 'sources'}`;
  $('clear-search').hidden = !query;
  $('active-search').hidden = !query;
  $('active-search').textContent = `Matching ${query} · all terms required · quoted phrases match exactly`;
  $('empty-library').hidden = results.length > 0;
  $('library-grid').classList.toggle('list-layout', layout === 'list');
  $('library-grid').innerHTML = results.map(({ doc, match }, i) => {
    const excerpt = doc.sample ? descriptions[doc.id.replace('sample-', '')] : paragraphs(doc.content).find(p => !p.heading)?.text;
    return `<article class="source-card"><button class="card-open" data-open="${esc(doc.id)}" aria-label="Read ${esc(doc.title)}"></button><div class="cover">${coverArt(doc.cover)}<span class="cover-type">${esc(doc.type.toUpperCase())}</span><span class="cover-number">${doc.sample ? 'SAMPLE' : 'PRIVATE'} / ${String(i + 1).padStart(2, '0')}</span></div><div class="card-content"><div class="card-category"><i></i>${esc(categories[doc.collection] || 'Your collection')}</div><h3>${highlight(doc.title, query)}</h3><p>${esc(excerpt?.slice(0, 200) || 'Your next thought starts here.')}</p><div class="card-meta"><span><i class="author-dot">${esc(doc.author[0] || '?')}</i>${esc(doc.author)}</span><span>${readingTime(doc.content)} min read</span></div><div class="card-bottom">${doc.tags.slice(0, 2).map(t => `<span class="tag">${esc(t)}</span>`).join('')}<span>${icon('arrow')}</span></div></div>${match ? `<div class="search-snippet"><small>MATCH · LINES ${match.line}–${match.endLine}</small>${highlight(snippet(match.text, query), query)}</div>` : ''}</article>`;
  }).join('');
  $('library-grid').querySelectorAll('[data-open]').forEach(button => button.onclick = () => openDoc(button.dataset.open));
  const sampleCount = state.docs.filter(d => d.sample).length;
  $('library-footnote').innerHTML = sampleCount ? `${sampleCount} fictional sample sources to explore. <strong>Bring your own material to make this desk yours.</strong>` : 'Your sources stay on this device. Export a workspace backup to keep a copy.';
  $('restore-samples').hidden = sampleCount === 9;
  updateCounts();
}
function snippet(text, query) {
  const terms = query.toLowerCase().match(/[^\s"]+/g) || [];
  const positions = terms.map(t => text.toLowerCase().indexOf(t)).filter(i => i >= 0);
  const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 40);
  return `${start ? '…' : ''}${text.slice(start, start + 180)}${text.length > start + 180 ? '…' : ''}`;
}
function setView(next) {
  view = next;
  $('library-view').hidden = next !== 'library'; $('brief-view').hidden = next !== 'brief';
  $('nav-library').classList.toggle('active', next === 'library'); $('nav-brief').classList.toggle('active', next === 'brief');
  $('nav-library').setAttribute('aria-current', next === 'library' ? 'page' : 'false');
  $('nav-brief').setAttribute('aria-current', next === 'brief' ? 'page' : 'false');
  $('breadcrumb').textContent = next === 'library' ? 'Library' : 'Your brief';
  if (next === 'brief') renderBrief(); else renderLibrary();
}
function setCollection(next) {
  collection = next;
  $('mobile-collection').value = next;
  document.querySelectorAll('[data-collection]').forEach(b => { b.classList.toggle('active', b.dataset.collection === next); b.setAttribute('aria-pressed', String(b.dataset.collection === next)); });
  setView('library');
}

function openDoc(id, line = null) {
  const doc = state.docs.find(d => d.id === id);
  if (!doc) { toast('The original source was removed. Your saved quote and citation are still in the brief.'); return; }
  currentDocId = id;
  $('reader-title').textContent = doc.title;
  $('reader-type').textContent = doc.type.toUpperCase(); $('reader-sample').hidden = !doc.sample;
  $('reader-tags').innerHTML = doc.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');
  $('reader-meta').innerHTML = `<span>${esc(doc.author)}</span><span>${wordCount(doc.content).toLocaleString()} words</span><span>${readingTime(doc.content)} min read</span>`;
  $('source-filename').textContent = doc.filename || 'FICTIONAL SAMPLE · COMMONPLACE STARTER COLLECTION';
  $('reader-body').innerHTML = paragraphs(doc.content).map((p, index) => p.heading ? `<h3>${highlight(p.text.replace(/^#{1,6}\s+/, ''), $('search').value)}</h3>` : `<section class="source-paragraph" id="paragraph-${p.line}"><span class="line-label" aria-hidden="true">${p.line}</span><p>${highlight(p.text, $('search').value)}</p><button data-pin="${index}" aria-label="Save passage at line ${p.line} to your brief" aria-pressed="false" title="Save this passage">＋</button></section>`).join('');
  $('reader-body').querySelectorAll('[data-pin]').forEach(button => button.onclick = () => pinParagraph(doc, paragraphs(doc.content)[Number(button.dataset.pin)]));
  const related = relatedDocuments(doc, state.docs);
  $('related-docs').innerHTML = related.length ? related.map(r => `<article class="related-card"><button data-related="${esc(r.doc.id)}" aria-label="Read related source: ${esc(r.doc.title)}"></button><small>${esc(r.doc.type)}</small><h4>${esc(r.doc.title)}</h4><p>Shared language<br><strong>${r.terms.map(esc).join(' · ')}</strong></p></article>`).join('') : '<p class="no-connections">Add more sources to discover shared language.</p>';
  $('related-docs').querySelectorAll('[data-related]').forEach(b => b.onclick = () => openDoc(b.dataset.related));
  updateReaderPins();
  if (!$('reader').open) $('reader').showModal();
  document.querySelector('.reader-article').scrollTop = 0;
  document.querySelector('.reader-layout').scrollTop = 0;
  $('reader-close').focus({ preventScroll: true });
  if (line) requestAnimationFrame(() => {
    const p = $(`paragraph-${line}`);
    p?.scrollIntoView({ block: 'center', behavior: 'smooth' }); p?.classList.add('source-flash');
  });
}
function updateReaderPins() {
  const doc = state.docs.find(d => d.id === currentDocId);
  if (!doc) return;
  const parts = paragraphs(doc.content);
  $('reader-body').querySelectorAll('[data-pin]').forEach(b => {
    const p = parts[Number(b.dataset.pin)], saved = state.pins.some(pin => pin.docId === doc.id && pin.line === p.line && pin.quote === p.text);
    b.textContent = saved ? '✓' : '＋'; b.setAttribute('aria-pressed', String(saved)); b.title = saved ? 'Already in your brief' : 'Save this passage';
  });
  $('reader-pin-count').textContent = `${state.pins.length} ${state.pins.length === 1 ? 'passage' : 'passages'} in your brief`;
}
function pinParagraph(doc, paragraph) {
  if (state.pins.some(p => p.docId === doc.id && p.line === paragraph.line && p.quote === paragraph.text)) { toast('Already kept. Add your own note in the brief.'); return; }
  const pin = makePin(doc, paragraph); state.pins.push(pin); save(); updateCounts(); updateReaderPins();
  toast('Passage kept. Its source and line numbers came along.', () => { state.pins = state.pins.filter(p => p.id !== pin.id); save(); updateCounts(); updateReaderPins(); if (view === 'brief') renderBrief(); });
}
function renderBrief() {
  $('brief-title').value = state.briefTitle;
  $('brief-empty').hidden = state.pins.length > 0;
  $('brief-pins').innerHTML = state.pins.map((p, index) => {
    const exists = state.docs.some(d => d.id === p.docId);
    return `<article class="pin-card" data-pin-id="${esc(p.id)}"><div class="pin-header"><span class="pin-number">${String(index + 1).padStart(2, '0')}</span><div><button class="pin-source" data-source="${esc(p.id)}">${esc(p.title)} ${icon('arrow')}</button><div class="pin-location">${esc(p.author)} · LINES ${p.line}–${p.endLine}${p.sample ? ' · FICTIONAL SAMPLE' : ''}</div></div><button class="pin-remove" data-remove-pin="${esc(p.id)}" aria-label="Remove quote from ${esc(p.title)}">×</button></div><blockquote>${esc(p.quote)}</blockquote><label for="note-${esc(p.id)}">YOUR THOUGHTS</label><textarea id="note-${esc(p.id)}" data-note="${esc(p.id)}" maxlength="30000" placeholder="What does this bring to mind? How does it connect?">${esc(p.note)}</textarea><div class="pin-actions"><button data-move="up" data-id="${esc(p.id)}" ${index === 0 ? 'disabled' : ''} aria-label="Move quote up">↑ Move up</button><button data-move="down" data-id="${esc(p.id)}" ${index === state.pins.length - 1 ? 'disabled' : ''} aria-label="Move quote down">↓ Move down</button>${!exists ? '<span class="pin-missing">Original source removed · quote preserved</span>' : ''}</div></article>`;
  }).join('');
  $('brief-pins').querySelectorAll('[data-note]').forEach(input => input.oninput = () => { state.pins.find(p => p.id === input.dataset.note).note = input.value; save(); });
  $('brief-pins').querySelectorAll('[data-source]').forEach(b => b.onclick = () => { const p = state.pins.find(p => p.id === b.dataset.source); openDoc(p.docId, p.line); });
  $('brief-pins').querySelectorAll('[data-remove-pin]').forEach(b => b.onclick = () => {
    const index = state.pins.findIndex(p => p.id === b.dataset.removePin), [removed] = state.pins.splice(index, 1);
    save(); renderBrief(); updateCounts();
    toast('Passage removed from your brief.', () => { state.pins.splice(index, 0, removed); save(); renderBrief(); updateCounts(); });
  });
  $('brief-pins').querySelectorAll('[data-move]').forEach(b => b.onclick = () => {
    const from = state.pins.findIndex(p => p.id === b.dataset.id), to = from + (b.dataset.move === 'up' ? -1 : 1);
    if (to < 0 || to >= state.pins.length) return;
    [state.pins[from], state.pins[to]] = [state.pins[to], state.pins[from]]; save(); renderBrief();
    $('announcements').textContent = `Quote moved to position ${to + 1}.`;
    $('brief-pins').querySelector(`[data-id="${CSS.escape(b.dataset.id)}"][data-move="${b.dataset.move}"]`)?.focus();
  });
  updateCounts();
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function workspaceBytes(docs) { return new TextEncoder().encode(docs.map(d => d.content).join('')).length; }
function mergeBackup(backup) {
  const docs = [...state.docs], mapping = new Map();
  for (const original of backup.docs) {
    const existing = docs.find(d => d.id === original.id);
    if (existing && existing.content === original.content) { mapping.set(original.id, existing.id); continue; }
    const doc = structuredClone(original);
    if (existing) doc.id = crypto.randomUUID();
    mapping.set(original.id, doc.id); docs.push(doc);
  }
  if (workspaceBytes(docs) > MAX_LIBRARY_BYTES) throw new Error('This backup would exceed the 8 MB source-text limit.');
  const pins = [...state.pins];
  for (const original of backup.pins) {
    const pin = { ...original, docId: mapping.get(original.docId) || original.docId };
    const existing = pins.find(p => p.id === pin.id);
    if (existing && JSON.stringify(existing) === JSON.stringify(pin)) continue;
    if (existing) pin.id = crypto.randomUUID();
    pins.push(pin);
  }
  const added = docs.length - state.docs.length;
  const addedPins = pins.length - state.pins.length;
  state.docs = docs; state.pins = pins;
  if (!state.briefTitle || (state.pins.length === addedPins && addedPins > 0)) state.briefTitle = backup.briefTitle;
  return `${added} sources and ${addedPins} passages restored`;
}
async function importFiles(files) {
  let added = 0, skipped = 0; const errors = [], backups = [];
  for (const file of files) {
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name}: this file is too large.`);
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        let parsed;
        try { parsed = JSON.parse(text); } catch { /* importDocument reports malformed JSON */ }
        if (parsed?.version === 1 && Array.isArray(parsed.docs) && Array.isArray(parsed.pins)) {
          if (!validateState(parsed)) throw new Error(`${file.name}: the workspace backup is invalid.`);
          backups.push(mergeBackup(parsed)); continue;
        }
      }
      const doc = importDocument(file.name, text, file.size);
      if (state.docs.some(d => !d.sample && d.filename === doc.filename && d.content === doc.content)) { skipped++; continue; }
      if (workspaceBytes([...state.docs, doc]) > MAX_LIBRARY_BYTES) throw new Error(`${file.name}: workspace source text would exceed 8 MB.`);
      state.docs.unshift(doc); added++;
    } catch (error) { errors.push(error.message); }
  }
  if (added || backups.length) { save(); setCollection(added ? 'imported' : 'all'); }
  renderLibrary(); if (view === 'brief') renderBrief();
  const messages = [added ? `${added} ${added === 1 ? 'source' : 'sources'} added. Nothing was uploaded.` : '', ...backups, skipped ? `${skipped} duplicate ${skipped === 1 ? 'file' : 'files'} skipped.` : '', ...errors].filter(Boolean);
  toast(messages.join(' ') || 'No files selected.');
  $('file-input').value = '';
}

$('import-button').onclick = () => $('file-input').click();
$('file-input').onchange = e => importFiles(e.target.files);
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
document.querySelectorAll('[data-collection]').forEach(b => b.onclick = () => setCollection(b.dataset.collection));
$('search').oninput = () => { if ($('search').value) $('sort').value = 'relevance'; renderLibrary(); };
$('clear-search').onclick = () => { $('search').value = ''; renderLibrary(); $('search').focus(); };
$('sort').onchange = renderLibrary;
$('mobile-collection').onchange = e => setCollection(e.target.value);
$('grid-view').onclick = () => setLayout('grid'); $('list-view').onclick = () => setLayout('list');
function setLayout(next) { layout = next; for (const name of ['grid', 'list']) { $(`${name}-view`).classList.toggle('active', name === next); $(`${name}-view`).setAttribute('aria-pressed', String(name === next)); } renderLibrary(); }
$('clear-filters').onclick = () => { $('search').value = ''; setCollection('all'); };
$('browse-library').onclick = () => setView('library');
$('reader-close').onclick = () => $('reader').close();
$('reader-to-brief').onclick = () => { $('reader').close(); setView('brief'); };
$('brief-title').oninput = () => { state.briefTitle = $('brief-title').value; save(); };
$('export-brief').onclick = () => { download('commonplace-brief.md', exportBrief(state.briefTitle, state.pins), 'text/markdown;charset=utf-8'); toast('Brief exported with quotes, notes, and source line references.'); };
$('export-workspace').onclick = () => { download('commonplace-workspace.json', JSON.stringify(state, null, 2), 'application/json'); toast('Workspace backup downloaded. Keep this file somewhere safe.'); };
const showAbout = () => $('about-dialog').showModal();
$('about-button').onclick = showAbout; $('shortcuts-button').onclick = showAbout;
$('about-close').onclick = () => $('about-dialog').close();
for (const dialog of [$('reader'), $('about-dialog')]) dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
$('delete-source').onclick = () => {
  const index = state.docs.findIndex(d => d.id === currentDocId);
  if (index < 0) return;
  const [removed] = state.docs.splice(index, 1); $('reader').close(); save(); renderLibrary(); if (view === 'brief') renderBrief();
  toast('Source removed. Saved quotes remain in your brief.', () => { state.docs.splice(index, 0, removed); save(); renderLibrary(); if (view === 'brief') renderBrief(); });
};
$('restore-samples').onclick = () => { const missing = sampleDocuments().filter(d => !state.docs.some(s => s.id === d.id)); state.docs.push(...missing); save(); renderLibrary(); toast(`${missing.length} fictional sample sources restored.`); };
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
  if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault(); $('reader').close(); $('about-dialog').close(); setView('library'); $('search').focus(); $('search').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  if (e.key === 'Escape') { $('drop-overlay').hidden = true; }
});
let dragDepth = 0;
document.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); dragDepth++; $('drop-overlay').hidden = false; } });
document.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop-overlay').hidden = true; });
document.addEventListener('drop', e => { if (e.dataTransfer.files.length) { e.preventDefault(); dragDepth = 0; $('drop-overlay').hidden = true; $('reader').close(); $('about-dialog').close(); importFiles(e.dataTransfer.files); } });
setView('library');
