// The essay below the hero: ASCII photos, footnotes lined up with their paragraphs, and the text hover.
//   Redaction (.fx-clear)               -> near the cursor each letter steps to a clearer grade (70/50 -> 10)
//   DM Sans + JetBrains Mono (.fx-px)   -> near the cursor each word is redrawn more pixelated
// In the body text and footnotes the effect is a 3-line band: the line under the cursor (strongest) plus
// the line above and below, as wide as the old circle. Headings and the closing quote keep the circle.
// Both trail the mouse like the ASCII image hover.
(() => {
// ---------- SETTINGS (edit these) ----------
const FX = {
  pxRadius: 220,            // design px (1920 wide); half the width of the band (and the quote's circle radius)
  sideLines: 0.55,          // strength of the line above / below the cursor's line (1 = same as the middle)
  clearRadius: 260,         // design px; area where Redaction letters clear up
  // pixel block size as a fraction of the font size, by closeness (closest first).
  // 1/8 of the font = ~70% pixelated (still shapes of words, hard to read); outside the area = clean
  pxLevels: [[0.66, 1 / 8], [0.33, 1 / 12], [0.08, 1 / 16]],
  alphaCut: 110,            // 0-255; how much of a pixel block must be covered to turn on
  lag: 0.12,                // seconds the area trails the mouse (same as the image hover)
  // headings arriving: they come into view clear (Redaction 10), hold, then degrade on their own to 70
  arriveHold: 350,          // ms the heading stays clear
  arriveFade: 800,          // ms to step back down through 20 / 35 / 50 / 70
  arriveSweep: 300,         // ms; letters further right start degrading a little later
  glideMs: 700,             // menu / "Text" link: scroll time to a section
  inMs: 600, outMs: 700,    // area fades in / out
  // ASCII characters across each essay photo (hero card: 170): the narrow photos (#0, #2) and the wide one (#1)
  photoCols: { tall: 120, wide: 150 },
};
// -------------------------------------------
const GRADES = { 70: [70, 50, 35, 20, 10], 50: [50, 35, 20, 10] };
const u = () => innerWidth / 1920;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// the main page's essay, or the About page's content
const essay = document.querySelector('[data-fx-root]');
// phones: one column (footnotes in a sheet); touch screens: no hover, so the effects follow the finger / scroll
const PHONE = matchMedia('(max-width: 600px)'), TOUCH = matchMedia('(hover: none)');

// ---------- 1. ASCII photos (hover only: no flip, no title) ----------
const figs = [...essay.querySelectorAll('.ascii-fig')].map(fig => ({ fig, view: new AsciiView(fig.querySelector('canvas')) }));
// Arriving from the About page (window.SKIP_TO, set in index.html's <head>), only the photo of the section
// you land on is made first, so the page can appear with it; the others follow once the heading has arrived,
// one at a time while the browser is idle (their space is already reserved, so nothing moves).
const SKIP = window.SKIP_TO;
let essayReady;
window.essayReady = new Promise(r => { essayReady = r; });   // the hero waits on this before revealing the page
async function renderFig(f) {
  if (f.started) return;
  f.started = true;
  f.view.setSource(await loadImage(ESSAY_IMAGES[f.fig.dataset.img]));
  sizeFigs();
}
const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 60));
async function loadFigs() {
  const landed = SKIP && document.getElementById(SKIP);
  const first = landed ? figs.filter(f => f.fig.closest('section') === landed.closest('section')) : figs;
  await Promise.all(first.map(renderFig));
  relayout();   // the photos now have their height, so the notes below them can be placed
  essayReady();
  const rest = figs.filter(f => !f.started);
  const next = () => { const f = rest.shift(); if (f) idle(() => renderFig(f).then(next)); };
  if (rest.length) setTimeout(next, SKIP ? 1300 : 0);
}
function sizeFigs() {
  for (const f of figs) {
    if (!f.view.data) continue;
    const w = f.fig.clientWidth;
    if (w && w !== f.view.w) f.view.size(w, f.fig.classList.contains('wide') ? FX.photoCols.wide : FX.photoCols.tall);
  }
}

// ---------- #1's wide photo: the gap under it equals the gap above it, measured ink to edge ----------
// above: from the bottom of the "LOW RESOLUTION" letters to the photo; below: from the photo to the top of
// the first line of text (footnote number and paragraph share that top, see placeNotes)
function matchWideGap() {
  const fig = essay.querySelector('.ascii-fig.wide');
  if (!fig) return;
  if (PHONE.matches) { fig.style.marginBottom = ''; return; }
  const sec = fig.closest('section'), title = sec.querySelector('.sec-title'), para = sec.querySelector('.body p');
  const cs = getComputedStyle(title), lh = parseFloat(cs.lineHeight);
  inkCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = inkCtx.measureText(title.textContent.toUpperCase());
  const r = title.getBoundingClientRect();
  const baseline = r.bottom - lh + (lh - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent;
  const above = fig.getBoundingClientRect().top - (baseline + m.actualBoundingBoxDescent);
  // + 1: the letters' anti-aliased bottom edge reads one pixel lower than the font metrics say
  fig.style.marginBottom = Math.max(0, above - inkTop(para, para.textContent.trim().split(/\s+/)[0]) + 1) + 'px';
}

// ---------- 2. footnotes: each starts level with the paragraph that cites it ----------
// where the ink of `text` starts below the top of its first line box (CSS centres the font's ascent +
// descent in the line height; the glyphs' own tops sit below the font's ascent)
const inkCtx = document.createElement('canvas').getContext('2d');
function inkTop(el, text) {
  const cs = getComputedStyle(el);
  inkCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = inkCtx.measureText(text), lh = parseFloat(cs.lineHeight);
  return (lh - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent;
}
function placeNotes() {
  if (PHONE.matches) {   // one column: the notes live in the bottom sheet, not beside the text
    essay.querySelectorAll('.side').forEach(s => { s.style.minHeight = ''; s.querySelectorAll('.note').forEach(n => { n.style.top = ''; }); });
    return;
  }
  for (const side of essay.querySelectorAll('.side')) {
    const notes = [...side.querySelectorAll('.note')];
    if (!notes.length) continue;
    const top0 = side.getBoundingClientRect().top;
    // anything above the notes in the same column (photo, asterisks) — notes never overlap it
    let floor = 0;
    for (const el of side.children) if (!el.classList.contains('note')) floor = Math.max(floor, el.getBoundingClientRect().bottom - top0);
    const gap = Math.max(16, 40 * u());
    let prev = floor ? floor + gap : 0, bottom = 0;
    for (const n of notes) {
      const ref = essay.querySelector(`.ref[data-ref="${n.dataset.ref}"]`);
      const para = ref && ref.closest('p');
      // line the visible tops up, not the boxes: the mono "[2]" brackets reach higher than a DM Sans
      // capital, so the note moves down by the difference between where each one's ink starts
      const nudge = para ? inkTop(para, para.textContent.trim().split(/\s+/)[0]) - inkTop(n.querySelector('.note-num'), n.querySelector('.note-num').textContent) : 0;
      const want = para ? para.getBoundingClientRect().top - top0 + nudge : prev;
      const top = Math.max(want, prev);
      n.style.top = top + 'px';
      prev = top + n.offsetHeight + gap; bottom = top + n.offsetHeight;
    }
    side.style.minHeight = Math.max(bottom, floor) + 'px';
  }
}

// ---------- 3. text hover ----------
// split the text into hover units: letters for Redaction, words for everything else
const clearChars = [], words = [];
function splitClear(el) {
  const from = el.dataset.from || '70';
  const walk = node => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 3) {
        // the grades differ in width by ~1%, so every letter is locked to its normal width (fixClear);
        // letters of one word sit in a no-wrap group so the word can't break between them
        const frag = document.createDocumentFragment();
        for (const tok of ch.textContent.split(/(\s+)/)) {
          if (!tok) continue;
          if (/^\s+$/.test(tok)) { frag.append(tok); continue; }
          const word = document.createElement('span'); word.className = 'fx-word';
          for (const c of tok) {
            const s = document.createElement('span'); s.className = 'fx-ch'; s.textContent = c; word.append(s);
            clearChars.push({ el: s, grades: GRADES[from], step: 0 });
          }
          frag.append(word);
        }
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) walk(ch);
    }
  };
  walk(el);
}
function splitWords(el) {
  for (const ch of [...el.childNodes]) {
    if (ch.nodeType === 1) { if (!ch.classList.contains('fx-clear')) splitWords(ch); continue; }
    if (ch.nodeType !== 3) continue;
    const frag = document.createDocumentFragment();
    // words, with long hyphenated words split after the dash so each piece sits on one line
    for (const tok of ch.textContent.split(/(\s+)/)) {
      if (!tok) continue;
      if (/^\s+$/.test(tok)) { frag.append(tok); continue; }
      for (const piece of tok.split(/(?<=[-–—])(?=.)/)) {
        const s = document.createElement('span'); s.textContent = piece; frag.append(s);
        words.push({ el: s, level: -1 });
      }
    }
    ch.replaceWith(frag);
  }
}
essay.querySelectorAll('.fx-clear').forEach(splitClear);
essay.querySelectorAll('.fx-px').forEach(splitWords);

// lock each Redaction letter to its width in its normal grade (in em, so it scales with the text)
function fixClear() {
  for (const c of clearChars) { c.el.style.width = ''; c.el.style.fontFamily = ''; c.step = 0; }
  const ws = clearChars.map(c => c.el.getBoundingClientRect().width / parseFloat(getComputedStyle(c.el).fontSize));
  clearChars.forEach((c, i) => { c.el.style.width = ws[i] + 'em'; });
}

// positions are kept in page coordinates and refreshed whenever the layout can change
const mctx = document.createElement('canvas').getContext('2d');
const blocks = new Map();
const BAND = '.body, .note, .colo-row';     // text blocks that use the 3-line band
function measure() {
  const sx = scrollX, sy = scrollY;
  // text blocks that use the 3-line band: each paragraph column and each footnote
  blocks.clear();
  for (const b of essay.querySelectorAll(BAND)) {
    const r = b.getBoundingClientRect();
    blocks.set(b, { x0: r.left + sx, x1: r.right + sx, y0: r.top + sy, y1: r.bottom + sy, lh: parseFloat(getComputedStyle(b).lineHeight) || 30 });
  }
  for (const c of clearChars) {
    const r = c.el.getBoundingClientRect();
    c.x = r.left + sx + r.width / 2; c.y = r.top + sy + r.height / 2;
    c.block = c.el.closest(BAND); c.lh = parseFloat(getComputedStyle(c.el).lineHeight) || 30;
  }
  const fonts = new Map();
  for (const w of words) {
    const r = w.el.getBoundingClientRect();
    w.x = r.left + sx; w.y = r.top + sy; w.w = r.width; w.h = r.height;
    w.cx = w.x + w.w / 2; w.cy = w.y + w.h / 2;
    const p = w.el.parentElement;
    if (!fonts.has(p)) {
      const cs = getComputedStyle(p);
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      mctx.font = font;
      const m = mctx.measureText('Hg');
      fonts.set(p, { font, size: parseFloat(cs.fontSize), family: cs.fontFamily, style: cs.fontStyle, weight: cs.fontWeight, ascent: m.fontBoundingBoxAscent, color: cs.color, lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 });
    }
    w.f = fonts.get(p);
    w.block = w.el.closest(BAND);
  }
}

// The pixelated / decoding copy of a word is a small canvas attached INSIDE that word, so the browser
// scrolls it together with the text (a separate screen-fixed layer lagged a frame behind when scrolling).
let dprL = Math.max(1, devicePixelRatio || 1);
function overlay(el) {
  if (!el.ov) {
    el.ov = document.createElement('canvas'); el.ov.className = 'fx-ov'; el.ov.setAttribute('aria-hidden', 'true');
    el.classList.add('fx-host'); el.appendChild(el.ov);
  }
  el.ov.style.display = '';
  return el.ov;
}
function hideOverlay(el) { if (el.ov) el.ov.style.display = 'none'; }

// a word drawn small and blown back up with hard pixel edges; cached per word, font and block size
const cache = new Map();
function pixelWord(w, block) {
  const key = w.f.font + '|' + block + '|' + w.el.textContent;
  let c = cache.get(key);
  if (c) return c;
  const k = dprL / block;                                    // low-res pixels per css px
  const lw = Math.ceil(w.w * k) + 2, lh = Math.ceil(w.h * k) + 2;
  c = document.createElement('canvas'); c.width = lw; c.height = lh;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.font = `${w.f.style} ${w.f.weight} ${w.f.size * k}px ${w.f.family}`;
  x.textBaseline = 'alphabetic'; x.fillStyle = '#000';
  x.fillText(w.el.textContent, 1, 1 + w.f.ascent * k);
  const img = x.getImageData(0, 0, lw, lh), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const on = d[i + 3] > FX.alphaCut; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = on ? 255 : 0; }
  x.putImageData(img, 0, 0);
  if (cache.size > 4000) cache.clear();
  cache.set(key, c);
  return c;
}

// the area that follows the mouse
const L = { x: 0, y: 0, tx: 0, ty: 0, amp: 0, target: 0 };
let raf = 0, last = 0, dirty = true;
// mouse: the area follows the cursor. Touch: it follows the finger while it's down (so holding a heading
// clears it up); body text instead pixelates near the bottom edge and sharpens as it scrolls up into view.
const follow = e => {
  L.tx = e.clientX; L.ty = e.clientY;
  if (L.amp < 0.01) { L.x = L.tx; L.y = L.ty; }
  L.target = 1; kick();
};
addEventListener('pointermove', e => { if (e.pointerType !== 'touch' || e.buttons || e.pressure) follow(e); }, { passive: true });
addEventListener('pointerdown', e => { if (e.pointerType === 'touch') follow(e); }, { passive: true });
['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => { if (e.pointerType === 'touch') { L.target = 0; kick(); } }, { passive: true }));
document.documentElement.addEventListener('mouseleave', () => { L.target = 0; kick(); });
addEventListener('blur', () => { L.target = 0; kick(); });
addEventListener('scroll', () => { if (L.amp > 0 || TOUCH.matches) kick(); }, { passive: true });
function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const k = 1 - Math.exp(-dt / FX.lag);
  L.x += (L.tx - L.x) * k; L.y += (L.ty - L.y) * k;
  const rate = dt * 1000 / (L.target > L.amp ? FX.inMs : FX.outMs);
  L.amp = L.target > L.amp ? Math.min(L.target, L.amp + rate) : Math.max(L.target, L.amp - rate);
  if (dirty) { measure(); dirty = false; }
  draw();
  const moving = Math.hypot(L.tx - L.x, L.ty - L.y) > 0.2;
  raf = (L.amp !== L.target || (moving && L.amp > 0) || arriving.size) ? requestAnimationFrame(frame) : 0;
}

function draw() {
  const px = L.x + scrollX, py = L.y + scrollY, s = u();
  const Rp = Math.max(120, FX.pxRadius * s), Rc = Math.max(140, FX.clearRadius * s);
  // the band: which paragraph column / footnote the cursor is in, and the centre of the line it's on
  let active = null, lineY = 0;
  if (L.amp > 0) for (const [b, r] of blocks) {
    if (px >= r.x0 && px <= r.x1 && py >= r.y0 - r.lh / 2 && py <= r.y1 + r.lh / 2) { active = b; break; }
  }
  if (active) {
    let best = Infinity;
    for (const w of words) if (w.block === active) { const d = Math.abs(w.cy - py); if (d < best) { best = d; lineY = w.cy; } }
  }
  // strength 0..1 of a unit: band (3 lines, as wide as the circle) inside paragraphs, circle elsewhere
  const strength = (block, x, y, halfW, lh, R) => {
    if (!block) { const d = Math.hypot(x - px, y - py); return d < R + halfW ? L.amp * (1 - smooth(0, R, Math.max(0, d - halfW / 2))) : 0; }
    if (block !== active) return 0;
    const line = Math.round((y - lineY) / lh);
    if (Math.abs(line) > 1) return 0;
    const dx = Math.abs(x - px);
    if (dx > Rp + halfW) return 0;
    return L.amp * (1 - smooth(0, Rp, Math.max(0, dx - halfW / 2))) * (line ? FX.sideLines : 1);
  };
  // Redaction letters: clearer grade the stronger the effect (cursor, or a heading that has just arrived)
  const now = performance.now();
  for (const c of clearChars) {
    let w = strength(c.block, c.x, c.y, 0, c.lh, Rc);
    if (c.arr) {
      const e = now - c.arr.t0, a = e < FX.arriveHold ? 1 : 1 - (e - FX.arriveHold) / FX.arriveFade;
      if (a <= 0) { c.arr = null; arriving.delete(c); } else w = Math.max(w, Math.min(1, a));
    }
    const n = c.grades.length;
    const step = Math.min(n - 1, Math.floor(w * n));
    if (step !== c.step) { c.step = step; c.el.style.fontFamily = step ? `'Redaction ${c.grades[step]}'` : ''; }
  }
  // words: bigger pixel blocks the stronger the effect
  const top = scrollY, bot = scrollY + innerHeight;
  for (const w of words) {
    let level = -1;
    if (w.y + w.h > top && w.y < bot) {
      // touch: lines low on the screen are pixelated and sharpen as they rise into the reading area
      const v = TOUCH.matches ? (w.block ? smooth(innerHeight * 0.8, innerHeight * 0.97, w.cy - scrollY) : 0)
                              : (L.amp > 0 ? strength(w.block, w.cx, w.cy, w.w / 2, w.f.lh, Rp) : 0);
      if (v > 0) level = FX.pxLevels.findIndex(([t]) => v >= t);
    }
    if (level !== w.level) { w.el.classList.toggle('px-hide', level >= 0); w.level = level; w.drawn = 0; if (level < 0) hideOverlay(w.el); }
    if (level < 0) continue;
    const block = Math.max(1, Math.round(w.f.size * FX.pxLevels[level][1] * dprL));
    if (w.drawn === block) continue;                        // already showing this level
    const bmp = pixelWord(w, block), cv = overlay(w.el);
    cv.width = bmp.width; cv.height = bmp.height;
    cv.getContext('2d').drawImage(bmp, 0, 0);
    // blown up with hard edges (image-rendering: pixelated), lined up with the screen's pixel grid
    const k = block / dprL, fx = ((w.x * dprL) % 1) / dprL, fy = ((w.y * dprL) % 1) / dprL;
    Object.assign(cv.style, { left: -k - fx + 'px', top: -k - fy + 'px', width: bmp.width * k + 'px', height: bmp.height * k + 'px' });
    w.drawn = block;
  }
}

// ---------- headings arrive clear, then degrade ----------
// Every time a section heading (or the About title) comes into view, its letters show at the clearest grade
// (Redaction 10), hold, then step back down to their normal grade (70, or 50 for "#0") in a quick
// left-to-right sweep. The cursor can still clear them up afterwards.
const HEADS = '.sec-head, .about-title';
const arriving = new Set();
const headChars = new Map();
for (const c of clearChars) { const h = c.el.closest(HEADS); if (h) { if (!headChars.has(h)) headChars.set(h, []); headChars.get(h).push(c); } }
function arrive(head) {
  const now = performance.now(), hr = head.getBoundingClientRect();
  for (const c of headChars.get(head) || []) {
    const cr = c.el.getBoundingClientRect();
    c.arr = { t0: now + clamp((cr.left - hr.left) / Math.max(1, hr.width)) * FX.arriveSweep };
    arriving.add(c);
  }
  if (dirty) { measure(); dirty = false; }
  draw();                                   // already clear in the very first frame it's seen
  kick();
}
// while the page is still hidden (arriving from the About page) headings wait here, and all start together
// at the moment the page appears (window.releaseArrival, called by flow.js)
let arrivalQueue = SKIP ? [] : null;
window.releaseArrival = () => { const q = arrivalQueue; arrivalQueue = null; if (q) q.forEach(arrive); };
if (window.IntersectionObserver) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      if (arrivalQueue) { if (!arrivalQueue.includes(e.target)) arrivalQueue.push(e.target); continue; }
      arrive(e.target);
    }
  }, { rootMargin: '40px 0px 40px 0px' });
  headChars.forEach((_, h) => io.observe(h));
}

// ---------- "Text" menu: glide to a section ----------
let glideRaf = 0;
function glideTo(y) {
  cancelAnimationFrame(glideRaf);
  const y0 = scrollY, dy = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight)) - y0, t0 = performance.now();
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = now => {
    const t = Math.min(1, (now - t0) / FX.glideMs);
    scrollTo(0, y0 + dy * ease(t));
    if (t < 1) glideRaf = requestAnimationFrame(step);
  };
  glideRaf = requestAnimationFrame(step);
}
// a wheel or touch stops the glide so it never fights the reader
['wheel', 'touchstart', 'keydown'].forEach(t => addEventListener(t, () => cancelAnimationFrame(glideRaf), { passive: true }));
function goSection(id) {
  if (document.documentElement.classList.contains('locked')) return;     // camera screen: nothing to scroll to yet
  const head = document.getElementById(id), header = document.getElementById('siteHeader');
  glideTo(head.getBoundingClientRect().top + scrollY - header.offsetHeight * 0.85);
}
// "Text" itself only opens this menu. On the main page the items glide; on the About page they open the
// main page at that section (index.html?go=…)
document.querySelectorAll('.nav-menu a').forEach(a => a.addEventListener('click', e => {
  if (!document.getElementById(a.dataset.go)) return;
  e.preventDefault(); a.blur(); goSection(a.dataset.go);
}));

// ---------- layout changes ----------
function relayout() {
  fixClear(); sizeFigs(); matchWideGap(); placeNotes();
  dprL = Math.max(1, devicePixelRatio || 1);
  dirty = true; cache.clear(); words.forEach(w => { w.drawn = 0; });
  if (L.amp > 0 || TOUCH.matches) kick();
}
let rt = 0;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(relayout, 120); });
// load every Redaction grade up front so the first hover never flashes a fallback font
const preload = [];
for (const g of [10, 20, 35, 50, 70]) for (const v of ['400', 'italic 400', '700']) if (!(g === 70 && v === '700')) preload.push(document.fonts.load(`${v} 32px 'Redaction ${g}'`));
preload.push(document.fonts.load("400 32px 'DM Sans'"), document.fonts.load("italic 400 32px 'DM Sans'"), document.fonts.load("700 32px 'JetBrains Mono'"));
Promise.all(preload).then(() => document.fonts.ready).then(() => { relayout(); loadFigs(); });
// a late font (or one of its character subsets) can rewrap the text: measure again when it arrives
document.fonts.addEventListener('loadingdone', () => { clearTimeout(rt); rt = setTimeout(relayout, 60); });
if (window.ResizeObserver) new ResizeObserver(() => { dirty = true; }).observe(essay);
// ---------- phone: Index menu, the section you're in, footnote sheet ----------
const indexBtn = document.getElementById('indexBtn'), indexMenu = document.getElementById('indexMenu');
function setMenu(open) {
  if (!indexMenu) return;
  indexMenu.hidden = !open; indexBtn.textContent = open ? 'Close' : 'Index'; indexBtn.setAttribute('aria-expanded', open);
  document.documentElement.classList.toggle('menu-open', open);
}
if (indexBtn) indexBtn.addEventListener('click', () => setMenu(indexMenu.hidden));
if (indexMenu) indexMenu.querySelectorAll('a[data-go]').forEach(a => a.addEventListener('click', e => {
  if (!document.getElementById(a.dataset.go)) { setMenu(false); return; }     // About page: open the main page there
  e.preventDefault(); setMenu(false); goSection(a.dataset.go);
}));
addEventListener('keydown', e => { if (e.key === 'Escape') { setMenu(false); closeSheet(); } });
// the label in the middle of the header: the section whose heading has passed the top third of the screen
const curSection = document.getElementById('curSection');
const secHeads = [['h0', '#0 Introduction'], ['h1', '#1 Low Resolution'], ['h2', '#2 Resurrection']].map(([id, label]) => [document.getElementById(id), label]).filter(([h]) => h);
function updateSection() {
  if (!curSection || !secHeads.length) return;
  let label = '';
  for (const [h, l] of secHeads) if (h.getBoundingClientRect().top < innerHeight * 0.35) label = l;
  if (curSection.textContent !== label) curSection.textContent = label;
  if (indexMenu) indexMenu.querySelectorAll('a[data-go]').forEach(a => {
    if (secHeads.some(([h, l]) => l === label && h.id === a.dataset.go)) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
  });
}
addEventListener('scroll', updateSection, { passive: true }); updateSection();
// footnotes on a phone: tapping [1] turns the screen black with the paragraph that cites it (dimmed) and the
// note below it; Close (or Esc) goes back to the text exactly where you were
const noteScreen = document.createElement('div');
noteScreen.className = 'note-screen'; noteScreen.hidden = true;
noteScreen.setAttribute('role', 'dialog'); noteScreen.setAttribute('aria-modal', 'true');
noteScreen.innerHTML = '<button type="button" class="ns-close">Close ×</button><p class="ns-para"></p><p class="ns-num"></p><p class="ns-text"></p>';
document.body.append(noteScreen);
function openSheet(n, viaKeyboard) {
  const note = document.getElementById('fn' + n), ref = essay.querySelector(`.ref[data-ref="${n}"]`);
  if (!note || !ref) return;
  // a clean copy of the paragraph: no hover canvases, no hidden or half-cleared letters
  const para = ref.closest('p').cloneNode(true);
  para.querySelectorAll('.fx-ov').forEach(c => c.remove());
  para.querySelectorAll('.px-hide').forEach(e => e.classList.remove('px-hide'));
  para.querySelectorAll('.fx-ch').forEach(e => { e.style.fontFamily = ''; });
  para.querySelectorAll('.ref').forEach(r => { r.removeAttribute('href'); r.classList.toggle('on', r.dataset.ref === String(n)); });
  noteScreen.querySelector('.ns-para').innerHTML = para.innerHTML;
  noteScreen.querySelector('.ns-num').textContent = '[' + n + ']';
  noteScreen.querySelector('.ns-text').innerHTML = note.querySelector('.note-text').innerHTML;
  noteScreen.hidden = false; noteScreen.scrollTop = 0;
  document.documentElement.classList.add('note-open');
  if (viaKeyboard) noteScreen.querySelector('.ns-close').focus({ preventScroll: true });   // a ring only for keyboard users
}
function closeSheet() { noteScreen.hidden = true; document.documentElement.classList.remove('note-open'); }
noteScreen.querySelector('.ns-close').addEventListener('click', closeSheet);
essay.querySelectorAll('.ref').forEach(r => r.addEventListener('click', e => { if (PHONE.matches) { e.preventDefault(); openSheet(r.dataset.ref, e.detail === 0); } }));
PHONE.addEventListener('change', () => { closeSheet(); setMenu(false); relayout(); });

// test hook: draw one frame with the area fully on at a screen point (used for checking screenshots)
window.__essayFx = { words, at(x, y) { L.x = L.tx = x; L.y = L.ty = y; L.amp = L.target = 1; if (dirty) { measure(); dirty = false; } draw(); } };
})();
