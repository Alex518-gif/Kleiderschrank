import * as db from './db.js';
import { blobToCanvas, canvasToBlob, fitPants, keepMainParts, removeBackgroundAI, removeBackgroundColor, removeHanger, trim } from './img.js';
import { COLORS, NEUTRAL, analyzeColors, feelTemp, fetchWeather, findPlace, harmonious, hexToRgb, weatherIcon } from './meta.js';

// Kategorien mit ihrem Platz auf der Figur: [links, oben, Breite, Höhe] in Prozent.
// z bestimmt die Reihenfolge: Schuhe unten, Mütze ganz oben.
const CATS = [
  { id: 'shirt', name: 'Oberteile', one: 'Oberteil', box: [14, 15, 72, 40], align: 'top', z: 30 },
  { id: 'pulli', name: 'Pullis', one: 'Pulli', box: [6, 14.5, 88, 42], align: 'top', z: 40 },
  { id: 'jacke', name: 'Jacken', one: 'Jacke', box: [4, 14, 92, 48], align: 'top', z: 50 },
  { id: 'kleid', name: 'Kleider', one: 'Kleid', box: [12, 15, 76, 62], align: 'top', z: 32 },
  { id: 'rock', name: 'Röcke', one: 'Rock', box: [18, 46, 64, 30], align: 'top', z: 25 },
  { id: 'hose', name: 'Hosen', one: 'Hose', box: [20, 47, 60, 46.5], align: 'top', z: 20 },
  { id: 'schuhe', name: 'Schuhe', one: 'Schuhe', box: [22, 87, 56, 10.5], align: 'bottom', z: 10 },
  { id: 'tasche', name: 'Taschen', one: 'Tasche', box: [62, 44, 36, 24], align: 'top', z: 60 },
  { id: 'muetze', name: 'Mützen & Hüte', one: 'Mütze/Hut', box: [29, 1, 42, 8.5], align: 'bottom', z: 65 },
  { id: 'hals', name: 'Schals & Ketten', one: 'Schal/Kette', box: [30, 11, 40, 20], align: 'top', z: 55 },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
const TOPS = ['shirt', 'pulli', 'jacke', 'kleid'];
// Schuhe und Accessoires dürfen zweifarbig sein, ohne als „Muster“ zu zählen
const NO_PATTERN = ['schuhe', 'tasche', 'muetze', 'hals'];
const SEASONS = [['ganz', 'Ganzjahr'], ['sommer', 'Sommer'], ['uebergang', 'Übergang'], ['winter', 'Winter']];
const OCCASIONS = [['alltag', 'Alltag'], ['arbeit', 'Arbeit'], ['party', 'Party'], ['sport', 'Sport']];
const APP_VERSION = 10;
const SKIN = { '--skin-1': '#efe5dc', '--skin-2': '#d9cabd', '--skin-3': '#c4b2a3' };

const MANNEQUIN = `
<svg class="mannequin" viewBox="0 0 200 500" aria-hidden="true">
  <defs>
    <linearGradient id="mq-skin" gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="160" y2="0">
      <stop offset="0" style="stop-color:var(--skin-3)"/>
      <stop offset=".38" style="stop-color:var(--skin-1)"/>
      <stop offset=".62" style="stop-color:var(--skin-1)"/>
      <stop offset="1" style="stop-color:var(--skin-2)"/>
    </linearGradient>
  </defs>
  <ellipse cx="100" cy="484" rx="44" ry="6" fill="var(--skin-3)" opacity=".35"/>
  <g fill="url(#mq-skin)">
    <path d="M62 90C52 96 50 120 50 150C49 180 46 210 44 240C43 252 44 262 48 266C52 268 56 262 56 252C58 222 62 190 66 160C68 140 70 115 70 100Z"/>
    <path d="M138 90C148 96 150 120 150 150C151 180 154 210 156 240C157 252 156 262 152 266C148 268 144 262 144 252C142 222 138 190 134 160C132 140 130 115 130 100Z"/>
    <path d="M66 250C64 300 70 360 76 410C78 430 79 445 80 455L95 455C95 440 96 420 97 400C99 350 101 300 100 262Z"/>
    <path d="M134 250C136 300 130 360 124 410C122 430 121 445 120 455L105 455C105 440 104 420 103 400C101 350 99 300 100 262Z"/>
    <path d="M80 452C76 462 70 470 72 476C76 480 92 480 96 476L95 452Z"/>
    <path d="M120 452C124 462 130 470 128 476C124 480 108 480 104 476L105 452Z"/>
    <path d="M100 80C84 80 66 82 60 92C55 100 60 112 64 124C68 140 76 162 76 186C76 206 64 222 64 250C64 262 70 272 80 276L120 276C130 272 136 262 136 250C136 222 124 206 124 186C124 162 132 140 136 124C140 112 145 100 140 92C134 82 116 80 100 80Z"/>
    <path d="M91 58L109 58L111 86L89 86Z"/>
    <ellipse cx="100" cy="40" rx="20" ry="25"/>
  </g>
</svg>`;

const $ = (s) => document.querySelector(s);
const state = {
  items: [], outfits: [], worn: [], trips: [], sel: {}, active: 'shirt',
  filter: { season: null, occ: null, color: null, hideWash: false, hideWish: false },
  showFigure: false, place: null, weather: null,
};
const urls = new Map();
const fitted = new Map(); // Hosen: auf die Figur gestreckte Fassung
let mainLayers;
let wheelList = [];
let wheelIndex = 0;

// ---------- Hilfen ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const itemById = (id) => state.items.find((i) => i.id === id);
const itemsOf = (cat) => state.items.filter((i) => i.cat === cat).sort((a, b) => a.created - b.created);
const emptySel = () => Object.fromEntries(CATS.map((c) => [c.id, null]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
  } catch { return null; }
}

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const daysSince = (date) => Math.round((keyToDate(dayKey()) - keyToDate(dayKey(new Date(date)))) / 86400000);
function relDays(n) {
  if (n === 0) return 'heute';
  if (n === 1) return 'gestern';
  return `vor ${n} Tagen`;
}
function shortDate(k) {
  const d = keyToDate(k);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

function urlOf(item) {
  if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(new Blob([item.buf], { type: item.type })));
  return urls.get(item.id);
}

// Figur-Einheiten: die Figur ist 200 x 500 groß, die Hüfte etwa 76 breit.
async function prepareFitted(item) {
  if (item.cat !== 'hose' || fitted.has(item.id)) return;
  const [, , w, h] = CAT.hose.box;
  const src = await blobToCanvas(new Blob([item.buf], { type: item.type }), 2000);
  const out = fitPants(src, { boxW: w * 2, boxH: h * 5, waist: 76 });
  fitted.set(item.id, URL.createObjectURL(await canvasToBlob(out, 'image/png')));
}

function dropUrls(id) {
  for (const m of [urls, fitted]) if (m.has(id)) { URL.revokeObjectURL(m.get(id)); m.delete(id); }
}

let toastTimer;
function toast(text, ms = 2400) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

function saveSel() { store('sel', state.sel); store('active', state.active); }

// Ein Kleid verdeckt Oberteil, Rock und Hose; ein Rock verdeckt die Hose.
function effective(sel) {
  const e = { ...emptySel(), ...sel };
  for (const k of Object.keys(e)) if (e[k] && !itemById(e[k])) e[k] = null;
  if (e.kleid) { e.shirt = null; e.rock = null; e.hose = null; }
  if (e.rock) e.hose = null;
  return e;
}
const selKey = (sel) => { const e = effective(sel); return CATS.map((c) => e[c.id] || '').join('|'); };
const isEmpty = (sel) => !Object.values(effective(sel)).some(Boolean);

// ---------- Figur ----------
function buildFigure(container, mini = false) {
  container.innerHTML = MANNEQUIN;
  container.classList.toggle('mini', mini);
  const layers = {};
  for (const c of CATS) {
    const el = document.createElement('div');
    el.className = `layer align-${c.align}`;
    el.dataset.cat = c.id;
    const [x, y, w, h] = c.box;
    Object.assign(el.style, { left: x + '%', top: y + '%', width: w + '%', height: h + '%', zIndex: c.z });
    container.appendChild(el);
    layers[c.id] = el;
  }
  return layers;
}

// Ein Teil auf der Figur. Ein einzelner Schuh (Seitenansicht) wird auf beide Füße
// gesetzt, der zweite gespiegelt, damit die Spitzen nach außen zeigen.
function makePiece(item) {
  const piece = document.createElement('div');
  piece.className = 'piece';
  piece.dataset.id = item.id;
  const single = item.cat === 'schuhe' && item.shoe === 'single';
  const stretched = item.cat === 'hose' && item.stretch !== false && fitted.has(item.id);
  piece.classList.toggle('shoe-single', single);
  piece.classList.toggle('fitted', stretched);
  piece.classList.toggle('flipped', !!item.flip);
  for (let i = 0; i < (single ? 2 : 1); i++) {
    const img = document.createElement('img');
    img.src = stretched ? fitted.get(item.id) : urlOf(item);
    img.alt = i ? '' : CAT[item.cat].one;
    img.draggable = false;
    piece.appendChild(img);
  }
  applyAdj(piece, item);
  return piece;
}

function applyAdj(piece, item) {
  const a = item.adj || { s: 100, x: 0, y: 0 };
  piece.style.transform = `translate(${a.x}%, ${a.y}%) scale(${a.s / 100})`;
}

function refreshPiece(item) {
  const old = mainLayers[item.cat].querySelector(`.piece[data-id="${item.id}"]:not(.leave)`);
  if (old) old.replaceWith(makePiece(item));
}

function setLayer(layers, cat, itemId, dir = 0) {
  const layer = layers[cat];
  const old = layer.querySelector('.piece:not(.leave)');
  if (old && old.dataset.id === itemId) return;
  if (!old && !itemId) return;
  if (old) {
    if (dir) {
      old.classList.remove('enter', 'from-left');
      old.classList.add('leave');
      if (dir < 0) old.classList.add('to-right');
      setTimeout(() => old.remove(), 300);
    } else old.remove();
  }
  const item = itemId && itemById(itemId);
  if (!item) return;
  const piece = makePiece(item);
  if (dir) {
    piece.classList.add('enter');
    if (dir < 0) piece.classList.add('from-left');
  }
  layer.appendChild(piece);
}

function renderLayers(layers, sel, dir = 0) {
  const e = effective(sel);
  for (const c of CATS) setLayer(layers, c.id, e[c.id], dir);
  if (layers === mainLayers) fitFigure(e);
}

// Ohne Figur auf die angezogenen Teile zoomen, damit das Outfit den Platz füllt
function fitFigure(e = effective(state.sel)) {
  const wrap = $('#figure').parentElement;
  let top = 100, bottom = 0;
  if (!state.showFigure) {
    for (const c of CATS) if (e[c.id]) { top = Math.min(top, c.box[1]); bottom = Math.max(bottom, c.box[1] + c.box[3]); }
  }
  if (bottom <= top) { wrap.style.setProperty('--zoom', 1); wrap.style.setProperty('--shift', '0%'); return; }
  const zoom = Math.min(1.45, 91 / (bottom - top));
  wrap.style.setProperty('--zoom', zoom.toFixed(3));
  wrap.style.setProperty('--shift', ((50 - (top + bottom) / 2) * zoom).toFixed(2) + '%');
}

function popFigure() {
  const f = $('#figure');
  f.classList.remove('pop');
  void f.offsetWidth;
  f.classList.add('pop');
}

function select(cat, itemId, dir = 1) {
  itemId = itemId || null;
  if ((state.sel[cat] || null) === itemId) return;
  state.sel[cat] = itemId;
  // Wer ein Oberteil, einen Rock oder eine Hose wählt, will das Kleid nicht mehr sehen
  if (itemId && ['shirt', 'rock', 'hose'].includes(cat)) state.sel.kleid = null;
  if (itemId && cat === 'hose') state.sel.rock = null;
  renderLayers(mainLayers, state.sel, dir);
  popFigure();
  saveSel();
  updateFooter();
  hideWhy();
}

// Ganzes Outfit anziehen, Teil für Teil mit kleiner Verzögerung
async function applyOutfit(sel) {
  hideWhy();
  const target = { ...emptySel(), ...sel };
  for (const c of CATS) {
    const id = target[c.id] && itemById(target[c.id]) ? target[c.id] : null;
    if ((state.sel[c.id] || null) === id) continue;
    state.sel[c.id] = id;
    renderLayers(mainLayers, state.sel, 1);
    await sleep(70);
  }
  popFigure();
  saveSel();
  updateFooter();
  renderCats();
  renderWheel();
}

// ---------- Filter ----------
function matches(item) {
  const f = state.filter;
  if (f.season && item.season && item.season !== 'ganz' && item.season !== f.season) return false;
  if (f.occ && !(item.occ || []).includes(f.occ)) return false;
  if (f.color && !(item.colors || []).some((c) => c.n === f.color)) return false;
  if (f.hideWash && item.wash) return false;
  if (f.hideWish && item.wish) return false;
  return true;
}
const filterActive = () => { const f = state.filter; return !!(f.season || f.occ || f.color || f.hideWash || f.hideWish); };

function renderFilter() {
  const f = state.filter;
  const chips = (el, list, key) => {
    el.innerHTML = '';
    for (const [val, label, color] of [[null, 'Alle'], ...list]) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.setAttribute('aria-selected', f[key] === val);
      b.innerHTML = (color ? `<i style="background:${color}"></i>` : '') + esc(label);
      b.onclick = () => { f[key] = val; changedFilter(); };
      el.appendChild(b);
    }
  };
  chips($('#fSeason'), SEASONS.slice(1), 'season');
  chips($('#fOcc'), OCCASIONS, 'occ');
  const present = new Set(state.items.flatMap((i) => (i.colors || []).map((c) => c.n)));
  chips($('#fColor'), Object.keys(COLORS).filter((n) => present.has(n)).map((n) => [n, n, COLORS[n]]), 'color');
  $('#fWash').checked = f.hideWash;
  $('#fWish').checked = f.hideWish;
  $('#filterDot').hidden = !filterActive();
}

function changedFilter() {
  store('filter', state.filter);
  renderFilter();
  renderCats();
  renderWheel();
}

// ---------- Kategorien + Drehrad ----------
function renderCats() {
  const nav = $('#cats');
  nav.innerHTML = '';
  for (const c of CATS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.role = 'tab';
    b.setAttribute('aria-selected', c.id === state.active);
    const n = itemsOf(c.id).filter(matches).length;
    b.innerHTML = `${c.name}${n ? `<span class="n">${n}</span>` : ''}`;
    b.onclick = () => setActive(c.id);
    nav.appendChild(b);
  }
}

function setActive(cat) {
  if (state.active !== cat) {
    state.active = cat;
    saveSel();
  }
  renderCats();
  renderWheel();
  const chip = $('#cats').children[CATS.findIndex((c) => c.id === cat)];
  if (chip) chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}

function renderWheel() {
  const track = $('#wheelTrack');
  const cat = CAT[state.active];
  const all = itemsOf(cat.id);
  const selId = state.sel[cat.id];
  const items = all.filter((i) => matches(i) || i.id === selId);
  track.innerHTML = '';
  track.classList.toggle('is-empty', !items.length);
  if (!items.length) {
    wheelList = [];
    const e = document.createElement('button');
    e.className = 'card empty';
    e.textContent = all.length ? 'Nichts passt zum Filter. Tippe oben auf den Filter, um ihn zu ändern.' : `Noch keine ${cat.name}. Tippe auf + und fotografiere das erste.`;
    e.onclick = all.length ? openFilter : openAdd;
    track.appendChild(e);
    track.scrollLeft = 0;
    return;
  }
  wheelList = [null, ...items];
  wheelList.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'card' + (item ? '' : ' none') + (item && item.wash ? ' wash' : '');
    card.dataset.index = i;
    if (item) {
      const img = document.createElement('img');
      img.src = urlOf(item);
      img.alt = '';
      card.appendChild(img);
      const tags = (item.wish ? '🛍' : '') + (item.wash ? '🧺' : '');
      if (tags) card.insertAdjacentHTML('beforeend', `<span class="tag">${tags}</span>`);
      const edit = document.createElement('button');
      edit.className = 'edit';
      edit.setAttribute('aria-label', 'Teil bearbeiten');
      edit.innerHTML = '<svg><use href="#i-edit"/></svg>';
      edit.onclick = (e) => { e.stopPropagation(); openEdit(item.id); };
      card.appendChild(edit);
    } else {
      card.innerHTML = '<span>∅</span>ohne';
    }
    card.onclick = () => scrollToIndex(i, true);
    track.appendChild(card);
  });
  wheelIndex = Math.max(0, wheelList.findIndex((it) => (it ? it.id : null) === (selId || null)));
  scrollToIndex(wheelIndex, false);
  updateCards();
}

function cardsOf() { return [...$('#wheelTrack').children].filter((c) => !c.classList.contains('empty')); }

function scrollToIndex(i, smooth) {
  const track = $('#wheelTrack');
  const card = cardsOf()[i];
  if (!card) return;
  const left = card.offsetLeft + card.offsetWidth / 2 - track.clientWidth / 2;
  track.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
}

function updateCards() {
  const track = $('#wheelTrack');
  const cards = cardsOf();
  if (cards.length < 1) return -1;
  const spacing = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 92;
  const center = track.scrollLeft + track.clientWidth / 2;
  let best = 0, bestDist = Infinity;
  cards.forEach((card, i) => {
    const off = (card.offsetLeft + card.offsetWidth / 2 - center) / spacing;
    const a = Math.min(Math.abs(off), 3);
    card.style.transform = `rotateY(${Math.max(-3, Math.min(3, off)) * -26}deg) scale(${1 - a * 0.1})`;
    card.style.opacity = 1 - a * 0.2;
    if (Math.abs(off) < bestDist) { bestDist = Math.abs(off); best = i; }
  });
  cards.forEach((card, i) => card.classList.toggle('current', i === best));
  return best;
}

let wheelRaf = 0;
function onWheelScroll() {
  if (wheelRaf) return;
  wheelRaf = requestAnimationFrame(() => {
    wheelRaf = 0;
    const idx = updateCards();
    if (idx < 0 || idx === wheelIndex || !wheelList.length) return;
    const dir = Math.sign(idx - wheelIndex);
    wheelIndex = idx;
    const item = wheelList[idx];
    select(state.active, item ? item.id : null, dir);
  });
}

function step(dir) {
  if (!wheelList.length) {
    toast(`Noch keine ${CAT[state.active].name} – tippe auf +`);
    return;
  }
  const n = wheelList.length;
  const next = (wheelIndex + dir + n) % n;
  if (Math.abs(next - wheelIndex) > 1) {
    // Umlauf: Rad springt, Figur wechselt sofort mit der gewünschten Richtung
    wheelIndex = next;
    const item = wheelList[next];
    select(state.active, item ? item.id : null, dir);
    scrollToIndex(next, true);
    return;
  }
  scrollToIndex(next, true);
}

// ---------- Wischen auf der Figur ----------
function initStageGestures() {
  const stage = $('#stage');
  let start = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.nav')) return;
    start = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  stage.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    const s = start;
    start = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      step(dx < 0 ? 1 : -1);
    } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && Date.now() - s.t < 400) {
      // Antippen eines Kleidungsstücks wählt dessen Kategorie
      const layer = e.target.closest('.layer');
      if (layer && layer.dataset.cat !== state.active) setActive(layer.dataset.cat);
    }
  });
  stage.addEventListener('pointercancel', () => (start = null));
  $('#btnPrev').onclick = () => step(-1);
  $('#btnNext').onclick = () => step(1);
}

// ---------- Getragen ----------
function wornStats(id) {
  let count = 0, last = null;
  for (const w of state.worn) {
    if (Object.values(w.sel).includes(id)) {
      count++;
      if (!last || w.id > last) last = w.id;
    }
  }
  return { count, last };
}
function lastWornDays(id) {
  const { last } = wornStats(id);
  return last ? Math.round((keyToDate(dayKey()) - keyToDate(last)) / 86400000) : null;
}

async function toggleWorn() {
  const sel = effective(state.sel);
  if (isEmpty(sel)) return toast('Die Figur hat noch nichts an');
  if (Object.values(sel).some((id) => id && itemById(id).wish)) return toast('Teile von der Wunschliste kann man noch nicht tragen 😉');
  lastSuggestion = null;
  tasteChanged();
  const key = dayKey();
  const ex = state.worn.find((w) => w.id === key);
  if (ex && selKey(ex.sel) === selKey(sel)) {
    state.worn = state.worn.filter((w) => w !== ex);
    await db.remove('worn', key);
    toast('Heutiger Eintrag entfernt');
  } else {
    const w = { id: key, sel, date: Date.now() };
    state.worn = state.worn.filter((x) => x.id !== key).concat(w);
    await db.put('worn', w);
    toast(ex ? 'Heutiges Outfit geändert ✓' : 'Als heute getragen gespeichert ✓');
  }
  updateFooter();
}

// ---------- Vorschlag + Zufall ----------
function seasonOkForTemp(item, t) {
  if (t == null) return true;
  const s = item.season || 'ganz';
  if (s === 'ganz') return true;
  if (s === 'sommer') return t >= 18;
  if (s === 'winter') return t <= 12;
  return t >= 7 && t <= 22;
}

// Lange nicht Getragenes kommt öfter dran
function weightOf(item) {
  const d = lastWornDays(item.id);
  return d == null ? 3 : Math.min(4, 0.3 + d / 7);
}
function pick(list) {
  const total = list.reduce((s, i) => s + weightOf(i), 0);
  let r = Math.random() * total;
  for (const i of list) { r -= weightOf(i); if (r <= 0) return i.id; }
  return list[list.length - 1].id;
}

// ---------- Geschmack lernen ----------
// Aus gemerkten Outfits (zählen doppelt), getragenen Tagen und übersprungenen
// Vorschlägen (zählen leicht negativ) entsteht ein Profil: welche Farben und
// welche Teile Isabell gern zusammen trägt. Alles bleibt auf dem Handy.
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const mainColors = (item) => (item.colors || []).filter((c) => c.s >= 0.2).slice(0, 2).map((c) => c.n);
const outfitItems = (sel) => Object.values(effective(sel)).filter(Boolean).map(itemById).filter(Boolean);
let tasteCache = null;
const tasteChanged = () => { tasteCache = null; };

function buildTaste() {
  if (tasteCache) return tasteCache;
  const colorPairs = new Map(), itemPairs = new Map();
  const add = (m, k, w) => m.set(k, (m.get(k) || 0) + w);
  const learn = (sel, w) => {
    const items = outfitItems(sel);
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        add(itemPairs, pairKey(items[a].id, items[b].id), w);
        for (const ca of mainColors(items[a])) for (const cb of mainColors(items[b])) add(colorPairs, pairKey(ca, cb), w / 2);
      }
    }
  };
  for (const o of state.outfits) learn(o.sel, 2);
  for (const w of state.worn) learn(w.sel, daysSince(keyToDate(w.id)) <= 90 ? 1 : 0.5);
  const skips = store('skips') || [];
  for (const s of skips) learn(s.sel, -0.5);
  tasteCache = { colorPairs, itemPairs, n: state.outfits.length + state.worn.length };
  return tasteCache;
}

function tasteScore(sel, taste = buildTaste()) {
  const items = outfitItems(sel);
  let sum = 0, cnt = 0;
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      let c = 0, cc = 0;
      for (const ca of mainColors(items[a])) for (const cb of mainColors(items[b])) { c += taste.colorPairs.get(pairKey(ca, cb)) || 0; cc++; }
      sum += (cc ? c / cc : 0) + 1.5 * (taste.itemPairs.get(pairKey(items[a].id, items[b].id)) || 0);
      cnt++;
    }
  }
  return cnt ? sum / cnt : 0;
}

// Genau dieses Outfit in den letzten 3 Tagen getragen? Dann lieber etwas anderes.
function wornRecently(sel) {
  const key = selKey(sel);
  return state.worn.some((w) => selKey(w.sel) === key && daysSince(keyToDate(w.id)) <= 3);
}

// Übersprungene Vorschläge merken: Wer direkt nochmal würfelt, mochte den letzten nicht so.
let lastSuggestion = null;
function noteSkip() {
  if (!lastSuggestion || Date.now() - lastSuggestion.t > 60000) return;
  if (selKey(state.sel) !== selKey(lastSuggestion.sel)) return; // inzwischen selbst geändert
  const skips = (store('skips') || []).slice(-49);
  skips.push({ sel: effective(lastSuggestion.sel), t: Date.now() });
  store('skips', skips);
  tasteChanged();
}

function makeOutfit(opts = {}) {
  const r = pickOutfit(opts);
  return r ? r.sel : null;
}

// Viele passende Kandidaten würfeln und den nehmen, der am besten zum Geschmack passt
function pickOutfit({ t = null, rain = 0, pool, noise = 0.8 } = {}) {
  const taste = buildTaste();
  const cands = [];
  for (let k = 0; k < 14; k++) {
    const s = rollOutfit({ t, rain, pool });
    if (!s) break;
    const score = Math.log1p(Math.max(0, tasteScore(s.sel, taste))) + Math.min(0, tasteScore(s.sel, taste)) * 0.5
      + (s.ok ? 0 : -3) + (wornRecently(s.sel) ? -2 : 0) + Math.random() * noise;
    cands.push({ ...s, score });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  return cands[0];
}

function rollOutfit({ t = null, rain = 0, pool } = {}) {
  const P = Object.fromEntries(CATS.map((c) => [c.id, (pool || itemsOf(c.id)).filter((i) =>
    i.cat === c.id && !i.wish && !i.wash && matches(i) && seasonOkForTemp(i, t))]));
  const chance = (p) => Math.random() < p;
  let best = null;
  for (let tries = 0; tries < 40; tries++) {
    const s = emptySel();
    const bottoms = P.hose.length + P.rock.length;
    if (P.kleid.length && (t == null || t >= 15) && chance(bottoms ? 0.3 : 1)) {
      s.kleid = pick(P.kleid);
    } else {
      if (P.shirt.length) s.shirt = pick(P.shirt);
      if (P.rock.length && (t == null || t >= 13) && chance(P.hose.length ? 0.35 : 1)) s.rock = pick(P.rock);
      else if (P.hose.length) s.hose = pick(P.hose);
    }
    const pulliP = t == null ? 0.4 : t < 10 ? 1 : t < 17 ? 0.6 : 0;
    if (P.pulli.length && chance(pulliP)) s.pulli = pick(P.pulli);
    const jackeP = t == null ? 0.35 : t < 13 || rain >= 50 ? 1 : t < 18 ? 0.4 : 0;
    if (P.jacke.length && chance(jackeP)) s.jacke = pick(P.jacke);
    if (P.schuhe.length) s.schuhe = pick(P.schuhe);
    if (P.tasche.length && chance(0.5)) s.tasche = pick(P.tasche);
    if (P.muetze.length && chance(t == null ? 0.2 : t < 6 ? 0.8 : 0)) s.muetze = pick(P.muetze);
    if (P.hals.length && chance(t == null ? 0.3 : t < 8 ? 0.7 : 0.2)) s.hals = pick(P.hals);
    const chosen = Object.values(s).filter(Boolean).map(itemById);
    if (!chosen.length) return null;
    if (harmonious(chosen)) return { sel: s, ok: true };
    if (!best) best = { sel: s, ok: false };
  }
  return best;
}

// ---------- „Warum?“: kurze Begründung zum Vorschlag ----------
function explain(sel, w) {
  const e = effective(sel);
  const items = outfitItems(sel);
  const parts = [];
  if (w) {
    const t = Math.round(feelTemp(w));
    if (w.rain >= 50 && e.jacke) parts.push(`${w.rain} % Regen → mit Jacke`);
    else if (e.jacke) parts.push(`${t}° → mit Jacke`);
    else if (e.pulli) parts.push(`${t}° → mit Pulli`);
    else parts.push(`${t}° → luftig`);
  }
  const colors = [...new Set(items.flatMap(mainColors))];
  const strong = colors.filter((c) => !NEUTRAL.has(c));
  if (!strong.length && colors.length) parts.push(`neutral: ${colors.slice(0, 3).join(', ')}`);
  else if (strong.length === 1) parts.push(`${strong[0]} als Farbakzent`);
  else if (strong.length > 1) parts.push(`Ton in Ton: ${strong.slice(0, 2).join(' & ')}`);
  const patterned = items.filter((i) => i.pattern && !['schuhe', 'tasche', 'muetze', 'hals'].includes(i.cat));
  if (patterned.length === 1) parts.push(`${CAT[patterned[0].cat].one} mit Muster, Rest ruhig`);
  else if (patterned.length > 1) parts.push('Muster-Mix, mutig!');
  const taste = buildTaste();
  if (taste.n) {
    let bestItem = { s: 0 }, bestColor = { s: 0 };
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const s = taste.itemPairs.get(pairKey(items[a].id, items[b].id)) || 0;
        if (s > bestItem.s) bestItem = { s, a: items[a], b: items[b] };
        for (const ca of mainColors(items[a])) for (const cb of mainColors(items[b])) {
          const s = taste.colorPairs.get(pairKey(ca, cb)) || 0;
          if (ca !== cb && s > bestColor.s) bestColor = { s, a: ca, b: cb };
        }
      }
    }
    if (bestItem.s >= 2) parts.unshift(`${CAT[bestItem.a.cat].one} + ${CAT[bestItem.b.cat].one} trägst du gern zusammen`);
    else if (bestColor.s >= 1) parts.unshift(`${bestColor.a} + ${bestColor.b} trägst du gern`);
  }
  const resting = items.map((i) => ({ i, d: lastWornDays(i.id) })).filter((x) => x.d != null && x.d >= 21).sort((a, b) => b.d - a.d)[0];
  if (resting) parts.push(`${CAT[resting.i.cat].one} lange nicht getragen (${resting.d} Tage)`);
  return parts.slice(0, 3);
}

let whyTimer;
function showWhy(parts) {
  const box = $('#why');
  clearTimeout(whyTimer);
  if (!parts || !parts.length) { box.hidden = true; return; }
  $('#whyText').textContent = parts.join(' · ');
  box.hidden = false;
  whyTimer = setTimeout(() => (box.hidden = true), 10000);
}
const hideWhy = () => { $('#why').hidden = true; };

async function presentSuggestion(r, w) {
  lastSuggestion = { sel: effective(r.sel), t: Date.now() };
  await applyOutfit(r.sel);
  lastSuggestion.sel = effective(state.sel);
  showWhy(explain(state.sel, w));
}

function shuffle() {
  noteSkip();
  const r = pickOutfit({ noise: 1.6 });
  if (!r) return toast(state.items.length ? 'Nichts passt zum Filter' : 'Erst ein paar Teile fotografieren');
  presentSuggestion(r, null);
}

async function getWeather() {
  if (!state.place) return null;
  const cached = store('weather');
  if (cached && cached.place === state.place.name && Date.now() - cached.t < 3600000 && cached.day === dayKey()) return cached;
  const w = await fetchWeather(state.place.lat, state.place.lon);
  Object.assign(w, { place: state.place.name, day: dayKey() });
  store('weather', w);
  return w;
}

function renderWeatherLine() {
  const w = state.weather;
  const el = $('#weatherLine');
  if (!w) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = `${weatherIcon(w.code)} ${Math.round(w.max)}° / ${Math.round(w.min)}° · ${w.rain} % Regen · ${w.place}`;
}

async function suggestToday() {
  if (!state.items.length) return toast('Erst ein paar Teile fotografieren');
  if (!state.place) { openWeather(true); return; }
  let w = null;
  try {
    w = await getWeather();
    state.weather = w;
    renderWeatherLine();
  } catch {
    toast('Wetter nicht erreichbar – Vorschlag ohne Wetter');
  }
  noteSkip();
  const t = w ? feelTemp(w) : null;
  const r = pickOutfit({ t, rain: w ? w.rain : 0 });
  if (!r) return toast('Für dieses Wetter passt nichts zum Filter');
  await presentSuggestion(r, w);
}

// ---------- Wetter-Ort ----------
let suggestAfterPlace = false;
function openWeather(thenSuggest = false) {
  suggestAfterPlace = thenSuggest;
  $('#placeCurrent').textContent = state.place ? `Aktuell: ${state.place.name}` : '';
  openSheet($('#sheetWeather'));
}
async function setPlace(place) {
  state.place = place;
  store('place', place);
  store('weather', null);
  closeSheet($('#sheetWeather'));
  toast(`Wetter-Ort: ${place.name}`);
  if (suggestAfterPlace) suggestToday();
  else getWeather().then((w) => { state.weather = w; renderWeatherLine(); }).catch(() => {});
}
function useGeo() {
  if (!navigator.geolocation) return toast('Standort geht hier nicht – bitte Ort eingeben');
  navigator.geolocation.getCurrentPosition(
    (p) => setPlace({ lat: Math.round(p.coords.latitude * 10) / 10, lon: Math.round(p.coords.longitude * 10) / 10, name: 'Mein Standort' }),
    () => toast('Standort nicht freigegeben – bitte Ort eingeben'),
    { timeout: 10000, maximumAge: 3600000 },
  );
}
async function searchPlace() {
  const q = $('#placeInput').value.trim();
  if (!q) return;
  try {
    const p = await findPlace(q);
    if (!p) return toast('Ort nicht gefunden');
    setPlace(p);
  } catch {
    toast('Suche nicht erreichbar');
  }
}

// ---------- Outfits merken ----------
function updateFooter() {
  const key = selKey(state.sel);
  $('#btnSave').classList.toggle('saved', state.outfits.some((o) => selKey(o.sel) === key));
  const today = state.worn.find((w) => w.id === dayKey());
  $('#btnWorn').classList.toggle('on', !!today && selKey(today.sel) === key);
  const n = state.outfits.length;
  const b = $('#outfitCount');
  b.hidden = !n;
  b.textContent = n;
}

async function saveOutfit() {
  const sel = effective(state.sel);
  if (isEmpty(sel)) return toast('Die Figur hat noch nichts an');
  const key = selKey(sel);
  lastSuggestion = null;
  tasteChanged();
  const existing = state.outfits.find((o) => selKey(o.sel) === key);
  if (existing) {
    state.outfits = state.outfits.filter((o) => o !== existing);
    await db.remove('outfits', existing.id);
    toast('Outfit nicht mehr gemerkt');
  } else {
    const o = { id: uid(), sel, created: Date.now() };
    state.outfits.push(o);
    await db.put('outfits', o);
    toast('Outfit gemerkt ♡');
  }
  updateFooter();
}

function miniFigure(sel) {
  const fig = document.createElement('div');
  fig.className = 'figure';
  const layers = buildFigure(fig, true);
  fig.classList.toggle('no-figure', !state.showFigure);
  renderLayers(layers, sel, 0);
  return fig;
}

function renderOutfits() {
  const grid = $('#outfitGrid');
  grid.innerHTML = '';
  if (!state.outfits.length) {
    grid.innerHTML = '<p class="outfit-empty">Noch keine Outfits gemerkt.<br>Stell eins zusammen und tippe auf „Merken“.</p>';
    return;
  }
  [...state.outfits].sort((a, b) => b.created - a.created).forEach((o) => {
    const tile = document.createElement('button');
    tile.className = 'outfit';
    tile.appendChild(miniFigure(o.sel));
    const del = document.createElement('span');
    del.className = 'del';
    del.role = 'button';
    del.setAttribute('aria-label', 'Outfit löschen');
    del.innerHTML = '<svg><use href="#i-close"/></svg>';
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Dieses Outfit löschen?')) return;
      state.outfits = state.outfits.filter((x) => x !== o);
      await db.remove('outfits', o.id);
      tasteChanged();
      renderOutfits();
      updateFooter();
    };
    tile.appendChild(del);
    tile.onclick = () => { closeSheet($('#sheetOutfits')); applyOutfit(o.sel); };
    grid.appendChild(tile);
  });
}

// ---------- Outfit als Bild teilen ----------
async function loadImg(url) {
  const im = new Image();
  im.src = url;
  await im.decode();
  return im;
}

async function drawPiece(ctx, item, c, fx, fy, fw, fh) {
  const [x, y, w, h] = c.box;
  const bx = fx + (x / 100) * fw, by = fy + (y / 100) * fh, bw = (w / 100) * fw, bh = (h / 100) * fh;
  const stretched = item.cat === 'hose' && item.stretch !== false && fitted.has(item.id);
  const img = await loadImg(stretched ? fitted.get(item.id) : urlOf(item));
  const a = item.adj || { s: 100, x: 0, y: 0 };
  ctx.save();
  ctx.translate(bx + bw / 2 + (a.x / 100) * bw, by + bh / 2 + (a.y / 100) * bh);
  ctx.scale(a.s / 100, a.s / 100);
  ctx.shadowColor = 'rgba(60, 35, 20, .22)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  const half = bw * 0.48;
  const parts = item.cat === 'schuhe' && item.shoe === 'single'
    ? [{ x0: -bw / 2, w: half, mirror: !!item.flip }, { x0: bw / 2 - half, w: half, mirror: !item.flip }]
    : [{ x0: -bw / 2, w: bw, mirror: !!item.flip }];
  for (const p of parts) {
    let dw = p.w, dh = bh;
    if (!stretched) {
      const s = Math.min(p.w / img.naturalWidth, bh / img.naturalHeight);
      dw = img.naturalWidth * s;
      dh = img.naturalHeight * s;
    }
    const dx = p.x0 + (p.w - dw) / 2;
    const dy = c.align === 'bottom' ? bh / 2 - dh : -bh / 2;
    ctx.save();
    if (p.mirror) {
      const cx = p.x0 + p.w / 2;
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }
  ctx.restore();
}

async function renderOutfitCanvas(sel) {
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fbf6f1');
  bg.addColorStop(1, '#efe4da');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const fh = 1190, fw = fh * 0.4, fx = (W - fw) / 2, fy = 40;
  if (state.showFigure) {
    let svg = MANNEQUIN.replace('<svg class="mannequin"', `<svg xmlns="http://www.w3.org/2000/svg" width="${fw}" height="${fh}"`);
    for (const [k, v] of Object.entries(SKIN)) svg = svg.split(`var(${k})`).join(v);
    ctx.drawImage(await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)), fx, fy, fw, fh);
  }
  const e = effective(sel);
  for (const c of [...CATS].sort((a, b) => a.z - b.z)) {
    const item = e[c.id] && itemById(e[c.id]);
    if (item) await drawPiece(ctx, item, c, fx, fy, fw, fh);
  }
  ctx.fillStyle = '#7a6c64';
  ctx.font = '600 30px Georgia, serif';
  ctx.fillText('Isabells Outfit', 48, H - 48);
  ctx.font = '26px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('de-DE'), W - 48, H - 50);
  return canvas;
}

async function shareOutfit() {
  if (isEmpty(state.sel)) return toast('Die Figur hat noch nichts an');
  toast('Bild wird erstellt …');
  try {
    const canvas = await renderOutfitCanvas(state.sel);
    const blob = await canvasToBlob(canvas, 'image/png');
    const file = new File([blob], `outfit-${dayKey()}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: 'Was meint ihr? 💬' }); } catch {}
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (err) {
    console.error(err);
    toast('Bild konnte nicht erstellt werden');
  }
}

// ---------- Blätter ----------
function openSheet(el) { el.hidden = false; }
function closeSheet(el) {
  if (el.hidden) return;
  el.hidden = true;
  el.dispatchEvent(new Event('closed'));
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]');
  if (c) closeSheet(c.closest('.sheet'));
});
function openFilter() { renderFilter(); openSheet($('#sheetFilter')); }

// ---------- Teil hinzufügen ----------
let addCat = 'shirt';
let pending = null;

function showStep(name) {
  document.querySelectorAll('#sheetAdd .step').forEach((s) => (s.hidden = s.dataset.step !== name));
}

function renderAddCats() {
  const row = $('#addCats');
  row.innerHTML = '';
  for (const c of CATS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = c.one;
    b.setAttribute('aria-selected', c.id === addCat);
    b.onclick = () => { addCat = c.id; renderAddCats(); };
    row.appendChild(b);
  }
}

function openAdd() {
  addCat = state.active;
  pending = null;
  $('#addWish').checked = false;
  renderAddCats();
  showStep('pick');
  openSheet($('#sheetAdd'));
}

async function onFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  showStep('busy');
  $('#busyText').textContent = 'Foto wird vorbereitet …';
  $('#busyBar').style.width = '0';
  try {
    const src = await blobToCanvas(file, 1280);
    pending = { src, ai: null, color: {}, mode: 'ai', tol: 42, previewUrl: null };
    $('#busyText').textContent = 'Hintergrund wird entfernt …';
    try {
      pending.ai = keepMainParts(await removeBackgroundAI(src, (key, cur, total) => {
        if (key.startsWith('fetch')) {
          const p = total ? Math.round((cur / total) * 100) : 0;
          $('#busyText').textContent = `Freistell-Modell wird geladen … ${p} %`;
          $('#busyBar').style.width = p + '%';
        } else {
          $('#busyText').textContent = 'Hintergrund wird entfernt …';
          $('#busyBar').style.width = '100%';
        }
      }));
    } catch (err) {
      console.warn('KI-Freistellung fehlgeschlagen', err);
      pending.mode = 'color';
      toast('KI ging nicht – Farb-Modus aktiv');
    }
    showStep('result');
    await updatePreview();
  } catch (err) {
    console.error(err);
    toast('Foto konnte nicht gelesen werden');
    showStep('pick');
  }
}

function currentCanvas() {
  const p = pending;
  if (p.mode === 'ai' && p.ai) return p.ai;
  if (p.mode === 'color') return (p.color[p.tol] ||= keepMainParts(removeBackgroundColor(p.src, p.tol)));
  return p.src;
}
const processedCanvas = (cat) => (TOPS.includes(cat) ? removeHanger(currentCanvas()) : currentCanvas());

const MODE_TIPS = {
  ai: 'Automatisch freigestellt. Wenn etwas fehlt, probier „Farbe“.',
  color: 'Entfernt die Farbe vom Rand her. Mit dem Regler die Stärke einstellen.',
  orig: 'Foto bleibt unverändert, mit Hintergrund.',
};

let previewToken = 0;
async function updatePreview() {
  const p = pending;
  if (!p) return;
  document.querySelectorAll('#modeSeg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === p.mode);
    b.disabled = b.dataset.mode === 'ai' && !p.ai;
  });
  $('#tolRow').hidden = p.mode !== 'color';
  $('#modeTip').textContent = MODE_TIPS[p.mode];
  const token = ++previewToken;
  const blob = await canvasToBlob(processedCanvas(addCat), 'image/png');
  if (token !== previewToken) return;
  if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
  p.previewUrl = URL.createObjectURL(blob);
  $('#previewImg').src = p.previewUrl;
}

async function keepItem() {
  if (!pending) return;
  const btn = $('#btnKeep');
  const cat = addCat;
  const wish = $('#addWish').checked;
  btn.disabled = true;
  try {
    const out = trim(processedCanvas(cat), 1000);
    const blob = await canvasToBlob(out, 'image/png');
    const { colors, pattern } = analyzeColors(out);
    const item = {
      id: uid(), cat, type: blob.type, buf: await blob.arrayBuffer(),
      w: out.width, h: out.height, adj: { s: 100, x: 0, y: 0 }, flip: false, created: Date.now(),
      colors, pattern: pattern && !NO_PATTERN.includes(cat), season: 'ganz', occ: [], wash: false, wish,
    };
    // Breites Schuhfoto = ein Schuh von der Seite, sonst ein Paar
    if (cat === 'schuhe') item.shoe = out.width / out.height > 1.45 ? 'single' : 'pair';
    if (cat === 'hose') item.stretch = true;
    await db.put('items', item);
    state.items.push(item);
    await prepareFitted(item).catch((err) => console.warn('Hose', err));
    discardPending();
    closeSheet($('#sheetAdd'));
    state.active = item.cat;
    select(item.cat, item.id, 1);
    setActive(item.cat);
    updateHint();
    const farben = colors.slice(0, 2).map((c) => c.n).join('/');
    toast(`${CAT[cat].one} gespeichert${wish ? ' (Wunschliste)' : ''}${farben ? ' · ' + farben : ''}`);
  } catch (err) {
    console.error(err);
    toast('Speichern hat nicht geklappt');
  } finally {
    btn.disabled = false;
  }
}

function discardPending() {
  if (pending && pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
  pending = null;
  $('#previewImg').removeAttribute('src');
}

// ---------- Teil bearbeiten ----------
let editId = null;
function openEdit(id, tab = 'sitz') {
  const item = itemById(id);
  if (!item) return;
  editId = id;
  if (state.sel[item.cat] !== id) select(item.cat, id, 1);
  const a = item.adj || (item.adj = { s: 100, x: 0, y: 0 });
  $('#adjScale').value = a.s;
  $('#adjX').value = a.x;
  $('#adjY').value = a.y;
  renderSitz(item);
  renderDetails(item);
  showTab(tab);
  openSheet($('#sheetEdit'));
}

function showTab(tab) {
  document.querySelectorAll('#editTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('#sheetEdit .tab').forEach((t) => (t.hidden = t.dataset.tab !== tab));
}

function renderSitz(item) {
  $('#pantsRow').hidden = item.cat !== 'hose';
  document.querySelectorAll('#pantsSeg button').forEach((b) => b.classList.toggle('on', b.dataset.stretch === (item.stretch === false ? '0' : '1')));
  $('#shoeRow').hidden = item.cat !== 'schuhe';
  document.querySelectorAll('#shoeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.shoe === (item.shoe || 'pair')));
}

function renderDetails(item) {
  const { count, last } = wornStats(item.id);
  const inSchrank = daysSince(item.created);
  $('#wornInfo').textContent = item.wish
    ? `${CAT[item.cat].one} auf der Wunschliste – noch nicht gekauft.`
    : count
      ? `${count}× getragen · zuletzt ${relDays(Math.round((keyToDate(dayKey()) - keyToDate(last)) / 86400000))}`
      : `Noch nie getragen${inSchrank > 0 ? ` · seit ${inSchrank} Tagen im Schrank` : ''}`;

  const seg = $('#dSeason');
  seg.innerHTML = '';
  for (const [val, label] of SEASONS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.classList.toggle('on', (item.season || 'ganz') === val);
    b.onclick = () => { item.season = val; renderDetails(item); };
    seg.appendChild(b);
  }

  const occ = $('#dOcc');
  occ.innerHTML = '';
  for (const [val, label] of OCCASIONS) {
    const b = document.createElement('button');
    b.className = 'chip';
    const on = (item.occ || []).includes(val);
    b.setAttribute('aria-selected', on);
    b.textContent = label;
    b.onclick = () => {
      item.occ = on ? item.occ.filter((x) => x !== val) : [...(item.occ || []), val];
      renderDetails(item);
    };
    occ.appendChild(b);
  }

  const col = $('#dColors');
  col.innerHTML = '';
  const names = (item.colors || []).map((c) => c.n);
  for (const [n, hex] of Object.entries(COLORS)) {
    const b = document.createElement('button');
    b.className = 'chip';
    const on = names.includes(n);
    b.setAttribute('aria-selected', on);
    b.innerHTML = `<i style="background:${hex}"></i>${n}`;
    b.onclick = () => {
      item.colors = on ? item.colors.filter((c) => c.n !== n) : [...(item.colors || []), { n, s: 0.3, rgb: hexToRgb(hex) }];
      renderDetails(item);
    };
    col.appendChild(b);
  }
  $('#dPattern').checked = !!item.pattern;
  $('#dWash').checked = !!item.wash;
  $('#dWish').checked = !!item.wish;
}

function onAdj() {
  const item = itemById(editId);
  if (!item) return;
  item.adj = { s: +$('#adjScale').value, x: +$('#adjX').value, y: +$('#adjY').value };
  const piece = mainLayers[item.cat].querySelector(`.piece[data-id="${item.id}"]:not(.leave)`);
  if (piece) applyAdj(piece, item);
}

// ---------- Statistik ----------
function thumbHtml(item, label) {
  return `<button class="thumb" data-id="${item.id}"><img src="${urlOf(item)}" alt=""><span>${esc(label)}</span></button>`;
}

function renderStats() {
  const body = $('#statsBody');
  const owned = state.items.filter((i) => !i.wish);
  const wishes = state.items.filter((i) => i.wish);
  const wash = owned.filter((i) => i.wash);
  let html = `<div class="nums">
    <div class="num"><b>${owned.length}</b><span>Teile im Schrank</span></div>
    <div class="num"><b>${state.worn.length}</b><span>Tage eingetragen</span></div>
    <div class="num"><b>${wishes.length}</b><span>auf der Wunschliste</span></div>
  </div>`;

  // Lange nicht getragen: nie (und schon 14 Tage im Schrank) oder vor über 60 Tagen
  const sleepers = owned
    .map((i) => ({ i, d: lastWornDays(i.id), age: daysSince(i.created) }))
    .filter((x) => (x.d == null && x.age >= 14) || x.d >= 60)
    .sort((a, b) => (b.d ?? b.age + 1000) - (a.d ?? a.age + 1000));
  html += '<h3 class="sec">Lange nicht getragen</h3>';
  html += sleepers.length
    ? `<p class="tip">Zeit zum Aussortieren oder für Vinted?</p><div class="thumbs">${sleepers.map((x) => thumbHtml(x.i, x.d == null ? 'nie getragen' : `vor ${x.d} Tagen`)).join('')}</div>`
    : '<p class="tip">Nichts – alles wird regelmäßig getragen. Teile zählen hier erst, wenn sie 14 Tage im Schrank sind.</p>';

  const favs = owned.map((i) => ({ i, n: wornStats(i.id).count })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 8);
  html += '<h3 class="sec">Lieblinge</h3>';
  html += favs.length
    ? `<div class="thumbs">${favs.map((x) => thumbHtml(x.i, `${x.n}× getragen`)).join('')}</div>`
    : '<p class="tip">Tippe unten auf „Getragen“, wenn du ein Outfit anhast. Dann siehst du hier deine Lieblinge.</p>';

  const taste = buildTaste();
  const styles = [...taste.colorPairs.entries()]
    .map(([k, s]) => ({ k, s, c: k.split('|') }))
    .filter((x) => x.s > 0 && x.c[0] !== x.c[1])
    .sort((a, b) => b.s - a.s).slice(0, 4);
  html += '<h3 class="sec">Dein Stil</h3>';
  html += styles.length
    ? `<p class="tip">Gelernt aus ${state.outfits.length} gemerkten Outfits und ${state.worn.length} getragenen Tagen. Danach richten sich „Vorschlag“ und „Zufall“.</p><div class="styles">${styles.map((x) => `<div class="style-row"><i style="background:${COLORS[x.c[0]]}"></i><i style="background:${COLORS[x.c[1]]}"></i><span>${esc(x.c[0])} + ${esc(x.c[1])}</span></div>`).join('')}</div>`
    : '<p class="tip">Je öfter du Outfits merkst oder als getragen einträgst, desto besser lernt die App deinen Stil. Danach richten sich dann „Vorschlag“ und „Zufall“.</p>';

  if (wash.length) html += `<h3 class="sec">In der Wäsche</h3><div class="thumbs">${wash.map((i) => thumbHtml(i, CAT[i.cat].one)).join('')}</div>`;
  if (wishes.length) html += `<h3 class="sec">Wunschliste</h3><div class="thumbs">${wishes.map((i) => thumbHtml(i, CAT[i.cat].one)).join('')}</div>`;

  const hist = [...state.worn].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 30);
  html += '<h3 class="sec">Verlauf</h3>';
  html += hist.length
    ? `<div class="hist">${hist.map((w) => `<div class="hist-row"><b>${esc(shortDate(w.id))}</b>${Object.values(w.sel).filter((id) => id && itemById(id)).map((id) => `<img src="${urlOf(itemById(id))}" alt="">`).join('')}</div>`).join('')}</div>`
    : '<p class="tip">Noch keine Einträge.</p>';
  body.innerHTML = html;
  body.querySelectorAll('.thumb').forEach((b) => (b.onclick = () => {
    const item = itemById(b.dataset.id);
    closeSheet($('#sheetStats'));
    setActive(item.cat);
    select(item.cat, item.id, 1);
    renderWheel();
  }));
}

// ---------- Kofferpacken ----------
let tripView = 'list';
let tripDraft = { name: '', days: 5, season: 'sommer', occ: null };

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pickHarmonious(list, n, withItems) {
  const out = list.filter((i) => withItems.every((w) => harmonious([i, w]))).slice(0, n);
  for (const i of list) if (out.length < n && !out.includes(i)) out.push(i);
  return out;
}

// Kleiner Kapsel-Koffer: wenige Unterteile, mehr Oberteile, alles kombinierbar
function planTrip(days, season, occ) {
  const t = season === 'sommer' ? 25 : season === 'winter' ? 3 : 14;
  const ok = (i) => !i.wish && seasonOkForTemp(i, t) && (!occ || !(i.occ || []).length || i.occ.includes(occ));
  const P = (cat) => shuffled(itemsOf(cat).filter(ok));
  const bottoms = pickHarmonious([...P('hose'), ...P('rock')], Math.min(3, Math.ceil(days / 3)), []);
  const tops = pickHarmonious(P('shirt'), Math.min(7, Math.ceil(days * 0.7)), bottoms);
  const dresses = t >= 15 ? P('kleid').slice(0, Math.floor(days / 4) || (bottoms.length ? 0 : 1)) : [];
  const shoes = P('schuhe').slice(0, days > 4 ? 2 : 1);
  const pullis = t < 17 ? pickHarmonious(P('pulli'), t < 8 ? 2 : 1, bottoms) : [];
  const jacke = t < 18 ? P('jacke').slice(0, 1) : [];
  const extra = { tasche: P('tasche').slice(0, 1), muetze: t < 8 ? P('muetze').slice(0, 1) : [], hals: t < 10 ? P('hals').slice(0, 1) : [] };
  const outfits = [];
  for (let d = 0; d < days; d++) {
    const s = emptySel();
    if (dresses.length && (d % 4 === 3 || !bottoms.length)) s.kleid = dresses[Math.floor(d / 4) % dresses.length].id;
    else {
      if (tops.length) s.shirt = tops[d % tops.length].id;
      const b = bottoms[d % (bottoms.length || 1)];
      if (b) s[b.cat] = b.id;
    }
    if (pullis.length) s.pulli = pullis[d % pullis.length].id;
    if (jacke.length) s.jacke = jacke[0].id;
    if (shoes.length) s.schuhe = shoes[d % shoes.length].id;
    for (const [k, v] of Object.entries(extra)) if (v.length) s[k] = v[0].id;
    outfits.push(s);
  }
  return outfits;
}

function packList(trip) {
  const map = new Map();
  trip.outfits.forEach((sel, d) => {
    for (const id of Object.values(effective(sel))) {
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(d + 1);
    }
  });
  const order = Object.fromEntries(CATS.map((c, i) => [c.id, i]));
  return [...map.entries()].map(([id, days]) => ({ item: itemById(id), days }))
    .filter((x) => x.item).sort((a, b) => order[a.item.cat] - order[b.item.cat]);
}

const SEASON_LABEL = Object.fromEntries(SEASONS);

function renderTrips() {
  const body = $('#tripBody');
  body.innerHTML = '';
  if (tripView === 'list') {
    $('#tripTitle').textContent = 'Kofferpacken';
    const list = [...state.trips].sort((a, b) => b.created - a.created);
    for (const t of list) {
      const pl = packList(t);
      const done = pl.filter((x) => t.packed[x.item.id]).length;
      const row = document.createElement('button');
      row.className = 'trip-row';
      row.innerHTML = `<span><b>${esc(t.name)}</b><small>${t.days} Tage · ${SEASON_LABEL[t.season]} · ${done}/${pl.length} eingepackt</small></span><svg><use href="#i-right"/></svg>`;
      row.onclick = () => { tripView = t.id; renderTrips(); };
      body.appendChild(row);
    }
    if (!list.length) body.insertAdjacentHTML('beforeend', '<p class="tip">Plane eine Reise: Die App stellt aus deinem Schrank kombinierbare Outfits zusammen und macht daraus eine Packliste.</p>');
    const add = document.createElement('button');
    add.className = 'big-btn primary';
    add.style.width = '100%';
    add.style.marginTop = '12px';
    add.textContent = '+ Neue Reise planen';
    add.onclick = () => { tripView = 'new'; tripDraft = { name: '', days: 5, season: 'sommer', occ: null }; renderTrips(); };
    body.appendChild(add);
    return;
  }

  if (tripView === 'new') {
    $('#tripTitle').textContent = 'Neue Reise';
    const d = tripDraft;
    body.innerHTML = `
      <div class="form-row"><span class="label">Wohin?</span>
        <div class="search-row" style="margin:0"><input type="text" id="tName" placeholder="z. B. Mallorca" value="${esc(d.name)}"></div></div>
      <div class="form-row"><span class="label">Wie viele Tage?</span>
        <div class="stepper"><button id="tMinus">−</button><b id="tDays">${d.days} Tage</b><button id="tPlus">+</button></div></div>
      <div class="form-row"><span class="label">Wetter dort</span><div class="seg" id="tSeason" style="margin:0"></div></div>
      <div class="form-row"><span class="label">Anlass</span><div class="chip-row" id="tOcc"></div></div>
      <div class="row-actions"><button class="btn ghost" id="tBack">Zurück</button><button class="btn primary" id="tPlan">Outfits planen</button></div>`;
    $('#tName').oninput = (e) => (d.name = e.target.value);
    const setDays = (n) => { d.days = Math.max(1, Math.min(21, n)); $('#tDays').textContent = `${d.days} ${d.days === 1 ? 'Tag' : 'Tage'}`; };
    $('#tMinus').onclick = () => setDays(d.days - 1);
    $('#tPlus').onclick = () => setDays(d.days + 1);
    const seg = $('#tSeason');
    for (const [val, label] of SEASONS.slice(1)) {
      const b = document.createElement('button');
      b.textContent = { sommer: '☀️ warm', uebergang: '🌤️ mild', winter: '❄️ kalt' }[val] || label;
      b.classList.toggle('on', d.season === val);
      b.onclick = () => { d.season = val; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
      seg.appendChild(b);
    }
    const occ = $('#tOcc');
    for (const [val, label] of [[null, 'Egal'], ...OCCASIONS]) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = label;
      b.setAttribute('aria-selected', d.occ === val);
      b.onclick = () => { d.occ = val; occ.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-selected', x === b)); };
      occ.appendChild(b);
    }
    $('#tBack').onclick = () => { tripView = 'list'; renderTrips(); };
    $('#tPlan').onclick = async () => {
      const outfits = planTrip(d.days, d.season, d.occ);
      if (!outfits.some((o) => !isEmpty(o))) return toast('Im Schrank ist noch nichts Passendes');
      const trip = { id: uid(), name: d.name.trim() || 'Meine Reise', days: d.days, season: d.season, occ: d.occ, outfits, packed: {}, created: Date.now() };
      state.trips.push(trip);
      await db.put('trips', trip);
      tripView = trip.id;
      renderTrips();
    };
    return;
  }

  const trip = state.trips.find((t) => t.id === tripView);
  if (!trip) { tripView = 'list'; renderTrips(); return; }
  $('#tripTitle').textContent = trip.name;
  const save = () => db.put('trips', trip);
  body.insertAdjacentHTML('beforeend', `<p class="tip">${trip.days} Tage · ${SEASON_LABEL[trip.season]}. „Neu“ würfelt einen Tag neu, „Aktuelles“ übernimmt das Outfit, das gerade auf der großen Figur ist.</p>`);
  const days = document.createElement('div');
  days.className = 'days';
  trip.outfits.forEach((sel, i) => {
    const day = document.createElement('div');
    day.className = 'day';
    day.innerHTML = `<b>Tag ${i + 1}</b>`;
    const fig = miniFigure(sel);
    fig.onclick = () => { closeSheet($('#sheetTrips')); applyOutfit(sel); };
    day.appendChild(fig);
    const acts = document.createElement('div');
    acts.className = 'day-actions';
    acts.innerHTML = '<button data-a="new">Neu</button><button data-a="cur">Aktuelles</button>';
    acts.onclick = async (e) => {
      const a = e.target.closest('button');
      if (!a) return;
      if (a.dataset.a === 'new') {
        const t = trip.season === 'sommer' ? 25 : trip.season === 'winter' ? 3 : 14;
        const s = makeOutfit({ t });
        if (!s) return toast('Nichts Passendes gefunden');
        trip.outfits[i] = s;
      } else {
        if (isEmpty(state.sel)) return toast('Die große Figur hat nichts an');
        trip.outfits[i] = effective(state.sel);
      }
      await save();
      renderTrips();
    };
    day.appendChild(acts);
    days.appendChild(day);
  });
  body.appendChild(days);

  const pl = packList(trip);
  const done = pl.filter((x) => trip.packed[x.item.id]).length;
  body.insertAdjacentHTML('beforeend', `<h3 class="sec">Packliste · ${done} von ${pl.length} eingepackt</h3>`);
  const pack = document.createElement('div');
  pack.className = 'pack';
  for (const { item, days: on } of pl) {
    const row = document.createElement('label');
    row.className = 'pack-row' + (trip.packed[item.id] ? ' done' : '');
    row.innerHTML = `<img src="${urlOf(item)}" alt=""><span>${esc(CAT[item.cat].one)}<small>${on.length === trip.days ? 'jeden Tag' : 'Tag ' + on.join(', ')}</small></span><input type="checkbox" ${trip.packed[item.id] ? 'checked' : ''}>`;
    row.querySelector('input').onchange = async (e) => { trip.packed[item.id] = e.target.checked; await save(); renderTrips(); };
    pack.appendChild(row);
  }
  body.appendChild(pack);
  const acts = document.createElement('div');
  acts.className = 'row-actions';
  acts.innerHTML = '<button class="btn ghost" id="tList">Alle Reisen</button><button class="btn danger" id="tDel">Reise löschen</button>';
  body.appendChild(acts);
  $('#tList').onclick = () => { tripView = 'list'; renderTrips(); };
  $('#tDel').onclick = async () => {
    if (!confirm(`Reise „${trip.name}“ löschen?`)) return;
    state.trips = state.trips.filter((t) => t !== trip);
    await db.remove('trips', trip.id);
    tripView = 'list';
    renderTrips();
  };
}

// ---------- Sicherung ----------
const bufToDataUrl = (buf, type) => new Promise((resolve) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.readAsDataURL(new Blob([buf], { type }));
});

async function exportBackup() {
  if (!state.items.length) return toast('Noch nichts zum Sichern');
  toast('Sicherung wird erstellt …');
  const items = await Promise.all(state.items.map(async ({ buf, ...rest }) => ({ ...rest, data: await bufToDataUrl(buf, rest.type) })));
  const json = JSON.stringify({ app: 'kleiderschrank', version: 2, items, outfits: state.outfits, worn: state.worn, trips: state.trips });
  const name = `kleiderschrank-${dayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Kleiderschrank-Sicherung' }); } catch {}
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importBackup(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'kleiderschrank') throw new Error('falsche Datei');
    let n = 0;
    for (const { data: url, ...rest } of data.items || []) {
      const buf = await (await fetch(url)).arrayBuffer();
      await db.put('items', { ...rest, buf });
      n++;
    }
    for (const store of ['outfits', 'worn', 'trips']) for (const x of data[store] || []) await db.put(store, x);
    await loadAll();
    closeSheet($('#sheetMenu'));
    toast(`${n} Teile geladen`);
  } catch (err) {
    console.error(err);
    toast('Diese Datei ist keine gültige Sicherung');
  }
}

function renderStat() {
  const app = $('#app').getBoundingClientRect();
  $('#appVersion').textContent = `Version ${APP_VERSION} · Bildschirm ${innerWidth}×${innerHeight} · App ${Math.round(app.width)} px · Seite ${document.documentElement.scrollWidth} px`;
  const owned = state.items.filter((i) => !i.wish).length;
  $('#stat').textContent = `${owned} Teile im Schrank, ${state.outfits.length} Outfits gemerkt, ${state.trips.length} Reisen geplant.`;
}

// ---------- Start ----------
function updateHint() {
  $('#stageHint').textContent = state.items.length ? '' : 'Fotografiere das erste Teil mit +';
  $('#btnPrev').hidden = $('#btnNext').hidden = !state.items.length;
}

function applyTheme(retro) {
  document.documentElement.classList.toggle('retro', retro);
  $('#optRetro').checked = retro;
  const month = new Date().getMonth();
  const season = month >= 2 && month <= 4 ? 'Frühlings' : month <= 7 ? 'Sommer' : month <= 10 ? 'Herbst' : 'Winter';
  $('#seasonLabel').textContent = `${season}-Mode`;
  requestAnimationFrame(() => { scrollToIndex(wheelIndex, false); updateCards(); });
}

function applyFigureOption() {
  $('#figure').classList.toggle('no-figure', !state.showFigure);
  $('#optFigure').checked = state.showFigure;
  if (mainLayers) fitFigure();
}

// Teile von früher bekommen ihre Farben nachträglich
async function backfillColors() {
  for (const item of state.items) {
    if (item.colors) continue;
    try {
      const c = await blobToCanvas(new Blob([item.buf], { type: item.type }), 600);
      const { colors, pattern } = analyzeColors(c);
      item.colors = colors;
      item.pattern = pattern && !NO_PATTERN.includes(item.cat);
      item.season ||= 'ganz';
      item.occ ||= [];
      await db.put('items', item);
    } catch (err) {
      console.warn('Farben', err);
    }
  }
}

async function loadAll() {
  for (const u of [...urls.values(), ...fitted.values()]) URL.revokeObjectURL(u);
  urls.clear();
  fitted.clear();
  [state.items, state.outfits, state.worn, state.trips] = await Promise.all(
    ['items', 'outfits', 'worn', 'trips'].map((s) => db.getAll(s)));
  tasteChanged();
  await Promise.all(state.items.map((i) => prepareFitted(i).catch((err) => console.warn('Hose', err))));
  const sel = store('sel') || {};
  state.sel = emptySel();
  for (const c of CATS) state.sel[c.id] = sel[c.id] && itemById(sel[c.id]) ? sel[c.id] : null;
  const active = store('active');
  state.active = CAT[active] ? active : 'shirt';
  state.filter = { ...state.filter, ...(store('filter') || {}) };
  state.place = store('place');
  const fig = store('showFigure');
  // Standard: ohne Figur, wirkt wie ein gestyltes Outfit-Foto
  state.showFigure = fig === null ? false : fig;
  mainLayers = buildFigure($('#figure'));
  applyFigureOption();
  renderLayers(mainLayers, state.sel, 0);
  renderCats();
  renderWheel();
  renderFilter();
  updateFooter();
  updateHint();
  backfillColors();
  if (state.place) getWeather().then((w) => { state.weather = w; renderWeatherLine(); }).catch(() => {});
}

function initInstallHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && !standalone && !store('hintClosed')) $('#installHint').hidden = false;
  $('#btnHintClose').onclick = () => { $('#installHint').hidden = true; store('hintClosed', true); };
}

async function init() {
  $('#wheelTrack').addEventListener('scroll', onWheelScroll, { passive: true });
  window.addEventListener('resize', () => scrollToIndex(wheelIndex, false));
  initStageGestures();
  $('#btnAdd').onclick = openAdd;
  $('#btnShuffle').onclick = shuffle;
  $('#btnSuggest').onclick = suggestToday;
  $('#btnSave').onclick = saveOutfit;
  $('#btnWorn').onclick = toggleWorn;
  $('#btnShare').onclick = shareOutfit;
  $('#btnFilter').onclick = openFilter;
  $('#btnOutfits').onclick = () => { renderOutfits(); openSheet($('#sheetOutfits')); };
  $('#btnMenu').onclick = () => { renderStat(); openSheet($('#sheetMenu')); };
  $('#btnStats').onclick = () => { closeSheet($('#sheetMenu')); renderStats(); openSheet($('#sheetStats')); };
  $('#btnTrips').onclick = () => { closeSheet($('#sheetMenu')); tripView = 'list'; renderTrips(); openSheet($('#sheetTrips')); };
  $('#btnWeatherPlace').onclick = () => { closeSheet($('#sheetMenu')); openWeather(false); };
  $('#weatherLine').onclick = () => openWeather(false);
  $('#btnGeo').onclick = useGeo;
  $('#btnPlace').onclick = searchPlace;
  $('#placeInput').onkeydown = (e) => { if (e.key === 'Enter') searchPlace(); };
  $('#optRetro').onchange = (e) => { store('theme', e.target.checked ? 'retro' : 'modern'); applyTheme(e.target.checked); };
  $('#optFigure').onchange = (e) => { state.showFigure = e.target.checked; store('showFigure', state.showFigure); applyFigureOption(); };

  $('#fWash').onchange = (e) => { state.filter.hideWash = e.target.checked; changedFilter(); };
  $('#fWish').onchange = (e) => { state.filter.hideWish = e.target.checked; changedFilter(); };
  $('#btnFilterReset').onclick = () => { state.filter = { season: null, occ: null, color: null, hideWash: false, hideWish: false }; changedFilter(); };

  $('#inCamera').onchange = onFile;
  $('#inGallery').onchange = onFile;
  $('#modeSeg').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !pending) return;
    pending.mode = b.dataset.mode;
    updatePreview();
  };
  let tolTimer;
  $('#tol').oninput = (e) => {
    clearTimeout(tolTimer);
    tolTimer = setTimeout(() => { if (pending) { pending.tol = +e.target.value; updatePreview(); } }, 120);
  };
  $('#btnKeep').onclick = keepItem;
  $('#btnDiscard').onclick = () => { discardPending(); showStep('pick'); };
  $('#sheetAdd').addEventListener('closed', discardPending);

  $('#editTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); };
  ['#adjScale', '#adjX', '#adjY'].forEach((s) => ($(s).oninput = onAdj));
  $('#btnResetAdj').onclick = () => {
    $('#adjScale').value = 100; $('#adjX').value = 0; $('#adjY').value = 0;
    onAdj();
  };
  $('#btnFlip').onclick = () => {
    const item = itemById(editId);
    if (!item) return;
    item.flip = !item.flip;
    refreshPiece(item);
  };
  $('#pantsSeg').onclick = (e) => {
    const b = e.target.closest('button');
    const item = itemById(editId);
    if (!b || !item) return;
    item.stretch = b.dataset.stretch === '1';
    renderSitz(item);
    refreshPiece(item);
  };
  $('#shoeSeg').onclick = (e) => {
    const b = e.target.closest('button');
    const item = itemById(editId);
    if (!b || !item) return;
    item.shoe = b.dataset.shoe;
    renderSitz(item);
    refreshPiece(item);
  };
  $('#dPattern').onchange = (e) => { const i = itemById(editId); if (i) i.pattern = e.target.checked; };
  $('#dWash').onchange = (e) => { const i = itemById(editId); if (i) { i.wash = e.target.checked; renderDetails(i); } };
  $('#dWish').onchange = (e) => {
    const i = itemById(editId);
    if (!i) return;
    i.wish = e.target.checked;
    renderDetails(i);
    if (!i.wish) toast('Glückwunsch zum neuen Teil 🎉');
  };
  $('#sheetEdit').addEventListener('closed', async () => {
    const item = itemById(editId);
    if (item) await db.put('items', item);
    renderCats();
    renderWheel();
    renderFilter();
  });
  $('#btnDelete').onclick = async () => {
    const item = itemById(editId);
    if (!item || !confirm(`Dieses Teil (${CAT[item.cat].one}) wirklich löschen?`)) return;
    await db.remove('items', item.id);
    state.items = state.items.filter((i) => i !== item);
    tasteChanged();
    if (state.sel[item.cat] === item.id) select(item.cat, null, -1);
    dropUrls(item.id);
    editId = null;
    closeSheet($('#sheetEdit'));
    updateHint();
    toast('Teil gelöscht');
  };
  $('#whyClose').onclick = hideWhy;
  $('#btnExport').onclick = exportBackup;
  $('#inImport').onchange = importBackup;

  initInstallHint();
  applyTheme(document.documentElement.classList.contains('retro'));
  await loadAll();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW', err));
  }
}

init();
