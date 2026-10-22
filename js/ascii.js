// ASCII image engine for "In Defense of the Poor Image" — the settled v-squash treatment (default look + hover area).
// Edit SETTINGS to tune. Shared by the hero card and any other ASCII image on the site.
// ---------- SETTINGS (edit these) ----------
// cols = how many cells across the image (more cols = smaller cell size)
const SETTINGS = {
  base:  { cols: 170, threshold: 0.42, edgeWeight: 0.30, lumaWeight: 0.85 },
  hover: { threshold: 0.18, edgeWeight: 0.80, lumaWeight: 1.00 },  // values at the centre of the hover area
  contrast: 1.5,             // >1 = lights lighter, darks darker (easier to read)
  cellAspect: 1,             // square cells, like the Sample Image
  ramp: ':-=*o0OQSHM',       // dim -> bright
  dot: '.',                  // below threshold
  edgeCut: 0.25,             // how strong an edge must be to draw / \ | -
  edgeSensitivity: 0.85,     // lower = more edge strokes in soft areas
  jitter: 0.12,              // random scatter of characters
  fontScale: 1.05,           // glyph size relative to the cell
  renderScale: 1,            // 1 = soft look you picked; 2 = sharper characters on retina screens

  // hover area (follows the mouse): characters stay in place; near the cursor they squash down
  // inside their cell and the image gets sharper and more contrasty — all fading smoothly to the edge
  areaSize: 1 / 2,           // diameter, as a fraction of the image width
  areaSquash: 0.5,           // how much the characters squash at the centre (0.5 = half height)
  areaDetail: 0.6,           // how much finer the image is sampled at the centre (0 = none, 0.6 = a lot)
  areaContrast: 0.6,         // extra contrast at the centre
  areaStartSize: 0.35,       // the area grows from this size to full when the mouse enters
  areaLag: 0.12,             // seconds; how far the area trails behind the mouse
  hoverInMs: 600,            // grow + fade in
  hoverOutMs: 700,           // shrink + fade out
  ink: '#FFFFFF',
  paper: '#000000',
  flyInMs: 900,
  flipMs: 800,
};
// -------------------------------------------

const FONT = "'JetBrains Mono', monospace";
const dpr = () => SETTINGS.renderScale || Math.max(1, window.devicePixelRatio || 1);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// ---------- analysis: luminance as a summed-area table ----------
function analyze(source) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  const W = 640, H = Math.max(1, Math.round(W * sh / sw));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0, W, H);
  const px = x.getImageData(0, 0, W, H).data;
  const I = new Float64Array((W + 1) * (H + 1));
  const smp = [];
  for (let yy = 0; yy < H; yy++) { let row = 0;
    for (let xx = 0; xx < W; xx++) {
      const i = (yy * W + xx) * 4;
      const l = (0.2126 * px[i] + 0.7152 * px[i+1] + 0.0722 * px[i+2]) / 255;
      if ((xx + yy * 7) % 11 === 0) smp.push(l);
      row += l;
      I[(yy+1)*(W+1) + xx+1] = I[yy*(W+1) + xx+1] + row;
    } }
  smp.sort((a, b) => a - b);
  const lo = smp[Math.floor(smp.length * 0.02)], hi = smp[Math.floor(smp.length * 0.98)];
  return { W, H, aspect: sw / sh, IL: I, lo, hi: Math.max(hi, lo + 0.05) };
}
function boxSum(I, W, x0, y0, x1, y1) {
  const s = W + 1;
  return I[y1*s + x1] - I[y0*s + x1] - I[y1*s + x0] + I[y0*s + x0];
}

// ---------- ASCII cells ----------
// 1) average brightness per cell  2) edges between neighbouring cells
// 3) score = luma*lumaWeight + edge*edgeWeight (+ a little scatter)
// 4) below threshold -> '.', strong edge -> / \ | -, otherwise a ramp character
function buildGrid(data, cw, ch, colsIn) {
  const S = SETTINGS;
  const cols = Math.max(4, Math.round(colsIn));
  const cellW = cw / cols, cellH = cellW * S.cellAspect;
  const rows = Math.max(1, Math.floor(ch / cellH));
  const offY = (ch - rows * cellH) / 2;
  const sx = data.W / cw, sy = data.H / ch;
  const n = rows * cols, Lc = new Float32Array(n);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor((offY + r * cellH) * sy), y1 = Math.max(y0 + 1, Math.floor((offY + (r + 1) * cellH) * sy));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * cellW * sx), x1 = Math.max(x0 + 1, Math.floor((c + 1) * cellW * sx));
      const l = boxSum(data.IL, data.W, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0));
      Lc[r * cols + c] = clamp(0.5 + ((l - data.lo) / (data.hi - data.lo) - 0.5) * S.contrast);
    }
  }
  const at = (r, c) => Lc[r * cols + c];
  const GX = new Float32Array(n), GY = new Float32Array(n), E = new Float32Array(n);
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    const gx = (at(r-1,c+1) + 2*at(r,c+1) + at(r+1,c+1)) - (at(r-1,c-1) + 2*at(r,c-1) + at(r+1,c-1));
    const gy = (at(r-1,c-1) + 2*at(r-1,c) + at(r-1,c+1)) - (at(r+1,c-1) + 2*at(r+1,c) + at(r+1,c+1));
    const i = r * cols + c; GX[i] = gx; GY[i] = gy; E[i] = Math.hypot(gx, gy);
  }
  const smp = []; for (let i = 0; i < n; i += 7) smp.push(E[i]); smp.sort((a, b) => a - b);
  const norm = smp[Math.floor(smp.length * S.edgeSensitivity)] || 1;
  for (let i = 0; i < n; i++) E[i] = Math.min(1, E[i] / norm);
  return { cols, rows, cellW, cellH, offY, Lc, E, GX, GY, norm, fontPx: cellW * S.fontScale };
}
function cellHash(c, r) { let h = Math.sin((c + 1) * 12.9898 + (r + 1) * 78.233) * 43758.5453; return h - Math.floor(h); }
function scoreOf(l, e, p, h) { return clamp(p.lumaWeight * l + p.edgeWeight * e + (h - 0.5) * SETTINGS.jitter); }
function cellScore(g, i, p, h) { return scoreOf(g.Lc[i], g.E[i], p, h); }
function charFor(l, e, gx, gy, p, h) {
  const S = SETTINGS, s = scoreOf(l, e, p, h);
  if (s < p.threshold) return S.dot;
  if (p.edgeWeight * e > S.edgeCut) {
    const ang = ((Math.atan2(gy, gx) * 180 / Math.PI) + 90 + 360) % 180;
    return ang < 22.5 || ang >= 157.5 ? '-' : ang < 67.5 ? '/' : ang < 112.5 ? '|' : '\\';
  }
  const t = (s - p.threshold) / (1 - p.threshold);
  return S.ramp[Math.min(S.ramp.length - 1, Math.floor(t * S.ramp.length))];
}
function pickChar(g, i, p, h) { return charFor(g.Lc[i], g.E[i], g.GX[i], g.GY[i], p, h); }
function computeCells(data, cw, ch, p) {
  const g = buildGrid(data, cw, ch, p.cols), cells = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const i = r * g.cols + c, h = cellHash(c, r);
    cells.push({ x: (c + .5) * g.cellW, y: g.offY + (r + .5) * g.cellH, ch: pickChar(g, i, p, h), s: cellScore(g, i, p, h) });
  }
  return { cells, cellW: g.cellW, cellH: g.cellH, fontPx: g.fontPx };
}

// ---------- a canvas that shows an image as ASCII, with a hover area ----------
// Characters never move. Near the cursor they squash down toward the bottom of their cell, and the
// image is read more finely with more contrast. Everything fades smoothly to the default by distance.
class AsciiView {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.lens = { x: 0, y: 0, tx: 0, ty: 0, amp: 0, target: 0 };
    this.raf = 0; this.enabled = true;
    const move = e => {
      const b = canvas.getBoundingClientRect(), L = this.lens;
      L.tx = e.clientX - b.left; L.ty = e.clientY - b.top;
      if (L.amp < 0.01) { L.x = L.tx; L.y = L.ty; }
      if (this.enabled) { L.target = 1; this.kick(); }
    };
    const leave = () => { this.lens.target = 0; this.kick(); };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerup', e => { if (e.pointerType === 'touch') leave(); });   // finger lifted
    canvas.addEventListener('pointercancel', leave);
  }
  setSource(source) { this.data = analyze(source); }
  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) { this.lens.target = 0; this.lens.amp = 0; cancelAnimationFrame(this.raf); this.raf = 0; this.paint(); }
  }
  // cols: optional per-image column count (the essay photos keep the hero card's cell size)
  size(w, cols = SETTINGS.base.cols) {
    const S = SETTINGS, r = dpr();
    this.w = w; this.h = w / this.data.aspect;
    this.canvas.width = this.base.width = Math.round(this.w * r);
    this.canvas.height = this.base.height = Math.round(this.h * r);
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
    const g = this.g = buildGrid(this.data, this.w, this.h, cols);
    this.gF = buildGrid(this.data, this.w, this.h, cols / Math.max(0.2, 1 - S.areaDetail));
    const x = this.base.getContext('2d');
    x.setTransform(r, 0, 0, r, 0, 0);
    x.fillStyle = S.paper; x.fillRect(0, 0, this.w, this.h);
    x.fillStyle = S.ink; x.font = `${g.fontPx}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let rr = 0; rr < g.rows; rr++) for (let c = 0; c < g.cols; c++)
      x.fillText(pickChar(g, rr * g.cols + c, S.base, cellHash(c, rr)), (c + .5) * g.cellW, g.offY + (rr + .5) * g.cellH);
    this.paint();
  }
  radius() {
    const S = SETTINGS, a = this.lens.amp;
    return this.w * S.areaSize / 2 * lerp(S.areaStartSize, 1, 1 - Math.pow(1 - a, 3));
  }
  paint() {
    if (!this.g) return;
    const S = SETTINGS, L = this.lens, x = this.ctx, r = dpr(), g = this.g, gF = this.gF;
    // copy the default layer pixel for pixel: stretching it by a fraction of a pixel greys the dots
    // and makes the hover circle's edge visible
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(this.base, 0, 0);
    x.setTransform(r, 0, 0, r, 0, 0);
    if (L.amp <= 0.001) return;
    const R = this.radius(), cw = g.cellW, ch = g.cellH;
    const c0 = Math.max(0, Math.floor((L.x - R) / cw)), c1 = Math.min(g.cols - 1, Math.ceil((L.x + R) / cw));
    const r0 = Math.max(0, Math.floor((L.y - R - g.offY) / ch)), r1 = Math.min(g.rows - 1, Math.ceil((L.y + R - g.offY) / ch));
    const buckets = new Map();
    x.fillStyle = S.paper;
    for (let rr = r0; rr <= r1; rr++) for (let c = c0; c <= c1; c++) {
      const cx = (c + .5) * cw, cy = g.offY + (rr + .5) * ch;
      const d = Math.hypot(cx - L.x, cy - L.y);
      if (d >= R) continue;
      const w = L.amp * (1 - smooth(0, R, d));                       // 1 at the centre, 0 at the edge
      if (w < 0.004) continue;
      const i = rr * g.cols + c;
      const fc = Math.min(gF.cols - 1, Math.floor(cx / gF.cellW)), fr = Math.min(gF.rows - 1, Math.max(0, Math.floor((cy - gF.offY) / gF.cellH)));
      const j = fr * gF.cols + fc;
      const l = clamp(0.5 + (lerp(g.Lc[i], gF.Lc[j], w) - 0.5) * (1 + S.areaContrast * w));
      const e = lerp(g.E[i], gF.E[j], w);
      const p = {
        threshold: lerp(S.base.threshold, S.hover.threshold, w),
        edgeWeight: lerp(S.base.edgeWeight, S.hover.edgeWeight, w),
        lumaWeight: lerp(S.base.lumaWeight, S.hover.lumaWeight, w)
      };
      const chr = charFor(l, e, lerp(g.GX[i], gF.GX[j], w), lerp(g.GY[i], gF.GY[j], w), p, cellHash(c, rr));
      x.fillRect(c * cw, g.offY + rr * ch, cw, ch);
      const s = Math.round((1 - S.areaSquash * w) * 40) / 40;         // height of the squashed character
      if (!buckets.has(s)) buckets.set(s, []);
      buckets.get(s).push(chr, cx, g.offY + (rr + 1) * ch - ch * s / 2);
    }
    x.fillStyle = S.ink; x.font = `${g.fontPx}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const [s, list] of buckets) {
      x.setTransform(r, 0, 0, r * s, 0, 0);
      for (let k = 0; k < list.length; k += 3) x.fillText(list[k], list[k + 1], list[k + 2] / s);
    }
    x.setTransform(r, 0, 0, r, 0, 0);
  }
  kick() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(t => this.frame(t));
  }
  frame(now) {
    const S = SETTINGS, L = this.lens, dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const k = 1 - Math.exp(-dt / S.areaLag);
    L.x += (L.tx - L.x) * k; L.y += (L.ty - L.y) * k;
    const rate = dt * 1000 / (L.target > L.amp ? S.hoverInMs : S.hoverOutMs);
    L.amp = L.target > L.amp ? Math.min(L.target, L.amp + rate) : Math.max(L.target, L.amp - rate);
    this.paint();
    const moving = Math.hypot(L.tx - L.x, L.ty - L.y) > 0.2;
    this.raf = (L.amp !== L.target || (moving && L.amp > 0)) ? requestAnimationFrame(t => this.frame(t)) : 0;
  }
}
