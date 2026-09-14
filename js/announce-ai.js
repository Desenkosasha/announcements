// announce-ai.js — Efferon Carousel Studio: AI for the ANNOUNCE output types.
//   planEvent(text)        -> fills an Event Spec from free text
//   resolveCountry(name)   -> resolves a country name to {iso, phrases, lang}
//
// Transport plumbing (fetch to api.anthropic.com, browser-direct header, model,
// structured output via output_config.format, the shared localStorage key) is
// the SAME as deck-ai.js / poster-ai.js — ported verbatim, not reinvented.
// Every AI response is merged onto a model default (newEvent()/newCountry()) so
// unset fields fall back to the model's own values, never to values invented here.

import { newEvent, newCountry } from './announce-model.js';
import { ensureKey } from './deck-ai.js';

const MODEL = 'claude-opus-4-8';
const API_URL = 'https://api.anthropic.com/v1/messages';

/* Product wordmark used in the country phrase ("Efferon® LPS ..."). */
const PRODUCT_LABEL = { lps: 'LPS', ct: 'CT', neo: 'NEO' };

/* ---------------- schemas ---------------- */
const EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'lede', 'date', 'venue', 'address'],
  properties: {
    title:   { type: 'string', description: 'The announcement headline, e.g. "Meet Efferon at the Unite for Sepsis Symposium". Sentence case, concise, no trailing period.' },
    lede:    { type: 'string', description: 'One short supporting paragraph (1–3 sentences). Empty string if the source gives nothing.' },
    date:    { type: 'string', description: 'Event date(s) as shown, e.g. "June 11–12, 2026". Use an en-dash for ranges. Empty string if unknown.' },
    venue:   { type: 'string', description: 'Venue name, e.g. "Kellogg Conference Hotel Capitol Hill at Gallaudet University". Empty string if unknown.' },
    address: { type: 'string', description: 'Street / city address, e.g. "800 Florida Ave NE, Washington, DC". Empty string if unknown.' },
  },
};

const COUNTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['country', 'iso', 'phraseEN', 'emphasis', 'phraseLocal', 'langName'],
  properties: {
    country:     { type: 'string', description: 'The country name in English, e.g. "Poland".' },
    iso:         { type: 'string', description: 'ISO 3166-1 alpha-2 code, UPPERCASE, e.g. "PL".' },
    phraseEN:    { type: 'string', description: 'Exactly "Efferon® <PRODUCT> is available in <Country>", e.g. "Efferon® LPS is available in Poland".' },
    emphasis:    { type: 'string', description: 'The country name exactly as it appears in phraseEN (this word is highlighted red), e.g. "Poland".' },
    phraseLocal: { type: 'string', description: 'phraseEN translated into the country\'s primary official language, keeping "Efferon® <PRODUCT>" untranslated. Correct diacritics. e.g. "Efferon® LPS dostępny w Polsce".' },
    langName:    { type: 'string', description: 'English name of that official language, e.g. "Polish".' },
    scene:       { type: 'string', description: 'A short image-search query for ONE instantly recognizable, photogenic landscape/cityscape/landmark of the country, suitable as a bright background photo. Name the specific place. e.g. Poland -> "Wawel Castle Krakow Vistula river", Germany -> "Neuschwanstein castle Bavaria", Japan -> "Mount Fuji Chureito pagoda", France -> "Eiffel Tower Paris Seine".' },
  },
};

/* ---------------- transport (verbatim from poster-ai.js) ---------------- */
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
      max_tokens: 4000,
      system,
      output_config: { format: { type: 'json_schema', schema } },
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === 'text');
  if (!block) throw new Error('Anthropic API returned no text content.');
  return block.text;
}

/* ---------------- event ---------------- */
const SYSTEM_EVENT = `You turn free text about an Efferon event/conference appearance into the fields of an EVENT ANNOUNCEMENT social post.

RULES
- Efferon makes medical devices for extracorporeal blood purification in sepsis. Keep the tone professional and warm.
- Write ONLY what the source says. Do NOT invent dates, venues, addresses, or claims. Leave a field as an empty string when the source gives nothing.
- title: the headline (often "Meet Efferon at <event>"). Concise, sentence case, no trailing period.
- lede: one short supporting paragraph, or empty.
- date / venue / address: exactly as given. Use an en-dash (–) for date ranges (e.g. "June 11–12, 2026").
- No em-dashes (—) anywhere in copy; use commas/colons/periods.
- Output must satisfy the JSON schema.`;

export async function planEvent(text, { lang = 'en' } = {}) {
  const key = ensureKey();
  if (!key) throw new Error('An Anthropic API key is required to generate an announcement.');
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Paste some source text before generating an announcement.');

  const messages = [{ role: 'user', content: `lang: ${lang}\n\nSource text:\n\n${trimmed}` }];
  const raw = await callClaude({ key, system: SYSTEM_EVENT, schema: EVENT_SCHEMA, messages });
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error('The AI response was not valid JSON: ' + e.message); }

  return { ...newEvent(), lang, ...pick(parsed, ['title', 'lede', 'date', 'venue', 'address']) };
}

/* ---------------- country ---------------- */
const SYSTEM_COUNTRY = `You resolve a country (given by name in any language, or an ISO code) into the fields of a NEW-COUNTRY ANNOUNCEMENT for an Efferon product.

You are given the country reference and the product wordmark (LPS, CT or NEO).

RULES
- scene: name ONE iconic, bright, photogenic place in the country for a background photo (a landmark + city/nature). Be specific so an image search finds it.
- iso: ISO 3166-1 alpha-2, UPPERCASE (Poland -> PL, Germany -> DE, Japan -> JP).
- country: the English country name.
- phraseEN: EXACTLY "Efferon® <PRODUCT> is available in <Country>" (® right after Efferon). e.g. "Efferon® LPS is available in Poland".
- emphasis: the <Country> substring exactly as written in phraseEN.
- phraseLocal: phraseEN translated into the country's PRIMARY official language, but keep "Efferon® <PRODUCT>" untranslated (it is a brand). Use correct native spelling and diacritics. If a country has several official languages, choose the most widely used one. e.g. Poland -> "Efferon® LPS dostępny w Polsce".
- langName: English name of that language (e.g. "Polish").
- No em-dashes. Output must satisfy the JSON schema.`;

export async function resolveCountry(nameOrCode, { product = 'lps' } = {}) {
  const key = ensureKey();
  if (!key) throw new Error('An Anthropic API key is required to resolve a country.');
  const ref = (nameOrCode || '').trim();
  if (!ref) throw new Error('Type a country name first.');

  const label = PRODUCT_LABEL[product] || 'LPS';
  const messages = [{ role: 'user', content: `product wordmark: ${label}\ncountry: ${ref}` }];
  const raw = await callClaude({ key, system: SYSTEM_COUNTRY, schema: COUNTRY_SCHEMA, messages });
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error('The AI response was not valid JSON: ' + e.message); }

  const iso = String(parsed.iso || '').trim().toUpperCase().slice(0, 2);
  return {
    ...newCountry(),
    product,
    ...pick(parsed, ['country', 'phraseEN', 'emphasis', 'phraseLocal', 'langName', 'scene']),
    iso,
  };
}

/* Fetch a recognizable landscape photo of the country from Wikimedia Commons
   (free, no key). Returns a data URI (fetched blob → dataURL, so it's export-safe
   and canvas-baking works) or null. `query` is the AI-suggested `scene`. */
function blobToDataURL(blob){
  return new Promise((ok,no)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=no; r.readAsDataURL(blob); });
}
export async function fetchScenePhoto(query){
  const q = (query || '').trim();
  if(!q) return null;
  try{
    const params = new URLSearchParams({
      action:'query', format:'json', origin:'*',
      generator:'search', gsrsearch:`filetype:bitmap ${q}`, gsrlimit:'12', gsrnamespace:'6',
      prop:'imageinfo', iiprop:'url|mime|size', iiurlwidth:'3200',
    });
    const res = await fetch('https://commons.wikimedia.org/w/api.php?' + params);
    const data = await res.json();
    const pages = data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
    const infos = pages.map(p => p.imageinfo && p.imageinfo[0]).filter(Boolean)
      .filter(i => /jpeg|jpg|png/i.test(i.mime || ''));
    // Prefer landscape-oriented AND big enough that the 2160² square crop is
    // real pixels rather than an upscale (that upscale is what reads as
    // "the photo went pixelated"). Fall back progressively.
    const landscape = infos.filter(i => (i.thumbwidth || i.width) >= (i.thumbheight || i.height));
    const bigEnough = landscape.filter(i => (i.width || 0) >= 2400);
    const pick = bigEnough[0] || landscape[0] || infos[0];
    if(!pick) return null;
    const blob = await (await fetch(pick.thumburl || pick.url)).blob();
    return await blobToDataURL(blob);
  }catch(_){ return null; }
}

/* small helper: copy only the listed keys that are present + string */
function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => { if (typeof obj?.[k] === 'string') out[k] = obj[k]; });
  return out;
}
