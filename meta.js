// Farben, Muster, Farbharmonie und Wetter – reine Helfer ohne Oberfläche.

export const COLORS = {
  Schwarz: '#1f1f1f', Weiß: '#f4f3ef', Grau: '#9a9a9a', Beige: '#d9c7a7', Braun: '#7a5232',
  Dunkelblau: '#1f2d4d', Jeansblau: '#5b7aa6', Rot: '#c8322f', Orange: '#e8812f', Gelb: '#e9c935',
  Grün: '#4f9a4a', Türkis: '#2fb3b0', Blau: '#2f6fd0', Lila: '#7d4fb3', Rosa: '#e79bb5',
};
// passen zu allem
export const NEUTRAL = new Set(['Schwarz', 'Weiß', 'Grau', 'Beige', 'Braun', 'Dunkelblau', 'Jeansblau']);

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function colorName(h, s, l) {
  if (l < 0.16) return s > 0.3 && h >= 195 && h < 260 ? 'Dunkelblau' : 'Schwarz';
  // schwacher Farbstich (Licht, Schatten) zählt als neutral
  if (s < 0.22) return l > 0.68 ? 'Weiß' : l < 0.26 ? 'Schwarz' : 'Grau';
  if (l > 0.82 && s < 0.4) return 'Weiß';
  if (h >= 195 && h < 250 && l < 0.32) return 'Dunkelblau';
  if (h >= 190 && h < 230 && s < 0.5 && l < 0.7) return 'Jeansblau';
  if (h >= 18 && h < 50 && s < 0.55 && l >= 0.55) return 'Beige';
  if (h >= 8 && h < 45 && l < 0.5) return 'Braun';
  if (h < 12 || h >= 345) return l > 0.7 ? 'Rosa' : 'Rot';
  if (h < 40) return 'Orange';
  if (h < 66) return 'Gelb';
  if (h < 165) return 'Grün';
  if (h < 192) return 'Türkis';
  if (h < 250) return 'Blau';
  if (h < 290) return 'Lila';
  return 'Rosa';
}

// Die (bis zu) drei häufigsten Farben eines freigestellten Teils und ob es gemustert ist
export function analyzeColors(src) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 12000)));
  const bins = new Map();
  let total = 0, dark = 0, light = 0, sumL = 0, sumL2 = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 200) continue;
      const hsl = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      const n = colorName(...hsl);
      if (hsl[2] < 0.35) dark++;
      if (hsl[2] > 0.6) light++;
      sumL += hsl[2]; sumL2 += hsl[2] * hsl[2];
      const b = bins.get(n) || { n, c: 0, r: 0, g: 0, b: 0 };
      b.c++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
      bins.set(n, b);
      total++;
    }
  }
  if (!total) return { colors: [], pattern: false };
  const colors = [...bins.values()]
    .sort((a, b) => b.c - a.c)
    .filter((b) => b.c / total >= 0.06)
    .slice(0, 3)
    .map((b) => ({ n: b.n, s: +(b.c / total).toFixed(2), rgb: [(b.r / b.c) | 0, (b.g / b.c) | 0, (b.b / b.c) | 0] }));
  // Feine Muster (Streifen, Karos): viele Hell-Dunkel-Sprünge zwischen Nachbarpixeln
  const L = (i) => (Math.max(d[i], d[i + 1], d[i + 2]) + Math.min(d[i], d[i + 1], d[i + 2])) / 510;
  const stride = Math.max(2, Math.round(w / 250)), off = Math.max(1, Math.round(w / 500));
  let pairs = 0, jumps = 0;
  for (let y = 0; y < h - off; y += stride) {
    for (let x = 0; x < w - off; x += stride) {
      const i = (y * w + x) * 4, r = i + off * 4, b = i + off * w * 4;
      if (d[i + 3] < 200 || d[r + 3] < 200 || d[b + 3] < 200) continue;
      const l = L(i);
      pairs++;
      if (Math.abs(l - L(r)) > 0.12 || Math.abs(l - L(b)) > 0.12) jumps++;
    }
  }
  // Muster = viel Hell UND viel Dunkel, starke Schwankung, viele Sprünge oder zwei kräftige Farben
  const std = Math.sqrt(Math.max(0, sumL2 / total - (sumL / total) ** 2));
  const pattern = (dark / total >= 0.12 && light / total >= 0.12) || std > 0.2 ||
    (pairs > 50 && jumps / pairs > 0.2) || looksPatterned(colors);
  return { colors, pattern };
}

const lightness = (rgb) => rgbToHsl(...rgb)[2];
const hueOf = (rgb) => rgbToHsl(...rgb)[0];
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// Zwei kräftig unterschiedliche Farben mit großem Anteil = Muster (Streifen, Punkte …)
export function looksPatterned(colors) {
  if (!colors || colors.length < 2 || colors[1].s < 0.2) return false;
  const [a, b] = colors;
  if (Math.abs(lightness(a.rgb) - lightness(b.rgb)) > 0.3) return true;
  return !NEUTRAL.has(a.n) && !NEUTRAL.has(b.n) && hueDist(hueOf(a.rgb), hueOf(b.rgb)) > 50;
}

const rgbOf = (c) => c.rgb || hexToRgb(COLORS[c.n] || '#888888');
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Passt das zusammen? Höchstens ein gemustertes Teil, kräftige Farben nur aus einer Farbfamilie.
export function harmonious(items) {
  if (items.filter((i) => i && i.pattern).length > 1) return false;
  const hues = [];
  for (const i of items) {
    for (const c of (i && i.colors) || []) {
      if (c.s >= 0.2 && !NEUTRAL.has(c.n)) hues.push(hueOf(rgbOf(c)));
    }
  }
  for (let a = 0; a < hues.length; a++) {
    for (let b = a + 1; b < hues.length; b++) if (hueDist(hues[a], hues[b]) > 45) return false;
  }
  return true;
}

// ---------- Wetter (Open-Meteo, kostenlos, ohne Anmeldung) ----------
const round1 = (x) => Math.round(x * 10) / 10; // etwa 10 km genau, mehr braucht das Wetter nicht

export async function fetchWeather(lat, lon) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${round1(lat)}&longitude=${round1(lon)}` +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=1';
  const res = await fetch(u);
  if (!res.ok) throw new Error('Wetter nicht erreichbar');
  const d = (await res.json()).daily;
  return {
    max: d.temperature_2m_max[0], min: d.temperature_2m_min[0],
    rain: d.precipitation_probability_max[0] ?? 0, code: d.weather_code[0], t: Date.now(),
  };
}

export async function findPlace(name) {
  const u = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&name=${encodeURIComponent(name)}`;
  const j = await (await fetch(u)).json();
  const r = j.results && j.results[0];
  if (!r) return null;
  return { lat: round1(r.latitude), lon: round1(r.longitude), name: r.name };
}

export function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}

// Temperatur, nach der man sich tagsüber anzieht
export const feelTemp = (w) => w.max * 0.6 + w.min * 0.4;
