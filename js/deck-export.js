// deck-export.js — Efferon Carousel Studio: PNG + PDF export.
// Renders each slide off-screen at full 1:1 pixel size (no CSS scale transform,
// unlike the Storyboard's `.art--row`/`.art--exp` thumbnails) so html-to-image
// snapshots crisp, native-resolution artwork instead of a scaled-down blur.
//
// Depends on the vendored UMD globals `htmlToImage` (vendor/html-to-image.js)
// and `jspdf` (vendor/jspdf.umd.min.js) — loaded via <script> tags in
// carousel-studio.html before this module runs. No network fetches; offline-only.

import { FORMAT_DIMS } from './deck-model.js';
import { renderSlide } from './deck-render.js';

// Cached once per page load: the @font-face CSS (as data-URI'd font files)
// that html-to-image needs to embed into the snapshot's serialized SVG.
// Without this, cloned nodes rendered via foreignObject can lose the
// @font-face and fall back to a system serif/sans-serif — see task de-risk.
let _fontEmbedCSSPromise = null;

function getFontEmbedCSS(node) {
  if (!_fontEmbedCSSPromise) {
    _fontEmbedCSSPromise = htmlToImage.getFontEmbedCSS(node);
  }
  return _fontEmbedCSSPromise;
}

// Resolves once every <img> under `node` has finished loading (or errored —
// we don't want one bad asset to hang the whole export).
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

/**
 * Renders `slide` full-size (per `deck.format`) in an off-screen container,
 * waits for fonts/images, and snapshots it to a PNG blob at 2x pixel ratio.
 * @returns {Promise<Blob>}
 */
/**
 * Snapshots any full-size element `el` (w×h px) to a 2× PNG blob off-screen.
 * Shared by the carousel (slideBlob) and the poster export — the element is
 * mounted off-screen at 1:1, fonts/images are awaited, then html-to-image
 * serialises it. No CSS scale transform (callers pass a 1:1 element).
 * @returns {Promise<Blob>}
 */
export async function elementToPngBlob(el, w, h) {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = w + 'px';
  host.style.height = h + 'px';
  host.style.overflow = 'hidden';
  host.appendChild(el);
  document.body.appendChild(host);
  try {
    await document.fonts.ready;
    await waitForImages(el);
    const fontEmbedCSS = await getFontEmbedCSS(el);
    return await htmlToImage.toBlob(el, {
      width: w,
      height: h,
      pixelRatio: 2,
      cacheBust: true,
      fontEmbedCSS,
    });
  } finally {
    document.body.removeChild(host);
  }
}

export async function slideBlob(slide, deck) {
  const format = (deck && deck.format) || 'portrait';
  const [w, h] = FORMAT_DIMS[format] || FORMAT_DIMS.portrait;
  const art = renderSlide(slide, { deck });
  return elementToPngBlob(art, w, h);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke — revoking synchronously can truncate/cancel the download in
  // some browsers before it has finished reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ================= store-only ZIP (no dependency) =================
   Browsers block/òprompt on many sequential downloads (and a revoked object URL
   cancels the next one), so exporting N PNGs as N clicks only saved the first.
   Instead we pack every PNG into ONE .zip and download it once. PNGs are already
   compressed, so store (method 0) is fine — no deflate needed. */

let _crcTable = null;
function crc32(bytes) {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      _crcTable[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = _crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Builds a store-only (uncompressed) ZIP from `files`.
 * @param {{name:string, bytes:Uint8Array}[]} files
 * @returns {Uint8Array}
 */
export function makeStoreZip(files) {
  const enc = new TextEncoder();
  const u16 = (v) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);

  const local = [];   // local records (file data), in order
  const central = []; // central-directory records
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.bytes;
    const crc = crc32(data);
    const localOffset = offset;
    const header = [
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name,
    ];
    for (const part of header) { local.push(part); offset += part.length; }
    local.push(data); offset += data.length;

    central.push(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(localOffset), name,
    );
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const part of central) cdSize += part.length;

  const end = [
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cdSize), u32(cdStart), u16(0),
  ];

  const all = [...local, ...central, ...end];
  const totalLen = all.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(totalLen);
  let p = 0;
  for (const part of all) { out.set(part, p); p += part.length; }
  return out;
}

/**
 * Renders every slide in `deck` sequentially and triggers a download of each
 * as `01.png`, `02.png`, … (zero-padded to the slide count). Sequential
 * (awaits each slide before starting the next) to avoid a download storm.
 * @param {object} deck
 * @param {(done:number, total:number)=>void} [onProgress]
 */
export async function exportAllPngs(deck, onProgress) {
  const total = deck.slides.length;
  // A single slide → download it directly as a .png (no need to zip one file).
  if (total === 1) {
    const blob = await slideBlob(deck.slides[0], deck);
    downloadBlob(blob, '01.png');
    if (onProgress) onProgress(1, 1);
    return;
  }
  // Otherwise render every slide and pack them into ONE .zip — reliable across
  // browsers (many sequential downloads get blocked and only the first saves).
  const files = [];
  for (let i = 0; i < total; i++) {
    const blob = await slideBlob(deck.slides[i], deck);
    files.push({ name: `${pad2(i + 1)}.png`, bytes: new Uint8Array(await blob.arrayBuffer()) });
    if (onProgress) onProgress(i + 1, total);
  }
  const zip = makeStoreZip(files);
  downloadBlob(new Blob([zip], { type: 'application/zip' }), 'efferon-carousel-png.zip');
}

/**
 * Renders every slide in `deck` sequentially, assembles a full-bleed PDF
 * (one page per slide, page size matching the slide's pixel dimensions) and
 * saves it as efferon-carousel.pdf.
 * @param {object} deck
 * @param {(done:number, total:number)=>void} [onProgress]
 */
export async function exportPdf(deck, onProgress) {
  const format = deck.format || 'portrait';
  const [w, h] = FORMAT_DIMS[format] || FORMAT_DIMS.portrait;
  const total = deck.slides.length;

  const { jsPDF } = jspdf;
  const pdf = new jsPDF({
    orientation: w >= h ? 'landscape' : 'portrait',
    unit: 'px',
    format: [w, h],
    compress: true,
  });

  for (let i = 0; i < total; i++) {
    const blob = await slideBlob(deck.slides[i], deck);
    const dataUrl = await blobToDataURL(blob);
    if (i > 0) pdf.addPage([w, h], w >= h ? 'landscape' : 'portrait');
    pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
    if (onProgress) onProgress(i + 1, total);
  }

  pdf.save('efferon-carousel.pdf');
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
