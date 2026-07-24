// deck-render.js — Efferon Carousel Studio: Deck Spec DOM renderer.
// Turns a Slide (see js/deck-model.js) into the exact dir-4 artboard DOM/CSS
// that used to be hardcoded in carousel-studio.html. No new data fields are
// invented here — every block reads the exact `data` shape produced by
// js/deck-model.js's demoDeck() (see .superpowers/sdd/task-2-report.md).

import { FORMAT_DIMS } from './deck-model.js';

/* ================= constants ported verbatim from the old inline script ================= */

const LOGO_SRC = 'assets/logo/efferon-logo-white.svg';
const LOGO_SRC_DARK = 'assets/logo/efferon-logo.svg'; // colour logo for the light ground
const HEART_SRC = 'assets/icons/heart%20icon.svg';
const PRODUCT_PHOTO_SRC = 'assets/product/efferon%20neo.png';

const ACCENT_VAR = { coral: 'var(--coral)', blue: 'var(--blue)', violet: 'var(--violet)' };
const ACCENT_HEX = { coral: '#e16f79', blue: '#4568a9', violet: '#896896' };
const COLOR_VAR = { coral: 'var(--coral)', blue: 'var(--blue)', violet: 'var(--violet)', grey: 'var(--mute2)' };

const FIG_SVG_MOCK = `<svg class="fig-svg" viewBox="0 0 620 300" preserveAspectRatio="none">
  <g stroke="#ececf1" stroke-width="1">
    <line x1="0" y1="60" x2="620" y2="60"/><line x1="0" y1="130" x2="620" y2="130"/>
    <line x1="0" y1="200" x2="620" y2="200"/><line x1="0" y1="270" x2="620" y2="270"/>
  </g>
  <polyline fill="none" stroke="#e16f79" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"
    points="10,255 120,215 235,150 350,95 465,60 610,42"/>
  <polyline fill="none" stroke="#4568a9" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".65"
    points="10,262 120,248 235,222 350,196 465,170 610,150"/>
  <circle cx="610" cy="42" r="7" fill="#e16f79"/>
  <circle cx="610" cy="150" r="7" fill="#4568a9" opacity=".65"/>
</svg>`;

/* ================= tiny helpers ================= */

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Escapes HTML, then converts ONLY the fixed color-emphasis tokens
// {{coral:X}} / {{violet:X}} / {{blue:X}} into a tint span. Because we escape
// FIRST, any HTML in the model's text is already inert; we only ever inject our
// own known span wrapper. Token-free input === escapeHtml(input).
export function richText(s) {
  const esc = escapeHtml(s);
  return esc.replace(/\{\{(coral|violet|blue):([\s\S]*?)\}\}/g,
    (_, color, inner) => `<span class="tint tint-${color}">${inner}</span>`);
}

// Resolves a data-supplied path (may contain spaces) to a URL-safe src.
// Leaves data: URIs and absolute http(s) URLs untouched.
function resolveSrc(path) {
  if (!path) return null;
  if (path.startsWith('data:') || /^https?:\/\//.test(path)) return path;
  return path.replace(/ /g, '%20');
}

function heartsHTML(filled, total) {
  let h = '';
  for (let i = 0; i < total; i++) {
    h += `<img class="heart${i < filled ? '' : ' faint'}" src="${HEART_SRC}" alt="">`;
  }
  return h;
}

function checkIconSVG(hex) {
  return `<svg class="bub-ic" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="19" fill="${hex}" opacity=".13"/><path d="M12 20.6l5.4 5.4L28 14" stroke="${hex}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function splitArrow(text) {
  const m = /^(.*?)\s*(→)$/.exec(text || '');
  return m ? { label: m[1], arrow: m[2] } : { label: text || '', arrow: '' };
}

/* ---- chart-block helpers (column / lineplot) ---- */

// Rounds v up to a "nice" axis ceiling (1/2/5/10 × a power of ten) so gridline
// labels read as clean numbers instead of arbitrary decimals.
function niceCeil(v) {
  if (!isFinite(v) || v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let step;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * mag;
}

function fmtTick(n) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

// Path for a bar rounded only on its top two corners (y = top edge of the bar).
function roundedTopBarPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, Math.max(h, 0)));
  if (h <= 0) return '';
  if (rr <= 0.5) return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`;
}

// Resolves a block's accent color: an explicit per-item/per-series override
// (blue/coral/violet) wins; otherwise falls back to the slide's own accent.
function chartColor(explicit, ctx) {
  if (explicit && COLOR_VAR[explicit]) return COLOR_VAR[explicit];
  return ACCENT_VAR[(ctx && ctx.style && ctx.style.accent) || 'coral'] || ACCENT_VAR.coral;
}

/* ================= one function per block type ================= */
/* Each takes (data, ctx) where ctx = { style, asset } and returns an HTML string
   for the block's own content (to be placed inside .c-body, or used directly by
   the cover/closing/quote shells). */

export function renderBignumber(data) {
  const items = data.items || [];
  if (items.length >= 2) {
    const stats = items.map((it) => `
      <div class="stat">
        <div class="statnum tnum">${escapeHtml(it.value)}<span class="s">${escapeHtml(it.unit || '')}</span></div>
        <div class="statcap">${richText(it.label || '')}</div>
      </div>`).join('');
    return `<div class="statwrap">${stats}</div>`;
  }
  const it = items[0] || {};
  return `<div class="heroblock">
    <div class="hero-num tnum">${escapeHtml(it.value)}<span class="s">${escapeHtml(it.unit || '')}</span></div>
    <div class="hero-num-cap">${richText(it.label || '')}</div>
  </div>`;
}

export function renderBarset(data) {
  const bars = (data.bars || []).map((b) => {
    const arrow = b.dir === 'up' ? '↑' : '↓';
    const cls = b.win ? 'win' : 'ctrl';
    return `
    <div class="cbar ${cls}">
      <div class="cbar-head"><span class="cbar-sw ${cls}"></span><span class="cbar-name">${richText(b.name)}</span><span class="cbar-pct"><span class="ar">${arrow}</span>${escapeHtml(b.pct)}<span class="u">%</span></span></div>
      <div class="cbar-track"><div class="cbar-fill ${cls}" style="width:${Number(b.pct) || 0}%"></div></div>
      <div class="cbar-sub">${richText(b.sub || '')}</div>
    </div>`;
  }).join('');
  return `<div class="cmp">${bars}</div>`;
}

export function renderKpis(data) {
  const items = (data.items || []).map((it) => `
    <div class="kpi"><div class="k-lead label"><span class="dot ${it.dot || 'blue'}"></span>${richText(it.label)}</div><div class="num k-num tnum">${escapeHtml(it.num)}</div><div class="support k-sub">${richText(it.sub || '')}</div></div>`).join('');
  return `<div class="kpigrid">${items}</div>`;
}

export function renderMarkers(data) {
  const items = (data.items || []).map((it) => `
    <div class="marker-item"><span class="marker-dot" style="background:${COLOR_VAR[it.color] || 'var(--coral)'}"></span><span class="marker-label">${richText(it.label || '')}</span>${it.value != null ? `<span class="marker-val tnum">${escapeHtml(it.value)}</span>` : ''}</div>`).join('');
  return `<div class="markers-row">${items}</div>`;
}

export function renderIconarray(data) {
  const columns = data.columns || [];
  // No pictogram data → don't strand the caption at the bottom of an empty card.
  // Render the sentence as a readable statement instead (the key point, not a
  // muted footnote). The planner should give columns; this is the safety net.
  if (!columns.length) {
    return data.note ? `<div class="c-statement">${richText(data.note)}</div>` : '';
  }
  const cols = columns.map((c, i) => {
    const m = /^([\d.]+)(.*)$/.exec(String(c.pct));
    const num = m ? m[1] : c.pct;
    const unit = m ? m[2] : '';
    const isLead = i === 0;
    return `
    <div class="iso-col">
      <div class="iso-grid">${heartsHTML(c.filled, c.total)}</div>
      <div class="iso-pctnum${isLead ? '' : ' mut'} tnum">${escapeHtml(num)}<span style="font-size:.5em;${isLead ? 'color:var(--accent-color, var(--coral))' : ''}">${escapeHtml(unit)}</span></div>
      <div class="iso-lab">${isLead ? `<b>${richText(c.label)}</b>` : richText(c.label)}</div>
    </div>`;
  }).join('');
  const note = data.note ? `<div class="iso-note">${richText(data.note)}</div>` : '';
  return `<div class="iso">${cols}</div>${note}`;
}

export function renderCircles(data) {
  const items = (data.items || []).map((it) => {
    const pctNum = Number(it.pct) || 0;
    const color = COLOR_VAR[it.color] || 'var(--accent-color, var(--coral))';
    return `<div class="circle-item">
      <div class="circle-ring" style="background:conic-gradient(${color} ${pctNum * 3.6}deg, var(--faint) 0)"><div class="circle-inner tnum">${escapeHtml(it.pct)}</div></div>
      <div class="circle-label">${richText(it.label || '')}</div>
    </div>`;
  }).join('');
  return `<div class="circles-row">${items}</div>`;
}

export function renderCheckgrid(data, ctx) {
  const accentHex = ACCENT_HEX[ctx && ctx.style && ctx.style.accent] || ACCENT_HEX.coral;
  const items = (data.items || []).map((label) => `
    <div class="bubble">${checkIconSVG(accentHex)}<span class="bub-txt">${richText(label)}</span></div>`).join('');
  return `<div class="bubbles">${items}</div>`;
}

export function renderQuote(data, ctx) {
  // Self-contained fallback for generic-card dispatch (block-type symmetry with
  // the other 9 renderers). The real `quote` role slide does NOT go through
  // this path — its qauthor row sits as a sibling of .c-body, not inside it —
  // see renderQuoteShell() below, which is what demoDeck()'s quote slide uses.
  const asset = (ctx && ctx.asset) || {};
  const avatarSrc = asset.dataUrl ? resolveSrc(asset.dataUrl) : null;
  const avatarInner = avatarSrc ? `<img src="${avatarSrc}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">` : '';
  return `
    <div class="quote-body"><span><span class="mark">“</span>${richText(data.text || '')}<span class="mark">”</span></span></div>
    <div class="qauthor">
      <div class="qavatar">${avatarInner}</div>
      <div><div class="qname">${escapeHtml(data.author || '')}</div><div class="qaff">${escapeHtml(data.affiliation || '')}</div></div>
    </div>`;
}

export function renderPhotofigure(data, ctx) {
  const asset = (ctx && ctx.asset) || {};
  if (data.legend && data.legend.length) {
    const legendHTML = (data.legend || []).map((l) => `<span><i style="background:${COLOR_VAR[l.color] || l.color}"></i>${escapeHtml(l.label)}</span>`).join('');
    const chart = asset.dataUrl
      ? `<img src="${resolveSrc(asset.dataUrl)}" alt="" style="flex:1;min-height:0;width:100%;object-fit:contain;">`
      : FIG_SVG_MOCK;
    return `<div class="figbox">
      <div class="fig-legend">${legendHTML}</div>
      ${chart}
      <div class="fig-cap">${escapeHtml(data.caption || '')}</div>
    </div>`;
  }
  const src = resolveSrc(asset.dataUrl || data.src);
  if (src) {
    return `<div class="figbox" style="align-items:center;justify-content:center;"><img src="${src}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`;
  }
  return `<div class="figbox" style="align-items:center;justify-content:center;color:var(--mute);font-size:var(--fs-support);">No image</div>`;
}

export function renderText(data) {
  const v = data.variant;
  if (v === 'term') {
    const accent = data.accent === 'violet' ? 'violet' : (data.accent === 'blue' ? 'blue' : 'coral');
    const aside = data.aside
      ? `<div class="tx-aside"><div class="tx-aside-lbl">${escapeHtml(data.aside.label || '')}</div><div class="tx-aside-q">${richText(data.aside.text || '')}</div></div>`
      : '';
    return `<div class="tx-termblock">
      <div class="ds-term ${accent}">${escapeHtml(data.term || '')}</div>
      <div class="tx-def">${richText(data.def || '')}</div>
      ${aside}
    </div>`;
  }
  if (v === 'tradeoff') {
    // Each part is rendered ONLY if present, and its text is exactly what the
    // data says — no renderer-injected dash/punctuation — so a chat edit to the
    // wording (or emptying a part) is always reflected verbatim.
    const line = (cls, s) => (s && String(s).trim()) ? `<div class="${cls}">${richText(s)}</div>` : '';
    return `<div class="tx-tradeoff">
      ${line('tx-plain', data.plain)}
      ${line('tx-pivot', data.pivot)}
      ${line('tx-cost', data.cost)}
    </div>`;
  }
  if (v === 'qualities') {
    const lead = data.def ? `<div class="tx-def">${richText(data.def)}</div>` : '';
    const lines = (data.items || []).map((it) =>
      `<div class="q-line"><span class="q-dot"></span><span>${richText(it)}</span></div>`).join('');
    return `<div class="tx-qualities">${lead}<div class="q-list">${lines}</div></div>`;
  }
  // Default: a standalone statement — large and readable (dark ink).
  return `<div class="c-statement">${richText(data.text || '')}</div>`;
}

// Vertical bar chart — one bar per category/time point. Native inline SVG,
// scales to fill the card body via viewBox + width/height 100%.
export function renderColumn(data, ctx) {
  const items = data.items || [];
  const values = items.map((it) => Number(it.value) || 0);
  const rawMax = Math.max(0, ...values);
  const axisMax = niceCeil(rawMax * 1.15);
  const color = chartColor(data.color, ctx);

  const W = 900, H = 560;
  const hasYInfo = !!(data.ylabel || data.unit);
  const marginLeft = 62, marginRight = 24;
  const marginTop = hasYInfo ? 76 : 56;
  const marginBottom = 76;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;
  const baseline = marginTop + plotH;

  const n = Math.max(items.length, 1);
  const slot = plotW / n;
  const barW = Math.min(130, slot * 0.44);

  const ticks = [0, axisMax / 2, axisMax];
  const gridHTML = ticks.map((t) => {
    const y = baseline - (t / axisMax) * plotH;
    return `<line x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${(W - marginRight).toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${(marginLeft - 14).toFixed(1)}" y="${(y + 7).toFixed(1)}" text-anchor="end" font-size="24" font-weight="500" fill="var(--mute)" style="font-variant-numeric:tabular-nums">${fmtTick(t)}</text>`;
  }).join('');

  const ylabelHTML = hasYInfo
    ? `<text x="${marginLeft}" y="${(marginTop - 32).toFixed(1)}" font-size="24" font-weight="500" fill="var(--mute)">${escapeHtml([data.ylabel, data.unit].filter(Boolean).join(', '))}</text>`
    : '';

  const barsHTML = items.map((it, i) => {
    const v = values[i];
    const barH = Math.max(0, (v / axisMax) * plotH);
    const x = marginLeft + slot * i + (slot - barW) / 2;
    const y = baseline - barH;
    const r = Math.min(16, barW / 2, barH);
    const path = roundedTopBarPath(x, y, barW, barH, r);
    const cx = x + barW / 2;
    const unitTspan = data.unit ? `<tspan font-size="16" font-weight="700">${escapeHtml(data.unit)}</tspan>` : '';
    // Edge bars anchor their labels inward (start/end) instead of centering,
    // so a wide value/category label can't overflow past the SVG's edge.
    const anchor = i === 0 ? 'start' : (i === items.length - 1 ? 'end' : 'middle');
    const lx = anchor === 'start' ? x : (anchor === 'end' ? x + barW : cx);
    return `
    <path class="chart-bar" d="${path}" style="fill:${color}"/>
    <text x="${lx.toFixed(1)}" y="${(y - 16).toFixed(1)}" text-anchor="${anchor}" font-size="32" font-weight="700" fill="var(--ink)" style="font-variant-numeric:tabular-nums">${escapeHtml(it.value)}${unitTspan}</text>
    <text x="${lx.toFixed(1)}" y="${(baseline + 40).toFixed(1)}" text-anchor="${anchor}" font-size="24" font-weight="500" fill="var(--mute)">${escapeHtml(it.label || '')}</text>`;
  }).join('');

  return `<div class="chart-box"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    ${gridHTML}
    ${ylabelHTML}
    <line x1="${marginLeft}" y1="${baseline}" x2="${(W - marginRight).toFixed(1)}" y2="${baseline}" stroke="var(--line)" stroke-width="1.5"/>
    ${barsHTML}
  </svg></div>`;
}

// Line/trend chart — 1-3 series over shared x labels. Native inline SVG,
// scales to fill the card body via viewBox + width/height 100%.
export function renderLineplot(data, ctx) {
  const xlabels = data.xlabels || [];
  const series = data.series || [];
  const allPoints = series.flatMap((s) => (s.points || []).map((p) => Number(p) || 0));
  let lo = allPoints.length ? Math.min(...allPoints) : 0;
  let hi = allPoints.length ? Math.max(...allPoints) : 1;
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  const axisMin = lo - pad;
  const axisMax = hi + pad;
  const span = (axisMax - axisMin) || 1;

  const W = 900, H = 520;
  const hasYInfo = !!data.ylabel;
  const marginLeft = 66, marginRight = 24;
  const marginTop = hasYInfo ? 58 : 32;
  const marginBottom = 60;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;
  const baseline = marginTop + plotH;

  const m = Math.max(xlabels.length, 1);
  const xAt = (j) => marginLeft + (m > 1 ? (plotW * j) / (m - 1) : plotW / 2);
  const yAt = (v) => baseline - ((v - axisMin) / span) * plotH;

  const ticks = [axisMin, axisMin + (axisMax - axisMin) / 2, axisMax];
  const gridHTML = ticks.map((t) => {
    const y = yAt(t);
    return `<line x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${(W - marginRight).toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${(marginLeft - 14).toFixed(1)}" y="${(y + 7).toFixed(1)}" text-anchor="end" font-size="24" font-weight="500" fill="var(--mute)" style="font-variant-numeric:tabular-nums">${fmtTick(t)}</text>`;
  }).join('');

  const ylabelHTML = hasYInfo
    ? `<text x="${marginLeft}" y="${(marginTop - 30).toFixed(1)}" font-size="24" font-weight="500" fill="var(--mute)">${escapeHtml(data.ylabel)}</text>`
    : '';

  const xlabelsHTML = xlabels.map((l, j) => {
    const x = xAt(j);
    // First/last labels anchor to their tick rather than centering on it, so
    // they grow inward instead of overflowing past the SVG's left/right edge.
    const anchor = j === 0 ? 'start' : (j === xlabels.length - 1 ? 'end' : 'middle');
    return `<text x="${x.toFixed(1)}" y="${(baseline + 38).toFixed(1)}" text-anchor="${anchor}" font-size="24" font-weight="500" fill="var(--mute)">${escapeHtml(l)}</text>`;
  }).join('');

  // Default rotation of accent colours: the slide's own accent first, then
  // the other two, so a 2-3 series chart never repeats a colour unnecessarily.
  const accentKey = (ctx && ctx.style && ctx.style.accent) || 'coral';
  const rotation = [accentKey, ...['coral', 'blue', 'violet'].filter((c) => c !== accentKey)];

  const seriesHTML = series.map((s, i) => {
    const color = s.color && COLOR_VAR[s.color] ? COLOR_VAR[s.color] : (ACCENT_VAR[rotation[i % rotation.length]] || ACCENT_VAR.coral);
    const pts = (s.points || []).map((p, j) => [xAt(j), yAt(Number(p) || 0)]);
    const pointsAttr = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const areaHTML = series.length === 1 && pts.length
      ? `<polygon points="${pointsAttr} ${pts[pts.length - 1][0].toFixed(1)},${baseline} ${pts[0][0].toFixed(1)},${baseline}" style="fill:${color}" opacity="0.08"/>`
      : '';
    const dotsHTML = pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" style="fill:${color}"/>`).join('');
    return `
    ${areaHTML}
    <polyline class="chart-line" points="${pointsAttr}" fill="none" style="stroke:${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dotsHTML}`;
  }).join('');

  const showLegend = series.length > 1 || (series.length === 1 && series[0] && series[0].name);
  const legendHTML = showLegend
    ? `<div class="chart-legend">${series.map((s, i) => {
        const color = s.color && COLOR_VAR[s.color] ? COLOR_VAR[s.color] : (ACCENT_VAR[rotation[i % rotation.length]] || ACCENT_VAR.coral);
        return `<span><i style="background:${color}"></i>${escapeHtml(s.name || '')}</span>`;
      }).join('')}</div>`
    : '';

  return `<div class="chart-box">${legendHTML}<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    ${gridHTML}
    ${ylabelHTML}
    <line x1="${marginLeft}" y1="${baseline}" x2="${(W - marginRight).toFixed(1)}" y2="${baseline}" stroke="var(--line)" stroke-width="1.5"/>
    ${xlabelsHTML}
    ${seriesHTML}
  </svg></div>`;
}

// Grouped bar chart — N groups, each with M bars side by side. Native inline
// SVG in the brand style. Reproduces paired clinical comparisons one-to-one
// (e.g. pSOFA Day 1 vs Day 7; markers Day 1 vs Day 2). Value printed above each
// bar; group label below; optional per-group significance pill; optional legend.
// normalize: 'global' (all bars share one scale) or 'pergroup' (each group
// scaled to its own max — needed when magnitudes differ wildly, e.g. 700 vs 8).
export function renderGroupbars(data, ctx) {
  const groups = data.groups || [];
  const legend = data.legend || [];
  const perGroup = data.normalize === 'pergroup';

  // Tall viewBox (close to the card-body aspect) so the chart fills the space
  // instead of letterboxing with air above/below; wide bars, tight side margins.
  const W = 900, H = 720;
  const marginLeft = 14, marginRight = 14;
  const marginTop = 70, marginBottom = 100;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;
  const baseline = marginTop + plotH;

  // No y-axis ticks here, so no need to round to a "nice" max — use the raw
  // peak plus a little headroom for the value labels, so bars fill the plot.
  const allVals = groups.flatMap((g) => (g.bars || []).map((b) => Number(b.value) || 0));
  const globalMax = Math.max(1, ...allVals) * 1.14;

  const nG = Math.max(groups.length, 1);
  const groupSlot = plotW / nG;
  const groupPad = groupSlot * 0.12;          // gap between groups
  const innerW = groupSlot - groupPad;
  const barGap = innerW * 0.08;

  // A hatch pattern per accent colour (Day-1 "outline" bars). Namespaced by the
  // chart's content so two group-bar charts in one document never clash.
  const token = 'gb' + nG + (legend.map((l) => l.label).join('') || '').replace(/[^a-z0-9]/gi, '').slice(0, 8);
  const usedHatch = {};
  const defs = [];
  const hatchId = (colorKey) => {
    const id = `${token}-h-${colorKey}`;
    if (!usedHatch[id]) {
      usedHatch[id] = true;
      const hex = ACCENT_HEX[colorKey] || ACCENT_HEX.blue;
      defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(45)">
        <rect width="14" height="14" fill="${hex}" opacity="0.06"/>
        <line x1="0" y1="0" x2="0" y2="14" stroke="${hex}" stroke-width="3" opacity="0.42"/></pattern>`);
    }
    return id;
  };

  let bars = '';
  let labels = '';
  let pills = '';
  groups.forEach((g, gi) => {
    const gx = marginLeft + groupSlot * gi + groupPad / 2;
    const gbars = g.bars || [];
    const m = Math.max(gbars.length, 1);
    const barW = Math.min(160, (innerW - barGap * (m - 1)) / m);
    const localMax = perGroup ? Math.max(1, ...gbars.map((b) => Number(b.value) || 0)) * 1.14 : globalMax;
    const groupCx = gx + innerW / 2;

    gbars.forEach((b, bi) => {
      const v = Number(b.value) || 0;
      const barH = Math.max(2, (v / localMax) * plotH);
      const x = gx + (innerW - (barW * m + barGap * (m - 1))) / 2 + bi * (barW + barGap);
      const y = baseline - barH;
      const r = Math.min(14, barW / 2, barH);
      const colorKey = b.color || 'blue';
      const hex = ACCENT_HEX[colorKey] || ACCENT_HEX.blue;
      const path = roundedTopBarPath(x, y, barW, barH, r);
      if (b.style === 'hatch') {
        bars += `<path d="${path}" fill="url(#${hatchId(colorKey)})" stroke="${hex}" stroke-width="2.5" stroke-opacity="0.55"/>`;
      } else {
        bars += `<path class="chart-bar" d="${path}" style="fill:${hex}"/>`;
      }
      const disp = b.display != null ? b.display : b.value;
      labels += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 16).toFixed(1)}" text-anchor="middle" font-size="34" font-weight="700" fill="var(--ink)" style="font-variant-numeric:tabular-nums">${escapeHtml(disp)}</text>`;
    });

    // group label (may carry a unit on a second line via "\n")
    const parts = String(g.label || '').split('\n');
    labels += parts.map((p, pi) =>
      `<text x="${groupCx.toFixed(1)}" y="${(baseline + 40 + pi * 30).toFixed(1)}" text-anchor="middle" font-size="26" font-weight="${pi === 0 ? 500 : 400}" fill="var(--mute)">${escapeHtml(p)}</text>`).join('');

    if (g.p) {
      const pw = 150, ph = 40, px = groupCx - pw / 2, py = 8;
      pills += `<g><rect x="${px.toFixed(1)}" y="${py}" width="${pw}" height="${ph}" rx="20" fill="var(--faint)"/>
        <text x="${groupCx.toFixed(1)}" y="${(py + 27).toFixed(1)}" text-anchor="middle" font-size="23" font-weight="500" fill="var(--mute)">${escapeHtml(g.p)}</text></g>`;
    }
  });

  const legendHTML = legend.length
    ? `<div class="chart-legend">${legend.map((l) => {
        const hex = ACCENT_HEX[l.color] || ACCENT_HEX.blue;
        const swatch = l.style === 'hatch'
          ? `<i style="width:22px;height:14px;border-radius:4px;background:${hex}1f;border:2px solid ${hex}"></i>`
          : `<i style="width:22px;height:14px;border-radius:4px;background:${hex}"></i>`;
        return `<span>${swatch}${escapeHtml(l.label)}</span>`;
      }).join('')}</div>`
    : '';

  return `<div class="chart-box">${legendHTML}<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    <defs>${defs.join('')}</defs>
    ${pills}
    <line x1="${marginLeft}" y1="${baseline}" x2="${(W - marginRight).toFixed(1)}" y2="${baseline}" stroke="var(--line)" stroke-width="1.5"/>
    ${bars}
    ${labels}
  </svg></div>`;
}

/* ================= concept forms (soft-illustrative, ported from typo-explore) =============
   These blocks render an idea as a soft illustration + D4 type INSIDE .c-body.
   The card shell still supplies the kicker (eyebrow) + lede (heading) + title +
   logo + badge, so the existing card design code is untouched. SVG is ported
   verbatim from the approved demos c1-diptych.html / c2-sieve.html / c3-surface.html. */

// A small named soft-glyph (used in diptych panels). Ported from c1-diptych.html.
function conceptGlyph(name) {
  const G = {
    sieve: `<svg viewBox="0 0 240 210" role="img" aria-label="Filtration: particles separated by size">
      <circle cx="88" cy="38" r="23" fill="rgba(225,111,121,.42)"/>
      <circle cx="150" cy="42" r="19" fill="rgba(225,111,121,.42)"/>
      <rect x="22" y="84" width="196" height="38" rx="19" fill="rgba(225,111,121,.34)"/>
      <circle cx="54" cy="103" r="10" fill="#f6ebec"/><circle cx="94" cy="103" r="10" fill="#f6ebec"/>
      <circle cx="134" cy="103" r="10" fill="#f6ebec"/><circle cx="174" cy="103" r="10" fill="#f6ebec"/>
      <circle cx="66" cy="150" r="8" fill="#e16f79"/><circle cx="108" cy="168" r="8" fill="#e16f79"/>
      <circle cx="150" cy="152" r="8" fill="#e16f79"/><circle cx="188" cy="170" r="8" fill="#e16f79"/></svg>`,
    surface: `<svg viewBox="0 0 240 210" role="img" aria-label="Adsorption: molecules binding to a surface">
      <circle cx="120" cy="120" r="66" fill="rgba(137,104,150,.22)"/>
      <circle cx="120" cy="120" r="46" fill="rgba(137,104,150,.12)"/>
      <circle cx="120" cy="54" r="10" fill="#896896"/><circle cx="167" cy="73" r="10" fill="#896896"/>
      <circle cx="73" cy="73" r="10" fill="#896896"/><circle cx="56" cy="110" r="10" fill="#896896"/>
      <circle cx="184" cy="110" r="10" fill="#896896"/>
      <circle cx="150" cy="28" r="9" fill="rgba(137,104,150,.5)"/><circle cx="92" cy="24" r="9" fill="rgba(137,104,150,.5)"/></svg>`,
    membrane: `<svg viewBox="0 0 240 210" role="img" aria-label="A porous membrane">
      <rect x="22" y="86" width="196" height="38" rx="19" fill="rgba(69,104,169,.30)"/>
      <circle cx="54" cy="105" r="10" fill="#eef2f8"/><circle cx="94" cy="105" r="10" fill="#eef2f8"/>
      <circle cx="134" cy="105" r="10" fill="#eef2f8"/><circle cx="174" cy="105" r="10" fill="#eef2f8"/></svg>`,
    cluster: `<svg viewBox="0 0 240 210" role="img" aria-label="A cluster of molecules">
      <circle cx="120" cy="105" r="60" fill="rgba(137,104,150,.14)"/>
      <circle cx="100" cy="88" r="14" fill="#896896"/><circle cx="140" cy="96" r="14" fill="#896896"/>
      <circle cx="118" cy="128" r="14" fill="#896896"/></svg>`,
  };
  return G[name] || '';
}

// diptych — contrast two concepts side by side (left coral, right violet).
export function renderDiptych(data) {
  const L = data.left || {}, R = data.right || {};
  const panel = (d, accent) => `<div class="dip-panel ${accent}">
      <div class="dip-glyph">${conceptGlyph(d.glyph)}</div>
      <div class="dip-term">${escapeHtml(d.term || '')}</div>
      <div class="dip-sub">${richText(d.line || '')}</div>
    </div>`;
  return `<div class="diptych">
    ${panel(L, 'coral')}
    <div class="dip-vs">vs</div>
    ${panel(R, 'violet')}
  </div>`;
}

// sieve — the filtration metaphor (membrane separating particles by size).
// Illustration SVG ported verbatim from c2-sieve.html.
export function renderSieve(data) {
  const term = data.term || 'Filtration';
  const aside = data.aside
    ? `<div class="cf-aside"><span class="lbl">${escapeHtml(data.aside.label || '')}</span><span class="q">${richText(data.aside.text || '')}</span></div>`
    : '';
  return `<div class="cf-sieve">
    <div class="cf-illo" aria-hidden="true"><svg viewBox="0 0 780 470" role="img">
      <defs>
        <linearGradient id="cfBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7c6ca"/><stop offset="1" stop-color="#eba1a9"/></linearGradient>
        <filter id="cfSoft" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#2b2f56" flood-opacity="0.10"/></filter>
        <filter id="cfSoftlite" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#2b2f56" flood-opacity="0.09"/></filter>
      </defs>
      <g filter="url(#cfSoftlite)">
        <circle cx="98" cy="150" r="18" fill="#f2b3b8"/><circle cx="150" cy="92" r="16" fill="#ccb9d6"/>
        <circle cx="252" cy="66" r="17" fill="#b3c3e6"/><circle cx="404" cy="58" r="15" fill="#f2b3b8"/>
        <circle cx="446" cy="150" r="16" fill="#b3c3e6"/><circle cx="640" cy="112" r="18" fill="#ccb9d6"/>
        <circle cx="678" cy="188" r="15" fill="#f2b3b8"/>
        <circle cx="300" cy="106" r="39" fill="#89a2d1"/><circle cx="505" cy="92" r="45" fill="#a98ab8"/>
        <circle cx="176" cy="199" r="47" fill="#a98ab8"/><circle cx="368" cy="192" r="53" fill="#e88f97"/><circle cx="588" cy="203" r="43" fill="#89a2d1"/>
      </g>
      <g filter="url(#cfSoft)"><rect x="48" y="248" width="684" height="54" rx="27" fill="url(#cfBand)"/></g>
      <g fill="#ffffff">
        <circle cx="128" cy="275" r="15"/><circle cx="238" cy="275" r="15"/><circle cx="348" cy="275" r="15"/>
        <circle cx="458" cy="275" r="15"/><circle cx="568" cy="275" r="15"/><circle cx="668" cy="275" r="15"/>
      </g>
      <g filter="url(#cfSoftlite)"><circle cx="238" cy="278" r="13" fill="#ccb9d6"/><circle cx="458" cy="300" r="13" fill="#b3c3e6"/></g>
      <g filter="url(#cfSoftlite)">
        <g opacity="0.95"><circle cx="176" cy="338" r="17" fill="#ccb9d6"/><circle cx="362" cy="344" r="16" fill="#f2b3b8"/><circle cx="560" cy="336" r="15" fill="#b3c3e6"/></g>
        <g opacity="0.85"><circle cx="108" cy="396" r="15" fill="#f2b3b8"/><circle cx="272" cy="400" r="18" fill="#b3c3e6"/><circle cx="440" cy="392" r="16" fill="#ccb9d6"/><circle cx="620" cy="402" r="15" fill="#f2b3b8"/></g>
        <g opacity="0.72"><circle cx="210" cy="448" r="16" fill="#b3c3e6"/><circle cx="382" cy="454" r="15" fill="#ccb9d6"/><circle cx="520" cy="446" r="17" fill="#f2b3b8"/><circle cx="668" cy="452" r="14" fill="#ccb9d6"/></g>
      </g>
    </svg></div>
    <h2 class="ds-term coral">${escapeHtml(term)}</h2>
    <div class="tx-def">${richText(data.def || '')}</div>
    ${aside}
  </div>`;
}

// surface — the adsorption metaphor (molecules binding to a sorbent surface +
// a shape-matched ligand). Illustration SVG ported verbatim from c3-surface.html.
export function renderSurface(data) {
  const term = data.term || 'Adsorption';
  const note = data.note
    ? `<div class="cf-note">${richText(data.note)}</div>`
    : '';
  return `<div class="cf-surface">
    <div class="cf-illo" aria-hidden="true"><svg viewBox="0 0 760 470" role="img">
      <defs>
        <radialGradient id="cfSorbent" cx="64%" cy="42%" r="72%"><stop offset="0%" stop-color="rgba(137,104,150,.26)"/><stop offset="62%" stop-color="rgba(137,104,150,.17)"/><stop offset="100%" stop-color="rgba(137,104,150,.12)"/></radialGradient>
        <radialGradient id="cfDotV" cx="38%" cy="32%" r="80%"><stop offset="0%" stop-color="rgba(151,120,164,.62)"/><stop offset="100%" stop-color="rgba(137,104,150,.42)"/></radialGradient>
        <radialGradient id="cfDotVfaint" cx="38%" cy="32%" r="80%"><stop offset="0%" stop-color="rgba(151,120,164,.34)"/><stop offset="100%" stop-color="rgba(137,104,150,.20)"/></radialGradient>
        <radialGradient id="cfCoral" cx="36%" cy="30%" r="82%"><stop offset="0%" stop-color="rgba(233,131,141,.98)"/><stop offset="100%" stop-color="rgba(219,104,114,.9)"/></radialGradient>
        <filter id="cfSoft2" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="rgba(90,66,104,.20)"/></filter>
        <filter id="cfSofter" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="rgba(90,66,104,.16)"/></filter>
        <mask id="cfPocket"><rect x="0" y="0" width="760" height="470" fill="#fff"/><circle cx="382" cy="221" r="21" fill="#000"/><circle cx="382" cy="259" r="21" fill="#000"/></mask>
      </defs>
      <ellipse cx="575" cy="430" rx="196" ry="20" fill="rgba(90,66,104,.10)"/>
      <g filter="url(#cfSoft2)"><path mask="url(#cfPocket)" fill="url(#cfSorbent)" d="M 585 42 C 690 40 760 118 760 240 C 760 372 686 436 578 434 C 470 432 402 402 378 344 C 362 306 372 286 372 240 C 372 196 360 172 380 132 C 404 84 484 44 585 42 Z"/></g>
      <circle cx="404" cy="86" r="23" fill="url(#cfDotV)" filter="url(#cfSofter)"/>
      <circle cx="372" cy="128" r="30" fill="url(#cfDotV)" filter="url(#cfSofter)"/>
      <circle cx="350" cy="176" r="24" fill="url(#cfDotV)" filter="url(#cfSofter)"/>
      <circle cx="352" cy="306" r="25" fill="url(#cfDotV)" filter="url(#cfSofter)"/>
      <circle cx="376" cy="350" r="31" fill="url(#cfDotV)" filter="url(#cfSofter)"/>
      <circle cx="410" cy="392" r="22" fill="url(#cfDotV)" filter="url(#cfSofter)"/>
      <circle cx="250" cy="170" r="22" fill="url(#cfDotVfaint)"/><circle cx="196" cy="292" r="18" fill="url(#cfDotVfaint)"/>
      <circle cx="150" cy="228" r="14" fill="url(#cfDotVfaint)"/><circle cx="96" cy="322" r="10" fill="rgba(137,104,150,.14)"/>
      <g filter="url(#cfSofter)"><circle cx="366" cy="224" r="16" fill="url(#cfCoral)"/><circle cx="366" cy="256" r="16" fill="url(#cfCoral)"/><circle cx="340" cy="240" r="16" fill="url(#cfCoral)"/></g>
      <g opacity=".72" transform="rotate(-12 150 118)"><circle cx="162" cy="106" r="13" fill="url(#cfCoral)"/><circle cx="162" cy="132" r="13" fill="url(#cfCoral)"/><circle cx="140" cy="119" r="13" fill="url(#cfCoral)"/></g>
    </svg></div>
    <h2 class="ds-term violet">${escapeHtml(term)}</h2>
    <div class="tx-def">${richText(data.def || '')}</div>
    ${note}
  </div>`;
}

/* ================= explainer media blocks (additive) =================
   Media zone for the "explainer" slide layout: a rounded image grid, or a
   clean white-card chart. A single image uses the existing photofigure block. */
const IMG_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/></svg>';
const CHART_HEX = { blue: '#4568a9', coral: '#e16f79', violet: '#896896', teal: '#21b9aa' };

export function renderMediagrid(data) {
  const imgs = Array.isArray(data.images) ? data.images : [];
  const chips = Array.isArray(data.chips) ? data.chips : [];
  const tile = (i, cls) => {
    const src = imgs[i] ? resolveSrc(imgs[i]) : '';
    const inner = src ? `<img src="${src}" alt="">` : `<span class="mglyph">${IMG_GLYPH}</span>`;
    const chip = chips[i] ? `<span class="mchip">${escapeHtml(chips[i])}</span>` : '';
    return `<div class="mtile ${cls}">${inner}${chip}</div>`;
  };
  return `<div class="mgrid"><div class="mcol">${tile(0, 'mbig')}${tile(1, 'mwide')}</div><div class="mcol">${tile(2, 'mtr')}${tile(3, 'mbr')}</div></div>`;
}

export function renderMediaimage(data) {
  const src = (Array.isArray(data.images) && data.images[0]) ? resolveSrc(data.images[0]) : '';
  const inner = src ? `<img src="${src}" alt="">` : `<span class="mglyph">${IMG_GLYPH}</span>`;
  const chip = data.chip ? `<span class="mchip">${escapeHtml(data.chip)}</span>` : '';
  return `<div class="mgrid mgrid--one"><div class="mtile mone">${inner}${chip}</div></div>`;
}

export function renderMediachart(data) {
  const bars = Array.isArray(data.bars) ? data.bars : [];
  const n = bars.length || 1;
  const max = Math.max(1, ...bars.map((b) => Number(b.value) || 0));
  const W = 900, H = 360, top = 44, bottom = 300, plotH = bottom - top, left = 70, right = W - 30, span = right - left, slot = span / n;
  const bw = Math.min(140, slot * 0.5);
  const grid = [90, 160, 230].map((y) => `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#eef0f4" stroke-width="1.5"/>`).join('');
  const cols = bars.map((b, i) => {
    const cx = left + slot * (i + 0.5);
    const h = ((Number(b.value) || 0) / max) * plotH;
    const y = bottom - h;
    const hex = CHART_HEX[b.color] || CHART_HEX.coral;
    const val = b.display || (b.value != null ? String(b.value) + (data.unit || '') : '');
    return `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${h}" rx="8" fill="${hex}"/>`
      + `<text x="${cx}" y="${y - 16}" text-anchor="middle" font-family="Gotham Pro" font-weight="700" font-size="30" fill="#2b2f56">${escapeHtml(val)}</text>`
      + `<text x="${cx}" y="${bottom + 30}" text-anchor="middle" font-family="Gotham Pro" font-weight="400" font-size="22" fill="#8b90a6">${escapeHtml(b.label || '')}</text>`;
  }).join('');
  return `<div class="exchart">`
    + (data.title ? `<div class="exch-h">${escapeHtml(data.title)}</div>` : '')
    + (data.sub ? `<div class="exch-sub">${escapeHtml(data.sub)}</div>` : '')
    + `<svg viewBox="0 0 ${W} ${H}"><line x1="${left}" y1="${top - 10}" x2="${left}" y2="${bottom}" stroke="#e2e1e6" stroke-width="2"/><line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#e2e1e6" stroke-width="2"/>${grid}${cols}</svg></div>`;
}

const BLOCK_RENDERERS = {
  mediagrid: renderMediagrid,
  mediaimage: renderMediaimage,
  mediachart: renderMediachart,
  bignumber: renderBignumber,
  barset: renderBarset,
  kpis: renderKpis,
  markers: renderMarkers,
  iconarray: renderIconarray,
  circles: renderCircles,
  checkgrid: renderCheckgrid,
  quote: renderQuote,
  photofigure: renderPhotofigure,
  text: renderText,
  column: renderColumn,
  lineplot: renderLineplot,
  groupbars: renderGroupbars,
  diptych: renderDiptych,
  sieve: renderSieve,
  surface: renderSurface,
};

function renderBlock(block, style, asset) {
  const fn = BLOCK_RENDERERS[block.type];
  if (!fn) return '';
  return fn(block.data || {}, { style, asset });
}

/* ================= card-slide layout (multi-block arrangement) ================= */

const LAYOUT_CLASS = { hero: 'card-hero', 'two-up': 'card-two-up', stack: 'card-stack', grid: 'card-grid-multi' };

function renderBlocksArea(blocks, layout, style, asset) {
  if (!blocks.length) return '';
  if (blocks.length === 1) return renderBlock(blocks[0], style, asset);
  const cls = LAYOUT_CLASS[layout] || 'card-stack';
  const items = blocks.map((b) => `<div class="card-block">${renderBlock(b, style, asset)}</div>`).join('');
  return `<div class="${cls}">${items}</div>`;
}

function firstLede(blocks) {
  const b = blocks.find((b) => b.data && typeof b.data.lede === 'string');
  return b ? b.data.lede : '';
}

/* ================= per-role shells (topbar + title + card/frost) ================= */

// opts.kicker===false → logo only (used by card/quote shells, where the kicker
// moves INSIDE the white card as its first line). Cover/closing keep the kicker
// on the gradient since they have no card.
// Top-left of every slide = a white "type" plate (opts.badge): the deck kind
// (e.g. "Case study") on card slides, or the section label (e.g. "Summary") on
// cover/closing. Logo sits top-right.
function topbarHTML(sk, opts = {}) {
  const b = opts.badge != null ? String(opts.badge).trim() : '';
  const left = b ? `<div class="deck-badge">${escapeHtml(b)}</div>` : '<span></span>';
  // Both logos rendered; CSS shows the white one by default and the colour one
  // on the light ground (white wordmark is invisible on a light background).
  return `<div class="topbar">${left}<span class="logowrap"><img class="logo logo-w" src="${LOGO_SRC}" alt="Efferon"><img class="logo logo-d" src="${LOGO_SRC_DARK}" alt="Efferon"></span></div>`;
}
function cardKicker(sk) {
  return sk.kicker ? `<div class="c-kicker">${escapeHtml(sk.kicker)}</div>` : '';
}

function renderCoverShell(slide, deck) {
  const sk = slide.skeleton || {};
  const blocks = slide.blocks || [];
  const photoBlock = blocks.find((b) => b.type === 'photofigure');
  const textBlock = blocks.find((b) => b.type === 'text');
  // Only show a cover image when one is actually provided (uploaded asset or an
  // explicit block src) — do NOT default to the product photo; covers aren't
  // always about the device.
  const rawPhoto = (slide.asset && slide.asset.dataUrl) || (photoBlock && photoBlock.data && photoBlock.data.src) || '';
  const photoSrc = rawPhoto ? resolveSrc(rawPhoto) : '';
  // The cover headline fills the space: prefer skeleton.title; if the planner
  // instead put the sentence in the text block (and left the title empty), use
  // that as the headline so the cover is never near-empty. A remaining tagline
  // (the text block when a title exists, else the subtitle) sits below.
  const textStr = textBlock && textBlock.data ? String(textBlock.data.text || '') : '';
  const hasTitle = !!(sk.title && sk.title.trim());
  const headline = hasTitle ? sk.title : textStr;
  const tagline = hasTitle ? textStr : (sk.subtitle || '');
  // With an image: title moves top-left and the image sits in a clean contained
  // band at the bottom (no overlap, no pasted-on bleed). Without: a big centred
  // type-only cover.
  const coverCls = photoSrc ? 'content cover has-photo' : 'content cover';
  // A transparent cut-out photo (e.g. the NEO device PNG) can sit directly on
  // the gradient with no white card, larger — set data.bare on the photofigure.
  const bare = !!(photoBlock && photoBlock.data && photoBlock.data.bare);
  const figCls = bare ? 'cover-figure bare' : 'cover-figure';
  return `
    <div class="${coverCls}">
      ${topbarHTML(sk, { badge: deck && deck.kind })}
      <div class="cover-hero">
        ${headline ? `<h2 class="cover-title">${richText(headline)}</h2>` : ''}
        ${tagline ? `<div class="cover-lede">${richText(tagline)}</div>` : ''}
      </div>
      ${photoSrc ? `<div class="${figCls}"><img src="${photoSrc}" alt=""></div>` : ''}
    </div>`;
}

function renderClosingShell(slide, deck) {
  const sk = slide.skeleton || {};
  const blocks = slide.blocks || [];
  const textBlock = blocks.find((b) => b.type === 'text');
  const { label, arrow } = splitArrow(textBlock ? textBlock.data.text : '');
  return `
    <div class="content cover">
      ${topbarHTML(sk, { badge: deck && deck.kind })}
      <div class="spacer"></div>
      <h2 class="title">${escapeHtml(sk.title)}</h2>
      ${sk.subtitle ? `<div class="cover-sub">${escapeHtml(sk.subtitle)}</div>` : ''}
      <div style="height:56px"></div>
      <div class="pill-out">${richText(label)}${arrow ? ` <span>${arrow}</span>` : ''}</div>
      <div class="spacer"></div>
      ${sk.footer ? `<div class="close-cite">${escapeHtml(sk.footer)}</div>` : ''}
    </div>`;
}

function renderQuoteShell(slide, deck) {
  const sk = slide.skeleton || {};
  const blocks = slide.blocks || [];
  const qBlock = blocks.find((b) => b.type === 'quote') || { data: {} };
  const d = qBlock.data || {};
  const asset = slide.asset || {};
  const avatarSrc = asset.dataUrl ? resolveSrc(asset.dataUrl) : null;
  const avatarInner = avatarSrc ? `<img src="${avatarSrc}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">` : '';
  return `
    <div class="content">
      ${topbarHTML(sk, { badge: deck && deck.kind })}
      <div class="card" style="margin-top:44px">
        ${cardKicker(sk)}
        <div class="c-body" style="justify-content:flex-start">
          <div class="quote-body"><span><span class="mark">“</span>${richText(d.text || '')}<span class="mark">”</span></span></div>
        </div>
        <div class="qauthor">
          <div class="qavatar">${avatarInner}</div>
          <div><div class="qname">${escapeHtml(d.author || '')}</div><div class="qaff">${escapeHtml(d.affiliation || '')}</div></div>
        </div>
      </div>
    </div>`;
}

function renderCardShell(slide, deck) {
  const sk = slide.skeleton || {};
  const blocks = slide.blocks || [];
  const style = slide.style || {};
  const bodyHTML = renderBlocksArea(blocks, slide.layout, style, slide.asset);
  const lede = firstLede(blocks);
  // A card ALWAYS leads with a short heading line at the top. Prefer the
  // block's lede; if there's no lede but a footer exists, promote that footer
  // to the top as the heading (a lone context line should lead the card, not
  // orphan at the bottom of an empty card). Keep a footer at the bottom only
  // when a lede already leads the card.
  const heading = lede || sk.footer || '';
  const footAtBottom = (sk.footer && lede) ? sk.footer : '';
  const b0 = blocks.length === 1 ? blocks[0] : null;
  const only = b0 ? b0.type : '';
  const stretch = ['photofigure', 'column', 'lineplot', 'groupbars', 'diptych'].includes(only);
  // text variants and the illustration-led concept forms read top-aligned.
  const topText = only === 'text' || only === 'sieve' || only === 'surface';
  const bodyStyle = stretch ? ' style="justify-content:stretch"'
    : (topText ? ' style="justify-content:flex-start;padding-top:6px"' : '');

  // "Self-headlined" blocks render their OWN big term (sieve/surface, and the
  // term text-variant). To avoid a typographic zoo (the same word as gradient
  // title AND kicker AND the block term), these slides drop the gradient title
  // and the external lede, and a kicker that merely repeats the term is hidden.
  const selfHeadlined = only === 'sieve' || only === 'surface'
    || (only === 'text' && b0.data && b0.data.variant === 'term');
  const blockTerm = selfHeadlined
    ? String((b0.data && b0.data.term) || (only === 'sieve' ? 'Filtration' : only === 'surface' ? 'Adsorption' : '')).trim().toLowerCase()
    : '';
  const showKicker = sk.kicker && !(selfHeadlined && sk.kicker.trim().toLowerCase() === blockTerm);
  const titleHTML = selfHeadlined ? '' : `<h2 class="title">${escapeHtml(sk.title)}</h2>`;
  const kickerHTML = showKicker ? `<div class="c-kicker">${escapeHtml(sk.kicker)}</div>` : '';
  const ledeHTML = (!selfHeadlined && heading) ? `<div class="c-lede">${richText(heading)}</div>` : '';
  return `
    <div class="content">
      ${topbarHTML(sk, { badge: deck && deck.kind })}
      ${titleHTML}
      <div class="card">
        ${kickerHTML}
        ${ledeHTML}
        <div class="c-body"${bodyStyle}>${bodyHTML}</div>
        ${footAtBottom && !selfHeadlined ? `<div class="c-foot">${escapeHtml(footAtBottom)}</div>` : ''}
      </div>
    </div>`;
}

// EXPLAINER layout (additive): title + subtitle + media (grid / single image /
// chart) + body + note callout, all directly on the gradient ground (no white
// card). skeleton.title/subtitle lead; skeleton.footer carries the note text.
function renderExplainerShell(slide, deck) {
  const sk = slide.skeleton || {};
  const blocks = slide.blocks || [];
  const style = slide.style || {};
  // Image-like media sit directly on the colored ground; data blocks (numbers,
  // bars, hearts, chart SVGs whose ink is tuned for white) ride inside a white
  // panel so they stay legible on a solid coral/blue/violet ground.
  const IMAGE_TYPES = ['mediagrid', 'mediaimage', 'mediachart', 'photofigure'];
  const PANEL_TYPES = ['bignumber', 'kpis', 'iconarray', 'groupbars', 'circles', 'checkgrid', 'column', 'lineplot', 'barset'];
  const media = blocks.find((b) => IMAGE_TYPES.includes(b.type) || PANEL_TYPES.includes(b.type));
  const isPanel = media && PANEL_TYPES.includes(media.type);
  const bodyBlock = blocks.find((b) => b.type === 'text');
  const mediaMode = !media ? '' : (media.type === 'mediagrid' ? 'grid'
    : (media.type === 'mediaimage' || media.type === 'photofigure') ? 'image'
    : (isPanel ? 'panel' : 'chart'));
  const inner = media ? renderBlock(media, style, slide.asset) : '';
  const mediaHTML = media ? `<div class="ex-media ex-media--${mediaMode}">${isPanel ? `<div class="ex-panel">${inner}</div>` : inner}</div>` : '';
  const note = sk.footer || '';
  return `
    <div class="content ex">
      ${topbarHTML(sk, { badge: deck && deck.kind })}
      ${sk.title ? `<h2 class="ex-title">${richText(sk.title)}</h2>` : ''}
      ${sk.subtitle ? `<div class="ex-sub">${richText(sk.subtitle)}</div>` : ''}
      ${mediaHTML}
      ${bodyBlock && bodyBlock.data ? `<div class="ex-body">${richText(bodyBlock.data.text || '')}</div>` : ''}
      ${note ? `<div class="ex-note"><span class="ex-check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span><span class="ex-note-t">${richText(note)}</span></div>` : ''}
    </div>`;
}

function renderDots(deck, slide) {
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    return '<div class="pdots"><i class="cur"></i></div>';
  }
  const idx = deck.slides.findIndex((s) => s.id === slide.id);
  return `<div class="pdots">${deck.slides.map((_, j) => `<i${j === idx ? ' class="cur"' : ''}></i>`).join('')}</div>`;
}

/* ================= public API ================= */

/**
 * Renders a full-size `.art` artboard for `slide`, sized per `deck.format`
 * (defaults to portrait 1080x1350). Honors slide.skeleton show-toggles and
 * slide.style knobs (titleScale/numberScale/density/align/accent).
 * @returns {HTMLElement}
 */
export function renderSlide(slide, { deck } = {}) {
  const format = (deck && deck.format) || 'portrait';
  const [w, h] = FORMAT_DIMS[format] || FORMAT_DIMS.portrait;
  const sk = slide.skeleton || {};
  const style = slide.style || {};

  const art = document.createElement('div');
  art.className = 'art';
  art.style.width = w + 'px';
  art.style.height = h + 'px';
  art.dataset.role = slide.role || 'generic';
  art.dataset.layout = slide.layout || 'hero';
  art.dataset.density = style.density || 'normal';
  art.dataset.align = style.align || 'left';
  art.style.setProperty('--tsc', style.titleScale != null ? style.titleScale : 1);
  art.style.setProperty('--nsc', style.numberScale != null ? style.numberScale : 1);
  art.style.setProperty('--bsc', style.bodyScale != null ? style.bodyScale : 1);
  art.style.setProperty('--accent-color', ACCENT_VAR[style.accent] || ACCENT_VAR.coral);

  // Optional gradient ground (design-system refresh): slide.ground || deck.ground
  // → class `ground-<name>`; default (none) keeps the original mesh.
  const ground = slide.ground || (deck && deck.ground) || '';
  if (ground) art.classList.add('ground-' + ground);

  art.classList.toggle('v-nokicker', sk.showKicker === false);
  art.classList.toggle('v-nologo', sk.showLogo === false);
  art.classList.toggle('v-nosub', sk.showSubtitle === false);
  art.classList.toggle('v-nofoot', sk.showFooter === false);

  let contentHTML;
  if (slide.role === 'cover') contentHTML = renderCoverShell(slide, deck);
  else if (slide.role === 'closing') contentHTML = renderClosingShell(slide, deck);
  else if (slide.role === 'quote') contentHTML = renderQuoteShell(slide, deck);
  else if (slide.role === 'explainer') contentHTML = renderExplainerShell(slide, deck);
  else contentHTML = renderCardShell(slide, deck);

  const dotsHTML = sk.showDots === false ? '' : renderDots(deck, slide);
  art.innerHTML = contentHTML + dotsHTML;
  return art;
}

/**
 * Same artboard, wrapped in a fixed-size container and scaled down for the
 * filmstrip / export grid via CSS transform.
 * @returns {HTMLElement}
 */
export function renderThumb(slide, { deck, scale } = {}) {
  const format = (deck && deck.format) || 'portrait';
  const [w, h] = FORMAT_DIMS[format] || FORMAT_DIMS.portrait;
  const s = scale || 0.04074;

  const art = renderSlide(slide, { deck });
  art.style.transform = `scale(${s})`;
  art.style.transformOrigin = 'top left';

  const wrap = document.createElement('div');
  wrap.className = 'art-thumb';
  wrap.style.width = Math.round(w * s) + 'px';
  wrap.style.height = Math.round(h * s) + 'px';
  wrap.style.position = 'relative';
  wrap.style.overflow = 'hidden';
  wrap.appendChild(art);
  return wrap;
}
