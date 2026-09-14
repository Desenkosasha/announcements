# Efferon Announcements

A small internal tool to build two kinds of on-brand square (1080×1080) social posts:

- **Event** — "Meet Efferon at [conference]": product column (LPS / NEO), conference logo in the footer, date / venue / booth card.
- **New country** — "NOW AVAILABLE IN [COUNTRY]": product lockup top-left, uppercase two-line headline with the country in red, local-language subline, stroke-only country outline (1:50m atlas) with an approval badge on its centroid, waving flag top-right, device bottom-right, auto-found landscape photo. Two colour treatments (navy + crimson, as in the approved Croatia post / brandbook blue + red).
  Typing a country name updates the flag and the outline immediately — both are vendored offline; only the local translation and the photo need the AI key.

Export resolution: the PNG is written at 2160×2160 (1080 artboard × `pixelRatio: 2`).
Anything baked onto a canvas first — the background photo, the waving flag — is
baked at that same 2× (`BAKE` in `js/announce-render.js`). If those ever drift
apart, the baked layers get upscaled in the export and the photo looks
pixelated while the text stays crisp. Background photos should therefore be at
least 2160 px on the short side; the panel warns when they are not.

Static site (HTML + JS modules + assets), no server. AI features (generate-from-text, resolve-country) run in the browser with your own Anthropic API key, entered via the **API key** button and stored only in your browser (localStorage), sent only to api.anthropic.com. Without a key, manual editing and PNG export still work.

Published via GitHub Pages behind a simple shared password (soft gate — keeps casual visitors out; the site source is public).
