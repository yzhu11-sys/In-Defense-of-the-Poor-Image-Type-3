// The hero flow: pick an image (camera / upload / generate) -> flash -> card flies in -> flips to ASCII
// -> scroll: ASCII cells fly into the pixel title -> the credit line fades in.
const TITLE_W = 898, TITLE_H = 694, TITLE_PITCH = 14.2683;

// ---------- title targets: every cell of the title's pixel grid that has any ink ----------
// Each flying square is a piece of the real title (its cell), so when they have all landed the
// squares are pixel-for-pixel the title — no hand-off, no fade.
let titleCells = null, titleImg = null;
async function prepareTitle() {
  const svgText = document.querySelector('#title svg').outerHTML;
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  titleImg = await loadImage(url);
  const step = TITLE_PITCH / 2;
  const cols = Math.ceil(TITLE_W / step), rows = Math.ceil(TITLE_H / step);
  const c = document.createElement('canvas'); c.width = TITLE_W; c.height = TITLE_H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(titleImg, 0, 0, TITLE_W, TITLE_H);
  const a = x.getImageData(0, 0, TITLE_W, TITLE_H).data;
  titleCells = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    // a 1 px margin + any trace of ink, so even the faintest anti-aliased edge belongs to a cell
    const x0 = Math.max(0, Math.floor(q * step) - 1), x1 = Math.min(TITLE_W, Math.ceil((q + 1) * step) + 1);
    const y0 = Math.max(0, Math.floor(r * step) - 1), y1 = Math.min(TITLE_H, Math.ceil((r + 1) * step) + 1);
    let ink = false;
    for (let yy = y0; yy < y1 && !ink; yy++) for (let xx = x0; xx < x1; xx++) if (a[(yy * TITLE_W + xx) * 4 + 3] > 0) { ink = true; break; }
    if (ink) titleCells.push({ q, r, x: q * step, y: r * step });
  }
}
// the title drawn once at full screen resolution, lined up with the device pixels
const hiDpr = () => Math.max(1, window.devicePixelRatio || 1);
let titleRaster = null;   // { canvas, ox, oy (device px), scale (device px per title unit) }
function rasterTitle(left, top, width) {
  const R = hiDpr();
  const ox = Math.round(left * R), oy = Math.round(top * R), scale = width * R / TITLE_W;
  const c = document.createElement('canvas');
  c.width = Math.ceil(TITLE_W * scale) + 1; c.height = Math.ceil(TITLE_H * scale) + 1;
  c.getContext('2d').drawImage(titleImg, 0, 0, TITLE_W * scale, TITLE_H * scale);
  titleRaster = { canvas: c, ox, oy, scale };
}
// a title cell in device pixels: shared rounding so neighbouring cells meet with no gaps
function cellRect(t) {
  const { ox, oy, scale } = titleRaster, s = (TITLE_PITCH / 2) * scale;
  const x0 = Math.round(ox + t.q * s), x1 = Math.round(ox + (t.q + 1) * s);
  const y0 = Math.round(oy + t.r * s), y1 = Math.round(oy + (t.r + 1) * s);
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

// ---------- elements ----------
const $ = id => document.getElementById(id);
const stage = $('stage'), cardWrap = $('cardWrap'), card = $('card'), hint = $('hint'), flow = $('flow');
const morph = $('morph'), mctx = morph.getContext('2d'), morphHi = $('morphHi'), hctx = morphHi.getContext('2d'), titleEl = $('title'), titleBlock = $('titleBlock');
const creditSpans = [...document.querySelectorAll('#credit span')];
const cardView = new AsciiView($('cardCanvas'));
let currentSource = null, particles = null, flipped = false, starting = false;
let cropMode = false, usedAspect = 0, baseAspect = 0;   // baseAspect: shape the size rule uses (the webcam's own shape for photos)

// the hero's height: the stage's own CSS height (100svh — the screen with the browser bars showing), so
// it stays the same while a phone browser's bars slide in and out
const stageH = () => stage.clientHeight || innerHeight;
// the space below the header that the card and the title are centred in
function cardArea() {
  const top = $('wordmark').getBoundingClientRect().bottom + 28;
  return { top, areaH: stageH() - 44 - top };
}
const srcDims = s => [s.naturalWidth || s.videoWidth || s.width, s.naturalHeight || s.videoHeight || s.height];
// card size for a picture of this shape. crop = true (default image, camera): keep the width and
// trim the height so there is a margin above and below. crop = false (uploads): keep the picture's
// shape and only scale it down to fit with the same margins.
function cardBox(aspect, crop) {
  const { areaH } = cardArea();
  const maxH = areaH - 2 * Math.max(28, areaH * 0.07);
  const maxW = innerWidth <= 600 ? innerWidth - 48 : Math.min(innerWidth * 0.78, 1200);   // phone: full width less margins
  if (crop) {
    const w = Math.min(maxW, (areaH - 10) * aspect);
    return { w, h: Math.min(w / aspect, maxH) };
  }
  const w = Math.min(maxW, maxH * aspect);
  return { w, h: w / aspect };
}
// the middle band of a picture with the given (wider) shape: equal strips trimmed off top and bottom
function cropTo(source, aspect) {
  const [sw, sh] = srcDims(source);
  if (aspect <= sw / sh + 1e-3) return source;
  const ch = Math.round(sw / aspect);
  const c = document.createElement('canvas'); c.width = sw; c.height = ch;
  c.getContext('2d').drawImage(source, 0, (sh - ch) / 2, sw, ch, 0, 0, sw, ch);
  return c;
}

function layout() {
  const vw = innerWidth, vh = stageH();
  const { top, areaH } = cardArea();
  if (currentSource) {
    const [sw, sh] = srcDims(currentSource);
    const box = cardBox(baseAspect || sw / sh, cropMode), a = box.w / box.h;
    if (Math.abs(a - usedAspect) > 0.002) { cardView.setSource(cropMode ? cropTo(currentSource, a) : currentSource); usedAspect = a; }
    const w = box.w, h = w / cardView.data.aspect;
    Object.assign(cardWrap.style, { width: w + 'px', height: h + 'px', left: (vw - w) / 2 + 'px', top: top + (areaH - h) / 2 + 'px' });
    cardView.size(w);
    // "hover the image · scroll" sits just under the card, never on it (and above the bottom fade)
    const fadeH = document.querySelector('.bottom-fade').offsetHeight, hh = hint.offsetHeight || 17;
    hint.style.top = Math.min(top + (areaH - h) / 2 + h + 12, vh - fadeH - hh - 4) + 'px';
  }
  if ($('cam').style.display === 'flex') sizeCamFrame();
  const credit = $('credit'), creditH = credit.offsetHeight + parseFloat(getComputedStyle(credit).marginTop);
  const tw = Math.max(260, Math.min(vw - 32, vw <= 600 ? vw - 48 : vw * 898 / 1920, (areaH - creditH - 10) * TITLE_W / TITLE_H));
  const bh = tw * TITLE_H / TITLE_W + creditH;
  // snapped to device pixels so the title drawn on the canvas lines up exactly
  const R = hiDpr(), tl = Math.round((vw - tw) / 2 * R) / R, tt = Math.round((top + (areaH - bh) / 2) * R) / R;
  Object.assign(titleBlock.style, { width: tw + 'px', left: tl + 'px', top: tt + 'px' });
  if (titleImg) rasterTitle(tl, tt, tw);
  morph.width = Math.round(vw * dpr()); morph.height = Math.round(vh * dpr());
  morphHi.width = Math.round(vw * R); morphHi.height = Math.round(vh * R);
  // exact CSS size = the size they're drawn at, so they can never be stretched (e.g. the title elongating
  // when a phone browser's bottom bar slides in and the window height changes)
  for (const c of [morph, morphHi]) Object.assign(c.style, { width: vw + 'px', height: vh + 'px' });
  particles = null;
  onScroll();
}

// ---------- the card: fly in, then flip ----------
// The image arrives character by character: every tiny character of the ASCII image appears on its own, at
// its own random moment — a sparse scatter first, then faster and faster until the image is whole.
const REVEAL = { ms: 1500, startDelay: 200, curve: 0.6 };    // curve < 1: few early, most towards the end
const reveal = document.createElement('canvas');
reveal.className = 'reveal'; reveal.setAttribute('aria-hidden', 'true');
cardWrap.appendChild(reveal);
function revealIn() {
  const g = cardView.g, d = Math.max(1, devicePixelRatio || 1);
  reveal.width = Math.round(cardView.w * d); reveal.height = Math.round(cardView.h * d);
  const x = reveal.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, reveal.width, reveal.height);
  reveal.style.display = 'block';
  const n = g.cols * g.rows, at = new Float32Array(n);
  for (let i = 0; i < n; i++) at[i] = REVEAL.ms * Math.pow(Math.random(), REVEAL.curve);
  const order = [...Array(n).keys()].sort((a, b) => at[a] - at[b]);
  const cw = g.cellW * d, ch = g.cellH * d, oy = g.offY * d;
  return new Promise(done => {
    const t0 = performance.now() + REVEAL.startDelay;
    let k = 0;
    const step = now => {
      const e = now - t0;
      while (k < n && at[order[k]] <= e) {
        const i = order[k++], c = i % g.cols, r = Math.floor(i / g.cols);
        const x0 = Math.floor(c * cw), y0 = Math.floor(oy + r * ch);
        x.clearRect(x0, y0, Math.ceil((c + 1) * cw) - x0, Math.ceil(oy + (r + 1) * ch) - y0);
      }
      if (k >= n) { reveal.style.display = 'none'; done(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

async function startCard(source, crop, base = 0) {
  currentSource = source; cropMode = crop; usedAspect = 0; baseAspect = base;
  cardView.setEnabled(false);
  cardWrap.style.display = 'block';
  card.getAnimations().forEach(a => a.cancel());
  card.style.transform = 'rotateY(180deg)';          // the ASCII side faces the viewer from the start
  flipped = false;
  hint.style.opacity = 0;
  layout();
  await revealIn();
  flipped = true;
  cardView.setEnabled(true);
  particles = null;
  onScroll();
}

// the 3D camera's flash fires and the whole screen flashes white
function flash() {
  dispatchEvent(new Event('camera:shoot'));
  // the white layer only exists during the flash: Safari copies the colour of anything at the screen's bottom
  // edge into its toolbar, and an always-present (invisible) white layer sometimes left that bar white
  setTimeout(() => {
    const f = $('flash'); f.style.display = 'block';
    f.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' }).onfinish = () => { f.style.display = ''; };
  }, 90);
}

// a button was picked: flash, the camera + buttons disappear under the flash, the image arrives character by character
// in the same spot. They never come back; scrolling unlocks once the card has flipped.
async function useImage(source, crop, base = 0) {
  if (starting) return;
  starting = true;
  flash();
  await new Promise(r => setTimeout(r, 200));   // the screen is white by now
  $('intro').classList.add('gone');
  document.documentElement.classList.remove('cam-screen');   // Text / About appear
  setHeaderState();                              // header switches to state A under the flash
  await startCard(source, crop, base);
  document.documentElement.classList.remove('locked');
  starting = false;
}

// ---------- reset (click the title in the header): fade to black, everything back to the camera ----------
async function resetSite() {
  if (starting) return;
  starting = true;
  const veil = $('veil');
  await veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-in', fill: 'forwards' }).finished;
  closeCamera();
  scrollPage(0);
  document.documentElement.classList.add('locked', 'cam-screen');
  card.getAnimations().forEach(a => a.cancel());
  cardWrap.style.display = 'none'; cardWrap.style.visibility = 'visible';
  cardView.setEnabled(false);
  currentSource = null; flipped = false; particles = null;
  drawMorph(0); titleEl.style.opacity = 0; setCredit(0); hint.style.opacity = 0;
  $('intro').classList.remove('gone');
  setHeaderState();
  dispatchEvent(new Event('camera:reset'));
  await veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-out', fill: 'forwards' }).finished;
  starting = false;
}
$('wordmark').addEventListener('click', e => { e.preventDefault(); resetSite(); });
$('marksReset').addEventListener('click', e => { e.preventDefault(); resetSite(); });
$('marksPhone').addEventListener('click', e => { e.preventDefault(); resetSite(); });   // phone header: the marks start over
// touch screens have no hover: the hint says so
if (matchMedia('(hover: none)').matches) hint.textContent = 'touch the image · scroll ↓';

// header: state B (wordmark + three centred marks) on the camera screen; state A (marks on the left,
// no wordmark — the big title is the title) from the flash on; state B again once the big title has
// scrolled completely off
const header = $('siteHeader');
function setHeaderState() {
  const onCamera = !$('intro').classList.contains('gone');
  const gone = flipped && titleBlock.getBoundingClientRect().bottom < $('wordmark').getBoundingClientRect().bottom + 8;
  header.classList.toggle('state-b', onCamera || gone);
  header.classList.toggle('state-a', !(onCamera || gone));
}

// ---------- scroll: ASCII cells fly into the title, then the credit fades in ----------
function buildParticles() {
  const g = computeCells(cardView.data, cardView.w, cardView.h, SETTINGS.base);
  const sr = stage.getBoundingClientRect(), cr = cardWrap.getBoundingClientRect(), R = hiDpr();
  // each target is a title cell; its centre (stage px) comes from its exact device-pixel rectangle
  const targets = titleCells.map(t => { const c = cellRect(t); return { x: (c.x0 + c.w / 2) / R, y: (c.y0 + c.h / 2) / R, cell: c }; });
  const src = g.cells.map(c => ({ x: cr.left - sr.left + c.x, y: cr.top - sr.top + c.y, ch: c.ch, s: c.s }));
  const ranked = src.map((c, i) => ({ c, i })).sort((a, b) => b.c.s - a.c.s);
  const moving = new Set(), movers = [];
  for (let k = 0; k < targets.length; k++) {
    const pick = ranked[k % ranked.length];
    movers.push({ ...pick.c });
    moving.add(pick.i);
  }
  movers.sort((a, b) => a.x - b.x || a.y - b.y);
  targets.sort((a, b) => a.x - b.x || a.y - b.y);
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const list = movers.map((m, k) => ({ sx: m.x, sy: m.y, tx: targets[k].x, ty: targets[k].y, cell: targets[k].cell, ch: m.ch, d: rand() * 0.35 }));
  const still = src.filter((_, i) => !moving.has(i));
  particles = { list, still, fontPx: g.fontPx };
}

// characters fly on the soft layer (same look as the ASCII card); the squares are pieces of the
// title drawn on the sharp layer. When every square has landed (t = 1) the sharp layer simply shows
// the whole title, which is identical to the landed squares, so there is no visible hand-off.
function drawMorph(t) {
  const x = mctx, r = dpr(), h = hctx, R = hiDpr();
  x.setTransform(r, 0, 0, r, 0, 0);
  x.clearRect(0, 0, innerWidth, innerHeight);
  h.setTransform(1, 0, 0, 1, 0, 0);
  h.clearRect(0, 0, morphHi.width, morphHi.height);
  if (t <= 0 || !particles || !titleRaster) return;
  const raster = titleRaster.canvas, ox = titleRaster.ox, oy = titleRaster.oy;
  if (t >= 1) { h.drawImage(raster, ox, oy); return; }
  x.fillStyle = SETTINGS.ink;
  x.font = `${particles.fontPx}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fadeStill = 1 - smooth(0, 0.35, t);
  if (fadeStill > 0) {
    x.globalAlpha = fadeStill;
    for (const p of particles.still) x.fillText(p.ch, p.x, p.y);
  }
  for (const p of particles.list) {
    const u = easeInOut(clamp((t - p.d) / 0.65));
    const px = lerp(p.sx, p.tx, u), py = lerp(p.sy, p.ty, u);
    const sq = smooth(0.55, 1, u), c = p.cell;
    if (sq < 1) { x.globalAlpha = 1 - sq; x.fillText(p.ch, px, py); }
    if (sq > 0) {
      h.globalAlpha = sq;
      if (u >= 1) h.drawImage(raster, c.x0 - ox, c.y0 - oy, c.w, c.h, c.x0, c.y0, c.w, c.h);
      else {
        const k = lerp(0.4, 1, sq), dw = c.w * k, dh = c.h * k;
        h.drawImage(raster, c.x0 - ox, c.y0 - oy, c.w, c.h, px * R - dw / 2, py * R - dh / 2, dw, dh);
      }
    }
  }
  x.globalAlpha = 1; h.globalAlpha = 1;
}

function setCredit(k) {
  creditSpans.forEach((s, i) => {
    const v = smooth(i * 0.25, i * 0.25 + 0.5, k);
    s.style.opacity = v;
    s.style.transform = `translateY(${(1 - v) * 0.6}em)`;
  });
}

function onScroll() {
  if (document.documentElement.classList.contains('locked') && pageY() !== 0) { scrollPage(0); return; }
  setHeaderState();
  const range = flow.offsetHeight - stageH();
  const p = clamp((pageY() - flow.offsetTop) / range);
  const t = clamp((p - 0.1) / 0.6);
  const canMorph = flipped && titleCells && cardView.data;
  if (!canMorph) { drawMorph(0); titleEl.style.opacity = 0; setCredit(0); return; }
  if (t > 0 && !particles) buildParticles();
  cardWrap.style.visibility = t > 0 ? 'hidden' : 'visible';
  cardView.setEnabled(t === 0);
  hint.style.opacity = t > 0 ? 0 : 0.7;
  drawMorph(t);
  setCredit(clamp((p - 0.74) / 0.16));
}

// ---------- camera capture ----------
let stream = null;
async function openCamera() {
  const cam = $('cam'), msg = $('camMsg');
  dispatchEvent(new Event('camera:ready'));
  cam.style.display = 'flex'; msg.textContent = '';
  sizeCamFrame();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const v = $('video');
    v.srcObject = stream;
    v.onloadedmetadata = sizeCamFrame;
  } catch (err) {
    msg.textContent = 'The camera is blocked or unavailable (' + err.name + '). You can upload or randomize an image instead.';
  }
}
// the preview window has exactly the shape the final card will have, so what you see is what you get
function camAspect() {
  const v = $('video'), va = v.videoWidth ? v.videoWidth / v.videoHeight : 4 / 3;
  const b = cardBox(va, true);
  return b.w / b.h;
}
function sizeCamFrame() {
  const a = camAspect(), f = $('camFrame');
  const w = Math.min(innerWidth * 0.9, 960, innerHeight * 0.7 * a);
  f.style.width = w + 'px'; f.style.height = w / a + 'px';
}
function closeCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; $('cam').style.display = 'none';
}
function snap() {
  const v = $('video');
  if (!v.videoWidth) return;
  // keep exactly the part shown in the preview: the centre band, mirrored like the preview
  const a = camAspect(), vw = v.videoWidth, vh = v.videoHeight;
  const sh = Math.min(vh, Math.round(vw / a)), sw = Math.round(sh * a);
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const x = c.getContext('2d'); x.translate(sw, 0); x.scale(-1, 1);
  x.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, sw, sh);
  closeCamera();
  useImage(c, true, vw / vh);
}

// ---------- boot ----------
$('btnGenerate').onclick = async () => useImage(await loadImage(DEFAULT_IMAGE), true);
$('btnCamera').onclick = openCamera;
$('btnSnap').onclick = snap;
$('btnCamCancel').onclick = closeCamera;
$('btnUpload').onclick = () => $('fileInput').click();
$('fileInput').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = async () => useImage(await loadImage(rd.result), false);
  rd.readAsDataURL(f);
  e.target.value = '';
};
onPageScroll(onScroll);
// Phone browsers change the window height while scrolling (their bars slide in and out). That's not a real
// resize: the layout only follows width changes on touch screens, so nothing jumps or stretches.
let lastW = innerWidth;
addEventListener('resize', () => {
  if (matchMedia('(hover: none)').matches && innerWidth === lastW) return;
  lastW = innerWidth; layout();
});

// Coming from the About page (index.html?go=h0 / h1 / h2): skip the camera. The page opens as if
// "Randomize an image" had been picked and played through, already scrolled to that section.
async function skipToSection(id) {
  $('intro').classList.add('gone');
  const img = await loadImage(DEFAULT_IMAGE);
  currentSource = img; cropMode = true; usedAspect = 0; baseAspect = 0;
  cardWrap.style.display = 'block';
  card.getAnimations().forEach(a => a.cancel());
  card.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)' }], { duration: 1, fill: 'forwards' });
  flipped = true; particles = null;
  cardView.setEnabled(true);
  layout();
  if (pinned) pinTo(id);
}
// jump to a heading and keep it in that spot while fonts and photos finish loading (they can nudge the
// layout); stops as soon as the reader scrolls, clicks or types, or after 3 s
function pinTo(id) {
  const head = document.getElementById(id);
  scrollPage(head.getBoundingClientRect().top + pageY() - $('siteHeader').offsetHeight * 0.85);
}
const goTo = new URLSearchParams(location.search).get('go');
let pinned = false;
const skipping = goTo && document.getElementById(goTo);

history.scrollRestoration = 'manual';
scrollPage(0);
if (skipping) {
  $('intro').classList.add('gone');                      // never show the camera on the way
  history.replaceState(null, '', location.pathname);     // a reload starts at the camera again
  flipped = true;                                        // the hero counts as played: header shows state B
  pinTo(goTo);
} else document.documentElement.classList.add('locked', 'cam-screen');

// Arriving from About, everything appears in the same instant: the page stays hidden until the fonts and
// the photo of that section are ready, then it is shown already in place and the heading arrives (clear,
// then degrading) in that same frame. The hero (title + card) is prepared afterwards.
async function arrive() {
  // essay.js loads after this file: wait for it, then for its fonts + the landed section's photo
  if (document.readyState === 'loading') await new Promise(r => addEventListener('DOMContentLoaded', r, { once: true }));
  await Promise.race([window.essayReady || Promise.resolve(), new Promise(r => setTimeout(r, 4000))]);
  pinTo(goTo);
  setHeaderState();
  document.documentElement.classList.remove('skip');
  if (window.releaseArrival) releaseArrival();
  // keep the heading in place while anything late (a font subset) settles; stops when the reader moves
  pinned = true;
  const stop = () => { pinned = false; };
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(t => addEventListener(t, stop, { once: true, passive: true }));
  setTimeout(stop, 3000);
  const ro = new ResizeObserver(() => { if (pinned) pinTo(goTo); });
  ro.observe(document.body);
  setTimeout(() => ro.disconnect(), 3200);
  // the hero is above, out of sight: build it after the heading has arrived
  await new Promise(r => setTimeout(r, 1300));
  await prepareTitle();
  await skipToSection(goTo);
}

if (skipping) arrive();
else (async () => {
  await Promise.race([document.fonts.load(`20px ${FONT}`), new Promise(r => setTimeout(r, 2500))]);
  await prepareTitle();
  layout();
})();
