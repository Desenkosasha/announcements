/* ===================================================================
   Announce templates — renderers (additive; carousel/poster untouched)
   renderEvent(spec)        -> DOM node .aev (1080×1080)
   renderCountry(spec, geo) -> DOM node .acn (1080×1080), where `geo` is the
                               announce-geo module (countryPathD/countryViewBox/
                               flagHref). geo may be null → map/flag degrade.
   Styling lives in announce.css. Ported verbatim from the approved
   announce-explore/ demos.
   =================================================================== */
import { PRODUCT_SRC, PRODUCT_LABEL, EVENT_DEVICE_SRC } from './announce-model.js';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;');

/* Render the ® registered mark as a small superscript span (brand style). */
function withReg(html){ return html.replace(/®/g, '<span class="reg">®</span>'); }

const CAL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/><line x1="7" y1="13" x2="9" y2="13"/><line x1="11" y1="13" x2="13" y2="13"/><line x1="15" y1="13" x2="17" y2="13"/><line x1="7" y1="16.5" x2="9" y2="16.5"/><line x1="11" y1="16.5" x2="13" y2="16.5"/></svg>`;
const PIN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c4.5-4.6 7-8 7-11.2A7 7 0 0 0 5 9.8C5 13 7.5 16.4 12 21z"/><circle cx="12" cy="9.6" r="2.6"/></svg>`;
/* exhibition-stand icon for the booth/stand-number row */
const BOOTH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 L4.6 4.6 h14.8 L21 9"/><path d="M4.5 9 v11 h15 V9"/><path d="M9 20 v-5.5 h6 V20"/></svg>`;
function node(html){
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ---------------- EVENT ----------------
   Additive options (all backward-compatible — omit them and the template renders
   exactly as before): s.product ('lps'|'neo') swaps the granule bead for a
   product column; s.booth adds a stand-number row; s.confLogoDataUrl puts a
   conference logo on the right of the footer (co-brand). */
export function renderEvent(spec){
  const s = spec || {};
  const dev = EVENT_DEVICE_SRC[s.product];        // undefined unless product set
  const foreground = dev
    ? `<img class="aev-dev ${esc(s.product)}" src="${esc(dev)}" alt="">`
    : `<img class="aev-bead" src="assets/illustrations/bead.png" alt="">`;
  const hasConf = !!s.confLogoDataUrl;
  const confTop = hasConf && s.confLogoPos === 'top';
  const confBottom = hasConf && !confTop;
  const confTopEl = confTop
    ? `<div class="aev-conf-top"><img src="${esc(s.confLogoDataUrl)}" alt=""></div>` : '';
  const confBottomEl = confBottom
    ? `<div class="aev-conf"><img src="${esc(s.confLogoDataUrl)}" alt=""></div>` : '';
  const html = `
  <div class="aev${dev ? ' has-dev' : ''}${s.topic ? ' has-topic' : ''}${confTop ? ' has-conftop' : ''}">
    <div class="aev-stripes"></div>
    ${foreground}
    ${confTopEl}
    <div class="aev-content">
      ${s.title ? `<h1 class="aev-headline">${esc(s.title)}</h1>` : ''}
      ${s.lede  ? `<p class="aev-lede">${esc(s.lede)}</p>` : ''}
      ${s.topic ? `<p class="aev-topic">${esc(s.topic)}</p>` : ''}
    </div>
    <div class="aev-card">
      ${s.date ? `<div class="aev-row"><span class="aev-ico">${CAL_ICON}</span><span class="aev-date">${esc(s.date)}</span></div>` : ''}
      ${s.venue ? `<div class="aev-row"><span class="aev-ico">${PIN_ICON}</span><span class="aev-venue">${esc(s.venue)}</span></div>` : ''}
      ${s.address ? `<div class="aev-addr">${esc(s.address)}</div>` : ''}
      ${s.booth ? `<div class="aev-row aev-booth-row"><span class="aev-ico">${BOOTH_ICON}</span><span class="aev-booth">${esc(s.booth)}</span></div>` : ''}
    </div>
    <div class="aev-footer${confBottom ? ' cobrand' : ''}">
      <img class="aev-eff" src="assets/logo/efferon-logo.svg" alt="Efferon">
      ${confBottomEl}
    </div>
  </div>`;
  return node(html);
}

/* =====================================================================
   COUNTRY — "NOW AVAILABLE IN <COUNTRY>" template (v2)
   Layout matches the approved Croatia post: product lockup top-left, uppercase
   two-line headline, local-language subline, stroke-only country outline with
   an approval badge on its centroid, waving flag top-right, device bottom-right.
   ===================================================================== */

/* Two colour treatments. 'ref' reproduces the approved Croatia post (deep navy
   + crimson); 'brand' stays inside the brandbook palette (#4568a9 + red).
   spec.palette picks one; default 'ref'. */
export const ACN_PALETTES = {
  ref:   { blue: '#2a3a8c', red: '#a5323f', logo: 'assets/logo/efferon-logo-navy.svg' },
  brand: { blue: '#4568a9', red: '#d4213d', logo: 'assets/logo/efferon-logo.svg' },
};
function palette(name){ return ACN_PALETTES[name] || ACN_PALETTES.ref; }

/* Approval badge: filled crimson shield + white disc + check. Delivered as an
   <img> data-URI (export-safe; an inline <svg> inside an absolutely-positioned
   box does not render reliably through html-to-image). */
function shieldURI(red){
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 116">`
    + `<path d="M50 2 L96 17 V60 C96 88 74 106 50 114 C26 106 4 88 4 60 V17 Z" fill="${red}"/>`
    + `<path d="M50 10.5 L88.5 23 V60 C88.5 83 70 97.5 50 105 C30 97.5 11.5 83 11.5 60 V23 Z" fill="none" stroke="#ffffff" stroke-opacity="0.62" stroke-width="3.2" stroke-linejoin="round"/>`
    + `<circle cx="50" cy="56" r="25.5" fill="#ffffff"/>`
    + `<path d="M37.5 56.5 L46.5 65.5 L63 45.5" fill="none" stroke="${red}" stroke-width="7.6" stroke-linecap="round" stroke-linejoin="round"/>`
    + `</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* Flag = a plain <img> of the canvas-baked waving cloth (see ensureFlag);
   an SVG displacement filter breaks html-to-image. */
function flagEl(href){
  if(!href) return '';
  return `<div class="acn-flag"><img src="${esc(href)}" alt=""></div>`;
}

/* Stroke-only country outline + the approval badge anchored on the projected
   centroid of the territory. Geometry comes from the vendored 1:50m world atlas
   (1:110m was too coarse — small countries came out as a blob). */
const MAP_BOX = { W: 540, H: 470, PAD: 10 };
function mapBlock(geo, iso, red){
  if(!geo || !iso || typeof geo.countryPathD !== 'function') return '';
  const { W, H, PAD } = MAP_BOX;
  let d = null, c = null;
  try { d = geo.countryPathD(iso, { width: W, height: H, padding: PAD }); } catch(_) { d = null; }
  if(!d) return '';
  try { c = typeof geo.countryCentroid === 'function'
      ? geo.countryCentroid(iso, { width: W, height: H, padding: PAD }) : null; } catch(_) { c = null; }
  const bx = c ? c[0] : W / 2, by = c ? c[1] : H * 0.44;
  const S = 66;                                  // badge width
  const badge = `<img class="acn-shield" src="${shieldURI(red)}" alt="" `
    + `style="left:${(bx - S / 2).toFixed(1)}px;top:${(by - S * 0.55).toFixed(1)}px;width:${S}px">`;
  return `<div class="acn-map">`
    + `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`
    + `<path d="${d}" fill="none" stroke="${red}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/>`
    + `</svg>${badge}</div>`;
}

/* Headline: two uppercase lines, the country word in red. Sizes step down for
   long country names so the block always clears the flag and the device. */
function headlineSize(l1, l2){
  const n = Math.max(l1.length, l2.length);
  if(n <= 15) return 67;
  if(n <= 18) return 60;
  if(n <= 22) return 53;
  return 47;
}
function subSize(text){
  const n = (text || '').length;
  if(n <= 40) return 33;
  if(n <= 52) return 29;
  return 26;
}
function titleLines(s){
  const country = String(s.country || '').trim();
  const l1 = (s.titleTop != null && s.titleTop !== '') ? s.titleTop : 'NOW AVAILABLE';
  const l2 = (s.titleBottom != null && s.titleBottom !== '')
    ? s.titleBottom : (country ? 'IN ' + country.toUpperCase() : '');
  const emph = String(s.emphasis || country || '').toUpperCase();
  return { l1: l1.toUpperCase(), l2: l2.toUpperCase(), emph };
}
function headlineHTML(s){
  const { l1, l2, emph } = titleLines(s);
  const fs = headlineSize(l1, l2);
  let h2 = esc(l2);
  if(emph){
    const i = h2.indexOf(esc(emph));
    if(i >= 0) h2 = h2.slice(0, i) + `<span class="pl">${esc(emph)}</span>` + h2.slice(i + esc(emph).length);
  }
  const lh = (fs * 1.31).toFixed(0);
  return `<div class="acn-h" style="font-size:${fs}px;line-height:${lh}px">`
    + `${esc(l1)}${l2 ? `<br>${h2}` : ''}</div>`;
}

/* Preload the flag file into a data URI on the spec so it survives PNG export
   (html-to-image does not inline an SVG <image> that points at an external URL).
   Idempotent + cached per ISO. Safe no-op if geo/iso missing. */
const _flagCache = new Map();
export async function ensureFlag(spec, geo){
  if(!spec || !geo || !spec.iso || typeof geo.flagHref !== 'function') return;
  const iso = spec.iso;
  if(spec.flagDataUrl && spec._flagIso === iso) return;
  if(_flagCache.has(iso)){ spec.flagDataUrl = _flagCache.get(iso); spec._flagIso = iso; return; }
  try{
    // Load the flag SVG at a known size (inject width/height so it rasterizes).
    // 2× the CSS box so the 2× PNG export gets native pixels, not an upscale.
    const res = await fetch(geo.flagHref(iso));
    let svg = await res.text();
    if(!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace('<svg', '<svg width="1600" height="1200"');
    const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    const iw = img.naturalWidth || 1600, ih = img.naturalHeight || 1200;

    // Bake a waving-cloth flag on a canvas (export-safe: an SVG displacement
    // filter breaks html-to-image). Per-column vertical sine displacement +
    // fold light/shadow shading. All geometry scaled by BAKE.
    const W = 760 * BAKE, H = 560 * BAKE, amp = 14 * BAKE, waves = 1.15;
    const top = amp + 40 * BAKE, fh = H - top - amp - 40 * BAKE;
    const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const col = 2 * BAKE; // column slice width
    for(let x = 0; x < W; x += col){
      const t = x / W;
      const dy = Math.sin(t * Math.PI * 2 * waves) * amp + Math.sin(t * Math.PI * waves + 0.8) * amp * 0.35;
      ctx.drawImage(img, t * iw, 0, Math.max(1, iw / (W / col)), ih, x, top + dy, col + 0.6, fh);
    }
    // fold shading following the wave — clipped to the flag pixels only
    // (source-atop) so it never paints a translucent rectangle onto the
    // transparent canvas (which would show as a box + a rectangular drop-shadow).
    ctx.globalCompositeOperation = 'source-atop';
    for(let x = 0; x < W; x += col){
      const t = x / W, shade = Math.cos(t * Math.PI * 2 * waves);
      ctx.fillStyle = shade >= 0 ? `rgba(255,255,255,${0.14 * shade})` : `rgba(0,0,0,${0.14 * -shade})`;
      ctx.fillRect(x, top - amp, col + 0.6, fh + amp * 2);
    }
    // Bake the same white pastel wash INTO the flag (only over its pixels), so it
    // reads UNDER the gradient like the photo and the title stays legible over it
    // (dark flag bands otherwise swallow the red country word).
    const wg = ctx.createLinearGradient(0, top - amp, 0, top + fh + amp);
    wg.addColorStop(0, 'rgba(255,255,255,0.70)');
    wg.addColorStop(1, 'rgba(255,255,255,0.56)');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // Soften the leading (left) edge so the cloth melts into the wash instead of
    // ending in a hard ribbon edge next to the headline.
    ctx.globalCompositeOperation = 'destination-out';
    const fade = ctx.createLinearGradient(0, 0, W * 0.54, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0.99)');
    fade.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    const url = cnv.toDataURL('image/png');
    _flagCache.set(iso, url); spec.flagDataUrl = url; spec._flagIso = iso;
  }catch(_){ /* leave unset — render falls back to the plain href */ }
}

function loadImg(src){
  return new Promise((ok,no)=>{ const im=new Image(); im.onload=()=>ok(im); im.onerror=()=>no(new Error('img load failed')); im.src=src; });
}

/* ---------------------------------------------------------------------
   BAKE — the pixel multiplier every canvas-baked layer (photo, flag) uses.
   It MUST match the `pixelRatio` html-to-image exports at (deck-export.js
   elementToPngBlob → 2), otherwise those layers are upscaled in the PNG while
   the text/SVG layers stay native — which is exactly the "the photo goes
   pixelated" bug colleagues reported: a 1080² photo blown up into a 2160² export.
   --------------------------------------------------------------------- */
export const BAKE = 2;

/* Box-filter halving until the source is within 2× of the target, then one
   high-quality draw. A single big downscale in Chrome uses a cheap filter and
   turns fine detail (roof tiles, foliage, water) into mush. */
function downscaleTo(img, tw, th){
  let src = img, sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  while(sw > tw * 2 && sh > th * 2){
    const nw = Math.max(1, Math.round(sw / 2)), nh = Math.max(1, Math.round(sh / 2));
    const c = document.createElement('canvas'); c.width = nw; c.height = nh;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, nw, nh);
    src = c; sw = nw; sh = nh;
  }
  return { src, sw, sh };
}

/* Pre-crop the background photo to a square data URI via canvas (cover fit,
   object-position 32%/60%) at BAKE× the artboard so the exported PNG gets
   native pixels. Needed because html-to-image honors neither
   <img object-fit:cover> nor a CSS background-image, so the exported photo
   would otherwise be blank. Idempotent per source.
   `spec._photoSrcDims` is left behind so the UI can warn about a low-res upload. */
export async function ensurePhoto(spec){
  if(!spec || spec._photoSquared) return;
  const src = spec.photoDataUrl || spec.photoSrc;
  if(!src) return;
  try{
    const img = await loadImg(src);
    spec._photoSrcDims = [img.naturalWidth || img.width, img.naturalHeight || img.height];
    const W = 1080 * BAKE, H = 1080 * BAKE;
    const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const ir = (img.naturalWidth || img.width) / (img.naturalHeight || img.height), br = W / H;
    let dw, dh; if(ir > br){ dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
    const { src: pre } = downscaleTo(img, dw, dh);
    ctx.filter = 'saturate(0.86) brightness(1.05)';
    ctx.drawImage(pre, (W - dw) * 0.32, (H - dh) * 0.60, dw, dh);
    ctx.filter = 'none';
    // Bake the white pastel wash INTO the photo — a CSS rgba-gradient overlay
    // renders far too opaque through html-to-image, so it must be pre-composited
    // here (keeps preview === export).
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,    'rgba(255,255,255,0.90)');
    g.addColorStop(0.30, 'rgba(255,255,255,0.79)');
    g.addColorStop(0.60, 'rgba(255,255,255,0.69)');
    g.addColorStop(1,    'rgba(255,255,255,0.64)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    spec.photoDataUrl = cnv.toDataURL('image/jpeg', 0.95);
    spec._photoSquared = true;
  }catch(_){ /* keep original as fallback */ }
}

/* Shortest side the source photo needs so the BAKE× square crop is real pixels
   rather than an upscale. Used by the UI to warn on low-res uploads. */
export const PHOTO_MIN_SIDE = 1080 * BAKE;

export function renderCountry(spec, geo){
  const s = spec || {};
  const pal = palette(s.palette);
  const flagHref = s.flagDataUrl
    || ((geo && s.iso && typeof geo.flagHref === 'function') ? geo.flagHref(s.iso) : null);
  const photo = s.photoDataUrl || s.photoSrc;
  const prod = PRODUCT_SRC[s.product] || PRODUCT_SRC.lps;
  const label = PRODUCT_LABEL[s.product] || 'LPS';
  const sub = s.phraseLocal || '';

  const html = `
  <div class="acn" style="--acn-blue:${pal.blue};--acn-red:${pal.red}">
    ${photo ? `<img class="acn-photo" src="${esc(photo)}" alt="">` : `<div class="acn-photo-ph"></div>`}
    ${flagEl(flagHref)}
    ${mapBlock(geo, s.iso, pal.red)}
    <img class="acn-product" src="${esc(prod)}" alt="">
    <div class="acn-lock">
      <img src="${esc(pal.logo)}" alt="Efferon">
      <span>${esc(label)}</span>
    </div>
    <div class="acn-title">
      ${headlineHTML(s)}
      ${sub ? `<div class="acn-sub" style="font-size:${subSize(sub)}px">${withReg(esc(sub))}</div>` : ''}
    </div>
  </div>`;
  return node(html);
}
