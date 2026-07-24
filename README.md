# Efferon Announcements

A small internal tool to build two kinds of on-brand square (1080×1080) social posts:

- **Event** — "Meet Efferon at [conference]": product column (LPS / NEO), conference logo in the footer, date / venue / booth card.
- **New country** — "Efferon® [product] is available in [country]": flag, map silhouette, bilingual headline, auto-found landscape photo.

Static site (HTML + JS modules + assets), no server. AI features (generate-from-text, resolve-country) run in the browser with your own Anthropic API key, entered via the **API key** button and stored only in your browser (localStorage), sent only to api.anthropic.com. Without a key, manual editing and PNG export still work.

Published via GitHub Pages behind a simple shared password (soft gate — keeps casual visitors out; the site source is public).
