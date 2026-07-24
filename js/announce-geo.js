/* ============================================================
   Efferon Data Viz — Announce Geo Engine
   Self-contained, offline. Given any country name / ISO code:
     - white silhouette SVG path of the territory
     - a flag image href
   Powers the "new country announcement" social post template.

   Everything is vendored locally (no runtime network, no CDN):
     ../vendor/world-countries-110m.json   TopoJSON boundaries (world-atlas)
     ../vendor/iso-lookup.json             numeric/name -> ISO lookup (world-countries)
     ../vendor/d3-geo.esm.js               d3-geo (bundled, self-contained)
     ../vendor/topojson-client.esm.js      topojson-client (bundled)
     ../assets/flags/xx.svg                flag-icons 4x3 SVGs (all ISO countries)

   Interface:
     initGeo()               -> Promise, load datasets once (idempotent)
     resolveISO(nameOrCode)  -> "PL" | null
     countryPathD(iso2,opts) -> SVG path 'd' string fit to width x height | null
     countryViewBox(iso2,opts) -> "0 0 W H"
     flagHref(iso2)          -> href string for the flag (absolute URL to vendored svg)
     listCountries()         -> [{iso2, name}] sorted by name
   ============================================================ */

import { feature } from '../vendor/topojson-client.esm.js';
import { geoPath, geoMercator } from '../vendor/d3-geo.esm.js';

/* ---- module state ---- */
let _ready = null;                 // Promise cache (idempotent init)
let _loaded = false;
let _countries = [];               // [{iso2, iso3, ccn3, name}]
let _aliasMap = Object.create(null); // normalized alias -> iso2
let _featureByIso2 = new Map();    // iso2 -> GeoJSON Feature

/* Resolve a sibling asset relative to THIS module file, so paths work
   no matter which HTML page (root app or announce-explore/) imports us. */
function assetUrl(rel) {
  return new URL(rel, import.meta.url).href;
}

/* Normalize any label for lookup: lowercase, strip punctuation/spacing,
   keep all Unicode letters + digits (so Cyrillic / CJK native names work). */
function norm(s) {
  if (s == null) return '';
  return String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export async function initGeo() {
  if (_ready) return _ready;
  _ready = (async () => {
    const [topo, lookup] = await Promise.all([
      fetch(assetUrl('../vendor/world-countries-110m.json')).then(r => r.json()),
      fetch(assetUrl('../vendor/iso-lookup.json')).then(r => r.json()),
    ]);

    _countries = lookup.countries;
    _aliasMap = lookup.aliasMap;

    // numeric ISO id -> iso2, from the vendored lookup
    const numMap = lookup.numMap;

    // Build GeoJSON features and index them by ISO alpha-2.
    const fc = feature(topo, topo.objects.countries); // FeatureCollection
    for (const feat of fc.features) {
      const id = feat.id != null ? String(feat.id) : '';
      let iso2 = numMap[id];
      if (!iso2) {
        // world-atlas marks disputed territories with id "-99" (no numeric id).
        // Fall back to matching the feature's English name via the alias map.
        const nm = feat.properties && feat.properties.name;
        iso2 = nm ? _aliasMap[norm(nm)] : undefined;
      }
      if (iso2 && !_featureByIso2.has(iso2)) _featureByIso2.set(iso2, feat);
    }

    _loaded = true;
  })();
  return _ready;
}

function ensureLoaded() {
  if (!_loaded) throw new Error('announce-geo: call await initGeo() before using the geo engine.');
}

export function resolveISO(nameOrCode) {
  ensureLoaded();
  if (nameOrCode == null) return null;
  const key = norm(nameOrCode);
  if (!key) return null;
  const iso2 = _aliasMap[key];
  return iso2 ? iso2.toUpperCase() : null;
}

export function countryPathD(iso2, opts = {}) {
  ensureLoaded();
  if (!iso2) return null;
  const code = String(iso2).toUpperCase();
  const feat = _featureByIso2.get(code);
  if (!feat) return null;

  const width = opts.width || 300;
  const height = opts.height || 230;
  const padding = opts.padding != null ? opts.padding : 8;

  // fitExtent handles both scaling-to-fill AND centering within the padded box.
  const projection = geoMercator().fitExtent(
    [[padding, padding], [width - padding, height - padding]],
    feat
  );
  const path = geoPath(projection);
  const d = path(feat);
  return d || null;
}

export function countryViewBox(iso2, opts = {}) {
  const width = opts.width || 300;
  const height = opts.height || 230;
  return `0 0 ${width} ${height}`;
}

export function flagHref(iso2) {
  if (!iso2) return null;
  return assetUrl('../assets/flags/' + String(iso2).toLowerCase() + '.svg');
}

export function listCountries() {
  ensureLoaded();
  return _countries.map(c => ({ iso2: c.iso2, name: c.name }));
}
