// deck-ai.js — Efferon Carousel Studio: AI deck planning + per-slide chat refine.
// Transport plumbing (fetch to api.anthropic.com, browser-direct header, model,
// structured output via output_config.format, localStorage key) is ported
// verbatim from studio.html's callScene()/getKey() pattern — do not reinvent it.
//
// This module never invents Deck Spec fields: every schema below mirrors the
// exact shape produced by js/deck-model.js's newSlide()/demoDeck(), and every
// AI response is merged onto a newSlide()-seeded object so unset fields fall
// back to the model's own defaults (never to ad-hoc values invented here).

import { newDeck, newSlide } from './deck-model.js';

/* ================= CONFIG ================= */

const MODEL = 'claude-opus-4-8';
const API_URL = 'https://api.anthropic.com/v1/messages';
// Same localStorage key as studio.html's sibling tool — entering the key once
// in either tool carries over to the other (same browser, same origin).
const KEY_STORAGE = 'eff_key';

const ROLES = [
  'cover', 'problem', 'design', 'economics', 'comparison',
  'isotype', 'figure', 'benefits', 'quote', 'closing', 'generic', 'explainer',
];
const GROUNDS = ['', 'coral', 'blue', 'violet', 'teal', 'bluecoral', 'light'];
const LAYOUTS = ['hero', 'two-up', 'stack', 'grid'];
const ACCENTS = ['blue', 'coral', 'violet'];
const DENSITIES = ['compact', 'normal', 'airy'];
const ALIGNS = ['left', 'center'];
const BLOCK_TYPES = [
  'bignumber', 'barset', 'kpis', 'markers', 'iconarray',
  'circles', 'checkgrid', 'quote', 'photofigure', 'text',
  'column', 'lineplot', 'groupbars', 'diptych', 'sieve', 'surface',
  'mediagrid', 'mediaimage', 'mediachart',
];

/* ================= API KEY (localStorage, same pattern as studio.html) ================= */

/**
 * Reads the Anthropic API key from localStorage; if absent, prompts the user
 * once and stores it. Returns null if the user cancels the prompt — callers
 * must handle that (the app stays fully usable with the demo deck either way).
 * @returns {string|null}
 */
export function ensureKey() {
  let key = (localStorage.getItem(KEY_STORAGE) || '').trim();
  if (!key) {
    const entered = window.prompt(
      'Paste your Anthropic API key (sk-ant-...). Stored only in this browser, sent only to api.anthropic.com.'
    );
    key = (entered || '').trim();
    if (key) localStorage.setItem(KEY_STORAGE, key);
  }
  return key || null;
}

/* ================= JSON SCHEMA (structured output) ================= */
// Top-level Slide/Deck fields are strictly constrained (role/layout/style
// enums, skeleton booleans). Block `data` is deliberately left as a plain
// object — the block vocabulary is enforced in the prompt (with concrete
// examples), not in the schema, so we don't have to hand-encode 10 different
// per-block-type shapes here and risk drifting from deck-render.js.
//
// `id` and `asset` are NOT part of what the AI returns: ids are assigned by
// newSlide()/deck-model.js, and asset.dataUrl can only ever be a real
// uploaded image (Task 6) — the AI has no image to give us, so it never
// touches that field. See slideFromAI()/slideToAI() below.

const SKELETON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kicker', 'title', 'subtitle', 'footer', 'showLogo', 'showKicker', 'showSubtitle', 'showFooter', 'showDots'],
  properties: {
    kicker: { type: 'string', description: 'Short category word/phrase, e.g. "Results", "Study design". Never a sentence, never ALL-CAPS.' },
    title: { type: 'string', description: 'The slide headline. Sentence case, concise.' },
    subtitle: { type: 'string', description: 'Optional one-line subhead. Empty string if not needed.' },
    footer: { type: 'string', description: 'Small footer caption (source, date range). Empty string if not needed.' },
    showLogo: { type: 'boolean' },
    showKicker: { type: 'boolean' },
    showSubtitle: { type: 'boolean' },
    showFooter: { type: 'boolean' },
    showDots: { type: 'boolean' },
  },
};

const STYLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titleScale', 'numberScale', 'bodyScale', 'density', 'align', 'accent'],
  properties: {
    titleScale: { type: 'number', description: 'Gradient TITLE size multiplier, keep in 0.7–1.4; 1 = default.' },
    numberScale: { type: 'number', description: 'Big-NUMBER size multiplier, keep in 0.7–1.4; 1 = default.' },
    bodyScale: { type: 'number', description: 'Card BODY-TEXT size multiplier (the term/definition/statement/list text inside the white card), keep in 0.7–1.5; 1 = default. Raise it when the user asks to make the slide text / description / body bigger.' },
    density: { type: 'string', enum: DENSITIES },
    align: { type: 'string', enum: ALIGNS },
    accent: { type: 'string', enum: ACCENTS },
  },
};

const BLOCK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'data'],
  properties: {
    type: { type: 'string', enum: BLOCK_TYPES },
    // `data` crosses the API as a JSON-ENCODED STRING, not a nested object.
    // Anthropic strict structured output forbids open objects (every object
    // needs additionalProperties:false + all props required), but each block
    // type has its own variable shape. Encoding data as a string sidesteps
    // that while the prompt's block reference keeps field names on-contract.
    // Parsed back into an object in slideFromAI() via dataFromAI().
    data: {
      type: 'string',
      description: 'A JSON object encoded as a string (NOT a nested object) holding this block type\'s fields — e.g. "{\\"lede\\":\\"...\\",\\"items\\":[...]}". Use the exact field names from the block reference.',
    },
  },
};

const SLIDE_CONTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['role', 'skeleton', 'layout', 'style', 'blocks'],
  properties: {
    role: { type: 'string', enum: ROLES },
    skeleton: SKELETON_SCHEMA,
    layout: { type: 'string', enum: LAYOUTS },
    style: STYLE_SCHEMA,
    blocks: { type: 'array', items: BLOCK_SCHEMA },
  },
};

const DECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['format', 'lang', 'kind', 'ground', 'slides'],
  properties: {
    format: { type: 'string', enum: ['portrait', 'square', 'story'] },
    lang: { type: 'string', enum: ['en', 'ru'] },
    kind: { type: 'string', description: 'A 1–3 word label naming the narrative type of the whole carousel, e.g. "Case study", "Clinical trial", "Cost analysis", "Mechanism", "Product overview", "Study results". Shown as a small badge on every slide. Sentence case, no ALL-CAPS.' },
    ground: { type: 'string', enum: GROUNDS, description: 'The gradient background for the whole deck. "" = the signature blue→violet→coral mesh (default, safe). Pick a single smooth brand ground when it suits the topic: "coral" (warm, general/positive), "blue" (clinical/trust), "violet", "teal", "bluecoral" (diagonal blue→coral). "light" = a light dot-grid with dark blue text (editorial). Keep ONE ground for the whole deck. When unsure, use "".' },
    slides: { type: 'array', items: SLIDE_CONTENT_SCHEMA },
  },
};

/* ================= PROMPT: block reference + worked examples ================= */
// Built from real objects (not hand-typed JSON strings) so the examples are
// always syntactically valid and always in sync with SLIDE_CONTENT_SCHEMA —
// these are literally the two demoDeck() slides (problem, comparison),
// stripped to the AI-owned fields (no id/asset), from js/deck-model.js.

const BLOCK_FIELD_REFERENCE = `
- bignumber: { "lede": string, "items": [{ "value": string, "unit": string, "label": string }] } — 1 item = one hero number; 2+ items = a stat row. Use for a single dominant figure or 2–3 supporting figures.
- barset: { "lede": string, "bars": [{ "name": string, "pct": number (0-100), "dir": "up"|"down", "sub": string, "win": boolean }] } — one bar per group/arm being compared. Set "win": true on the arm the story favors (it gets the coral highlight); false on the rest.
- kpis: { "lede": string, "items": [{ "label": string, "num": string, "sub": string, "dot": "blue"|"coral"|"grey" }] } — a compact grid of 3–5 short key numbers (e.g. study design: enrolled, sites, arms).
- markers: { "items": [{ "color": "blue"|"coral"|"violet", "label": string, "value": string }] } — a simple labeled row, e.g. biomarker names + values.
- iconarray: { "columns": [{ "filled": number, "total": number, "pct": string, "label": string }], "note": string } — pictogram comparison (e.g. "X of 10" mortality/survival visuals). MUST have columns — the numbers ARE the pictogram (e.g. "28-day mortality 9% vs 35%" → two columns: {filled:1,total:10,pct:"9%",label:"Hemoadsorption"} and {filled:4,total:10,pct:"35%",label:"Control"}). "note" is only a small caption — NEVER put the key finding only in note with empty columns.
- circles: { "items": [{ "pct": number (0-100), "color": "blue"|"coral"|"violet", "label": string }] } — a row of ring/donut stats.
- checkgrid: { "items": [string, ...] } — a short list of benefit phrases, one per bubble. No numbering, no punctuation at the end.
- quote: { "text": string, "author": string, "affiliation": string } — an expert quote; the speaker's name/affiliation go in author/affiliation, never inside the title.
- photofigure: { "lede": string, "caption": string, "legend": [{ "label": string, "color": "blue"|"coral"|"violet" }], "imageRef"?: number } — a chart/figure card. Include "legend" only for a two-series chart; use an empty array [] when there is no second series (a plain photo/figure). "imageRef": 1-based index of an attached image to place here, ONLY when you could not redraw it natively as a column/lineplot/barset/markers/kpis block — omit this field entirely when there is no attached image, or when you redrew the image as a native block instead.
- text: { "text": string } — a single short line, used on cover (a tag/pill line) and closing (a call-to-action like "Learn more →"). Also supports editorial VARIANTS for conceptual copy (set "variant"):
    · { "variant":"statement", "text": string } — a confident lead/closing line (same as plain text; may carry emphasis tokens).
    · { "variant":"term", "term": string, "def": string, "accent"?: "coral"|"violet"|"blue", "aside"?: { "label": string, "text": string } } — a DEFINITION slide: a big term + its definition, with an optional soft analogy callout (aside).
    · { "variant":"tradeoff", "plain": string, "pivot": string, "cost": string } — a "gain, BUT at a cost" turn (plain = the gain; pivot = the turn phrase e.g. "but at a cost"; cost = the downside). Each non-empty part renders on its OWN LINE; to put copy on one line, fill a single part and leave the others as empty strings.
    · { "variant":"qualities", "def"?: string, "items": [string, ...] } — 2-4 short RELATED properties as an airy list (e.g. types of binding).
- diptych: { "left": { "term": string, "line": string, "glyph": "sieve"|"surface"|"membrane"|"cluster" }, "right": { "term": string, "line": string, "glyph": "sieve"|"surface"|"membrane"|"cluster" } } — contrast TWO concepts side by side (left reads coral, right violet). Use for "two principles / A vs B" ideas. "line" is one short phrase; pick the "glyph" whose picture best fits each side (a sieve/membrane for size-filtration, a surface/cluster for surface-binding).
- sieve: { "term"?: string, "def": string, "aside"?: { "label": string, "text": string } } — the FILTRATION metaphor drawn as a membrane separating particles by size. def = one line; aside = an everyday analogy (e.g. a coffee filter). Defaults term to "Filtration". This block renders its OWN big term inside the card, so set the slide's skeleton.kicker to a short SECTION label (e.g. "A mechanical sieve"), NOT the term itself, and keep skeleton.title short — the term is the headline.
- surface: { "term"?: string, "def": string, "note"?: string } — the ADSORPTION metaphor drawn as molecules binding to a sorbent surface, including specificity (a tailored ligand). def = one line; note = an optional small caption (do not simply repeat the def). Defaults term to "Adsorption". Renders its OWN big term, so set skeleton.kicker to a short SECTION label (e.g. "A matter of specificity"), NOT the term, and keep skeleton.title short.
- mediagrid: { "chips"?: [string, ...] } — a 4-tile media collage (placeholder tiles unless images are uploaded); "chips" are up to 4 short corner captions (e.g. scale bars "100 nm"). Used ONLY as the media of an "explainer" slide.
- mediaimage: { "chip"?: string } — a single large media tile (placeholder unless an image is uploaded); "chip" is one short corner caption. Used ONLY as the media of an "explainer" slide.
- mediachart: { "title"?: string, "sub"?: string, "unit"?: string, "bars": [{ "label": string, "value": number, "color": "blue"|"coral"|"violet"|"teal" }] } — a clean white-card bar chart for the media of an "explainer" slide. 2-4 bars; "unit" is appended to each value label (e.g. "%").

Inline emphasis: inside ANY copy string you may mark AT MOST one or two KEY TERMS with {{coral:term}}, {{violet:term}} or {{blue:term}}. The renderer turns them into soft color highlights. Never use bold, **, <b>, or ALL-CAPS. Sentence case only.
- column: { "lede": string, "ylabel": string, "unit": string, "color": "blue"|"coral"|"violet", "items": [{ "label": string, "value": number }] } — a vertical bar chart, one bar per category or time point (e.g. "Day 2", "Day 4", "Day 6"). Use for a single metric measured at a handful of time points or groups (e.g. CRP falling by day).
- lineplot: { "lede": string, "ylabel": string, "xlabels": [string, ...], "series": [{ "name": string, "color": "blue"|"coral"|"violet", "points": [number, ...] }] } — a line/trend chart, 1-3 series, one point per xlabels entry (points and xlabels must be the same length). Use for a continuous trend or curve across several time points (e.g. a lab value normalizing over days, a survival curve).
- groupbars: { "lede": string, "normalize": "global"|"pergroup", "legend": [{ "label": string, "color": "blue"|"coral"|"violet", "style": "solid"|"hatch" }], "groups": [{ "label": string (a "\\n" splits it onto a unit second line, e.g. "IL-6\\npg/mL"), "p"?: string (a small significance pill above this group, e.g. "p = 0.003"), "bars": [{ "value": number, "display"?: string (e.g. "9,6" for a comma decimal — height still uses value), "color": "blue"|"coral"|"violet", "style": "solid"|"hatch" }] }] } — GROUPED/PAIRED bar chart: N groups, each with the SAME 2 (sometimes 3) bars side by side. Use for a head-to-head measured across several categories or time points (e.g. Control vs Hemoadsorption at Day 1 and Day 7; each marker's Day 1 vs Day 2). normalize "global" = all bars share one scale (use when magnitudes are comparable); "pergroup" = each group scaled to its own tallest bar (use when magnitudes differ wildly across groups, e.g. 700 vs 8, so the small group is still visible). Give the two bars a consistent legend (colors/styles matching the bars). Put a single overall p-value in skeleton.footer (renders as the bottom pill); use per-group "p" pills only when each group has its own p-value.
`.trim();

// block.data crosses the API as a JSON-encoded STRING (see BLOCK_SCHEMA).
function dataToString(d) { return typeof d === 'string' ? d : JSON.stringify(d || {}); }
function dataFromAI(d) {
  if (d && typeof d === 'object') return d;
  if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) { return {}; } }
  return {};
}

function stripAiFields(slide) {
  return {
    role: slide.role,
    skeleton: { ...slide.skeleton },
    layout: slide.layout,
    style: { ...slide.style },
    // data as a JSON string, matching BLOCK_SCHEMA (used for prompt examples
    // and the refine-conversation seed so the model mirrors the wire shape).
    blocks: (slide.blocks || []).map((b) => ({ type: b.type, data: dataToString(b.data) })),
  };
}

// Two real demoDeck() slides, used as worked examples in the prompt so the
// model mirrors field names exactly instead of guessing at a plausible shape.
const EXAMPLE_PROBLEM_SLIDE = {
  role: 'problem',
  skeleton: {
    kicker: 'Context', title: 'Pediatric sepsis remains a critical challenge',
    subtitle: '', footer: 'WHO global sepsis report',
    showLogo: true, showKicker: true, showSubtitle: true, showFooter: true, showDots: false,
  },
  layout: 'hero',
  style: { titleScale: 1, numberScale: 1, bodyScale: 1, density: 'normal', align: 'left', accent: 'coral' },
  blocks: [{
    type: 'bignumber',
    data: {
      lede: 'Children are among the most vulnerable ICU patients',
      items: [
        { value: '40', unit: '%', label: 'of sepsis cases occur in children under 5' },
        { value: '20', unit: 'mln', label: 'cases annually — the global sepsis burden' },
      ],
    },
  }],
};

const EXAMPLE_COMPARISON_SLIDE = {
  role: 'comparison',
  skeleton: {
    kicker: 'Results', title: 'Primary endpoint achieved',
    subtitle: '', footer: 'Baseline → Day 7 · pSOFA score',
    showLogo: true, showKicker: true, showSubtitle: true, showFooter: true, showDots: false,
  },
  layout: 'two-up',
  style: { titleScale: 1, numberScale: 1, bodyScale: 1, density: 'normal', align: 'left', accent: 'coral' },
  blocks: [{
    type: 'barset',
    data: {
      lede: 'pSOFA significantly lower with hemoadsorption on Day 7',
      bars: [
        { name: 'Hemoadsorption', pct: 51, dir: 'down', sub: 'pSOFA 10.1 → 4.9 by Day 7', win: true },
        { name: 'Control', pct: 19, dir: 'down', sub: 'pSOFA 9.6 → 7.8 by Day 7', win: false },
      ],
    },
  }],
};

const WORKED_EXAMPLES = `
Example 1 — a "problem" slide (bignumber block). NOTE how "data" is a JSON string, not a nested object:
${JSON.stringify(stripAiFields(EXAMPLE_PROBLEM_SLIDE), null, 2)}

Example 2 — a "comparison" slide (barset block):
${JSON.stringify(stripAiFields(EXAMPLE_COMPARISON_SLIDE), null, 2)}
`.trim();

const ROLE_GUIDE = `
- cover: opening slide, one hero idea. Put the MAIN TITLE in skeleton.title — it renders as a big centred headline that fills the slide, so make it a real title (a few strong words), not a long sentence. The text block is only a SHORT optional tag line beneath it (or omit it) — never put the whole title into the text block and leave skeleton.title empty. layout "hero".
- problem: sets up the clinical or economic problem/context. Usually a bignumber block with 1–2 items.
- design: study design / methodology. Usually a kpis block (enrolled, sites, arms). layout often "grid".
- comparison: head-to-head result between two or three arms/groups on one metric. A barset block, layout "two-up". The favored arm gets win:true.
- isotype: mortality/survival or other proportion, told as a pictogram. An iconarray block.
- economics: cost or efficiency data. A bignumber block, usually one hero figure.
- figure: a chart or photographic figure as evidence. A photofigure block, or a column/lineplot chart when the "figure" is really a metric measured across time points rather than a photo.
- benefits: a short list of clinical benefits/advantages. A checkgrid block.
- quote: an expert opinion. A quote block.
- closing: recap / call to action. Usually blocks = [text (a short line like "Learn more →")]. layout "hero".
- generic: only when none of the above genuinely fits.
- explainer: a full-bleed "here is how it works / here is the finding" slide — a big title + one subtitle line + a MEDIA area + a short body paragraph + a takeaway note, all directly on the gradient (no white card). Blocks = [ a media block (mediagrid = a 4-image collage, mediaimage = one large photo, or mediachart = a bar chart) , then a text block (the body paragraph) ]. Put the headline in skeleton.title, the one-line subtitle in skeleton.subtitle, and the takeaway sentence in skeleton.footer (it renders as a checked callout at the bottom). Use when a point is best carried by imagery/a chart WITH a short explanation (a mechanism photo set, a single figure, one headline chart).

For CONCEPTUAL / explainer content (mechanisms, "how it works", contrasts of ideas, definitions — text with few or no numbers), the problem/design/generic roles should carry concept forms rather than plain text: a contrast of two ideas → a diptych block; a mechanism/metaphor → a sieve (size-filtration) or surface (surface-binding) block; a definition → a text block with variant "term"; a trade-off → text variant "tradeoff"; a short set of properties → text variant "qualities". Keep the gradient title (skeleton.title) SHORT on these slides (or a brief section phrase) — the concept block's own term/illustration is the real headline inside the card.
`.trim();

const BRAND_RULES = `
Hard brand and design rules — never break these:
- The dir-4 gradient/skeleton visual system is fixed. You control layout composition, copy, block choice, and the style knobs below — nothing else.
- One hero idea per slide. Never cram two unrelated facts onto one artboard; split into two slides instead.
- No ALL-CAPS anywhere — not in kicker, title, or any label. Sentence case only.
- Emphasis is color-only and sparing: mark at most one or two KEY TERMS per copy string. The house TEXT emphasis is BRAND BLUE {{blue:...}} — use it for inline highlights. Do NOT use the red/coral pill for neutral text emphasis (coral reads as an alert; blue is the Efferon brand voice); reserve {{coral:...}} for a single genuinely negative/warning term (e.g. "a {{coral:significant loss}} of protein"), and {{violet:...}} almost never. (This is about TEXT highlights only — a coral bar / hero number for a winning data figure is a data color, not a text pill, and stays coral per the accent rule below.) Never use bold, **, <b>, ALL-CAPS, or any markdown. The renderer turns the tokens into soft color highlights.
- No em-dashes (the long "—") anywhere in any copy. Use a comma, a colon, or a full stop instead. (A short en-dash in a numeric range like "7-8" or "409-189" is fine.)
- Copy is concise and medical-professional: no hype, no exclamation marks, no marketing adjectives ("revolutionary", "amazing"). Say what the data says.
- WRITE ONLY WHAT THE SOURCE SAYS. Every line of copy (title, kicker, lede, body, caption, quote, conclusion) must be grounded in the provided input. Do NOT invent framing, ledes, subtitles, taglines, or interpretive claims the source does not support. Rephrase for concision, never add meaning. If a slot has no source material, use a simpler block or leave it empty rather than composing filler.
- Show the idea, not just the words. When the source has NUMBERS, prefer a numeric block (bignumber / kpis / barset / circles / iconarray / column / lineplot) over plain text. When the source is CONCEPTUAL (a mechanism, a contrast, a definition, a trade-off, a metaphor), reach for a concept form instead of dumping prose into a plain text block: a contrast of two ideas → diptych; a mechanism/metaphor → sieve or surface; a definition → text variant "term"; a gain-with-a-cost → text variant "tradeoff"; a short set of related properties → text variant "qualities". Fall back to a plain statement (text with no variant) ONLY for genuine lead/connective lines that carry no showable structure.
When the story is a single metric tracked over time or across a small number of groups (e.g. "CRP fell from 409 to 189 to 92 mg/L by Day 6"), use a column chart instead of bignumber/barset. When the story is a continuous trend or curve across several time points (e.g. a lab value normalizing over days, a Kaplan-Meier-like survival curve), use a lineplot chart. When TWO arms are compared side by side across several categories or time points (e.g. Control vs Treatment at Day 1 and Day 7; each inflammatory marker's Day 1 vs Day 2), use a groupbars chart — normalize "pergroup" when the groups' magnitudes differ wildly (e.g. 700 vs 8) so every group stays readable, else "global". Reach for bignumber/barset/iconarray only when there are just 1-2 data points to compare, not a series.
- Pick style.accent per slide with intent: "coral" is the default for the winning/positive/hero figure (a reduction, a survival benefit, the favored arm); "blue" for neutral or contextual slides; "violet" sparingly, as a change of pace (e.g. a quote slide).
- skeleton.kicker is one or two words naming the section (e.g. "Results", "Study design", "Economics") — never a full sentence.
- Never invent a number that is not in the source text. If the source is thin on data for a slide, use fewer items or a simpler block rather than fabricating figures.
- Give each data card a short heading line at the top via the main block's "lede" field (a brief description of what the card shows) — it renders as the card's first line, like a subheading. Put ONLY a source/citation (a study id, "Urine and blood cultures", a date range) in skeleton.footer, which renders small at the very bottom. Never put the card's descriptive heading in footer.
`.trim();

const SYSTEM_PREAMBLE = `You are a senior brand designer for Efferon composing LinkedIn data-viz carousels. Efferon is a medical company specializing in extracorporeal blood purification (hemoadsorption) for sepsis, septic shock, and cytokine storm.

You compose every slide from a fixed block vocabulary. You do NOT invent new block types or new fields — only the block types and "data" field names below exist. A slide's "blocks" array holds one or more { "type", "data" } entries. CRITICAL: the "data" value MUST be a STRING containing JSON (not a nested object) — e.g. "data": "{\\"lede\\":\\"Children are ...\\",\\"items\\":[...]}". Use the exact field names below inside that JSON string:
${BLOCK_FIELD_REFERENCE}

${WORKED_EXAMPLES}

Slide roles — assign the role that matches each slide's job (a deck rarely needs every role):
${ROLE_GUIDE}

${BRAND_RULES}`;

const SYSTEM_PLAN = `${SYSTEM_PREAMBLE}

You are planning a WHOLE DECK from the user's source text in one shot.

When the message says mode "plan": you decide the number of slides and the story arc. A typical carousel arc is: cover → problem/context → study design → results (comparison / bignumber / isotype) → economics → a quote → benefits → closing/CTA. Adapt this to the actual content — skip any act that has no supporting material in the source text; do not force every role into a short or narrow input. Use 8–14 slides for a full carousel deck, or exactly 1 slide if the message says the output is a single slide.

CONCEPTUAL INPUT — worked mapping. When the text is an explainer with few numbers (e.g. a "filter or adsorber?" post about how blood-purification mechanisms work), do NOT stack plain text slides. Map the ideas to forms like this (each block's "data" is a JSON-encoded STRING):
- Cover → title "Filter or adsorber?", a text block { "text": "Two ways to clean the blood in sepsis." }.
- "Two core mechanisms: filtration and adsorption" → a diptych: { "left": { "term": "Filtration", "line": "Separation by size.", "glyph": "sieve" }, "right": { "term": "Adsorption", "line": "Binding by surface.", "glyph": "surface" } }.
- "Filtration = a membrane that lets small particles pass, holds larger ones back; like a coffee filter" → a sieve block: { "def": "A porous membrane lets {{blue:small particles}} through and holds the larger ones back.", "aside": { "label": "Think of it like", "text": "A coffee filter: the water passes, the grounds stay behind." } }.
- "High cut-off membranes clear more cytokines but cause protein loss" → a text tradeoff: { "variant": "tradeoff", "plain": "Wider pores, {{blue:high cut-off membranes}}, clear more cytokines.", "pivot": "but at a cost", "cost": "a {{coral:significant loss}} of useful proteins." }.
- "Adsorption = molecules attach to a sorbent surface; specificity via a ligand" → a surface block: { "def": "Molecules attach to the surface of a solid {{violet:sorbent}}.", "note": "A tailored ligand can remove one target molecule." }.
- "Binding can be ionic or hydrophobic; specific or non-specific" → a text qualities: { "variant": "qualities", "items": ["Binding can be {{violet:ionic}} or {{violet:hydrophobic}}.", "It can be non-specific, or specific to certain molecules.", "A tailored ligand removes one target molecule."] }.
Keep numbers, when present, in numeric blocks as before — this mapping is for the number-free parts.

When the message says mode "outline": the source text has already been split into numbered lines, one line per slide, in that exact order — you must return exactly that many slides, in the same order, never merging or splitting lines. Choose the role/layout/block type that best dresses each line's content; the first line is usually cover-like and the last line is usually closing-like, but judge each line on its own words rather than forcing a pattern.

You may be given chart/figure images (Image 1, Image 2, …) attached above the text. For EACH image, read it, extract the underlying data (categories, series, values), and REBUILD it as native blocks — a metric over time or across a handful of groups → "column"; a trend/curve across several points → "lineplot"; two arms compared side by side across several categories/time points (grouped/paired bars) → "groupbars" (normalize "pergroup" if the groups differ wildly in magnitude); a single head-to-head between two or three arms → "barset"; a labelled list of values → "markers" or "kpis". Do NOT keep the original as a pasted image when you can reconstruct it — prefer redrawing every time.

CRITICAL — redraw ONE-TO-ONE, this is a matter of trust: reproduce exactly what the figure shows. Read off every value, every point of a curve, every bar and its precise height, the exact categories and axis labels, the number and order of series. Do NOT simplify, smooth, round, approximate, add, remove, reorder, or "improve" anything. If a chart has ten time points, draw ten; if a value is 176.2, do not write 176. A redrawn chart that differs from the source — even slightly — destroys the reader's trust in the whole carousel, so faithfulness beats tidiness every time.

ONLY when a figure genuinely cannot be faithfully reconstructed from what you can read (a Kaplan-Meier curve with confidence bands, a photograph, an anatomical schematic, a dense table you cannot parse) keep it as a "photofigure" block and set that block's "data.imageRef" to the image's 1-based index, so the original picture is placed there instead — never invent a caption for an image you are keeping only as a photofigure; describe what it shows in general terms. One attached image may become one native slide, several native slides, or (rarely) stay a single photofigure slide — judge each image on its own.

Write copy in the language given in the message (en or en/ru — match it exactly).

Classify the whole carousel: set "kind" to a 1–3 word label naming its narrative type (e.g. "Case study", "Clinical trial", "Cost analysis", "Mechanism", "Product overview", "Study results") — judge it from the source text. It appears as a small badge on every slide, so keep it short and sentence-case.

Output contract: return ONLY a Deck object — { "format", "lang", "kind", "slides" } — matching the JSON schema exactly, and nothing else (no markdown, no commentary, no text outside the JSON). "format" and "lang" must echo the values given in the message. Every slide must be fully specified: skeleton has all 9 fields (use empty strings for subtitle/footer when not needed, and leave every show* boolean true unless there is a specific reason to hide that element on that slide); style has all 5 fields; blocks is a non-empty array.`;

const SYSTEM_REFINE = `${SYSTEM_PREAMBLE}

You are refining ONE slide of an existing deck through an ongoing chat conversation.

This is a continuing conversation: the current slide (as JSON) is the most recent assistant message. Each user message is an instruction to change something about it. On every turn you must return the FULL updated slide: apply the instruction just given, AND keep every change requested in earlier turns of this conversation, AND leave anything not discussed exactly as it was, byte-for-byte. Understand relative instructions like "revert that", "undo", "no, put it back the way it was", "make it bigger again" by looking back at what actually changed in this conversation's earlier turns — do not guess from scratch. Never invent new numbers unless the user asked. Apply the user's EXACT new wording when they rewrite or replace copy — quote it verbatim (in whatever language they wrote it), don't paraphrase or keep the old wording.

Text blocks are FLEXIBLE — you may freely change a text block's "variant" and which fields are filled to match what the user asks. Each non-empty part of a "tradeoff" (plain / pivot / cost) renders on its OWN LINE; a "qualities" item and a "term"'s term/def likewise render separately. So:
- To put copy on ONE continuous line, place the whole sentence in a SINGLE field and leave the other fields as empty strings — or switch the block to variant "statement" with one "text" string. Do NOT keep text split across plain/pivot/cost when the user wants it merged into one sentence.
- To keep an emphasis when merging/rewriting, carry the {{coral:…}}/{{violet:…}}/{{blue:…}} token into the new wording.
Example: if the user says merge "but at a cost of" + "a significant loss of useful proteins" into one line "But at a cost of a significant loss of useful proteins.", return that as a single field (e.g. cost) with plain/pivot empty, preserving {{coral:significant loss}}.

Output contract: return ONLY the updated Slide object — role, skeleton (all 9 fields), layout, style (all 5 fields), blocks — matching the JSON schema exactly. No markdown, no commentary, no text outside the JSON.`;

const SYSTEM_ADD = `${SYSTEM_PREAMBLE}

You are creating ONE new slide to insert into an existing deck. You will be given the deck's current slides as context and a short description of the slide the user wants. Design a single slide that matches the deck's visual system and language and fulfils the description. If the description asks for a summary / recap / takeaways, SYNTHESISE from the existing slides — never invent new numbers; reuse only facts already present in the deck. Choose the role and block(s) that fit best (a summary often reads well as a checkgrid of takeaways, a short text statement, or a kpis/markers recap; keep one idea per slide).

Output contract: return ONLY a single Slide object — role, skeleton (all 9 fields), layout, style (all 5 fields), blocks (non-empty) — matching the JSON schema exactly. No markdown, no commentary, no text outside the JSON.`;

/* ================= transport (ported from studio.html's callScene) ================= */

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
// Accepted by the Messages API vision content block. Anything else (gif, svg,
// an unparsable/corrupt dataURL) is skipped gracefully — planDeck() still
// runs text-only for that image rather than failing the whole request.
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

/* ================= AI response -> Deck Spec (reuse newSlide()/newDeck() defaults) ================= */

function slideFromAI(raw) {
  const slide = newSlide(raw && raw.role ? raw.role : 'generic');
  slide.skeleton = { ...slide.skeleton, ...(raw && raw.skeleton) };
  slide.layout = (raw && raw.layout) || slide.layout;
  slide.style = { ...slide.style, ...(raw && raw.style) };
  slide.blocks = ((raw && raw.blocks) || []).map((b) => ({ type: b.type, data: dataFromAI(b.data) }));
  return slide;
}

/* ================= public API ================= */

/**
 * Plans a full Deck from free text in one API call.
 * @param {string} text - source text (study findings, abstract, talking points).
 * @param {{mode?:'plan'|'outline', format?:'portrait'|'square'|'story', lang?:'en'|'ru', output?:'carousel'|'single', images?:string[]}} params
 *   `images` - dataURLs of any charts/figures the user attached on the Input screen. Sent to
 *   Claude as vision content so it can read and redraw them as native blocks (see SYSTEM_PLAN).
 * @returns {Promise<object>} a Deck Spec (see js/deck-model.js)
 */
export async function planDeck(text, { mode = 'plan', format = 'portrait', lang = 'en', output = 'carousel', template = 'cards', images = [] } = {}) {
  const key = ensureKey();
  if (!key) throw new Error('An Anthropic API key is required to plan a deck.');

  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Paste some source text before generating a deck.');

  // Parse each attached dataURL into an Anthropic vision content block up
  // front; unreadable/unsupported images are dropped rather than failing the
  // whole plan (see imageBlockFromDataUrl()).
  const imageBlocks = (images || []).map(imageBlockFromDataUrl).filter(Boolean);

  const userParts = [
    `mode: ${mode === 'outline' ? 'outline' : 'plan'}`,
    `output: ${output === 'single' ? 'single slide' : 'carousel deck'}`,
    `format: ${format}`,
    `lang: ${lang}`,
    `template: ${template === 'gradient' ? 'gradient' : 'cards'}`,
  ];
  if (template === 'gradient') {
    userParts.push('TEMPLATE = gradient: compose EVERY content slide as role "explainer" — a big skeleton.title, a one-line skeleton.subtitle, a media block, a short text body block, and the takeaway sentence in skeleton.footer (it renders as a checked note). The media block is: mediagrid (a 4-image collage) or mediaimage (one photo) when the point is visual, OR mediachart (a clean bar chart) when the point is numeric — turn numbers/comparisons/trends into a mediachart rather than a white-card bignumber/barset/kpis. Do NOT use the white-card data blocks (bignumber/barset/kpis/markers/circles/iconarray/checkgrid/column/lineplot/photofigure) in this template. Keep the cover and closing slides as their usual roles. Everything sits directly on the gradient (no white cards).');
  }

  if (mode === 'outline') {
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    userParts.push(`There are exactly ${lines.length} lines below — one slide per line, in this exact order:`);
    userParts.push(lines.map((l, i) => `${i + 1}. ${l}`).join('\n'));
  } else {
    userParts.push('Source text:');
    userParts.push(trimmed);
  }

  if (output === 'single') {
    userParts.push('Return exactly ONE slide in the "slides" array.');
  } else if (mode !== 'outline') {
    userParts.push('Return 8–14 slides in the "slides" array, following the deck arc guidance.');
  }

  if (imageBlocks.length > 0) {
    const label = imageBlocks.length === 1 ? 'Image 1 is' : `Image 1–${imageBlocks.length} are`;
    userParts.push(`${label} attached above, in order. Read each one, extract its data, and rebuild it as native blocks per your instructions — only fall back to a photofigure with imageRef when a chart truly cannot be reconstructed.`);
  }

  // The Anthropic vision content-block shape is an ARRAY: image blocks first
  // (in order, matching "Image 1, Image 2, …" in the text), then the text
  // block. callClaude()/the request body pass this through unchanged — no
  // transport change needed, `messages` is serialized as-is.
  const textContent = userParts.join('\n\n');
  const content = imageBlocks.length > 0
    ? [...imageBlocks, { type: 'text', text: textContent }]
    : textContent;

  const messages = [{ role: 'user', content }];
  const raw = await callClaude({ key, system: SYSTEM_PLAN, schema: DECK_SCHEMA, messages });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('The AI response was not valid JSON: ' + e.message);
  }

  const deck = newDeck();
  deck.format = format;
  deck.lang = lang;
  deck.kind = (parsed.kind || '').trim();
  deck.ground = GROUNDS.includes(parsed.ground) ? parsed.ground : '';
  deck.slides = (parsed.slides || []).map(slideFromAI);
  if (!deck.slides.length) deck.slides.push(newSlide('generic'));
  return deck;
}

/**
 * Refines a single slide via a conversational chat turn. The FULL updated
 * slide is returned each time; `history` accumulates so later turns (e.g.
 * "revert that") can be understood relative to earlier ones.
 * @param {object} slide - the current Slide (see js/deck-model.js)
 * @param {string} message - the user's chat instruction
 * @param {Array} history - prior {role, content} turns for this slide (or [] to start fresh)
 * @returns {Promise<{slide: object, history: Array}>}
 */
export async function refineSlide(slide, message, history = []) {
  const key = ensureKey();
  if (!key) throw new Error('An Anthropic API key is required to refine this slide.');

  const trimmedMsg = (message || '').trim();
  if (!trimmedMsg) throw new Error('Type an instruction before sending.');

  const messages = [...history];
  if (!messages.length) {
    // Seed the conversation with the slide's current state, mirroring
    // studio.html's seedHistory() pattern, so "revert"/"undo" have something
    // to compare against even on the very first chat turn.
    const currentJSON = JSON.stringify(stripAiFields(slide));
    messages.push({ role: 'user', content: `Here is the current slide as JSON. Treat it as the current design; you will receive edit instructions next.\n${currentJSON}` });
    messages.push({ role: 'assistant', content: currentJSON });
  }
  messages.push({ role: 'user', content: trimmedMsg });

  const raw = await callClaude({ key, system: SYSTEM_REFINE, schema: SLIDE_CONTENT_SCHEMA, messages });
  messages.push({ role: 'assistant', content: raw });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('The AI response was not valid JSON: ' + e.message);
  }

  const updated = slideFromAI(parsed);
  // The AI never sees or invents real images — the id and any uploaded asset
  // carry over from the slide it was asked to edit.
  updated.id = slide.id;
  updated.asset = slide.asset;

  return { slide: updated, history: messages };
}

/**
 * Generates ONE new slide to insert into an existing deck, using the whole deck
 * as context (so e.g. "a summary of the key takeaways" synthesises from the real
 * slides). Returns a fresh Slide (with its own id); the caller inserts it.
 * @param {object} deck - the current Deck Spec (for language, format, context).
 * @param {string} description - what the new slide should be.
 * @returns {Promise<object>} a Slide Spec (see js/deck-model.js).
 */
export async function addAiSlide(deck, description) {
  const key = ensureKey();
  if (!key) throw new Error('An Anthropic API key is required to generate a slide.');
  const desc = (description || '').trim();
  if (!desc) throw new Error('Describe the slide you want.');

  const context = (deck.slides || []).map(stripAiFields);
  const userMsg = [
    `format: ${deck.format || 'portrait'}`,
    `lang: ${deck.lang || 'en'}`,
    'The deck so far (context — do not copy verbatim, synthesise where asked):',
    JSON.stringify(context),
    '',
    `Create ONE new slide: ${desc}`,
  ].join('\n');

  const raw = await callClaude({ key, system: SYSTEM_ADD, schema: SLIDE_CONTENT_SCHEMA, messages: [{ role: 'user', content: userMsg }] });
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { throw new Error('The AI response was not valid JSON: ' + e.message); }
  return slideFromAI(parsed);
}
