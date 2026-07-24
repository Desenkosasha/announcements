// poster-ai.js — Efferon Carousel Studio: AI planning + per-section chat refine
// for the POSTER output type (single A4-landscape infographic, "P2 · airier").
//
// Transport plumbing (fetch to api.anthropic.com, browser-direct header, model,
// structured output via output_config.format, the localStorage API key) is the
// SAME as deck-ai.js — ported verbatim, not reinvented. `ensureKey()` and the
// `imageBlockFromDataUrl()` vision helper follow deck-ai's exact shape (ensureKey
// is imported so both tools share the one `eff_key` browser key).
//
// This module never invents Poster Spec fields: the schema mirrors the exact
// shape produced by js/poster-model.js's newPoster()/demoPoster(), and every AI
// response is merged onto a newPoster()-seeded object so unset fields fall back
// to the model's own defaults (never to ad-hoc values invented here).

import { newPoster, demoPoster } from './poster-model.js';
import { ensureKey } from './deck-ai.js';

/* ================= CONFIG (verbatim from deck-ai.js) ================= */

const MODEL = 'claude-opus-4-8';
const API_URL = 'https://api.anthropic.com/v1/messages';

const ACCENTS = ['blue', 'coral', 'violet'];
const PANEL_TONES = ['blue', 'soft'];
// Line colors the poster chart renderer understands (spec: inlet coral, outlet
// blue, adsorption teal #21b9aa; violet kept for parity with the accent set).
const CHART_COLORS = ['coral', 'blue', 'teal', 'violet'];

/* ================= JSON SCHEMA (structured output) ================= */
// Top-level poster fields are strictly constrained (accent/tone enums, the
// header/results objects). The VARIABLE-shape arrays — panels and charts —
// carry their open, per-item shape (chips[]/stats[] for a panel; xlabels[] +
// series[] for a chart) as a JSON-ENCODED STRING inside an otherwise-constrained
// wrapper. Anthropic strict structured output forbids open objects (every object
// needs additionalProperties:false + all props required), so this is the same
// trick deck-ai uses for block.data. Parsed back in posterFromAI() via
// dataFromAI(); the prompt's slot reference keeps the field names on-contract.
//
// `id` is NOT part of what the AI returns — section ids are assigned locally
// (nextId() below), mirroring how deck-model assigns slide ids. `assets` is not
// AI-owned either (only a real uploaded image can populate it).

const HEADER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'titleEmphasis', 'kicker'],
  properties: {
    title: { type: 'string', description: 'The poster headline — the study/topic title. Sentence case, concise.' },
    titleEmphasis: { type: 'string', description: 'ONE word or short phrase taken verbatim from the title to render as the coral emphasis pill (e.g. "Hemoadsorption"). Empty string if none.' },
    kicker: { type: 'string', description: 'A short line above/under the title: study design + product, e.g. "Multicenter · prospective · observational — Efferon® LPS". Empty string if not needed.' },
  },
};

const PANEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tone', 'heading', 'body', 'data'],
  properties: {
    tone: { type: 'string', enum: PANEL_TONES, description: '"blue" for a tinted panel (use once, usually the study-design panel), "soft" for a neutral panel.' },
    heading: { type: 'string', description: 'Short panel heading, e.g. "Study design", "Drugs administered". Sentence case.' },
    body: { type: 'string', description: 'One short paragraph of panel body copy. May carry at most one or two emphasis tokens.' },
    // JSON string, NOT a nested object (see file header).
    data: {
      type: 'string',
      description: 'A JSON object encoded as a STRING (not a nested object) holding this panel\'s variable fields: { "chips": [string,...], "stats": [{ "value": string, "label": string }] }. chips = short tag phrases (methods, arms, drug names, time points); stats = 1–3 headline figures for this panel (e.g. {"value":"30","label":"adult patients"}). Use [] for either when not needed.',
    },
  },
};

const METRIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'label', 'sub'],
  properties: {
    value: { type: 'string', description: 'The metric value as shown, e.g. "5%", "12%".' },
    label: { type: 'string', description: 'What the value measures, e.g. "Vancomycin".' },
    sub: { type: 'string', description: 'A small caption under the metric, e.g. "n = 10". Empty string if none.' },
  },
};

const RESULTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['note', 'metrics'],
  properties: {
    note: { type: 'string', description: 'A one-line lead describing what the results row shows. May carry one emphasis token. Empty string if none.' },
    metrics: { type: 'array', items: METRIC_SCHEMA, description: 'The headline result numbers (2–4). Never invent a figure not in the source.' },
  },
};

const BANNER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['show', 'text'],
  properties: {
    show: { type: 'boolean', description: 'true to include the single gradient objective banner, false to omit it entirely.' },
    text: { type: 'string', description: 'The banner line (e.g. the primary objective). May carry one emphasis token. Empty string when show is false.' },
  },
};

// A results-row CARD. "type" picks the shape so the row can MIX freely (some
// cards a statistic, some a chart) — the card is NOT a forced number+chart pair.
const CHART_TYPES = ['stat', 'bars', 'donut', 'grouped', 'km', 'line'];
const CHART_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'sub', 'value', 'unitLabel', 'data'],
  properties: {
    type: { type: 'string', enum: CHART_TYPES, description: 'The card shape. "stat" = a headline figure with NO plot (title + one big number, e.g. "4 days", "38.7%"). "bars" = a small vertical-bar comparison of a few groups/arms (e.g. mortality 9% vs 35%). "donut" = one or two rings for a change/fraction (e.g. a SOFA delta). "grouped" = paired before/after bars per metric (e.g. 0 h vs 72 h). "km" = a stepped Kaplan-Meier survival curve. "line" = a continuous trend over 3+ time points (e.g. a concentration falling over minutes). Pick per data — see the rules in the system prompt.' },
    title: { type: 'string', description: 'The card title, e.g. "28-day mortality", "Shorter ICU stay", "Vancomycin".' },
    value: { type: 'string', description: 'For a "stat" card (or a chart carrying a hero number): the big number as shown, e.g. "4 days", "38.7%", "9% vs 35%". Empty string when the card has no headline number.' },
    unitLabel: { type: 'string', description: 'A tiny label under the number, ONLY when it adds meaning (e.g. "adsorbed", "reduction", "vs control"). Empty string otherwise. NEVER default it to "adsorbed" — that word belongs only to an adsorption study.' },
    sub: { type: 'string', description: 'A small caption under the title, e.g. "n = 10", "p = 0.008 · OR = 0.2". Empty string if none.' },
    // JSON string, NOT a nested object (see file header). Shape depends on "type":
    data: {
      type: 'string',
      description: 'A JSON object encoded as a STRING (not a nested object) holding this card\'s plot data. The shape MUST match "type":\n'
        + '• stat: "{}" (no plot data; the number lives in "value"/"unitLabel").\n'
        + '• bars: { "unit": "%"|"", "max"?: number, "bars": [{ "label": string, "value": number, "color": "coral"|"blue"|"teal", "note"?: string }] } — one bar per arm/group.\n'
        + '• donut: { "donuts": [{ "value": string, "tone": "good"|"bad", "fraction": 0..1, "caption": string }] } — 1 or 2 rings; tone good=teal, bad=coral; fraction=arc fill.\n'
        + '• grouped: { "xlabels": [string,string], "groups": [{ "name": string, "unit": string, "series": [{ "name": string, "color": "blue"|"coral", "points": [from, to] }] }] } — paired before/after bars.\n'
        + '• km: { "xmax": number, "xlabel": string, "ylabel": string, "ymin"?: number, "ymax"?: number, "yticks"?: [{ "v": number, "label": string }], "markX"?: number, "markLabel"?: string, "series": [{ "name": string, "color": "blue"|"coral", "points": [[x,y],...], "annot"?: { "x": number, "y": number, "text": string } }] } — survival %; each series steps down; keep EVERY step of the source curve.\n'
        + '• line: { "xlabels": [string,...], "series": [{ "name": string, "color": "coral"|"blue"|"teal", "points": [number|null,...] }], "imageRef"?: number } — a trend; every series\' points length = xlabels length (null for a missing point). Set "imageRef" (1-based) with empty xlabels/series ONLY when a figure cannot be redrawn.',
    },
  },
};

const POSTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'accent', 'header', 'intro', 'panels', 'banner', 'results', 'charts', 'conclusion'],
  properties: {
    kind: { type: 'string', description: 'A 1–3 word label naming the poster type, e.g. "Clinical study", "Cost analysis". Shown as a small badge. Sentence case.' },
    accent: { type: 'string', enum: ACCENTS, description: '"coral" is the default hero accent; "blue" for neutral/contextual; "violet" sparingly.' },
    header: HEADER_SCHEMA,
    intro: { type: 'string', description: 'The problem / lede paragraph that opens the poster. May carry at most one or two emphasis tokens.' },
    panels: { type: 'array', items: PANEL_SCHEMA, description: '1–2 study panels (design, cohort/procedure, drugs). One idea per panel.' },
    banner: BANNER_SCHEMA,
    results: RESULTS_SCHEMA,
    charts: { type: 'array', items: CHART_SCHEMA, description: 'One chart per measured series, redrawn natively from the data/figures.' },
    conclusion: { type: 'string', description: 'A neutral, one-paragraph conclusion. No hype. May carry one emphasis token.' },
  },
};

/* ================= PROMPT: slot reference + worked example ================= */
// The worked example is built from the real demoPoster() object (not hand-typed
// JSON) so it is always valid and always in sync with POSTER_SCHEMA — panels and
// charts are stripped to the AI-owned fields with `data` re-encoded as a string,
// exactly the wire shape the model must return.

// panel/chart `data` crosses the API as a JSON-encoded STRING (see schema).
function dataToString(d) { return typeof d === 'string' ? d : JSON.stringify(d || {}); }
function dataFromAI(d) {
  if (d && typeof d === 'object') return d;
  if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) { return {}; } }
  return {};
}

// Strip a Poster Spec to the AI-owned wire shape (no ids, no assets, no
// format/bodyScale — those are locally owned). Used for the worked example AND
// as the refine-conversation seed so the model mirrors the exact wire shape.
function stripPosterForAI(poster) {
  return {
    kind: poster.kind || '',
    accent: poster.accent || 'coral',
    header: { ...poster.header },
    intro: poster.intro || '',
    panels: (poster.panels || []).map((p) => ({
      tone: p.tone,
      heading: p.heading,
      body: p.body,
      data: dataToString({ chips: p.chips || [], stats: p.stats || [] }),
    })),
    banner: poster.banner ? { show: true, text: poster.banner.text || '' } : { show: false, text: '' },
    results: {
      note: (poster.results && poster.results.note) || '',
      metrics: ((poster.results && poster.results.metrics) || []).map((m) => ({
        value: m.value || '', label: m.label || '', sub: m.sub || '',
      })),
    },
    charts: (poster.charts || []).map((c) => {
      const d = {};
      ['xlabels', 'series', 'bars', 'donuts', 'groups', 'yticks', 'unit', 'max',
        'xmax', 'xlabel', 'ylabel', 'ymin', 'ymax', 'markX', 'markLabel'].forEach((k) => {
        if (c[k] != null) d[k] = c[k];
      });
      if (typeof c.imageRef === 'number') d.imageRef = c.imageRef;
      return {
        type: c.type || 'line', title: c.title || '', sub: c.sub || '',
        value: c.value || '', unitLabel: c.unitLabel || '', data: dataToString(d),
      };
    }),
    conclusion: poster.conclusion || '',
  };
}

const SLOT_REFERENCE = `
The poster is ONE fixed landscape layout with these named slots — fill each from the source, skip a slot only when the source has nothing for it:

- header: { "title", "titleEmphasis", "kicker" } — the study/topic title in sentence case; "titleEmphasis" is ONE word copied verbatim out of the title to render as the brand-blue pill (e.g. "Hemoadsorption"); "kicker" is a short design+product line (e.g. "Multicenter · prospective · observational · Efferon® LPS").
- intro: a single problem/lede paragraph that frames why the study matters. At most one or two emphasis tokens.
- panels: 1–2 study panels, one idea each. Each panel = { "tone", "heading", "body", "data" } where "data" is a JSON STRING { "chips": [...], "stats": [{ "value", "label" }] }. Use a "blue" tone once (usually the study-design panel) and "soft" for the rest. chips = short tag phrases (methods, arms, drug names, time points like "inlet vs outlet · 0 · 30 · 90 · 240 min"); stats = 1–3 headline figures for that panel (e.g. {"value":"30","label":"adult patients"}, {"value":"8","label":"hospitals"}).
- banner: { "show", "text" } — ONE optional restrained gradient banner, typically the primary objective. Set show:false (and text:"") to omit it.
- results: { "note", "metrics" } — "note" is the one-line lead over the results row. Leave "metrics" an EMPTY array []: put every result card in "charts" instead (below), so the whole row is one consistent card list.
- charts: THE RESULTS ROW — a list of 3-6 CARDS, each { "type", "title", "value", "unitLabel", "sub", "data" }. This is the key to variety: PICK "type" per data so the row mixes statistics and charts, and NEVER force a line chart:
  · a single headline figure (a duration, a percentage, a cost) -> type "stat" (title + the number in "value", data "{}"). e.g. {"type":"stat","title":"Shorter ICU stay","value":"4 days","unitLabel":"","sub":"","data":"{}"}.
  · two arms compared at one time point (mortality 9% vs 35%, a rate A vs B) -> type "bars" (one bar per arm), NOT a line. e.g. data {"unit":"%","bars":[{"label":"Treatment","value":9,"color":"blue"},{"label":"Control","value":35,"color":"coral"}]}. (Or state it as a "stat" with value "9% vs 35%" if a chart is overkill.)
  · a change / fraction (a SOFA delta, a proportion) -> type "donut".
  · the SAME metric before and after per group (0 h vs 72 h for CRP, creatinine) -> type "grouped".
  · survival over days -> type "km" (keep every step of the source curve).
  · a value moving continuously over 3+ time points (a concentration over minutes) -> type "line". Colors: inlet "coral", outlet "blue", adsorption "teal"; every series' points length = xlabels length (null for a missing point).
  Use "unitLabel" ONLY when it truly clarifies the number ("adsorbed", "reduction", "vs control") — leave it "" otherwise; never write "adsorbed" unless it is an adsorption study. Set "value" on a chart card too when it has one hero number worth showing big in the header (e.g. the adsorbed % over an antibiotic curve); otherwise "".
- conclusion: a neutral one-paragraph takeaway. No hype, no exclamation marks.
`.trim();

const BRAND_RULES = `
Hard brand and design rules — never break these:
- One landscape poster, one story. Fill the fixed slots above; do not invent new slots or fields.
- No invented numbers. Every figure (stat, metric, chart point) must come from the source text or an attached figure. If the source is thin, use fewer items rather than fabricating.
- WRITE ONLY WHAT THE SOURCE SAYS. Every line of copy — title, subtitle/lede, panel body, banner, results note, captions, conclusion — must be grounded in the provided input. Do NOT invent framing, ledes, subtitles, taglines, interpretive claims ("this study quantifies the risk", "a key concern is…"), or any sentence the source does not support. Rephrase for concision, never add meaning. If the source gives no subtitle/lede for a slot, leave that slot EMPTY (empty string) rather than composing one. The reader is a medical professional who will notice fabricated claims — say only what is given.
- CHARTS ARE REPRODUCTIONS, NOT REDESIGNS. When you rebuild a figure, copy it ONE-TO-ONE: the exact same data points, values, categories, axis range, number of steps/bars, and series. Do NOT smooth, round, simplify, "clean up", add, drop, reorder, or infer any point that is not in the source. A survival curve keeps every step; a bar chart keeps every bar and its exact height; an axis keeps the source's range (e.g. a 0.4–1.0 survival axis stays 0.4–1.0, not 0–100). If you genuinely cannot read a value, keep the figure as an image (imageRef) rather than guessing. Accuracy is the whole point — a chart the reader cannot trust is worse than no chart.
- No ALL-CAPS anywhere — not in kicker, title, heading, or any label. Sentence case only.
- Emphasis is color-only and sparing: mark AT MOST one or two KEY TERMS per copy string. The house emphasis is BRAND BLUE — use {{blue:...}} for the title highlight and for key terms. Do NOT use the red/coral pill for text emphasis (coral reads as an alert; blue is the Efferon brand voice). Reserve {{coral:...}} only for a single genuinely negative/warning term if one truly exists, and {{violet:...}} almost never. Never use bold, **, <b>, ALL-CAPS, or any markdown. The renderer turns the tokens into soft color highlights.
- No em-dashes (the long "—") anywhere in any copy. Use a comma, a colon, or a full stop instead. (A short en-dash in a numeric range like "7-8" or "6-12 hours" is fine.)
- Copy is concise and medical-professional: no hype, no marketing adjectives ("revolutionary", "amazing"), no exclamation marks. Say what the data says.
- Pick "accent" with intent: "blue" (default, the brand voice) for most posters, "coral" only for a poster whose single hero message is a positive result, "violet" almost never.
`.trim();

const VISION_RULES = `
You may be given chart/figure images (Image 1, Image 2, …) attached above the text. For EACH image, read it, extract the underlying data (categories, x-axis labels, each series and its points), and REBUILD it as native "charts" entries — inlet/outlet(+adsorption) trend figures become one chart per measured drug/series (xlabels + series points; inlet coral, outlet blue, adsorption teal). Prefer redrawing EVERY time.

CRITICAL — redraw ONE-TO-ONE, this is a matter of trust: reproduce exactly what the figure shows. Read off every value, every step of a curve, every bar and its precise height, the exact axis min/max and tick labels, the number and order of series. Do NOT simplify, smooth, round, approximate, add, remove, reorder, or "improve" anything. If a survival curve has fifteen little steps, draw fifteen; if its y-axis is 0.4–1.0, keep 0.4–1.0. A redrawn chart that differs from the source — even slightly — destroys the reader's trust in the whole poster, so faithfulness beats tidiness every time.

ONLY when a figure genuinely cannot be faithfully reconstructed from what you can read (a photograph, an anatomical schematic, a dense unparsable table, a curve you cannot read the values off) keep it as a chart with empty xlabels/series and set that chart's "data.imageRef" to the image's 1-based index so the original picture is placed there instead — never invent points for an image you are keeping as a figure.
`.trim();

// One worked example, from the real demoPoster() object, showing the exact wire
// shape (note how panel/chart "data" is a JSON string, not a nested object) so
// the model mirrors field names instead of guessing at a plausible shape.
const WORKED_EXAMPLE = `
Worked example — the antibiotic-clearance poster, in the EXACT wire shape you must return (note how each panel/chart "data" is a JSON STRING, not a nested object):
${JSON.stringify(stripPosterForAI(demoPoster()), null, 2)}
`.trim();

const SYSTEM_PREAMBLE = `You are a senior brand designer for Efferon composing a single landscape research POSTER (A4 landscape, the "P2 · airier" layout — panels on white). Efferon is a medical company specializing in extracorporeal blood purification (hemoadsorption) for sepsis, septic shock, and cytokine storm.

You compose the poster from a FIXED set of named slots. You do NOT invent new slots or new fields — only the slots and "data" field names below exist. CRITICAL: inside a panel or chart, the "data" value MUST be a STRING containing JSON (not a nested object) — e.g. "data": "{\\"chips\\":[...],\\"stats\\":[...]}". Use the exact field names below inside that JSON string.

${SLOT_REFERENCE}

${WORKED_EXAMPLE}

${BRAND_RULES}`;

const SYSTEM_PLAN = `${SYSTEM_PREAMBLE}

You are planning a WHOLE POSTER from the user's source text (and any attached figures) in one shot.

Teach yourself the P2 flow from the source: pull the TITLE (+ optionally one brand-blue emphasis word if a key term stands out), the PROBLEM/intro ONLY if the source actually states one (leave intro empty otherwise, do not invent a lede), 1-2 STUDY PANELS (design, cohort/procedure, the drugs or arms, each with a heading, a short body, chips, and 1-3 stats), an optional gradient OBJECTIVE banner, the RESULTS row (a mixed list of cards — pick each card's "type" per data: "stat" for a single figure, "bars" for a two-arm comparison, "donut" for a change, "grouped" for before/after, "km" for survival, "line" only for a real time trend — see the charts slot), and a neutral CONCLUSION. Every piece of copy must be grounded in the source (see the copy-fidelity rule) and must contain no em-dashes.

${VISION_RULES}

Write copy in the language given in the message (en or ru — match it exactly).

Output contract: return ONLY a Poster object — { "kind", "accent", "header", "intro", "panels", "banner", "results", "charts", "conclusion" } — matching the JSON schema exactly, and nothing else (no markdown, no commentary, no text outside the JSON). Every object slot must be fully specified (header has all 3 fields; banner has show + text; results has note + metrics; each panel has tone/heading/body/data; each chart has title/sub/data). Use empty strings / empty arrays / banner.show:false where a slot is not needed.`;

const SYSTEM_REFINE = `${SYSTEM_PREAMBLE}

You are refining an existing poster through an ongoing chat conversation.

This is a continuing conversation: the current poster (as JSON) is the most recent assistant message. Each user message is an instruction to change ONE named section of it (the message names which section). On every turn you must return the FULL updated poster: apply the instruction just given to the named section ONLY, keep every change requested in earlier turns of this conversation, and leave every OTHER section exactly as it was, byte-for-byte. Understand relative instructions like "revert that", "undo", "put it back" by looking at what actually changed earlier in this conversation — do not guess from scratch. Never invent new numbers unless the user asked. Apply the user's EXACT new wording when they rewrite copy — quote it verbatim (in whatever language they wrote it), don't paraphrase. To keep an emphasis when rewriting, carry the {{coral:…}}/{{violet:…}}/{{blue:…}} token into the new wording.

Do not add, remove, or reorder panels/charts/metrics unless the user explicitly asks — keep the arrays in the same order and length so unrelated sections stay stable.

Output contract: return ONLY the updated Poster object — kind, accent, header, intro, panels, banner, results, charts, conclusion — matching the JSON schema exactly. No markdown, no commentary, no text outside the JSON.`;

/* ================= transport (verbatim from deck-ai.js callClaude) ================= */

async function callClaude({ key, system, schema, messages }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 12000,
      system,
      output_config: { format: { type: 'json_schema', schema } },
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Anthropic API returned no text content.');
  return textBlock.text;
}

/* ================= vision: dataURL -> Anthropic image content block ================= */
// Verbatim from deck-ai.js — unsupported/corrupt dataURLs are skipped gracefully
// so the plan still runs text-only for that image rather than failing outright.
const SUPPORTED_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function imageBlockFromDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec((dataUrl || '').trim());
  if (!m) return null;
  let mediaType = m[1].toLowerCase();
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg'; // some browsers emit this non-standard alias
  if (!SUPPORTED_IMAGE_MEDIA_TYPES.includes(mediaType)) return null;
  const data = m[2];
  if (!data) return null;
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

/* ================= AI response -> Poster Spec (reuse newPoster() defaults) ================= */
// Section ids are assigned locally with a single per-poster counter so panels
// AND charts share one namespace (never collide within a poster). On refine we
// reuse the current poster's ids by index so a section's id stays stable across
// edits (mirrors refineSlide preserving slide.id).

function makeIdGen() {
  let n = 0;
  return () => 'sec-' + (++n);
}

function panelFromAI(raw, nextId, keepId) {
  const d = dataFromAI(raw && raw.data);
  return {
    id: keepId || nextId(),
    tone: (raw && raw.tone) || 'soft',
    heading: (raw && raw.heading) || '',
    body: (raw && raw.body) || '',
    chips: Array.isArray(d.chips) ? d.chips : [],
    stats: Array.isArray(d.stats) ? d.stats : [],
  };
}

function chartFromAI(raw, nextId, keepId) {
  const d = dataFromAI(raw && raw.data);
  const type = (raw && CHART_TYPES.includes(raw.type)) ? raw.type : 'line';
  const chart = {
    id: keepId || nextId(),
    type,
    title: (raw && raw.title) || '',
    sub: (raw && raw.sub) || '',
    value: (raw && raw.value) || '',
    unitLabel: (raw && raw.unitLabel) || '',
  };
  // pass through only the per-type plot fields the renderer reads
  if (Array.isArray(d.xlabels)) chart.xlabels = d.xlabels;
  if (Array.isArray(d.series)) chart.series = d.series;
  if (Array.isArray(d.bars)) chart.bars = d.bars;
  if (Array.isArray(d.donuts)) chart.donuts = d.donuts;
  if (Array.isArray(d.groups)) chart.groups = d.groups;
  if (Array.isArray(d.yticks)) chart.yticks = d.yticks;
  ['unit', 'max', 'xmax', 'xlabel', 'ylabel', 'ymin', 'ymax', 'markX', 'markLabel'].forEach((k) => {
    if (d[k] != null) chart[k] = d[k];
  });
  if (raw && raw.annot) chart.annot = raw.annot;
  if (typeof d.imageRef === 'number') chart.imageRef = d.imageRef;
  return chart;
}

/**
 * Merge an AI response onto a fresh newPoster() so unset fields keep the model's
 * defaults. When `template` is given (refine), section ids are reused by index.
 */
function posterFromAI(raw, { format, template } = {}) {
  const p = newPoster();
  const nextId = makeIdGen();

  if (format) p.format = format;
  if (template) {
    p.bodyScale = template.bodyScale != null ? template.bodyScale : p.bodyScale;
    p.assets = template.assets || p.assets;
  }

  p.kind = ((raw && raw.kind) || '').trim();
  if (raw && ACCENTS.includes(raw.accent)) p.accent = raw.accent;
  p.header = { ...p.header, ...(raw && raw.header) };
  p.intro = (raw && raw.intro) || '';

  const tplPanels = (template && template.panels) || [];
  p.panels = ((raw && raw.panels) || []).map((rp, i) => panelFromAI(rp, nextId, tplPanels[i] && tplPanels[i].id));

  p.banner = raw && raw.banner && raw.banner.show ? { text: raw.banner.text || '' } : null;

  p.results = {
    note: (raw && raw.results && raw.results.note) || '',
    metrics: ((raw && raw.results && raw.results.metrics) || []).map((m) => ({
      value: m.value || '', label: m.label || '', sub: m.sub || '',
    })),
  };

  const tplCharts = (template && template.charts) || [];
  p.charts = ((raw && raw.charts) || []).map((rc, i) => chartFromAI(rc, nextId, tplCharts[i] && tplCharts[i].id));

  p.conclusion = (raw && raw.conclusion) || '';
  return p;
}

/* ================= public API ================= */

/**
 * Plans a full Poster Spec from free text (and optional chart images) in one
 * structured-output API call.
 * @param {string} text - source text (study abstract, findings, talking points).
 * @param {{format?:'poster-landscape', lang?:'en'|'ru', images?:string[]}} params
 *   `images` - dataURLs of any charts/figures the user attached. Sent to Claude
 *   as vision content so it can read and redraw them as native charts[].
 * @returns {Promise<object>} a Poster Spec (see js/poster-model.js)
 */
export async function planPoster(text, { format = 'poster-landscape', lang = 'en', images = [] } = {}) {
  const key = ensureKey();
  if (!key) throw new Error('An Anthropic API key is required to plan a poster.');

  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Paste some source text before generating a poster.');

  // Unreadable/unsupported images are dropped rather than failing the whole plan.
  const imageBlocks = (images || []).map(imageBlockFromDataUrl).filter(Boolean);

  const userParts = [
    `format: ${format}`,
    `lang: ${lang}`,
    'Source text:',
    trimmed,
  ];

  if (imageBlocks.length > 0) {
    const label = imageBlocks.length === 1 ? 'Image 1 is' : `Image 1–${imageBlocks.length} are`;
    userParts.push(`${label} attached above, in order. Read each one, extract its data, and rebuild it as native charts per your instructions — only fall back to a chart with imageRef when a figure truly cannot be reconstructed.`);
  }

  // Anthropic vision content is an ARRAY: image blocks first (in order, matching
  // "Image 1, Image 2, …"), then the text block. Passed through unchanged.
  const textContent = userParts.join('\n\n');
  const content = imageBlocks.length > 0
    ? [...imageBlocks, { type: 'text', text: textContent }]
    : textContent;

  const messages = [{ role: 'user', content }];
  const raw = await callClaude({ key, system: SYSTEM_PLAN, schema: POSTER_SCHEMA, messages });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('The AI response was not valid JSON: ' + e.message);
  }

  return posterFromAI(parsed, { format });
}

// Human-readable description of the targeted section, so the refine prompt can
// name exactly what to change even for the array sections (a panel/chart by id).
function describeSection(poster, sectionId) {
  switch (sectionId) {
    case 'header': return 'the header (title, emphasis word, kicker)';
    case 'intro': return 'the intro / problem paragraph';
    case 'results': return 'the results row (the headline metric numbers)';
    case 'banner': return 'the objective banner';
    case 'conclusion': return 'the conclusion paragraph';
    default: break;
  }
  const panelIdx = (poster.panels || []).findIndex((p) => p.id === sectionId);
  if (panelIdx >= 0) {
    const h = (poster.panels[panelIdx].heading || '').trim();
    return `study panel #${panelIdx + 1}${h ? ` ("${h}")` : ''}`;
  }
  const chartIdx = (poster.charts || []).findIndex((c) => c.id === sectionId);
  if (chartIdx >= 0) {
    const t = (poster.charts[chartIdx].title || '').trim();
    return `chart #${chartIdx + 1}${t ? ` ("${t}")` : ''}`;
  }
  return `the "${sectionId}" section`;
}

/**
 * Refines one section of a poster via a conversational chat turn. Mirrors
 * refineSlide: the conversation is seeded with the current poster as JSON, each
 * user turn names a section to change, and the FULL updated poster is returned
 * each time so later turns ("revert that") resolve relative to earlier ones.
 * Section ids are preserved (by index) across the edit.
 * @param {object} poster - the current Poster Spec (see js/poster-model.js)
 * @param {string} sectionId - which section to edit: 'header' | 'intro' |
 *   'results' | 'banner' | 'conclusion' | a panel id | a chart id.
 * @param {string} message - the user's chat instruction
 * @param {Array} history - prior {role, content} turns (or [] to start fresh)
 * @returns {Promise<{poster: object, history: Array}>}
 */
export async function refinePosterSection(poster, sectionId, message, history = []) {
  const key = ensureKey();
  if (!key) throw new Error('An Anthropic API key is required to refine this poster.');

  const trimmedMsg = (message || '').trim();
  if (!trimmedMsg) throw new Error('Type an instruction before sending.');

  const messages = [...history];
  if (!messages.length) {
    // Seed with the poster's current state (same pattern as refineSlide) so
    // "revert"/"undo" have something to compare against on the first turn.
    const currentJSON = JSON.stringify(stripPosterForAI(poster));
    messages.push({ role: 'user', content: `Here is the current poster as JSON. Treat it as the current design; you will receive edit instructions next.\n${currentJSON}` });
    messages.push({ role: 'assistant', content: currentJSON });
  }

  const section = describeSection(poster, sectionId);
  messages.push({ role: 'user', content: `Edit ONLY ${section}. Leave every other section byte-for-byte unchanged.\nInstruction: ${trimmedMsg}` });

  const raw = await callClaude({ key, system: SYSTEM_REFINE, schema: POSTER_SCHEMA, messages });
  messages.push({ role: 'assistant', content: raw });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('The AI response was not valid JSON: ' + e.message);
  }

  // Merge onto a fresh poster but reuse the current poster's format/ids/assets
  // so section ids (and the untouched carousel-free bits) stay stable.
  const updated = posterFromAI(parsed, { format: poster.format, template: poster });
  return { poster: updated, history: messages };
}
