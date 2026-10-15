// Avatars (slice J10a). render(character, age) returns an SVG string: original head-and-shoulders
// vector art with no gender field. The same character visibly ages across 25, 40, 60 and 80:
// greying hair, a thinning hairline, lines on the forehead and around the eyes and mouth.
//
// character = { skin, hairStyle, hairColor, outfit, glasses }. Every value is looked up in the
// tables below (unknown values fall back to the first option), so no caller text ever reaches the
// SVG. Presentation attributes only, no style attributes, so it is safe under the site CSP.
// For an <img>: img.src = dataUri(character, age).

export const OPTIONS = Object.freeze({
  skin: ['tone1', 'tone2', 'tone3', 'tone4', 'tone5', 'tone6'],
  hairStyle: ['short', 'curly', 'long', 'bun', 'afro', 'bob', 'buzz', 'none'],
  hairColor: ['black', 'darkbrown', 'brown', 'auburn', 'blonde', 'ginger', 'blue', 'pink'],
  outfit: ['tee', 'hoodie', 'shirt', 'sweater', 'jacket', 'overalls'],
  glasses: ['none', 'round', 'square'],
});

// Labels for pickers. Skin tones are numbered, never named.
export const LABELS = Object.freeze({
  skin: ['Tone 1', 'Tone 2', 'Tone 3', 'Tone 4', 'Tone 5', 'Tone 6'],
  hairStyle: ['Short', 'Curly', 'Long', 'Bun', 'Afro', 'Bob', 'Buzz cut', 'No hair'],
  hairColor: ['Black', 'Dark brown', 'Brown', 'Auburn', 'Blonde', 'Ginger', 'Blue', 'Pink'],
  outfit: ['T-shirt', 'Hoodie', 'Shirt', 'Sweater', 'Jacket', 'Overalls'],
  glasses: ['No glasses', 'Round glasses', 'Square glasses'],
});

export const AGES = Object.freeze([25, 40, 60, 80]);

const SKIN = { tone1: '#F7D7BA', tone2: '#EBBE98', tone3: '#D29A70', tone4: '#AE7651', tone5: '#7F5236', tone6: '#553624' };
const HAIR = { black: '#1F1B19', darkbrown: '#3D2A1E', brown: '#6B4429', auburn: '#8C3A1E', blonde: '#D8B263', ginger: '#C2562B', blue: '#3F5FDB', pink: '#D13B73' };
const OUTFIT = {
  tee: { main: '#0DA678', trim: '#09855F' },
  hoodie: { main: '#5A4BD6', trim: '#4537B0' },
  shirt: { main: '#F4F7F5', trim: '#2A77D1' },
  sweater: { main: '#C2630A', trim: '#9A4E08' },
  jacket: { main: '#34443D', trim: '#1D2A25' },
  overalls: { main: '#2A77D1', trim: '#F5A524' },
};

const pick = (table, value, fallback) => (Object.hasOwn(table, value) ? value : fallback);
const stageOf = (age) => {
  const a = Number(age);
  if (!Number.isFinite(a)) return 25;
  return AGES.reduce((best, s) => (Math.abs(s - a) < Math.abs(best - a) ? s : best), 25);
};

// Mix a hex colour toward another: used for greying hair and shading skin.
function mix(hex, toward, amount) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ch = (shift) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const GREY = { 25: 0, 40: 0.12, 60: 0.55, 80: 0.85 };

export function normalize(character = {}) {
  const c = character && typeof character === 'object' ? character : {};
  const glasses = c.glasses === true ? 'round' : c.glasses === false ? 'none' : c.glasses;
  return {
    skin: pick(SKIN, c.skin, 'tone1'),
    hairStyle: OPTIONS.hairStyle.includes(c.hairStyle) ? c.hairStyle : 'short',
    hairColor: pick(HAIR, c.hairColor, 'black'),
    outfit: pick(OUTFIT, c.outfit, 'tee'),
    glasses: OPTIONS.glasses.includes(glasses) ? glasses : 'none',
  };
}

const el = (tag, attrs) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`;

function hairBack(style, color) {
  if (style === 'long') return el('path', { d: 'M33 50c0-20 12-31 27-31s27 11 27 31v38H33z', fill: color });
  if (style === 'bob') return el('path', { d: 'M33 52c0-21 12-31 27-31s27 10 27 31v14c0 4-3 6-6 6H39c-3 0-6-2-6-6z', fill: color });
  if (style === 'bun') return el('circle', { cx: 60, cy: 18, r: 10, fill: color });
  if (style === 'afro') return el('circle', { cx: 60, cy: 44, r: 33, fill: color });
  return '';
}

// Hair on top of the head. `recede` (0 to 1) thins the hairline with age.
function hairFront(style, color, recede) {
  const top = 24 + recede * 7;
  switch (style) {
    case 'short':
      return el('path', { d: `M35 ${50 - recede * 4}c0-16 11-${26 - recede * 6} 25-${26 - recede * 6}s25 ${10 - recede * 2} 25 ${26 - recede * 6}c-6-7-14-${10 - recede * 4}-25-${10 - recede * 4}s-19 3-25 10z`, fill: color });
    case 'curly':
      return [[38, top + 14], [46, top + 6], [55, top + 2], [65, top + 2], [74, top + 6], [82, top + 14]]
        .map(([x, y]) => el('circle', { cx: x, cy: y, r: 8 - recede * 2, fill: color })).join('');
    case 'long':
    case 'bob':
      return el('path', { d: `M34 50c0-18 11-${26 - recede * 5} 26-${26 - recede * 5}s26 ${8 - recede * 2} 26 ${26 - recede * 5}c-8-9-16-12-26-12s-18 3-26 12z`, fill: color });
    case 'bun':
      return el('path', { d: `M35 48c0-16 11-${23 - recede * 5} 25-${23 - recede * 5}s25 ${7 - recede * 2} 25 ${23 - recede * 5}c-7-6-15-9-25-9s-18 3-25 9z`, fill: color });
    case 'afro':
      // The hairline sits above the brows so the face (and the forehead lines that come with age) stay clear.
      return el('path', { d: `M31 44c2-${20 - recede * 5} 14-${27 - recede * 5} 29-${27 - recede * 5}s27 7 29 ${27 - recede * 5}c-8-${7 - recede * 2}-18-${11 - recede * 3}-29-${11 - recede * 3}s-21 4-29 ${11 - recede * 3}z`, fill: color });
    case 'buzz':
      return el('path', { d: `M36 46c1-14 11-${21 - recede * 5} 24-${21 - recede * 5}s23 ${7} 24 ${21 - recede * 5}c-7-5-15-7-24-7s-17 2-24 7z`, fill: color, opacity: 0.85 });
    default:
      return '';
  }
}

function outfitShape(name, skinShade) {
  const o = OUTFIT[name];
  const body = el('path', { d: 'M20 120c0-20 16-31 40-31s40 11 40 31z', fill: o.main });
  if (name === 'hoodie') return body + el('path', { d: 'M42 92c4 9 10 13 18 13s14-4 18-13', fill: 'none', stroke: o.trim, 'stroke-width': 4, 'stroke-linecap': 'round' });
  if (name === 'shirt') return body + el('path', { d: 'M50 90l10 12 10-12', fill: 'none', stroke: o.trim, 'stroke-width': 3 }) + el('path', { d: 'M60 102v18', stroke: o.trim, 'stroke-width': 3 });
  if (name === 'sweater') return body + el('path', { d: 'M48 91c3 5 7 7 12 7s9-2 12-7', fill: 'none', stroke: o.trim, 'stroke-width': 4 });
  if (name === 'jacket') return body + el('path', { d: 'M50 90l10 30 10-30', fill: '#F4F7F5' }) + el('path', { d: 'M50 90l10 30M70 90l-10 30', stroke: o.trim, 'stroke-width': 2 });
  if (name === 'overalls') return body + el('rect', { x: 44, y: 100, width: 32, height: 20, rx: 4, fill: '#3F5FDB' }) + el('path', { d: 'M46 92v10M74 92v10', stroke: o.trim, 'stroke-width': 4, 'stroke-linecap': 'round' });
  return body + el('path', { d: 'M49 90c3 5 6 7 11 7s8-2 11-7', fill: skinShade });
}

// Lines that come with age. Each carries data-wrinkle so tests can count them.
function ageLines(stage, line) {
  const w = (d) => `<path d="${d}" fill="none" stroke="${line}" stroke-width="1.3" stroke-linecap="round" data-wrinkle="1"/>`;
  const out = [];
  if (stage >= 40) out.push(w('M52 37c5-1.5 11-1.5 16 0'));
  if (stage >= 60) {
    out.push(w('M50 33c6-2 14-2 20 0'));
    out.push(w('M41 50l-3 2'), w('M79 50l3 2'));
    out.push(w('M50 64c-2 3-2 6 0 8'), w('M70 64c2 3 2 6 0 8'));
  }
  if (stage >= 80) {
    out.push(w('M49 29c7-2 15-2 22 0'));
    out.push(w('M41 54l-3 1'), w('M79 54l3 1'));
    out.push(w('M47 56c3 2 7 2 10 0'), w('M63 56c3 2 7 2 10 0'));
    out.push(w('M44 70c2 5 4 8 7 9'), w('M76 70c-2 5-4 8-7 9'));
  }
  return out.join('');
}

function glassesShape(kind) {
  if (kind === 'none') return '';
  const frame = { fill: 'none', stroke: '#1D2A25', 'stroke-width': 2.2 };
  const lenses = kind === 'round'
    ? el('circle', { cx: 51, cy: 51, r: 6.5, ...frame }) + el('circle', { cx: 69, cy: 51, r: 6.5, ...frame })
    : el('rect', { x: 43.5, y: 45.5, width: 15, height: 11, rx: 2.5, ...frame }) + el('rect', { x: 61.5, y: 45.5, width: 15, height: 11, rx: 2.5, ...frame });
  return lenses + el('path', { d: kind === 'round' ? 'M57.5 51h5' : 'M58.5 50h3', ...frame });
}

export function render(character, age = 25) {
  const c = normalize(character);
  const stage = stageOf(age);
  const skin = SKIN[c.skin];
  const shade = mix(skin, '#000000', 0.12);
  const line = mix(skin, '#000000', 0.32);
  const hair = mix(HAIR[c.hairColor], '#E4E4E2', GREY[stage]);
  const brow = mix(HAIR[c.hairColor], '#D9D9D7', GREY[stage] * 0.9);
  const recede = stage >= 80 ? 1 : stage >= 60 ? 0.45 : 0;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Avatar, age ${stage}" data-stage="${stage}">`,
    el('circle', { cx: 60, cy: 60, r: 60, fill: '#EEF3F0' }),
    hairBack(c.hairStyle, hair),
    outfitShape(c.outfit, shade),
    el('rect', { x: 52, y: 70, width: 16, height: 18, rx: 6, fill: shade }),
    el('ellipse', { cx: 34, cy: 52, rx: 4.5, ry: 6.5, fill: shade }),
    el('ellipse', { cx: 86, cy: 52, rx: 4.5, ry: 6.5, fill: shade }),
    // Face: a touch fuller at the jaw at 80.
    stage >= 80
      ? el('path', { d: 'M34 50c0-17 11-27 26-27s26 10 26 27c0 15-8 29-26 29S34 65 34 50z', fill: skin })
      : el('ellipse', { cx: 60, cy: 51, rx: 26, ry: 28, fill: skin }),
    hairFront(c.hairStyle, hair, recede),
    el('path', { d: 'M45 44c3-2 7-2 10-1', fill: 'none', stroke: brow, 'stroke-width': stage >= 80 ? 3.4 : 2.6, 'stroke-linecap': 'round' }),
    el('path', { d: 'M65 43c3-1 7-1 10 1', fill: 'none', stroke: brow, 'stroke-width': stage >= 80 ? 3.4 : 2.6, 'stroke-linecap': 'round' }),
    el('ellipse', { cx: 51, cy: 51, rx: 2.4, ry: stage >= 80 ? 2.2 : 2.8, fill: '#1D2A25' }),
    el('ellipse', { cx: 69, cy: 51, rx: 2.4, ry: stage >= 80 ? 2.2 : 2.8, fill: '#1D2A25' }),
    el('path', { d: 'M60 53c-1 4-2 6-3 7 2 1 4 1 6 0', fill: 'none', stroke: line, 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
    el('path', { d: 'M52 66c4 4 12 4 16 0', fill: 'none', stroke: '#8A3B2E', 'stroke-width': 2.4, 'stroke-linecap': 'round' }),
    el('circle', { cx: 45, cy: 60, r: 3.5, fill: '#E5484D', opacity: stage >= 60 ? 0.1 : 0.16 }),
    el('circle', { cx: 75, cy: 60, r: 3.5, fill: '#E5484D', opacity: stage >= 60 ? 0.1 : 0.16 }),
    ageLines(stage, line),
    glassesShape(c.glasses),
    '</svg>',
  ];
  return parts.join('');
}

export const dataUri = (character, age) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(render(character, age))}`;
