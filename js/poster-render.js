// poster-render.js — Efferon Carousel Studio: Poster Spec → the "P2 · airier"
// poster (1400×990, panels-on-white). Ported verbatim from
// poster-explore/p2-airy.html and parameterised by the Poster Spec produced by
// js/poster-model.js (newPoster()/demoPoster()).
//
// Isolated from the carousel engine: this module never imports or mutates
// deck-model.js. It reuses ONLY the shared text helpers from deck-render.js
// (richText / escapeHtml) so the {{coral|violet|blue:word}} emphasis tokens
// render identically to the carousel — and never leak.

import { richText, escapeHtml } from './deck-render.js';

/* ================= constants ================= */

const LOGO_SRC = 'assets/logo/efferon-logo.svg';
const PRODUCT_SRC = 'assets/product/%D0%BA%D0%BE%D0%BB%D0%BE%D0%BD%D0%BA%D0%B0%20%D0%BB%D0%BF%D1%81.png';
const MICROBE_SRC = 'assets/illustrations/efferon%20ball%20illustration%201.png';

// series colour name -> brand hex (inlet coral, outlet blue, adsorption teal)
const SERIES_HEX = {
  coral: '#e16f79', blue: '#4568a9', violet: '#896896', teal: '#21b9aa',
};
// fallback by series name when no colour is given
const NAME_HEX = { inlet: '#e16f79', outlet: '#4568a9', adsorption: '#21b9aa' };

function seriesColor(s) {
  return SERIES_HEX[s.color] || NAME_HEX[(s.name || '').toLowerCase()] || '#4568a9';
}

/* ================= tiny helpers ================= */

// Resolve a data-supplied image path to a URL-safe src (leaves data:/http(s)).
function resolveSrc(path) {
  if (!path) return null;
  if (path.startsWith('data:') || /^https?:\/\//.test(path)) return path;
  return path.replace(/ /g, '%20');
}

function cap(s) {
  s = String(s || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Split a metric value like "5%" / "12 %" / "4 h" into a big number + unit.
function splitValue(v) {
  const m = /^\s*([\d.,–—-]+)\s*(.*)$/.exec(String(v ?? ''));
  if (!m) return { num: String(v ?? ''), unit: '' };
  return { num: m[1], unit: m[2] };
}

// Build the <h1> title, highlighting titleEmphasis as the coral .hl pill.
// Everything else still runs through richText so any {{...}} tokens render too.
function titleHTML(header) {
  const title = header.title || '';
  const emph = (header.titleEmphasis || '').trim();
  if (!emph) return richText(title);
  const i = title.indexOf(emph);
  if (i < 0) return richText(title);
  const before = title.slice(0, i);
  const after = title.slice(i + emph.length);
  return `${richText(before)}<span class="hl">${richText(emph)}</span>${richText(after)}`;
}

/* ================= panels ================= */

function panelStats(stats) {
  if (!stats || !stats.length) return '';
  const items = stats.map((s) =>
    `<div class="p-stat"><div class="p-stat-v">${richText(s.value || '')}</div>` +
    `<div class="p-stat-l">${richText(s.label || '')}</div></div>`).join('');
  return `<div class="p-stats">${items}</div>`;
}

function panelChips(chips) {
  if (!chips || !chips.length) return '';
  const pills = chips.map((c) => `<span class="pill-drug">${richText(c)}</span>`).join('');
  return `<div class="drug-names">${pills}</div>`;
}

function renderPanel(panel, poster) {
  const tone = panel.tone === 'blue' ? 'blue' : 'soft';
  const showProduct = tone === 'soft' && poster.assets && poster.assets.productPhoto;

  const heading = panel.heading ? `<div class="p-kicker">${richText(panel.heading)}</div>` : '';
  const body = panel.body ? `<p class="p-text">${richText(panel.body)}</p>` : '';
  const stats = panelStats(panel.stats);
  const chips = panelChips(panel.chips);

  let inner;
  if (showProduct) {
    // body + tag pills on the left, product cartridge photo on the right
    inner = heading +
      `<div class="drug-row"><div class="drug-body">${body}${chips}</div>` +
      `<div class="product"><img src="${PRODUCT_SRC}" alt="Efferon® LPS cartridge"></div></div>` +
      stats;
  } else {
    inner = heading + body + stats + chips;
  }
  return `<div class="panel ${tone}">${inner}</div>`;
}

/* ================= results cards ================= */

function legendHTML(chart) {
  // series live on the chart (line/km/grouped-single) or on the first metric
  // group (grouped with multiple groups); donut/bars carry no series.
  const src = (chart.series && chart.series.length)
    ? chart.series
    : (chart.groups && chart.groups[0] && chart.groups[0].series) || [];
  const series = src.filter((s) => s && s.name);
  if (!series.length) return '';
  const lgs = series.map((s) =>
    `<div class="lg"><span class="sw" style="background:${seriesColor(s)}"></span>${escapeHtml(cap(s.name))}</div>`
  ).join('');
  return `<div class="legend">${lgs}</div>`;
}

// A results card. It is one of three shapes, chosen per data so the row can mix
// freely (some cards a statistic, some a chart), NOT a forced number+chart pair:
//   1. pure STAT  — a headline figure, no plot: title on top, the number big and
//      centred (e.g. "4 days · Shorter ICU stay", "38.7% · cost reduction").
//   2. CHART      — a bars/donut/line/grouped/km plot, optionally with a hero
//      number in the header (e.g. the antibiotic "5% adsorbed" over its curve).
//   3. metric-less CHART — everything centred (the sepsis donut/km/bars cards).
// A stat comes from either a `metric` (results.metrics[]) or a chart of type
// "stat"; either way the number reads from value/unitLabel. There is NO default
// unit label — "adsorbed" is antibiotic-specific and must be set explicitly.
function statCard(chart, metric) {
  const title = (chart && chart.title) || (metric && metric.label) || '';
  const sub = (chart && chart.sub) || (metric && metric.sub) || '';
  const value = (metric && metric.value) || (chart && chart.value) || '';
  const unitLabel = (metric && metric.unitLabel) || (chart && chart.unitLabel) || '';
  const hasPlot = !!chart && chart.type !== 'stat';
  const span = chart && chart.span > 1 ? ` style="grid-column:span ${chart.span}"` : '';
  const numParts = () => {
    const { num, unit } = splitValue(value);
    return `<div class="num">${escapeHtml(num)}` +
      (unit ? `<span class="pct">${escapeHtml(unit)}</span>` : '') + `</div>` +
      (unitLabel ? `<div class="numlab">${escapeHtml(unitLabel)}</div>` : '');
  };

  // 1 · pure STAT card — big centred figure that fills the card height.
  if (value && !hasPlot) {
    return `<div class="stat nonum"${span}>
      <div class="shead"><div class="stitle"><h3>${richText(title)}</h3>${sub ? `<div class="n">${richText(sub)}</div>` : ''}</div></div>
      <div class="stat-figure">${numParts()}</div>
    </div>`;
  }

  // 2/3 · CHART card. Donut cards lay out ring + caption as HTML; every other
  // type renders as a single inline SVG in the chartwrap.
  let chartBody = '';
  if (hasPlot) {
    chartBody = (chart.type === 'donut')
      ? `<div class="donut-wrap">${donutBlock(chart)}</div>`
      : `<div class="chartwrap">${posterChartSVG(chart, { showTitle: false })}</div>`;
  }
  // With a hero number the header is title-left + number-right; without one the
  // whole card centres (title / chart / legend).
  const centred = value ? '' : ' nonum';
  return `<div class="stat${centred}"${span}>
    <div class="shead">
      <div class="stitle"><h3>${richText(title)}</h3>${sub ? `<div class="n">${richText(sub)}</div>` : ''}</div>
      ${value ? `<div class="numblock">${numParts()}</div>` : ''}
    </div>
    ${chartBody}
    ${hasPlot ? legendHTML(chart) : ''}
  </div>`;
}

function resultsHTML(poster) {
  const results = poster.results || {};
  const metrics = results.metrics || [];
  const charts = poster.charts || [];

  if (!charts.length && !metrics.length && !results.note) return '';

  // Each metric is its OWN stat card and each chart its OWN chart card — the two
  // are no longer zipped index-by-index (that forced every card to be a number
  // AND a chart). Stat cards first, then chart cards, so the row mixes freely.
  let cards = '';
  metrics.forEach((m) => { cards += statCard(null, m); });
  charts.forEach((c) => { cards += statCard(c, null); });

  const head = results.note
    ? `<div class="results-head"><span class="results-pill">Results</span>` +
      `<div class="results-note">${richText(results.note)}</div></div>`
    : '';

  const cols = results.columns || 3;
  const gridStyle = cols !== 3 ? ` style="grid-template-columns:repeat(${cols},1fr)"` : '';
  return `<div class="results">${head}${cards ? `<div class="stats"${gridStyle}>${cards}</div>` : ''}</div>`;
}

/* ================= brand charts (native inline SVG) ================= */

/**
 * posterChartSVG(chart[, {showTitle}]) — a small brand chart as an inline SVG
 * string. Which primitive is drawn is chosen by `chart.type` (default 'line',
 * so every existing deck/poster is unaffected). All primitives share the brand
 * palette (coral #e16f79, blue #4568a9, teal #21b9aa) and the muted #7d7d93
 * axis ink. Per-type DATA SHAPES:
 *
 *   type:'line' (default) — the original 2-axis line chart.
 *     { xlabels:['0','30',…], series:[{ name, color, points:[100,60,…] }] }
 *     null points are skipped (e.g. an outlet series that starts at 30 min).
 *
 *   type:'donut' — one or two rings, each a big centre value + caption. Used
 *     for a paired change readout (e.g. SOFA −3,4 vs +1,7). Rendered by the
 *     card as HTML+SVG (donutBlock), not through this function.
 *     { donuts:[ { value:'−3,4', tone:'good'|'bad', fraction:0..1, caption } ] }
 *     tone 'good' → teal ring, 'bad' → coral ring; fraction = arc fill.
 *
 *   type:'bars' — simple vertical bars for a small comparison. Value label
 *     above each bar, group label (+ optional note) beneath. Colour per bar.
 *     { unit:'%', max?, bars:[ { label, value, color, note } ] }
 *
 *   type:'grouped' — paired before/after bars (e.g. 0 h → 72 h) per series,
 *     optionally split into several named metric groups (CRP, Creatinine, …).
 *     { xlabels:['0 h','72 h'], unit?,
 *       series:[ { name, color, points:[from,to] } ]           // single group, OR
 *       groups:[ { name, unit, series:[ { name, color, points:[from,to] } ] } ] }
 *
 *   type:'km' — a stepped Kaplan–Meier survival curve, two arms, x = days.
 *     { xmax, xlabel, ylabel,
 *       series:[ { name, color, points:[[x,y],…], annot:{ x, y, text } } ] }
 *     y is a 0–100 survival %; each series steps down (step-after).
 *
 * When showTitle is true (line only) the title + sub are drawn above the plot;
 * the poster card passes showTitle:false because it prints its own heading.
 */
export function posterChartSVG(chart, opts = {}) {
  const type = (chart && chart.type) || 'line';
  if (type === 'bars') return barsSVG(chart);
  if (type === 'grouped') return groupedBarsSVG(chart);
  if (type === 'km') return kmSVG(chart);
  // 'donut' is rendered by the card (donutBlock); fall through to line for it
  // only if it ever reaches here without donuts.
  return lineChartSVG(chart, opts);
}

/** The original brand line chart (type:'line'). */
function lineChartSVG(chart, opts = {}) {
  const showTitle = opts.showTitle !== false; // default true (self-contained)
  const xlabels = (chart && chart.xlabels) || [];
  const series = (chart && chart.series) || [];

  // geometry (P2 proportions, scaled ~2× so #7d7d93 ~20px labels read cleanly)
  const W = 744;
  const plotL = 78, plotR = 720;
  const titleH = showTitle ? 66 : 0;
  const plotT = (showTitle ? 24 : 18) + titleH;
  // Shorter plot inside the results cards (showTitle:false) so a card — header +
  // hairline + chart + legend — stays compact and the poster never clips.
  const plotH = showTitle ? 210 : 150;
  const plotB = plotT + plotH;
  const H = plotB + (showTitle ? 62 : 54);

  const N = Math.max(xlabels.length, ...series.map((s) => (s.points || []).length), 1);
  const xAt = (i) => (N <= 1 ? plotL : plotL + (plotR - plotL) * (i / (N - 1)));
  const yAt = (v) => plotB - (v / 100) * plotH;

  // gridlines + y labels (0/25/50/75/100 = % from initial)
  let grid = '';
  [0, 25, 50, 75, 100].forEach((g) => {
    const yy = yAt(g).toFixed(1);
    grid += `<line x1="${plotL}" y1="${yy}" x2="${plotR}" y2="${yy}" stroke="rgba(43,47,86,.09)" stroke-width="1.4"/>`;
    grid += `<text x="${plotL - 14}" y="${(yAt(g) + 7).toFixed(1)}" text-anchor="end" font-size="20" fill="#7d7d93" font-family="'Gotham Pro',sans-serif">${g}</text>`;
  });

  // x-axis labels
  const xLabY = plotB + (showTitle ? 32 : 28);
  const capY = plotB + (showTitle ? 58 : 48);
  let xt = '';
  for (let i = 0; i < N; i++) {
    const lab = xlabels[i] != null ? xlabels[i] : '';
    xt += `<text x="${xAt(i).toFixed(1)}" y="${xLabY}" text-anchor="middle" font-size="20" fill="#7d7d93" font-family="'Gotham Pro',sans-serif">${escapeHtml(lab)}</text>`;
  }

  // one polyline + dots per series (skip null points)
  let lines = '';
  let dots = '';
  series.forEach((s) => {
    const color = seriesColor(s);
    const pts = [];
    (s.points || []).forEach((v, i) => {
      if (v == null) return;
      pts.push([xAt(i), yAt(v)]);
    });
    if (!pts.length) return;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    lines += `<path d="${d}" fill="none" stroke="${color}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    dots += pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="6.4" fill="#fff" stroke="${color}" stroke-width="4"/>`).join('');
  });

  // optional title + sub above the plot
  let titleTxt = '';
  if (showTitle && chart) {
    if (chart.title) titleTxt += `<text x="${plotL - 14}" y="34" font-size="27" font-weight="700" fill="#2b2f56" font-family="'Gotham Pro',sans-serif">${escapeHtml(chart.title)}</text>`;
    if (chart.sub) titleTxt += `<text x="${plotL - 14}" y="60" font-size="19" fill="#7d7d93" font-family="'Gotham Pro',sans-serif">${escapeHtml(chart.sub)}</text>`;
  }

  const axis = `<line x1="${plotL}" y1="${plotB}" x2="${plotR}" y2="${plotB}" stroke="rgba(43,47,86,.22)" stroke-width="1.6"/>`;
  const caption = `<text x="${((plotL + plotR) / 2).toFixed(1)}" y="${capY}" text-anchor="middle" font-size="18" fill="#7d7d93" font-family="'Gotham Pro',sans-serif">time, min · % from initial</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml((chart && chart.title) || 'chart')}">`
    + titleTxt + grid + axis + lines + dots + xt + caption + `</svg>`;
}

// Resolve a colour name ('coral'|'blue'|'teal'|'violet') or literal to a hex.
function chartColor(c) { return SERIES_HEX[c] || c || '#4568a9'; }

// Split a label into at most two centred lines (~budget chars each) so long
// group labels ("Control group") don't overflow a narrow card.
function wrapLabel(text, budget) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  const lines = ['', ''];
  let i = 0;
  words.forEach((w) => {
    if (i === 0 && (lines[0] + ' ' + w).trim().length > budget && lines[0]) i = 1;
    lines[i] = (lines[i] ? lines[i] + ' ' : '') + w;
  });
  return lines.filter(Boolean);
}

const SVG_FONT = "font-family=\"'Gotham Pro',sans-serif\"";

/* ---------- donut (ring + centre value + caption) — HTML+SVG ---------- */

function donutRing(value, color, frac) {
  const size = 118, sw = 15, r = (size - sw) / 2, c = 2 * Math.PI * r;
  const fill = Math.max(0, Math.min(1, frac == null ? 0.6 : frac)) * c;
  const cx = size / 2, cy = size / 2;
  return `<svg class="donut-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">`
    + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e8ecf3" stroke-width="${sw}"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" `
    + `stroke-linecap="round" stroke-dasharray="${fill.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`
    + `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="30" `
    + `font-weight="700" fill="${color}" ${SVG_FONT}>${escapeHtml(value)}</text></svg>`;
}

// donutBlock(chart) → the flex row of ring + caption items (called by the card).
function donutBlock(chart) {
  const items = (chart.donuts || []).map((d) => {
    const color = d.tone === 'bad' ? SERIES_HEX.coral : SERIES_HEX.teal;
    return `<div class="donut-item">${donutRing(d.value, color, d.fraction)}`
      + `<div class="donut-cap">${richText(d.caption || '')}</div></div>`;
  }).join('');
  return `<div class="donut-row">${items}</div>`;
}

/* ---------- vertical bars ---------- */

function barsSVG(chart) {
  const bars = chart.bars || [];
  const unit = chart.unit || '';
  // Taller-than-wide viewBox so the chart fills a narrow (span-1) card and the
  // bars read big; plot leaves room for the value on top and label+note below.
  const W = 300, H = 280, plotT = 52, plotB = H - 66;
  const max = chart.max || Math.max(1, ...bars.map((b) => b.value)) * 1.18;
  const n = Math.max(bars.length, 1);
  const yAt = (v) => plotB - (v / max) * (plotB - plotT);
  // Centre the bar GROUP in the viewBox (equal left/right margins) so it always
  // reads centred in the card, regardless of the card's width.
  const gap = 44;
  const bw = Math.min(92, (W - 40 - gap * (n - 1)) / n);
  const groupW = n * bw + (n - 1) * gap;
  const startX = (W - groupW) / 2;

  let out = `<line x1="${(startX - 14).toFixed(1)}" y1="${plotB}" x2="${(startX + groupW + 14).toFixed(1)}" y2="${plotB}" stroke="rgba(43,47,86,.18)" stroke-width="1.5"/>`;
  bars.forEach((b, i) => {
    const cx = startX + bw / 2 + i * (bw + gap);
    const x = cx - bw / 2;
    const y = yAt(b.value);
    const col = chartColor(b.color);
    out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(plotB - y).toFixed(1)}" rx="9" fill="${col}"/>`;
    out += `<text x="${cx.toFixed(1)}" y="${(y - 15).toFixed(1)}" text-anchor="middle" font-size="34" font-weight="700" fill="${col}" ${SVG_FONT}>`
      + `${escapeHtml(String(b.value))}${unit ? `<tspan font-size="20">${escapeHtml(unit)}</tspan>` : ''}</text>`;
    wrapLabel(b.label, 12).forEach((ln, k) => {
      out += `<text x="${cx.toFixed(1)}" y="${(plotB + 30 + k * 22).toFixed(1)}" text-anchor="middle" font-size="18" fill="#7d7d93" ${SVG_FONT}>${escapeHtml(ln)}</text>`;
    });
    if (b.note) out += `<text x="${cx.toFixed(1)}" y="${(plotB + 54).toFixed(1)}" text-anchor="middle" font-size="15" fill="#b3b3c1" ${SVG_FONT}>${escapeHtml(b.note)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(chart.title || 'bars')}">${out}</svg>`;
}

/* ---------- grouped before/after bars (one or several metric groups) ---------- */

function groupedBarsSVG(chart) {
  const groups = chart.groups || [{ name: '', unit: chart.unit || '', series: chart.series || [] }];
  const xlabels = chart.xlabels || [];
  const W = 640, H = 262, plotL = 14, plotR = W - 14, plotT = 42, plotB = H - 54;
  // one global max across every group so bars are comparable
  let max = 1;
  groups.forEach((g) => (g.series || []).forEach((s) => (s.points || []).forEach((v) => { if (v > max) max = v; })));
  max *= 1.2;
  const yAt = (v) => plotB - (v / max) * (plotB - plotT);

  const groupW = (plotR - plotL) / groups.length;
  let out = `<line x1="${plotL}" y1="${plotB}" x2="${plotR}" y2="${plotB}" stroke="rgba(43,47,86,.18)" stroke-width="1.5"/>`;
  groups.forEach((g, gi) => {
    const gx0 = plotL + groupW * gi;
    const series = g.series || [];
    const nSeries = Math.max(series.length, 1);
    const inner = groupW * 0.82;
    const gpad = (groupW - inner) / 2;
    // Separate each series (Efferon / Control) into its own sub-cluster with a
    // gap between them, so a metric reads as TWO pairs (0h→72h per group), not
    // four evenly-spaced bars.
    const seriesGap = inner * 0.16;
    const subW = (inner - seriesGap * (nSeries - 1)) / nSeries;
    series.forEach((s, si) => {
      const col = chartColor(s.color);
      const sx0 = gx0 + gpad + si * (subW + seriesGap);
      const pts = s.points || [];
      const nPts = Math.max(pts.length, 1);
      const slot = subW / nPts;
      const bw = Math.min(42, slot * 0.6);
      pts.forEach((v, pi) => {
        const cx = sx0 + slot * (pi + 0.5);
        const y = yAt(v);
        out += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(plotB - y).toFixed(1)}" rx="6" fill="${col}"/>`;
        out += `<text x="${cx.toFixed(1)}" y="${(y - 9).toFixed(1)}" text-anchor="middle" font-size="16" font-weight="700" fill="${col}" ${SVG_FONT}>${escapeHtml(String(v))}</text>`;
        const xl = xlabels[pi] != null ? xlabels[pi] : '';
        out += `<text x="${cx.toFixed(1)}" y="${(plotB + 20).toFixed(1)}" text-anchor="middle" font-size="14" fill="#7d7d93" ${SVG_FONT}>${escapeHtml(xl)}</text>`;
      });
    });
    // group name + unit centred beneath the cluster
    const gcx = gx0 + groupW / 2;
    const gname = g.name ? `${g.name}${g.unit ? ', ' + g.unit : ''}` : (g.unit || '');
    if (gname) out += `<text x="${gcx.toFixed(1)}" y="${(plotB + 44).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="700" fill="#2b2f56" ${SVG_FONT}>${escapeHtml(gname)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(chart.title || 'grouped bars')}">${out}</svg>`;
}

/* ---------- Kaplan–Meier survival (stepped) ---------- */

function kmSVG(chart) {
  const series = chart.series || [];
  const xmax = chart.xmax || 15;
  // Faithful reproduction of a published KM figure: the y-axis may be a ZOOMED
  // survival window (e.g. 0.4–1.0 in the source) rather than a forced 0–100, and
  // it may carry a dashed vertical guide at a key day (markX + markLabel). Points
  // are still survival % (0–100); ymin/ymax + yticks control what is shown.
  const ymin = (typeof chart.ymin === 'number') ? chart.ymin : 0;
  const ymax = (typeof chart.ymax === 'number') ? chart.ymax : 100;
  const yticks = (chart.yticks && chart.yticks.length)
    ? chart.yticks
    : [0, 25, 50, 75, 100].map((v) => ({ v, label: String(v) }));
  // symmetric left/right gutters so the plot box sits CENTRED in the card. The
  // left gutter is wide enough for BOTH the rotated y-axis title and the tick
  // labels without them overlapping (they collided in a narrow gutter).
  const W = 470, H = 250, plotL = 58, plotR = W - 58, plotT = 16, plotB = H - 44;
  const xAt = (x) => plotL + (x / xmax) * (plotR - plotL);
  const yAt = (y) => plotB - ((y - ymin) / (ymax - ymin)) * (plotB - plotT);

  let grid = '';
  yticks.forEach((t) => {
    const yy = yAt(t.v).toFixed(1);
    grid += `<line x1="${plotL}" y1="${yy}" x2="${plotR}" y2="${yy}" stroke="rgba(43,47,86,.09)" stroke-width="1.2"/>`;
    grid += `<text x="${plotL - 10}" y="${(yAt(t.v) + 5).toFixed(1)}" text-anchor="end" font-size="14" fill="#7d7d93" ${SVG_FONT}>${escapeHtml(t.label)}</text>`;
  });
  // x ticks 0,5,10,15
  let xt = '';
  for (let d = 0; d <= xmax; d += 5) {
    xt += `<text x="${xAt(d).toFixed(1)}" y="${(plotB + 22).toFixed(1)}" text-anchor="middle" font-size="14" fill="#7d7d93" ${SVG_FONT}>${d}</text>`;
  }

  // optional dashed vertical guide (e.g. "day-3 mortality"), drawn UNDER the curves
  let mark = '';
  if (typeof chart.markX === 'number') {
    const mx = xAt(chart.markX).toFixed(1);
    mark += `<line x1="${mx}" y1="${plotT}" x2="${mx}" y2="${plotB}" stroke="rgba(43,47,86,.4)" stroke-width="1.2" stroke-dasharray="4 4"/>`;
    // label sits in the free gap between the two arms (right of the guide), so it
    // never collides with the survival annotations near the top.
    if (chart.markLabel) mark += `<text x="${(xAt(chart.markX) + 7).toFixed(1)}" y="${(yAt((ymin + ymax) / 2 + (ymax - ymin) * 0.24)).toFixed(1)}" font-size="12.5" font-weight="500" fill="#7d7d93" ${SVG_FONT}>${escapeHtml(chart.markLabel)}</text>`;
  }

  let lines = '', annots = '';
  series.forEach((s) => {
    const col = chartColor(s.color);
    const pts = (s.points || []).map((p) => [xAt(p[0]), yAt(p[1])]);
    if (pts.length) {
      // step-after path: hold the level, then step to the next
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) d += ` L${pts[i][0].toFixed(1)} ${pts[i - 1][1].toFixed(1)} L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
      lines += `<path d="${d}" fill="none" stroke="${col}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    if (s.annot) {
      const ax = xAt(s.annot.x), ay = yAt(s.annot.y);
      annots += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="4.5" fill="#fff" stroke="${col}" stroke-width="3"/>`;
      annots += `<text x="${(ax + 9).toFixed(1)}" y="${(ay - 8).toFixed(1)}" font-size="14" font-weight="700" fill="${col}" ${SVG_FONT}>${escapeHtml(s.annot.text)}</text>`;
    }
  });

  const axis = `<line x1="${plotL}" y1="${plotB}" x2="${plotR}" y2="${plotB}" stroke="rgba(43,47,86,.22)" stroke-width="1.5"/>`
    + `<line x1="${plotL}" y1="${plotT}" x2="${plotL}" y2="${plotB}" stroke="rgba(43,47,86,.22)" stroke-width="1.5"/>`;
  const xcap = `<text x="${((plotL + plotR) / 2).toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="middle" font-size="14" fill="#7d7d93" ${SVG_FONT}>${escapeHtml(chart.xlabel || 'Time, days')}</text>`;
  const ycap = `<text x="16" y="${((plotT + plotB) / 2).toFixed(1)}" text-anchor="middle" font-size="13" fill="#7d7d93" ${SVG_FONT} transform="rotate(-90 16 ${((plotT + plotB) / 2).toFixed(1)})">${escapeHtml(chart.ylabel || 'Survival, %')}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(chart.title || 'survival curve')}">`
    + grid + mark + axis + lines + annots + xt + xcap + ycap + `</svg>`;
}

/* ================= drugs strip ================= */

// Render a "remaining" panel (e.g. "Drugs administered") as a slim, wide, low
// horizontal band — heading + body on the left, name chips on the right — so it
// reads lighter/shorter than the leading study-design block above it.
function drugStrip(panel) {
  const heading = panel.heading ? `<div class="ds-k">${richText(panel.heading)}</div>` : '';
  const body = panel.body ? `<p class="ds-text">${richText(panel.body)}</p>` : '';
  const chips = (panel.chips && panel.chips.length)
    ? `<div class="ds-chips">${panel.chips.map((c) => `<span class="pill-drug">${richText(c)}</span>`).join('')}</div>`
    : '';
  return `<div class="drug-strip"><div class="ds-main">${heading}${body}</div>${chips}</div>`;
}

/* ================= full poster ================= */

/** posterHTML(spec) → the full 1400×990 P2 poster as an HTML string. */
export function posterHTML(spec) {
  const poster = spec || {};
  const header = poster.header || {};

  // 1. Header — kicker + big title (coral emphasis pill) + colour logo.
  const eyebrow = header.kicker ? `<div class="eyebrow">${richText(header.kicker)}</div>` : '';
  const title = `<h1 class="p-title">${titleHTML(header)}</h1>`;
  const headEl = `<header class="head">
    <div>${eyebrow}${title}</div>
    <div class="logo"><img src="${LOGO_SRC}" alt="Efferon"></div>
  </header>`;

  // 2. Intro / problem — one full-width lead line (emphasis tokens render).
  const intro = poster.intro
    ? `<div class="intro"><p>${richText(poster.intro)}</p></div>`
    : '';

  // 3. Study design + objective, together and first. First panel (blue) on the
  //    left; objective banner (the one gradient accent) on the right. If the
  //    banner is empty the study panel takes the full width.
  const panels = poster.panels || [];
  const studyPanel = panels[0];
  const restPanels = panels.slice(1);

  const bannerText = (poster.banner && poster.banner.text) ? poster.banner.text : '';
  const objEl = bannerText
    ? `<div class="lead-side"><div class="obj grad"><div class="obj-k">Objective</div>` +
      `<p class="obj-t">${richText(bannerText)}</p></div></div>`
    : '';
  const leadMain = studyPanel ? `<div class="lead-main">${renderPanel(studyPanel, poster)}</div>` : '';
  const leadRow = (leadMain || objEl)
    ? `<div class="lead-row${objEl ? '' : ' full'}">${leadMain}${objEl}</div>`
    : '';

  // 3b. Hospitals — an optional small panel: a bulleted list of institutions.
  //     The reference's KZ map is decorative; we omit it (no invented map).
  const hospitals = poster.hospitals;
  const hospitalsEl = (hospitals && hospitals.items && hospitals.items.length)
    ? `<div class="hospitals"><div class="hos-k">${richText(hospitals.heading || 'Participating hospitals')}</div>` +
      `<ul class="hos-list">${hospitals.items.map((h) => `<li>${richText(h)}</li>`).join('')}</ul></div>`
    : '';

  // 4. Drugs — a narrow, full-width soft-blue strip under the lead row.
  const drugsEl = restPanels.length
    ? `<div class="drugs">${restPanels.map((p) => drugStrip(p)).join('')}</div>`
    : '';

  // 5. Results — pill + note, then the three chart cards.
  const results = resultsHTML(poster);

  // 6. Conclusion — the dark ink strip at the bottom.
  const conclusion = poster.conclusion
    ? `<div class="conclusion">
        <div class="cpill">Conclusion</div>
        <p class="ctext">${richText(poster.conclusion)}</p>
        <div class="microbe"><img src="${MICROBE_SRC}" alt=""></div>
      </div>`
    : '';

  // Place hospitals + drugs (methods) side by side when both exist, to save
  // vertical space; otherwise fall back to the stacked full-width blocks.
  const midEl = (hospitalsEl && drugsEl)
    ? `<div class="mid-row">${hospitalsEl}${drugsEl}</div>`
    : (hospitalsEl + drugsEl);

  return headEl + intro + leadRow + midEl + results + conclusion;
}

/** renderPoster(spec) → an HTMLElement (`div.poster`, 1400×990). */
export function renderPoster(spec) {
  const d = document.createElement('div');
  d.className = 'poster';
  d.style.width = '1400px';
  d.style.height = '990px';
  d.innerHTML = posterHTML(spec);
  return d;
}
