/* ===================================================================
   Announce templates — data model (additive; carousel/poster untouched)
   Two square 1080×1080 social post types:
     - event   : event announcement (warm brand gradient + granule + glass card)
     - country : new-country announcement (photo + waving flag + map silhouette
                 + approval shield + bilingual title + product device)
   Mirrors the poster-model.js shape (DIMS + newX + demoX).
   =================================================================== */

export const ANNOUNCE_DIMS = [1080, 1080];

/* ---------- Event announcement ---------- */
export function newEvent() {
  return {
    type: 'event',
    lang: 'en',
    title: '',
    lede: '',
    date: '',
    venue: '',
    address: '',
    // Optional (additive; when unset the template renders exactly as before):
    product: '',           // '' | 'lps' | 'neo' -> product column instead of the granule bead
    booth: '',             // stand / booth number -> extra row in the detail card, only if filled
    confLogoDataUrl: null, // conference logo (data URI) -> right side of the footer, only if set
  };
}

export function demoEvent() {
  return {
    type: 'event',
    lang: 'en',
    title: 'Meet Efferon at the Unite for Sepsis Symposium',
    lede: 'Our team looks forward to connecting with fellow leaders in critical care and discussing innovative approaches to improving outcomes for patients affected by sepsis.',
    date: 'June 11–12, 2026',
    venue: 'Kellogg Conference Hotel Capitol Hill at Gallaudet University',
    address: '800 Florida Ave NE, Washington, DC',
  };
}

/* ---------- New-country announcement ----------
   iso        ISO alpha-2 (drives flag + map outline via announce-geo)
   titleTop   headline line 1, uppercased on render ("NOW AVAILABLE")
   titleBottom headline line 2 ("IN CROATIA"); auto from `country` when empty
   emphasis   the word painted red in line 2 (auto = country, uppercased)
   phraseLocal same message in the country's official language (the subline)
   palette    'ref' = approved Croatia post (navy + crimson) | 'brand' = brandbook
   phraseEN   legacy English sentence kept for the AI round-trip (unused on render)
   langName   e.g. "Polish" (for UI / prompts)
   photoDataUrl user-uploaded background photo (null → soft placeholder)
   product    which device label: 'lps' | 'ct' | 'neo'
*/
export function newCountry() {
  return {
    type: 'country',
    lang: 'en',
    country: '',
    iso: '',
    titleTop: 'NOW AVAILABLE',
    titleBottom: '',
    emphasis: '',
    phraseEN: '',
    phraseLocal: '',
    langName: '',
    scene: '',
    photoDataUrl: null,
    photoSrc: null,
    product: 'lps',
    palette: 'ref',
  };
}

/* Headline line 2 for a country name ("Croatia" -> "IN CROATIA"). */
export function countryTitleBottom(name) {
  const n = String(name || '').trim();
  return n ? 'IN ' + n.toUpperCase() : '';
}

export function demoCountry() {
  return {
    type: 'country',
    lang: 'en',
    country: 'Poland',
    iso: 'PL',
    titleTop: 'NOW AVAILABLE',
    titleBottom: 'IN POLAND',
    emphasis: 'Poland',
    phraseEN: 'Efferon® LPS is available in Poland',
    phraseLocal: 'Efferon® LPS jest dostępny w Polsce',
    langName: 'Polish',
    scene: 'Wawel Castle Krakow Vistula river',
    photoDataUrl: null,
    photoSrc: 'assets/demo/poland.jpg',
    product: 'lps',
    palette: 'ref',
  };
}

/* device image path (from app root) per product */
export const PRODUCT_SRC = {
  lps: 'assets/product/lps-full.png',
  ct:  'assets/product/ct-full.png',
  neo: 'assets/product/neo-full.png',
};

/* product wordmark used in the country phrase ("Efferon® LPS ...") */
export const PRODUCT_LABEL = { lps: 'LPS', ct: 'CT', neo: 'NEO' };

/* Event device column images, pre-cropped to their opaque bounding box (so they
   can be placed precisely bottom-right). Used only when event.product is set. */
export const EVENT_DEVICE_SRC = {
  lps: 'assets/product/lps-column.png',
  neo: 'assets/product/neo-column.png',
};
