// deck-anim.js — Efferon Carousel Studio: per-slide animation (live preview + GIF/video export).
//
// A single `applyProgress(artEl, t)` progress function is the source of truth
// for the animated entrance — both the in-tool live preview (`playSlide`,
// driven by requestAnimationFrame) and the offscreen frame-by-frame exports
// (`recordSlideGif` / `recordSlideVideo`) call the exact same function at
// increasing values of t, so what you preview is what you export.
//
// Generic by design: it does not know about block types. It walks the
// rendered artboard's DOM structure — `.content > *` as the top-level groups
// (header/topbar, title, card, plus any cover/closing/quote-specific
// siblings), and when a group is `.card`, its own direct children
// (`.c-lede` / `.c-body` / `.c-foot`) become additional groups continuing the
// same staggered sequence. Every slide role (cover/closing/quote/card) is
// built from `.content > *` in js/deck-render.js, so this works unmodified
// across all of them.
//
// Depends on the vendored UMD globals `htmlToImage` (vendor/html-to-image.js),
// `GIF` (vendor/gif.js, worker at vendor/gif.worker.js), and `Mp4Muxer`
// (vendor/mp4-muxer.js) — loaded via <script> tags in carousel-studio.html
// before this module runs — plus the browser's native WebCodecs
// (`VideoEncoder`/`VideoFrame`) when available. Offline-only, no network
// fetches.
//
// Video export renders each frame with html-to-image (slow, ~150-300ms/frame)
// but encodes with WebCodecs using EXPLICIT per-frame timestamps, so slow
// rendering never stretches the output's duration or frame rate — only the
// MediaRecorder fallback (used when WebCodecs is unavailable) is coupled to
// real wall-clock time.

import { FORMAT_DIMS } from './deck-model.js';
import { renderSlide } from './deck-render.js';

/* ================= staggered-reveal timeline ================= */

const STAGGER = 0.12; // default gap between one group's start and the next's
const WINDOW = 0.4;   // each group's own fade/translate takes this fraction of [0,1]

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Top-level groups = `.content`'s direct children, in DOM order (topbar,
// title, card, plus whatever cover/closing/quote shells add — spacer,
// pill-frost, cover-photo, cover-sub, pill-out, qauthor, …). When a group IS
// `.card`, its own direct children are appended as further groups so the
// reveal continues into the card (lede → body → footer) instead of popping
// in all at once.
function collectGroups(artEl) {
  const content = artEl.querySelector('.content');
  if (!content) return [];
  const groups = [];
  Array.from(content.children).forEach((child) => {
    groups.push(child);
    if (child.classList && child.classList.contains('card')) {
      Array.from(child.children).forEach((grandchild) => groups.push(grandchild));
    }
  });
  return groups;
}

// Each group i gets a [start,end) window inside [0,1]. The stagger between
// groups shrinks automatically when there are many groups, so the *last*
// group's window still ends by t=1 regardless of how many groups a given
// slide has (a quote slide has ~4 groups, a multi-block card can have 6+).
function windowFor(i, total) {
  const maxStagger = total > 1 ? Math.min(STAGGER, (1 - WINDOW) / (total - 1)) : STAGGER;
  const start = i * maxStagger;
  const end = Math.min(1, start + WINDOW);
  return [start, end];
}

/* ================= enhancement: bar-fill grow + number count-up ================= */
// Both are keyed off the SAME per-group eased progress as the fade/translate,
// so a stat's bar/number finishes growing right as its group finishes
// revealing. Guarded with try/catch + "does this element even match" checks
// so a slide with no bars/numbers (or a shape we don't expect) never throws.

const fillFinalCache = new WeakMap();
function applyFillGrow(el, eased) {
  try {
    let finalPct = fillFinalCache.get(el);
    if (finalPct === undefined) {
      finalPct = parseFloat(el.style.width) || 0;
      fillFinalCache.set(el, finalPct);
    }
    el.style.width = (finalPct * eased) + '%';
  } catch (e) { /* never throw from the animation path */ }
}

const numberCache = new WeakMap();
function firstNumberTextNode(el) {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return node;
  }
  return null;
}
function primeNumberEntry(el) {
  if (numberCache.has(el)) return numberCache.get(el);
  let entry = null;
  const node = firstNumberTextNode(el);
  if (node) {
    const raw = node.textContent.trim();
    const val = parseFloat(raw.replace(/,/g, ''));
    if (isFinite(val)) {
      const decimals = (raw.split('.')[1] || '').length;
      entry = { node, val, decimals };
    }
  }
  numberCache.set(el, entry);
  return entry;
}
function applyNumberCountUp(el, eased) {
  try {
    const entry = primeNumberEntry(el);
    if (!entry) return; // not a plain leading number (or no text) — leave untouched
    entry.node.textContent = (entry.val * eased).toFixed(entry.decimals);
  } catch (e) { /* never throw from the animation path */ }
}

/* ---- chart blocks: column bars grow from baseline, line draws in ---- */
// SVG column <path> bars: scaleY from their own bottom edge (transform-box:
// fill-box makes transform-origin resolve within the bar's own bbox).
function applyBarGrow(el, eased) {
  try {
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = 'bottom';
    el.style.transform = `scaleY(${eased})`;
  } catch (e) { /* never throw */ }
}
// SVG lineplot <polyline>: stroke draw-in via dasharray/dashoffset.
const lineLenCache = new WeakMap();
function applyLineDraw(el, eased) {
  try {
    let len = lineLenCache.get(el);
    if (len === undefined) { len = (el.getTotalLength && el.getTotalLength()) || 0; lineLenCache.set(el, len); }
    if (!len) return;
    el.style.strokeDasharray = String(len);
    el.style.strokeDashoffset = String(len * (1 - eased));
  } catch (e) { /* never throw */ }
}

/* ================= public API ================= */

/**
 * Sets the artboard's animated entrance state at progress `t` ∈ [0,1].
 * Pure function of (artEl, t) — calling it repeatedly with increasing t (or
 * jumping straight to 0 or 1) always produces the same visual state, which is
 * what lets the live preview and the frame-by-frame exporters share it.
 * @param {HTMLElement} artEl - a `.art` artboard as returned by renderSlide()
 * @param {number} t - progress, 0 (hidden/offset) .. 1 (final, fully in place)
 */
export function applyProgress(artEl, t) {
  const clampedT = Math.max(0, Math.min(1, t));
  const groups = collectGroups(artEl);
  const total = groups.length;
  groups.forEach((group, i) => {
    const [start, end] = windowFor(i, total);
    const local = end > start ? (clampedT - start) / (end - start) : 1;
    const localClamped = Math.max(0, Math.min(1, local));
    const eased = easeOutCubic(localClamped);

    group.style.opacity = String(eased);
    group.style.transform = `translateY(${(1 - eased) * 24}px)`;

    group.querySelectorAll('.cbar-fill, .m-fill').forEach((el) => applyFillGrow(el, eased));
    group.querySelectorAll('.statnum, .hero-num, .num').forEach((el) => applyNumberCountUp(el, eased));
    group.querySelectorAll('.chart-bar').forEach((el) => applyBarGrow(el, eased));
    group.querySelectorAll('.chart-line').forEach((el) => applyLineDraw(el, eased));
  });
}

/**
 * Real-time live-preview: drives `applyProgress` from 0→1 over `duration` ms
 * via requestAnimationFrame, then leaves the artboard at its final (t=1)
 * state. Resolves once the entrance has finished playing.
 * @param {HTMLElement} artEl
 * @param {{duration?:number}} [opts]
 * @returns {Promise<void>}
 */
export function playSlide(artEl, { duration = 2200 } = {}) {
  return new Promise((resolve) => {
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      applyProgress(artEl, t);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

/* ================= offscreen full-scale render (shared by both exporters) ================= */
// Same pattern as js/deck-export.js's slideBlob(): render off-screen at exact
// 1:1 pixel size (no CSS scale transform), wait for fonts + images, and cache
// the @font-face embed CSS once so every per-frame html-to-image snapshot
// reuses it instead of recomputing it (recomputing per-frame would be very
// slow across dozens of frames).

let _fontEmbedCSSPromise = null;
function getFontEmbedCSS(node) {
  if (!_fontEmbedCSSPromise) _fontEmbedCSSPromise = htmlToImage.getFontEmbedCSS(node);
  return _fontEmbedCSSPromise;
}

function waitForImages(node) {
  const imgs = Array.from(node.querySelectorAll('img'));
  return Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalWidth !== 0) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }));
}

async function mountOffscreen(slide, deck) {
  const format = (deck && deck.format) || 'portrait';
  const [w, h] = FORMAT_DIMS[format] || FORMAT_DIMS.portrait;

  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = w + 'px';
  host.style.height = h + 'px';
  host.style.overflow = 'hidden';

  const art = renderSlide(slide, { deck });
  applyProgress(art, 0); // start hidden/offset before the first captured frame
  host.appendChild(art);
  document.body.appendChild(host);

  await document.fonts.ready;
  await waitForImages(art);
  const fontEmbedCSS = await getFontEmbedCSS(art);

  return { host, art, w, h, fontEmbedCSS, cleanup: () => document.body.removeChild(host) };
}

// Single frame-capture call shared by every exporter (GIF, single-slide
// video, whole-deck video) — html-to-image snapshot of the artboard at its
// exact 1:1 pixel size, reusing the cached @font-face embed CSS.
function snapshotFrame(art, w, h, fontEmbedCSS) {
  return htmlToImage.toCanvas(art, { width: w, height: h, pixelRatio: 1, fontEmbedCSS });
}

/**
 * Renders `slide` off-screen at full 1:1 size and encodes its entrance
 * animation as an animated GIF. Uses a light ordered dithering kernel
 * (Floyd–Steinberg, serpentine) to reduce banding across the brand's gradient
 * background — GIF's 256-color palette otherwise bands visibly on it.
 * @param {object} slide
 * @param {object} deck
 * @param {{duration?:number, fps?:number}} [opts]
 * @returns {Promise<Blob>} an `image/gif` blob
 */
export async function recordSlideGif(slide, deck, { duration = 2200, fps = 18 } = {}) {
  const { art, w, h, fontEmbedCSS, cleanup } = await mountOffscreen(slide, deck);
  try {
    const gif = new GIF({
      workers: 2,
      quality: 10,
      workerScript: 'vendor/gif.worker.js',
      width: w,
      height: h,
      dither: 'FloydSteinberg-serpentine',
    });

    const totalFrames = Math.max(1, Math.round((duration / 1000) * fps));
    const delay = 1000 / fps;
    for (let i = 0; i <= totalFrames; i++) {
      const t = i / totalFrames;
      applyProgress(art, t);
      const canvas = await snapshotFrame(art, w, h, fontEmbedCSS);
      gif.addFrame(canvas, { delay, copy: true });
    }

    const blob = await new Promise((resolve, reject) => {
      gif.on('finished', (b) => resolve(b));
      gif.on('abort', () => reject(new Error('GIF encoding aborted')));
      gif.render();
    });
    return blob;
  } finally {
    cleanup();
  }
}

/* ================= shared MediaRecorder plumbing (single-slide + whole-deck video) ================= */
// Chrome's MediaRecorder almost always produces WebM, not MP4 — this asks
// for 'video/mp4' first and only falls back to WebM variants when the
// browser genuinely doesn't support MP4 capture, so the resolved `ext`
// always reflects what was actually produced (never claims mp4 when the
// blob is webm).

function pickVideoMimeType() {
  const candidates = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }
  return '';
}

function startCanvasRecording(canvas, fps) {
  const stream = canvas.captureStream(fps);
  const mimeType = pickVideoMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start();
  return { recorder, chunks, stopped, mimeType };
}

async function finishCanvasRecording({ recorder, chunks, stopped, mimeType }) {
  recorder.stop();
  await stopped;
  const usedMime = recorder.mimeType || mimeType || 'video/webm';
  const ext = usedMime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type: usedMime.split(';')[0] });
  return { blob, ext };
}

/**
 * FALLBACK ONLY (used when WebCodecs is unavailable). Renders `slide`
 * off-screen at full 1:1 size and records its entrance animation as a video
 * via canvas.captureStream() + MediaRecorder — real-time, so render speed
 * directly affects output duration/frame rate. See `recordSlideVideo` for the
 * primary (WebCodecs) path.
 * @param {object} slide
 * @param {object} deck
 * @param {{duration?:number, fps?:number}} [opts]
 * @returns {Promise<{blob:Blob, ext:'mp4'|'webm'}>}
 */
async function recordSlideVideoLegacy(slide, deck, { duration = 1800, fps = 30 } = {}) {
  const { art, w, h, fontEmbedCSS, cleanup } = await mountOffscreen(slide, deck);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const rec = startCanvasRecording(canvas, fps);

    const totalFrames = Math.max(1, Math.round((duration / 1000) * fps));
    const frameDuration = duration / totalFrames;
    for (let i = 0; i <= totalFrames; i++) {
      const t = i / totalFrames;
      applyProgress(art, t);
      const frameCanvas = await snapshotFrame(art, w, h, fontEmbedCSS);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(frameCanvas, 0, 0, w, h);
      await new Promise((r) => setTimeout(r, frameDuration));
    }

    return await finishCanvasRecording(rec);
  } finally {
    cleanup();
  }
}

/**
 * FALLBACK ONLY (used when WebCodecs is unavailable). Renders the WHOLE deck
 * off-screen, one slide at a time, and records a single continuous video:
 * each slide plays its entrance (t:0→1, snapshotted frame-by-frame like
 * `recordSlideVideoLegacy`), then holds on its final frame — snapshotted ONCE
 * and redrawn for the hold duration (the key perf win: no repeated
 * html-to-image renders while nothing is changing on screen) — before
 * hard-cutting to the next slide. All frames are drawn onto one canvas and
 * captured by ONE real-time MediaRecorder session, so render speed directly
 * affects output duration/frame rate. See `recordDeckVideo` for the primary
 * (WebCodecs) path.
 * @param {object} deck
 * @param {{entrance?:number, hold?:number, fps?:number, onProgress?:(done:number,total:number)=>void}} [opts]
 * @returns {Promise<{blob:Blob, ext:'mp4'|'webm'}>}
 */
async function recordDeckVideoLegacy(deck, { entrance = 1600, hold = 1000, fps = 30, onProgress } = {}) {
  const format = (deck && deck.format) || 'portrait';
  const [w, h] = FORMAT_DIMS[format] || FORMAT_DIMS.portrait;
  const total = deck.slides.length;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const rec = startCanvasRecording(canvas, fps);

  const entranceFrames = Math.max(1, Math.round((entrance / 1000) * fps));
  const holdFrames = Math.max(0, Math.round((hold / 1000) * fps));
  const frameDuration = 1000 / fps;

  for (let s = 0; s < total; s++) {
    const { art, w: sw, h: sh, fontEmbedCSS, cleanup } = await mountOffscreen(deck.slides[s], deck);
    try {
      // Entrance: step t 0→1, snapshotting every frame (same approach as recordSlideVideo).
      for (let i = 0; i <= entranceFrames; i++) {
        const t = i / entranceFrames;
        applyProgress(art, t);
        const frameCanvas = await snapshotFrame(art, sw, sh, fontEmbedCSS);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(frameCanvas, 0, 0, w, h);
        await new Promise((r) => setTimeout(r, frameDuration));
      }
      // Hold: the slide is static at t=1 — snapshot ONCE, then just redraw
      // that same canvas for the remaining hold frames (no re-render).
      if (holdFrames > 0) {
        const holdCanvas = await snapshotFrame(art, sw, sh, fontEmbedCSS);
        for (let i = 0; i < holdFrames; i++) {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(holdCanvas, 0, 0, w, h);
          await new Promise((r) => setTimeout(r, frameDuration));
        }
      }
    } finally {
      cleanup();
    }
    if (onProgress) onProgress(s + 1, total);
  }

  return await finishCanvasRecording(rec);
}

/* ================= primary path: WebCodecs + mp4-muxer (explicit timestamps) ================= */
// The whole point of this path: each encoded VideoFrame gets an explicit,
// evenly-spaced timestamp computed from its frame index and the target fps —
// NOT from wall-clock time. However long html-to-image actually takes to
// render a given frame, the muxed mp4 places it at exactly i/fps seconds, so
// output duration = totalFrames/fps and frame rate is perfectly constant,
// regardless of render speed.

function webCodecsAvailable() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
    && typeof Mp4Muxer !== 'undefined';
}

// Wraps one VideoEncoder + one Mp4Muxer.Muxer session. `encodeFrame` accepts
// a canvas (or anything else VideoFrame can wrap) and stamps it with the next
// sequential timestamp; `finish()` flushes the encoder, finalizes the muxer,
// and returns the finished `{blob, ext}` pair. Frames are encoded and closed
// one at a time — no array of frames is ever held in memory.
async function createMp4Encoder(w, h, fps) {
  const target = new Mp4Muxer.ArrayBufferTarget();
  const muxer = new Mp4Muxer.Muxer({
    target,
    video: { codec: 'avc', width: w, height: h },
    fastStart: 'in-memory',
  });

  let encodeError = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e; },
  });
  enc.configure({ codec: 'avc1.640028', width: w, height: h, bitrate: 8_000_000, framerate: fps });

  let frameIndex = 0;
  return {
    encodeFrame(canvas) {
      if (encodeError) throw encodeError;
      const vf = new VideoFrame(canvas, {
        timestamp: Math.round((frameIndex * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      });
      enc.encode(vf, { keyFrame: frameIndex % fps === 0 });
      vf.close();
      frameIndex += 1;
    },
    async finish() {
      await enc.flush();
      if (encodeError) throw encodeError;
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: 'video/mp4' });
      return { blob, ext: 'mp4' };
    },
  };
}

/**
 * Renders `slide` off-screen at full 1:1 size and encodes its entrance
 * animation as an mp4 via WebCodecs (`VideoEncoder`) + the vendored mp4-muxer,
 * with explicit per-frame timestamps — so render speed never affects output
 * duration or frame rate. Falls back to `recordSlideVideoLegacy` (real-time
 * MediaRecorder) when WebCodecs isn't available.
 * @param {object} slide
 * @param {object} deck
 * @param {{duration?:number, fps?:number}} [opts]
 * @returns {Promise<{blob:Blob, ext:'mp4'|'webm'}>}
 */
export async function recordSlideVideo(slide, deck, { duration = 1800, fps = 30 } = {}) {
  if (!webCodecsAvailable()) return recordSlideVideoLegacy(slide, deck, { duration, fps });

  const { art, w, h, fontEmbedCSS, cleanup } = await mountOffscreen(slide, deck);
  try {
    const encoder = await createMp4Encoder(w, h, fps);
    const totalFrames = Math.max(1, Math.round((duration / 1000) * fps));
    for (let i = 0; i <= totalFrames; i++) {
      const t = i / totalFrames;
      applyProgress(art, t);
      const canvas = await snapshotFrame(art, w, h, fontEmbedCSS);
      encoder.encodeFrame(canvas);
    }
    return await encoder.finish();
  } finally {
    cleanup();
  }
}

/**
 * Renders the WHOLE deck off-screen, one slide at a time, and encodes a
 * single continuous mp4 via WebCodecs + mp4-muxer: each slide plays its
 * entrance (t:0→1, one html-to-image render per frame), then holds on its
 * final frame — snapshotted ONCE with html-to-image and re-encoded (with the
 * next sequential timestamp, no re-render) for the remaining hold frames —
 * before cutting to the next slide. Because every frame's timestamp is
 * derived from its position (frame index / fps), not wall-clock time, a
 * 10-slide deck at entrance=1600ms/hold=1000ms/fps=30 always comes out to
 * ~26s regardless of how long the renders actually took. Falls back to
 * `recordDeckVideoLegacy` (real-time MediaRecorder) when WebCodecs isn't
 * available.
 * @param {object} deck
 * @param {{entrance?:number, hold?:number, fps?:number, onProgress?:(done:number,total:number)=>void}} [opts]
 * @returns {Promise<{blob:Blob, ext:'mp4'|'webm'}>}
 */
export async function recordDeckVideo(deck, { entrance = 1600, hold = 1000, fps = 30, onProgress } = {}) {
  if (!webCodecsAvailable()) return recordDeckVideoLegacy(deck, { entrance, hold, fps, onProgress });

  const format = (deck && deck.format) || 'portrait';
  const [w, h] = FORMAT_DIMS[format] || FORMAT_DIMS.portrait;
  const total = deck.slides.length;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const encoder = await createMp4Encoder(w, h, fps);
  const entranceFrames = Math.max(1, Math.round((entrance / 1000) * fps));
  const holdFrames = Math.max(0, Math.round((hold / 1000) * fps));

  for (let s = 0; s < total; s++) {
    const { art, w: sw, h: sh, fontEmbedCSS, cleanup } = await mountOffscreen(deck.slides[s], deck);
    try {
      // Entrance: step t 0→1, one render per frame, each encoded with the
      // next sequential timestamp.
      for (let i = 0; i <= entranceFrames; i++) {
        const t = i / entranceFrames;
        applyProgress(art, t);
        const frameCanvas = await snapshotFrame(art, sw, sh, fontEmbedCSS);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(frameCanvas, 0, 0, w, h);
        encoder.encodeFrame(canvas);
      }
      // Hold: the slide is static at t=1 — snapshot ONCE, then just
      // re-encode that same canvas (new timestamp only) for the remaining
      // hold frames — no re-render.
      if (holdFrames > 0) {
        const holdCanvas = await snapshotFrame(art, sw, sh, fontEmbedCSS);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(holdCanvas, 0, 0, w, h);
        for (let i = 0; i < holdFrames; i++) {
          encoder.encodeFrame(canvas);
        }
      }
    } finally {
      cleanup();
    }
    if (onProgress) onProgress(s + 1, total);
  }

  return await encoder.finish();
}
