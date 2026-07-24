// deck-model.js — Efferon Carousel Studio: Deck Spec data model.
// Pure JS, no DOM. Single source of truth for slide data; renderer/planner/export
// tasks consume this shape. Do not rename fields — later tasks depend on them.

export const FORMAT_DIMS = {
  portrait: [1080, 1350],
  square: [1080, 1080],
  story: [1080, 1920],
};

// Module-level incrementing counter for deterministic, collision-free ids.
// Deliberately NOT Date.now()/Math.random() so tests stay deterministic.
let _idCounter = 0;
function nextId() {
  _idCounter += 1;
  return `s${_idCounter}`;
}

/** @returns {object} an empty Deck */
export function newDeck() {
  return {
    format: 'portrait',
    lang: 'en',
    kind: '', // deck-level narrative type badge (e.g. "Case study"), AI-classified
    ground: '', // deck-level gradient ground ('' = mesh; coral/blue/violet/teal/bluecoral)
    template: 'cards', // deck style: 'cards' (white data cards) | 'gradient' (media/explainer on the gradient)
    slides: [],
  };
}

/** @returns {object} a Slide with sane defaults and a unique id */
export function newSlide(role = 'generic') {
  return {
    id: nextId(),
    role,
    ground: '', // per-slide gradient ground override ('' = use deck.ground / mesh)
    skeleton: {
      kicker: '',
      title: '',
      subtitle: '',
      footer: '',
      showLogo: true,
      showKicker: true,
      showSubtitle: true,
      showFooter: true,
      showDots: false,
    },
    blocks: [],
    layout: 'hero',
    style: {
      titleScale: 1,
      numberScale: 1,
      bodyScale: 1,
      density: 'normal',
      align: 'left',
      accent: 'coral',
    },
    asset: { kind: null, dataUrl: null },
  };
}

function block(type, data) {
  return { type, data };
}

/**
 * Builds one of the pediatric-sepsis demo slides, extracted from the
 * hardcoded content in carousel-studio.html (const slides[], ~line 836).
 */
function buildDemoSlide(role, overrides) {
  const slide = newSlide(role);
  Object.assign(slide.skeleton, overrides.skeleton);
  slide.blocks = overrides.blocks || [];
  if (overrides.layout) slide.layout = overrides.layout;
  if (overrides.style) Object.assign(slide.style, overrides.style);
  if (overrides.asset) slide.asset = { ...slide.asset, ...overrides.asset };
  return slide;
}

/** @returns {object} a Deck pre-populated with the 12 pediatric-sepsis sample slides */
export function demoDeck() {
  const deck = newDeck();
  deck.kind = 'Clinical study';

  deck.slides.push(
    // 1. cover
    buildDemoSlide('cover', {
      skeleton: {
        kicker: 'Clinical evidence',
        title: 'Efferon® NEO in Pediatric Sepsis',
      },
      layout: 'hero',
      asset: { kind: 'photo', dataUrl: 'assets/product/efferon neo.png' },
      blocks: [
        block('photofigure', {
          src: 'assets/product/efferon neo.png',
          caption: '',
        }),
        block('text', {
          text: 'First multimodal adsorber for pediatric use',
        }),
      ],
    }),

    // 2. problem
    buildDemoSlide('problem', {
      skeleton: {
        kicker: 'Context',
        title: 'Pediatric sepsis remains a critical challenge',
        footer: 'WHO global sepsis report',
      },
      blocks: [
        block('bignumber', {
          lede: 'Children are among the most vulnerable ICU patients',
          items: [
            { value: '40', unit: '%', label: 'of sepsis cases occur in children under 5' },
            { value: '20', unit: 'mln', label: 'cases annually, the global sepsis burden' },
          ],
        }),
      ],
    }),

    // 3. design
    buildDemoSlide('design', {
      skeleton: {
        kicker: 'Study design',
        title: 'Multicenter controlled study',
        footer: 'clinicaltrials.gov / NCT05707494',
      },
      layout: 'grid',
      blocks: [
        block('kpis', {
          lede: 'Prospective evaluation of hemoadsorption in pediatric sepsis',
          items: [
            { label: 'Enrolled', num: '78', sub: 'Patients', dot: 'blue' },
            { label: 'Sites', num: '8', sub: 'Centers', dot: 'blue' },
            { label: 'Treatment arm', num: '32', sub: 'Efferon NEO', dot: 'coral' },
            { label: 'Comparator', num: '46', sub: 'Control', dot: 'grey' },
          ],
        }),
      ],
    }),

    // 4. economics
    buildDemoSlide('economics', {
      skeleton: {
        kicker: 'Economics',
        title: 'Better outcomes, lower costs',
        footer: 'ICU stay −4 days · Hospital −5 days',
      },
      blocks: [
        block('bignumber', {
          lede: 'Hemoadsorption reduced total treatment cost per patient',
          items: [
            { value: '38.7', unit: '%', label: 'cost reduction with hemoadsorption' },
          ],
        }),
      ],
    }),

    // 5. comparison
    buildDemoSlide('comparison', {
      skeleton: {
        kicker: 'Results',
        title: 'Primary endpoint achieved',
        footer: 'Baseline → Day 7 · pSOFA score',
      },
      layout: 'two-up',
      blocks: [
        block('barset', {
          lede: 'pSOFA significantly lower with hemoadsorption on Day 7',
          bars: [
            { name: 'Hemoadsorption', pct: 51, dir: 'down', sub: 'pSOFA 10.1 → 4.9 by Day 7', win: true },
            { name: 'Control', pct: 19, dir: 'down', sub: 'pSOFA 9.6 → 7.8 by Day 7', win: false },
          ],
        }),
      ],
    }),

    // 6. isotype
    buildDemoSlide('isotype', {
      skeleton: {
        kicker: 'Survival',
        title: 'Lower 28-day mortality',
        footer: 'p = 0.008 · OR = 0.2',
      },
      blocks: [
        block('iconarray', {
          lede: 'Each icon represents one in ten treated children',
          columns: [
            { filled: 2, total: 10, pct: '9%', label: 'with Efferon NEO' },
            { filled: 7, total: 10, pct: '35%', label: 'in control' },
          ],
          note: 'p = 0.008, OR = 0.2',
        }),
      ],
    }),

    // 7. figure
    buildDemoSlide('figure', {
      skeleton: {
        kicker: 'Recovery',
        title: 'Earlier weaning from organ support',
        footer: 'Figure adapted from study publication',
      },
      asset: { kind: 'figure', dataUrl: null },
      blocks: [
        block('photofigure', {
          lede: 'Proportion of patients free from mechanical ventilation',
          caption: 'Recovery from mechanical ventilation, p=0.003',
          legend: [
            { label: 'Efferon NEO', color: 'coral' },
            { label: 'Control', color: 'blue' },
          ],
        }),
      ],
    }),

    // 7b. column chart — a metric across a handful of time points
    // role 'generic' (not 'figure'): the column/lineplot blocks are drawn
    // natively from data, not from an uploaded image, so they should not
    // surface the Inspector's "drop image" asset prompt (see ROLE_ASSET_KIND
    // in carousel-studio.html, keyed off role).
    buildDemoSlide('generic', {
      skeleton: {
        kicker: 'Inflammation',
        title: 'CRP falls after hemoadsorption',
        footer: 'C-reactive protein, per-patient median',
      },
      blocks: [
        block('column', {
          lede: 'CRP falls after hemoadsorption',
          ylabel: 'CRP',
          unit: 'mg/L',
          items: [
            { label: 'Day 2', value: 409 },
            { label: 'Day 4', value: 189 },
            { label: 'Day 6', value: 92 },
          ],
        }),
      ],
    }),

    // 7c. lineplot — a trend normalizing over several time points
    buildDemoSlide('generic', {
      skeleton: {
        kicker: 'Recovery',
        title: 'Leukocytes normalize',
        footer: 'White blood cell count, per-patient median',
      },
      blocks: [
        block('lineplot', {
          lede: 'Leukocytes normalize',
          ylabel: 'Leukocytes ×10⁹/L',
          xlabels: ['0', 'Day 2', 'Day 3', 'Day 7'],
          series: [
            { name: 'Leukocytes', points: [35, 21, 15, 9] },
          ],
        }),
      ],
    }),

    // 8. benefits
    buildDemoSlide('benefits', {
      skeleton: {
        kicker: 'Clinical value',
        title: 'Benefits of Efferon hemoadsorption',
      },
      blocks: [
        block('checkgrid', {
          items: [
            'Faster resolution of sepsis',
            'Faster weaning from vasopressors',
            'Shorter mechanical ventilation',
            'Rapid organ-function recovery',
            'Restored hemodynamics',
          ],
        }),
      ],
    }),

    // 9. quote
    buildDemoSlide('quote', {
      skeleton: {
        kicker: 'Expert opinion',
      },
      asset: { kind: 'avatar', dataUrl: null },
      blocks: [
        block('quote', {
          text: 'Even if a single cartridge costs several hundred euros, the subsequent cost savings due to the clinical effect may outweigh the initial costs.',
          author: 'Professor Thomas Rimmelé',
          affiliation: 'Nice University Hospital, France',
        }),
      ],
    }),

    // 10. closing
    buildDemoSlide('closing', {
      skeleton: {
        kicker: 'Efferon® NEO',
        title: 'Better outcomes, lower costs',
        subtitle: 'Economic efficiency of hemoadsorption',
      },
      layout: 'hero',
      blocks: [
        block('text', { text: 'Learn more →' }),
      ],
    })
  );

  return deck;
}

/** Inserts a new slide of `role` at `index`, returns the new slide. */
// Demo deck for the EXPLAINER layout + gradient grounds (?demo=explainer).
// Three slides: media grid (coral), single image (blue), chart (violet).
export function demoExplainerDeck() {
  const mk = (ground, media) => {
    const s = newSlide('explainer');
    s.ground = ground;
    s.skeleton.title = 'Hypercrosslinked polystyrene matrix';
    s.skeleton.subtitle = 'Polymers of this structure are highly porous.';
    s.skeleton.footer = 'The higher the cytokines concentration in the blood, the better it binds to the pores.';
    s.skeleton.showDots = true;
    s.blocks = [media, block('text', { text: 'The special pore structure allows for the capture of small and medium-sized molecules (interleukins and other cytokines) while preventing the loss of large.' })];
    return s;
  };
  const deck = newDeck();
  deck.ground = 'coral';
  deck.slides = [
    mk('coral', block('mediagrid', { chips: ['100 nm', '50 nm', '100 mkr', '300 nm'] })),
    mk('blue', block('mediaimage', { chip: '100 nm' })),
    mk('violet', block('mediachart', { title: 'Inflammatory-marker reduction by Day 2', sub: 'Efferon LPS hemoperfusion', unit: '%', bars: [{ label: 'CRP', value: 31, color: 'blue' }, { label: 'IL-6', value: 94, color: 'coral' }, { label: 'TNF-a', value: 68, color: 'violet' }] })),
  ];
  return deck;
}

/**
 * @returns {object} the "Efferon NEO in Pediatric Sepsis" deck — a faithful
 * redesign of the 8-slide LinkedIn carousel into the studio's dir-4 design
 * system. Hybrid (path B): simple data → native brand blocks (kpis / iconarray),
 * the three grouped/complex published charts kept one-to-one as figure images
 * inside branded white cards (photofigure). Cover/closing use the clean
 * `efferon neo.png` asset; the slide-2 baby-hand photo kept in black & white.
 * Loaded via ?demo=neoped. Additive: not the default deck.
 */
export function demoNeoPediatric() {
  const deck = newDeck();
  deck.kind = 'Clinical study';

  deck.slides.push(
    // 1. cover — clean NEO device on the gradient
    buildDemoSlide('cover', {
      skeleton: { kicker: 'Clinical evidence', title: 'Efferon® NEO in Pediatric Sepsis' },
      layout: 'hero',
      asset: { kind: 'photo', dataUrl: 'assets/product/efferon neo.png' },
      blocks: [
        block('photofigure', { src: 'assets/product/efferon neo.png', bare: true }),
        block('text', { text: 'First multimodal adsorber for pediatric use' }),
      ],
    }),

    // 2. problem — two stats + the kept black & white baby-hand photo
    buildDemoSlide('problem', {
      skeleton: {
        kicker: 'Context',
        title: 'Pediatric sepsis remains a critical challenge',
      },
      layout: 'stack',
      style: { numberScale: 1.2, bodyScale: 1.18 },
      blocks: [
        block('bignumber', {
          lede: 'Children with sepsis are among the most vulnerable ICU patients.',
          items: [
            { value: '40', unit: '%', label: 'of sepsis cases occur in children under 5' },
            { value: '20', unit: 'M', label: 'cases of sepsis annually' },
          ],
        }),
        block('photofigure', { src: 'neo-redesign/assets/s2_crop.png' }),
      ],
    }),

    // 3. study design — native KPI grid (numbers one-to-one)
    buildDemoSlide('design', {
      skeleton: {
        kicker: 'Study design',
        title: 'Multicenter controlled study',
        footer: 'clinicaltrials.gov / NCT05707494',
      },
      layout: 'grid',
      style: { numberScale: 1.9, bodyScale: 1.35 },
      blocks: [
        block('kpis', {
          lede: 'Multicenter controlled study (NCT05707494)',
          items: [
            { label: 'Enrolled', num: '78', sub: 'patients, 1 month to 14 years', dot: 'blue' },
            { label: 'Study centers', num: '8', sub: 'multicenter', dot: 'blue' },
            { label: 'Efferon NEO', num: '32', sub: '', dot: 'coral' },
            { label: 'Control', num: '46', sub: '', dot: 'grey' },
          ],
        }),
      ],
    }),

    // 4. primary endpoint — pSOFA grouped bars redrawn natively (one-to-one)
    buildDemoSlide('generic', {
      skeleton: {
        kicker: 'Results',
        title: 'Primary endpoint achieved',
        footer: 'pSOFA score, baseline to Day 7 · p = 0.006',
      },
      blocks: [
        block('groupbars', {
          lede: 'On Day 7 the multiple organ dysfunction score (pSOFA) was significantly lower in the hemoadsorption group.',
          normalize: 'global',
          legend: [
            { label: 'Control group', color: 'coral', style: 'solid' },
            { label: 'Hemoadsorption group', color: 'blue', style: 'solid' },
          ],
          groups: [
            { label: 'Day 1', bars: [
              { value: 9.6, display: '9,6', color: 'coral' },
              { value: 10.1, display: '10,1', color: 'blue' },
            ] },
            { label: 'Day 7', bars: [
              { value: 7.8, display: '7,8', color: 'coral' },
              { value: 4.9, display: '4,9', color: 'blue' },
            ] },
          ],
        }),
      ],
    }),

    // 5. earlier weaning — two KM curves kept as a figure (path B)
    buildDemoSlide('figure', {
      skeleton: {
        kicker: 'Recovery',
        title: 'Earlier weaning from organ support',
        footer: 'p = 0.003 (ventilation), p = 0.001 (vasopressors)',
      },
      blocks: [
        block('photofigure', {
          lede: 'Patients treated with Efferon NEO were weaned from mechanical ventilation and vasopressor support significantly earlier.',
          src: 'neo-redesign/assets/s5_crop.png',
        }),
      ],
    }),

    // 6. inflammatory markers — Day 1 to Day 2, redrawn natively (per-group
    // scaling: 700 and 8 can't share one axis, each pair scaled to its own max).
    buildDemoSlide('generic', {
      skeleton: {
        kicker: 'Inflammation',
        title: 'Reduction of inflammatory markers by day 2',
      },
      blocks: [
        block('groupbars', {
          normalize: 'pergroup',
          legend: [
            { label: 'Day 1', color: 'blue', style: 'hatch' },
            { label: 'Day 2', color: 'blue', style: 'solid' },
          ],
          groups: [
            { label: 'C-reactive protein\nmg/L', p: 'p = 0.003', bars: [
              { value: 192, color: 'blue', style: 'hatch' },
              { value: 63, color: 'blue', style: 'solid' },
            ] },
            { label: 'IL-6\npg/mL', p: 'p < 0.001', bars: [
              { value: 700, color: 'blue', style: 'hatch' },
              { value: 41, color: 'blue', style: 'solid' },
            ] },
            { label: 'IL-1β\npg/mL', p: 'p < 0.001', bars: [
              { value: 8, color: 'blue', style: 'hatch' },
              { value: 3, color: 'blue', style: 'solid' },
            ] },
          ],
        }),
      ],
    }),

    // 7. mortality — native isotype hearts (5×5, one-to-one with the original)
    buildDemoSlide('isotype', {
      skeleton: {
        kicker: 'Survival',
        title: 'Lower 28-day mortality',
        footer: 'p = 0.008 · OR = 0.2',
      },
      style: { numberScale: 1.55 },
      blocks: [
        block('iconarray', {
          lede: 'Mortality in the Efferon NEO group was significantly lower.',
          columns: [
            { filled: 2, total: 25, pct: '9%', label: 'with Efferon NEO' },
            { filled: 9, total: 25, pct: '35%', label: 'in control' },
          ],
        }),
      ],
    }),

    // 8. closing — device message + CTA on the gradient
    buildDemoSlide('closing', {
      skeleton: {
        kicker: 'Efferon® NEO',
        title: 'Efferon® NEO helps disrupt the domino effect of sepsis in the most fragile patients',
        footer: 'ESICM LIVES 2025. ICMx 13 (Suppl 1), 109 (2025). https://doi.org/10.1186/s40635-025-00797-x',
      },
      layout: 'hero',
      blocks: [block('text', { text: 'Learn more →' })],
    })
  );

  return deck;
}

/**
 * @returns {object} the SAME "Efferon NEO in Pediatric Sepsis" content in the
 * EXPLAINER template (the second house style: solid coral/blue/violet grounds,
 * white title + subtitle, media, a bottom note callout — no mesh, no white
 * card frame). Cover/closing keep the bare-device shells on a solid ground;
 * the six data slides use the explainer shell with data wrapped in a white
 * panel for legibility. Loaded via ?demo=neoexp. Additive.
 */
export function demoNeoExplainer() {
  const deck = newDeck();
  deck.kind = 'Clinical study';

  const s = [];

  // 1. cover — bare device on a solid coral ground
  s.push(buildDemoSlide('cover', {
    skeleton: { kicker: 'Clinical evidence', title: 'Efferon® NEO in Pediatric Sepsis' },
    layout: 'hero',
    asset: { kind: 'photo', dataUrl: 'assets/product/efferon neo.png' },
    blocks: [
      block('photofigure', { src: 'assets/product/efferon neo.png', bare: true }),
      block('text', { text: 'First multimodal adsorber for pediatric use' }),
    ],
  }));

  // 2. problem — big numbers in a white panel; the "essential" line as the note
  s.push(buildDemoSlide('explainer', {
    skeleton: {
      title: 'Pediatric sepsis remains a critical challenge',
      subtitle: 'Children with sepsis are among the most vulnerable ICU patients.',
      footer: 'Effective modulation of systemic inflammation is essential to improve outcomes.',
    },
    blocks: [
      block('bignumber', {
        items: [
          { value: '40', unit: '%', label: 'of sepsis cases worldwide occur in children under 5 years' },
          { value: '20', unit: 'mln', label: 'cases of sepsis annually' },
        ],
      }),
    ],
  }));

  // 3. study design — KPI grid in a white panel
  s.push(buildDemoSlide('explainer', {
    skeleton: {
      title: 'Multicenter controlled study',
      subtitle: 'Prospective controlled evaluation of hemoadsorption (NCT05707494).',
      footer: 'clinicaltrials.gov / NCT05707494',
    },
    blocks: [
      block('kpis', {
        items: [
          { label: 'Enrolled', num: '78', sub: 'patients, 1 month to 14 years', dot: 'blue' },
          { label: 'Study centers', num: '8', sub: 'multicenter', dot: 'blue' },
          { label: 'Efferon NEO', num: '32', sub: 'treatment arm', dot: 'coral' },
          { label: 'Control', num: '46', sub: 'comparator', dot: 'grey' },
        ],
      }),
    ],
  }));

  // 4. primary endpoint — pSOFA grouped bars in a white panel
  s.push(buildDemoSlide('explainer', {
    skeleton: {
      title: 'Primary endpoint achieved',
      subtitle: 'On Day 7 the pSOFA organ-dysfunction score was significantly lower with hemoadsorption.',
      footer: 'pSOFA score, baseline to Day 7 · p = 0.006',
    },
    blocks: [
      block('groupbars', {
        normalize: 'global',
        legend: [
          { label: 'Control group', color: 'coral', style: 'solid' },
          { label: 'Hemoadsorption group', color: 'blue', style: 'solid' },
        ],
        groups: [
          { label: 'Day 1', bars: [
            { value: 9.6, display: '9,6', color: 'coral' },
            { value: 10.1, display: '10,1', color: 'blue' },
          ] },
          { label: 'Day 7', bars: [
            { value: 7.8, display: '7,8', color: 'coral' },
            { value: 4.9, display: '4,9', color: 'blue' },
          ] },
        ],
      }),
    ],
  }));

  // 5. earlier weaning — the two KM curves as a figure image
  s.push(buildDemoSlide('explainer', {
    skeleton: {
      title: 'Earlier weaning from organ support',
      subtitle: 'Patients treated with Efferon NEO were weaned from ventilation and vasopressors significantly earlier.',
      footer: 'p = 0.003 (ventilation), p = 0.001 (vasopressors)',
    },
    blocks: [
      block('photofigure', { src: 'neo-redesign/assets/s5_crop.png' }),
    ],
  }));

  // 6. inflammatory markers — grouped bars (per-group scaled) in a white panel
  s.push(buildDemoSlide('explainer', {
    skeleton: {
      title: 'Reduction of inflammatory markers by day 2',
      subtitle: 'Key inflammatory markers fell sharply between Day 1 and Day 2.',
      footer: 'CRP, IL-6 and IL-1β · Day 1 to Day 2',
    },
    blocks: [
      block('groupbars', {
        normalize: 'pergroup',
        legend: [
          { label: 'Day 1', color: 'blue', style: 'hatch' },
          { label: 'Day 2', color: 'blue', style: 'solid' },
        ],
        groups: [
          { label: 'C-reactive protein\nmg/L', p: 'p = 0.003', bars: [
            { value: 192, color: 'blue', style: 'hatch' },
            { value: 63, color: 'blue', style: 'solid' },
          ] },
          { label: 'IL-6\npg/mL', p: 'p < 0.001', bars: [
            { value: 700, color: 'blue', style: 'hatch' },
            { value: 41, color: 'blue', style: 'solid' },
          ] },
          { label: 'IL-1β\npg/mL', p: 'p < 0.001', bars: [
            { value: 8, color: 'blue', style: 'hatch' },
            { value: 3, color: 'blue', style: 'solid' },
          ] },
        ],
      }),
    ],
  }));

  // 7. mortality — isotype hearts in a white panel
  s.push(buildDemoSlide('explainer', {
    skeleton: {
      title: 'Lower 28-day mortality',
      subtitle: 'Mortality in the Efferon NEO group was significantly lower.',
      footer: 'p = 0.008 · OR = 0.2',
    },
    style: { numberScale: 1.2 },
    blocks: [
      block('iconarray', {
        columns: [
          { filled: 2, total: 25, pct: '9%', label: 'with Efferon NEO' },
          { filled: 9, total: 25, pct: '35%', label: 'in control' },
        ],
      }),
    ],
  }));

  // 8. closing — CTA on a solid coral ground
  s.push(buildDemoSlide('closing', {
    skeleton: {
      kicker: 'Efferon® NEO',
      title: 'Efferon® NEO helps disrupt the domino effect of sepsis in the most fragile patients',
    },
    layout: 'hero',
    blocks: [block('text', { text: 'Learn more →' })],
  }));

  // solid grounds: coral bookends, alternating blue/violet through the data slides
  const grounds = ['coral', 'blue', 'violet', 'blue', 'violet', 'blue', 'violet', 'coral'];
  s.forEach((slide, i) => { slide.ground = grounds[i]; });
  deck.slides.push(...s);

  return deck;
}

export function addSlide(deck, index, role = 'generic') {
  const slide = newSlide(role);
  deck.slides.splice(index, 0, slide);
  return slide;
}

/** Removes the slide with the given id, in place. */
export function deleteSlide(deck, id) {
  const idx = deck.slides.findIndex((s) => s.id === id);
  if (idx !== -1) deck.slides.splice(idx, 1);
}

/** Deep-clones the slide with `id` (new id), inserts right after the original, returns the clone. */
export function duplicateSlide(deck, id) {
  const idx = deck.slides.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const clone = JSON.parse(JSON.stringify(deck.slides[idx]));
  clone.id = nextId();
  deck.slides.splice(idx + 1, 0, clone);
  return clone;
}

/** Reorders deck.slides in place, moving the slide at `from` to `to`. */
export function moveSlide(deck, from, to) {
  const [moved] = deck.slides.splice(from, 1);
  if (moved === undefined) return;
  deck.slides.splice(to, 0, moved);
}

/** Sets a style knob, or a skeleton show-toggle when `key` starts with "show". */
export function setKnob(slide, key, val) {
  if (key.startsWith('show')) {
    slide.skeleton[key] = val;
  } else {
    slide.style[key] = val;
  }
}

/** Sets the slide's asset. */
export function setAsset(slide, kind, dataUrl) {
  slide.asset = { kind, dataUrl };
}

/**
 * @returns {object} a conceptual (number-free) demo deck — the "filter or
 * adsorber?" explainer — exercising the D4 typography + concept forms
 * (diptych / sieve / surface / text variants). Additive: NOT the default deck;
 * loaded only via ?demo=concept for visual verification.
 */
export function conceptDemoDeck() {
  const deck = newDeck();
  deck.kind = 'Mechanism';
  deck.slides.push(
    buildDemoSlide('cover', {
      skeleton: { kicker: 'Mechanism', title: 'Filter or adsorber?' },
      layout: 'hero',
      blocks: [block('text', { text: 'Two ways to clean the blood in sepsis.' })],
    }),
    buildDemoSlide('problem', {
      skeleton: { kicker: 'Two core principles', title: 'Two ways to purify blood', footer: '' },
      style: { accent: 'coral' },
      blocks: [block('diptych', {
        left: { term: 'Filtration', line: 'Separation by size.', glyph: 'sieve' },
        right: { term: 'Adsorption', line: 'Binding by surface.', glyph: 'surface' },
      })],
    }),
    buildDemoSlide('design', {
      skeleton: { kicker: 'A mechanical sieve', title: 'Filtration' },
      style: { accent: 'coral' },
      blocks: [block('sieve', {
        def: 'A porous membrane lets {{blue:small particles}} through and holds the larger ones back.',
        aside: { label: 'Think of it like', text: 'A coffee filter: the water passes, the grounds stay behind.' },
      })],
    }),
    buildDemoSlide('problem', {
      skeleton: { kicker: 'The trade-off', title: 'More clearance, less protein' },
      style: { accent: 'coral' },
      blocks: [block('text', {
        variant: 'tradeoff',
        plain: 'Wider pores, {{blue:high cut-off membranes}}, clear more cytokines.',
        pivot: 'but at a cost',
        cost: 'a {{coral:significant loss}} of useful proteins.',
      })],
    }),
    buildDemoSlide('design', {
      skeleton: { kicker: 'A matter of specificity', title: 'Adsorption' },
      style: { accent: 'violet' },
      blocks: [block('surface', {
        def: 'Molecules attach to the surface of a solid {{violet:sorbent}}.',
        note: 'A tailored ligand can remove one target molecule.',
      })],
    }),
    buildDemoSlide('generic', {
      skeleton: { kicker: 'How binding works', title: 'Three kinds of binding' },
      style: { accent: 'violet' },
      blocks: [block('text', {
        variant: 'qualities',
        items: [
          'Binding can be {{violet:ionic}} or {{violet:hydrophobic}}.',
          'It can be non-specific, or specific to certain molecules.',
          'A tailored ligand removes one target molecule.',
        ],
      })],
    }),
  );
  return deck;
}
