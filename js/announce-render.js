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

/* Highlight the emphasis word (e.g. country name) in red inside the EN title. */
function emphasise(phrase, word){
  let h = withReg(esc(phrase));
  const w = (word || '').trim();
  if(w){
    const we = withReg(esc(w));
    h = h.replace(we, `<span class="pl">${we}</span>`);
  }
  return h;
}

/* EN title: break after the brand+product part ("Efferon® LPS") so the
   availability clause ("is available in <Country>") drops to line 2 — matches
   the approved layout for any country/product. Falls back to a plain emphasised
   line when the label can't be located. */
function enTitleHTML(phrase, word, product){
  const label = PRODUCT_LABEL[product] || 'LPS';
  const idx = phrase.indexOf(label);
  if(idx >= 0){
    const cut = idx + label.length;
    const brand = phrase.slice(0, cut);
    const rest = phrase.slice(cut).replace(/^\s+/, '');
    if(rest) return `${emphasise(brand, '')}<br>${emphasise(rest, word)}`;
  }
  return emphasise(phrase, word);
}

const CAL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/><line x1="7" y1="13" x2="9" y2="13"/><line x1="11" y1="13" x2="13" y2="13"/><line x1="15" y1="13" x2="17" y2="13"/><line x1="7" y1="16.5" x2="9" y2="16.5"/><line x1="11" y1="16.5" x2="13" y2="16.5"/></svg>`;
const PIN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c4.5-4.6 7-8 7-11.2A7 7 0 0 0 5 9.8C5 13 7.5 16.4 12 21z"/><circle cx="12" cy="9.6" r="2.6"/></svg>`;
/* exhibition-stand icon for the booth/stand-number row */
const BOOTH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 L4.6 4.6 h14.8 L21 9"/><path d="M4.5 9 v11 h15 V9"/><path d="M9 20 v-5.5 h6 V20"/></svg>`;
/* Shield delivered as an <img> data-URI (export-safe; inline <svg> in an
   absolutely-positioned box does not render reliably through html-to-image). */
const SHIELD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 114"><path d="M50 4 L92 20 V56 C92 84 72 102 50 110 C28 102 8 84 8 56 V20 Z" fill="#e16f79" fill-opacity="0.12" stroke="#e16f79" stroke-width="5" stroke-linejoin="round"/><path d="M34 57 L46 70 L68 44" fill="none" stroke="#e16f79" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SHIELD_URI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SHIELD_SVG);

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
  const conf = s.confLogoDataUrl
    ? `<div class="aev-conf"><img src="${esc(s.confLogoDataUrl)}" alt=""></div>` : '';
  const html = `
  <div class="aev${dev ? ' has-dev' : ''}">
    <div class="aev-stripes"></div>
    ${foreground}
    <div class="aev-content">
      ${s.title ? `<h1 class="aev-headline">${esc(s.title)}</h1>` : ''}
      ${s.lede  ? `<p class="aev-lede">${esc(s.lede)}</p>` : ''}
    </div>
    <div class="aev-card">
      ${s.date ? `<div class="aev-row"><span class="aev-ico">${CAL_ICON}</span><span class="aev-date">${esc(s.date)}</span></div>` : ''}
      ${s.venue ? `<div class="aev-row"><span class="aev-ico">${PIN_ICON}</span><span class="aev-venue">${esc(s.venue)}</span></div>` : ''}
      ${s.address ? `<div class="aev-addr">${esc(s.address)}</div>` : ''}
      ${s.booth ? `<div class="aev-row aev-booth-row"><span class="aev-ico">${BOOTH_ICON}</span><span class="aev-booth">${esc(s.booth)}</span></div>` : ''}
    </div>
    <div class="aev-footer${conf ? ' cobrand' : ''}">
      <img class="aev-eff" src="assets/logo/efferon-logo.svg" alt="Efferon">
      ${conf}
    </div>
  </div>`;
  return node(html);
}

/* ---------------- COUNTRY ---------------- */
/* Flag = a plain <img> (export-safe; an SVG displacement filter breaks
   html-to-image) angled in the top-right, with a soft fold-gradient overlay for
   a cloth feel. Sits UNDER the white wash so it reads pastel. */
function flagEl(href){
  if(!href) return '';
  return `<div class="acn-flag"><img src="${esc(href)}" alt=""></div>`;
}

function mapSVG(geo, iso){
  if(!geo || !iso || typeof geo.countryPathD !== 'function') return '';
  const W = 560, H = 520;
  let d = null;
  try { d = geo.countryPathD(iso, { width: W, height: H, padding: 10 }); } catch(_) { d = null; }
  if(!d) return '';
  // Inline <svg> with ATTRIBUTE fill/stroke (transparent outside the path).
  // (An <img> of an SVG data-URI rasterizes the transparent area to white; the
  // over-opaque radial wash was what previously hid the inline version.)
  return `<div class="acn-map"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="#ffffff" fill-opacity="0.96" stroke="#6472a0" stroke-width="2" stroke-linejoin="round" paint-order="stroke"/></svg></div>`;
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
    const res = await fetch(geo.flagHref(iso));
    let svg = await res.text();
    if(!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace('<svg', '<svg width="640" height="480"');
    const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    const iw = img.naturalWidth || 640, ih = img.naturalHeight || 480;

    // Bake a waving-cloth flag on a canvas (export-safe: an SVG displacement
    // filter breaks html-to-image). Per-column vertical sine displacement +
    // fold light/shadow shading.
    const W = 700, H = 500, amp = 30, waves = 2.15, top = amp + 24, fh = H - top - amp - 24;
    const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext('2d');
    const col = 2; // column slice width
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
    wg.addColorStop(0, 'rgba(255,255,255,0.86)');
    wg.addColorStop(1, 'rgba(255,255,255,0.56)');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    const url = cnv.toDataURL('image/png');
    _flagCache.set(iso, url); spec.flagDataUrl = url; spec._flagIso = iso;
  }catch(_){ /* leave unset — render falls back to the plain href */ }
}

/* Pre-crop the background photo to a square 1080×1080 data URI via canvas
   (cover fit, object-position 32%/60%). Needed because html-to-image honors
   neither <img object-fit:cover> nor a CSS background-image, so the exported
   photo would otherwise be blank. The result is a plain square <img> that
   exports reliably. Idempotent per source. */
function loadImg(src){
  return new Promise((ok,no)=>{ const im=new Image(); im.onload=()=>ok(im); im.onerror=()=>no(new Error('img load failed')); im.src=src; });
}
export async function ensurePhoto(spec){
  if(!spec || spec._photoSquared) return;
  const src = spec.photoDataUrl || spec.photoSrc;
  if(!src) return;
  try{
    const img = await loadImg(src);
    const W = 1080, H = 1080;
    const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext('2d');
    const ir = img.width / img.height, br = W / H;
    let dw, dh; if(ir > br){ dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
    ctx.filter = 'saturate(0.8) brightness(1.06)';
    ctx.drawImage(img, (W - dw) * 0.32, (H - dh) * 0.60, dw, dh);
    ctx.filter = 'none';
    // Bake the white pastel wash INTO the photo — a CSS rgba-gradient overlay
    // renders far too opaque through html-to-image, so it must be pre-composited
    // here (keeps preview === export).
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,    'rgba(255,255,255,0.86)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.66)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.50)');
    g.addColorStop(1,    'rgba(255,255,255,0.46)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    spec.photoDataUrl = cnv.toDataURL('image/jpeg', 0.92);
    spec._photoSquared = true;
  }catch(_){ /* keep original as fallback */ }
}

export function renderCountry(spec, geo){
  const s = spec || {};
  const flagHref = s.flagDataUrl
    || ((geo && s.iso && typeof geo.flagHref === 'function') ? geo.flagHref(s.iso) : null);
  const photo = s.photoDataUrl || s.photoSrc;
  const prod = PRODUCT_SRC[s.product] || PRODUCT_SRC.lps;

  const html = `
  <div class="acn">
    ${photo ? `<img class="acn-photo" src="${esc(photo)}" alt="">` : `<div class="acn-photo-ph"></div>`}
    ${flagEl(flagHref)}
    ${mapSVG(geo, s.iso)}
    <div class="acn-shield">${SHIELD_SVG}</div>
    <img class="acn-product" src="${esc(prod)}" alt="">
    <div class="acn-title">
      ${s.phraseEN ? `<div class="acn-t-en">${enTitleHTML(s.phraseEN, s.emphasis, s.product)}</div>` : ''}
      ${s.phraseLocal ? `<div class="acn-t-pl">${withReg(esc(s.phraseLocal))}</div>` : ''}
    </div>
    <img class="acn-logo" src="assets/logo/efferon-logo.svg" alt="Efferon">
  </div>`;
  return node(html);
}
