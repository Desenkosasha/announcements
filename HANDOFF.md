# Handoff — Efferon Announcements

_Updated 2026-08-31_

## 1. What is this?
Static internal tool that builds 1080×1080 social posts: **Event** ("Meet Efferon at …")
and **New country** ("NOW AVAILABLE IN …"). No server; AI features use the editor's own
Anthropic key from localStorage. Published on GitHub Pages behind a soft password gate.

## 2. Where does it run?
- Source: `~/.superset/projects/efferon-announcements`
- Local preview: `python3 -m http.server 8341 --directory ~/.superset/projects/efferon-announcements`
  → http://localhost:8341/index.html?mode=country (password gate: SHA-256 hash in `index.html`)

## 3b. What changed 2026-09-14
- **Event template — talk/speaker mode + logo position.** Added a **Talk topic**
  field and a **conference-logo position** toggle (bottom-right / top-right).
  When `topic` is set the layout switches to a speaker post (matches Ivan
  Bessonov reference): title -> compact bold uppercase name, lede -> role, topic
  -> large light uppercase hero; logo can sit top-right directly on the gradient.
  With no topic the classic big-headline event renders unchanged (backward
  compatible). New spec fields: `topic`, `confLogoPos` ('bottom'|'top'). AI
  "Generate from text" can now fill `topic` too. Demo content = the reference post.
  Cache bumps: css v10, model v4, render v9, ai v4.
- **Speaker-mode auto-fit:** the topic hero and the speaker name now step down
  by length (topic 48/42/36/31px, name 37/31/27px) so long talk titles / names
  clear the glass card instead of running under it. Cache: render v10, css v11
  (top logo now on a white chip).
- **Talk info moved into the card (2026-09-14, revised):** headline is classic
  again ("Meet Efferon at ..."); the talk title + speaker name + role now live
  INSIDE the glass detail card, above the date/venue rows. New spec fields
  `speaker`, `speakerRole` (topic = talk title). The card anchors to the bottom
  in talk mode and grows upward, so it always clears the footer. Talk title
  auto-fits (32/28/25px). Cache: model v5, render v11, css v12, ai v5.
- **"LPS" baseline aligned** in the country lockup (the product label span had
  `top:-3px`, lifting it above the Efferon wordmark; now `top:0`).
- **Missing English country aliases added** (announce-geo.js): the English
  "Turkey" (only "Türkiye" resolved before), plus England/Britain/America.
  Additive only — never overwrites an existing alias.
- **Stale flag/outline fixed**: typing a country then clearing it (or typing an
  unresolvable/partial name) used to leave the previous flag + outline on the
  card. The input handler now clears iso/flag and re-renders when the name no
  longer resolves.
- Cache versions bumped so browsers reload: announce.css v6->v7, announce-geo.js v2->v3.

### Known corner cases still open (case-by-case)
- **Antimeridian / overseas-territory geometry** (proven from the atlas): Russia,
  USA, Fiji, New Zealand, Kiribati span ~360° of longitude, and France, the
  Netherlands, Norway carry far-flung territories. `geoMercator().fitExtent` on
  the full multipolygon shrinks the mainland to a speck and puts the badge in the
  ocean. Fix needs a per-country call on which landmass to show — not done.
- **RTL sublines** (UAE, Saudi, Israel...) and **wide scripts** (CJK/Thai) vs the
  character-count `headlineSize`/`subSize` heuristic.
- **Red emphasis word** silently absent if a custom line-2 omits the country name.

## 3. What changed in this session (2026-08-31)
- **New-country template redesigned** to match the approved Croatia post: product lockup
  (mark + "Efferon®" + product name) top-left, uppercase two-line headline with the country
  in red, local-language subline, stroke-only country outline with an approval badge, flag
  top-right, device bottom-right. Old design (sentence headline + white filled silhouette +
  logo bottom-left) is gone.
- **Map detail**: vendored atlas swapped 1:110m → 1:50m. At 110m small countries (North
  Macedonia) degenerated into a featureless polygon.
- **"The photo goes pixelated" fixed**: the photo and flag were canvas-baked at 1080/700 px
  while the PNG exports at 2160 (pixelRatio 2), so those two layers were upscaled 2× while
  the text stayed crisp. Both now bake at `BAKE = 2`, with stepped high-quality downscaling.
- Also: the pastel wash + saturate/brightness grade was being applied twice (baked into the
  canvas AND again as a CSS filter) — the CSS filter is gone.
- Wikimedia photo search now asks for 3200 px wide and prefers sources ≥2400 px.
- Typing a country name updates the flag + outline instantly (both offline); only the local
  translation and the photo need the AI key.

## 4. Open questions / decisions for Sasha
- **Colours.** The approved Croatia post uses a deep navy (#2a3a8c) + crimson (#a5323f),
  neither of which is in the brandbook (#4568a9 blue, #e16f79 coral). Both treatments ship:
  the *Colours* dropdown offers "Navy + crimson (approved post)" (default) and
  "Brandbook blue + red". Pick one and the other can be dropped.
- Croatia's outline is slightly narrower here than in the reference post — we use a Mercator
  projection, the reference was drawn with something wider. Left as is.
- The approval badge sits on the territory's projected centroid, which for archipelagos
  (Japan, Indonesia) can land just off the land. Could be hand-nudged per country if needed.

## 5. Not committed
The working tree holds all of the above uncommitted (plus `vendor/world-countries-50m.json`
and `assets/logo/efferon-logo-navy.svg`; `vendor/world-countries-110m.json` deleted).
Set a repo-local git identity before the first commit — the global one is not hers.
