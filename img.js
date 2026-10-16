// Bildverarbeitung: verkleinern, Hintergrund entfernen, Ränder abschneiden.

const BG_LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
let bgLib;

export async function blobToCanvas(blob, maxSide = 1280) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))), type, quality));
}

// KI-Freistellung direkt im Browser. Beim ersten Mal wird das Modell (~40 MB) geladen.
export async function removeBackgroundAI(canvas, onProgress) {
  if (!bgLib) bgLib = import(BG_LIB);
  const { removeBackground } = await bgLib;
  const input = await canvasToBlob(canvas, 'image/png');
  const out = await removeBackground(input, {
    model: 'isnet_quint8',
    output: { format: 'image/png' },
    progress: (key, current, total) => onProgress && onProgress(key, current, total),
  });
  return blobToCanvas(out, 4000);
}

// Ersatzweg ohne KI: Farbe vom Bildrand aus wegfüllen (gut bei Bett, Boden, heller Wand).
export function removeBackgroundColor(src, tolerance = 40) {
  const w = src.width, h = src.height;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Hintergrundfarbe = Median der Randpixel
  const rs = [], gs = [], bs = [];
  const sample = (x, y) => { const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
  const step = Math.max(1, Math.floor((w + h) / 400));
  for (let x = 0; x < w; x += step) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y += step) { sample(0, y); sample(w - 1, y); }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const br = med(rs), bg = med(gs), bb = med(bs);

  const tol2 = tolerance * tolerance * 3;
  const isBg = (i) => {
    const dr = d[i] - br, dg = d[i + 1] - bg, db = d[i + 2] - bb;
    return dr * dr + dg * dg + db * db <= tol2;
  };

  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const push = (p) => { if (!seen[p] && isBg(p * 4)) { seen[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (head < tail) {
    const p = queue[head++];
    d[p * 4 + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }

  // Kanten weicher machen: sichtbare Pixel neben entfernten halb transparent
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (seen[p]) continue;
      if (seen[p - 1] || seen[p + 1] || seen[p - w] || seen[p + w]) d[p * 4 + 3] = 150;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// Krümel entfernen: nur große zusammenhängende Flächen behalten
// (mehrere, damit ein Schuhpaar beide Schuhe behält).
export function keepMainParts(src) {
  const w = src.width, h = src.height;
  const ctx = src.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const sizes = [0];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (label[p0] || d[p0 * 4 + 3] <= 100) continue;
    const id = sizes.length;
    let top = 0, count = 0;
    stack[top++] = p0;
    label[p0] = id;
    while (top) {
      const p = stack[--top];
      count++;
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of nb) {
        if (q < 0 || q >= w * h || label[q] || d[q * 4 + 3] <= 100) continue;
        label[q] = id;
        stack[top++] = q;
      }
    }
    sizes.push(count);
  }
  let max = 0;
  for (const s of sizes) if (s > max) max = s;
  if (!max) return src;
  for (let p = 0; p < w * h; p++) {
    const l = label[p];
    if (l && sizes[l] < max * 0.08) d[p * 4 + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  return src;
}

function rowCounts(src) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const counts = new Int32Array(h);
  const left = new Int32Array(h).fill(-1);
  const right = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 100) {
        counts[y]++;
        if (left[y] < 0) left[y] = x;
        right[y] = x;
      }
    }
  }
  return { counts, left, right };
}

// Kleiderbügel: Der Haken ragt als dünner Streifen über die Schultern.
// Alles oberhalb der ersten breiten Zeile wird entfernt. Gibt eine Kopie zurück.
export function removeHanger(src) {
  const h = src.height;
  const { counts } = rowCounts(src);
  let max = 0;
  for (const c of counts) if (c > max) max = c;
  if (!max) return src;
  let cut = 0;
  while (cut < h * 0.4 && counts[cut] < max * 0.14) cut++;
  if (cut >= h * 0.4) return src;
  // ein Stück zurück, damit die Schulterspitzen bleiben
  while (cut > 0 && counts[cut - 1] >= max * 0.06) cut--;
  let above = 0;
  for (let y = 0; y < cut; y++) above += counts[y];
  if (above < max * 0.5) return src; // kein Haken da
  const out = document.createElement('canvas');
  out.width = src.width; out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.clearRect(0, 0, out.width, cut);
  return out;
}

// Hose auf die Figur zuschneiden: Bund auf Hüftbreite skalieren, die Beine bis zu
// den Schuhen strecken. Ergebnis hat genau das Seitenverhältnis des Hosen-Platzes.
export function fitPants(src, { boxW, boxH, waist, hipZone = 0.3, pxPerUnit = 4 }) {
  const { left, right } = rowCounts(src);
  const h = src.height;
  const widths = [];
  for (let y = Math.floor(h * 0.02); y < Math.max(3, Math.floor(h * 0.07)); y++) {
    if (left[y] >= 0) widths.push(right[y] - left[y] + 1);
  }
  widths.sort((a, b) => a - b);
  const waistPx = widths.length ? widths[widths.length >> 1] : src.width;
  let s = waist / waistPx; // Einheiten pro Pixel
  s = Math.min(s, boxW / src.width);
  const outW = Math.round(boxW * pxPerUnit), outH = Math.round(boxH * pxPerUnit);
  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const dw = src.width * s * pxPerUnit;
  const dx = (outW - dw) / 2;
  const hipPx = Math.round(h * hipZone);
  const hipH = Math.min(outH * 0.6, hipPx * s * pxPerUnit);
  ctx.drawImage(src, 0, 0, src.width, hipPx, dx, 0, dw, hipH);
  ctx.drawImage(src, 0, hipPx, src.width, h - hipPx, dx, hipH - 0.5, dw, outH - hipH + 0.5);
  return out;
}

// Durchsichtige Ränder abschneiden, damit das Teil auf der Figur richtig sitzt.
export function trim(src, maxSide = 1000) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 100) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return src; // alles durchsichtig, unverändert lassen
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const scale = Math.min(1, maxSide / Math.max(cw, ch));
  const out = document.createElement('canvas');
  out.width = Math.round(cw * scale);
  out.height = Math.round(ch * scale);
  out.getContext('2d').drawImage(src, minX, minY, cw, ch, 0, 0, out.width, out.height);
  return out;
}

export function scaleDown(src, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  if (scale === 1) return src;
  const out = document.createElement('canvas');
  out.width = Math.round(src.width * scale);
  out.height = Math.round(src.height * scale);
  out.getContext('2d').drawImage(src, 0, 0, out.width, out.height);
  return out;
}
