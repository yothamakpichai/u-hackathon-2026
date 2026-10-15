// Shared UI helpers. All text goes in through text nodes or textContent, never HTML (BRIEF §11).
// The page CSP blocks inline styles: never set a style attribute; set classes, or el.style properties.
import { QUOTE } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MINUS = '−';
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

// h('button', { class: 'btn', type: 'button', onClick }, ['Label'])
// Props: class, text, dataset, on<Event> handlers, anything else becomes an attribute.
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

// Original line icons on a 24 px grid. Each entry is a list of [element, attributes].
const ICONS = {
  'chevron-right': [['path', { d: 'M9 6l6 6-6 6' }]],
  compass: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z', fill: 'currentColor' }],
  ],
  candles: [
    ['path', { d: 'M6 4v3M6 15v4M12 3v3M12 16v4M18 7v3M18 17v3' }],
    ['rect', { x: 4, y: 7, width: 4, height: 8, rx: 1 }],
    ['rect', { x: 10, y: 6, width: 4, height: 10, rx: 1 }],
    ['rect', { x: 16, y: 10, width: 4, height: 7, rx: 1 }],
  ],
  blocks: [
    ['path', { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z' }],
    ['path', { d: 'M4 7.5l8 4.5 8-4.5M12 12v9' }],
  ],
  shield: [
    ['path', { d: 'M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6z' }],
    ['path', { d: 'M9 12l2.2 2.2L15.5 10' }],
  ],
  alert: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 7.5v5.5M12 16.5v.01' }],
  ],
  inbox: [
    ['path', { d: 'M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z' }],
    ['path', { d: 'M4 13h4.5l1 2h5l1-2H20' }],
  ],
};

export function icon(name, { size = 24, label = '', className = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs = {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', focusable: 'false',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, String(v));
  if (className) svg.setAttribute('class', className);
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const [tag, a] of ICONS[name] || []) {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(a)) part.setAttribute(k, String(v));
    svg.append(part);
  }
  return svg;
}

// Loading, empty and error states. Each one says what happened and what to do next.
// heading: 'h1' when the state is the whole screen (the router uses that), 'h2' inside a screen.
export function stateView({ kind = 'empty', title, body = '', actions = [], heading = 'h2' }) {
  const isError = kind === 'error';
  const visual = kind === 'loading'
    ? h('span', { class: 'spinner', 'aria-hidden': 'true' })
    : h('span', { class: 'state__icon' }, [icon(isError ? 'alert' : 'inbox', { size: 28 })]);
  const items = actions.filter(Boolean);
  return h('div', { class: `state state--${kind}`, role: isError ? 'alert' : 'status' }, [
    visual,
    h(heading, { class: 'state__title', text: title }),
    body ? h('p', { class: 'state__body', text: body }) : null,
    items.length ? h('div', { class: 'state__actions' }, items) : null,
  ]);
}

// Polite screen-reader announcement through the shared live region in index.html.
export function announce(message) {
  const region = document.getElementById('live');
  if (!region) return;
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

// Fetch JSON with readable errors, for the screens' error states.
export async function getJSON(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) throw new Error(`Could not load ${url} (error ${res.status}). Try again in a moment.`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url} could not be read. Try again in a moment.`);
  }
}

// Numbers. Negative values use a true minus sign; gains and losses always carry a sign and an arrow.
const fmtCache = new Map();
function fmt(min, max) {
  const key = `${min}:${max}`;
  if (!fmtCache.has(key)) {
    fmtCache.set(key, new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  return fmtCache.get(key);
}

function signedText(n, digits, prefix) {
  const body = fmt(digits, digits).format(Math.abs(n));
  const negative = n < 0 && body !== fmt(digits, digits).format(0);
  return (negative ? MINUS : '') + prefix + body;
}

// 1,234.56 or −1,234.56
export const number = (n, digits = 2) => signedText(n, digits, '');

// L$1,234.56 or −L$12.00
export const money = (n, digits = 2) => signedText(n, digits, QUOTE);

// Prices from cents to tiny meme-coin fractions: keeps about four significant digits.
export function price(n) {
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : abs > 0 ? Math.min(10, 3 - Math.floor(Math.log10(abs))) : 2;
  return money(n, digits);
}

export function trend(n) {
  if (n > 0) return { dir: 'up', arrow: '↑', sign: '+', className: 'is-gain' };
  if (n < 0) return { dir: 'down', arrow: '↓', sign: MINUS, className: 'is-loss' };
  return { dir: 'flat', arrow: '→', sign: '', className: 'is-flat' };
}

// <span class="delta is-gain">↑ +2.4%</span>. Pass a percentage (2.4 means 2.4%).
export function delta(pct, digits = 1) {
  const rounded = Number(pct.toFixed(digits));
  const t = trend(rounded);
  return h('span', { class: `delta ${t.className}` }, [
    h('span', { 'aria-hidden': 'true', text: t.arrow }),
    `${t.sign}${fmt(digits, digits).format(Math.abs(rounded))}%`,
  ]);
}

// Motion (BRIEF §10): WAAPI only, 150 to 300 ms ease-out, skipped under prefers-reduced-motion.
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => reducedQuery.matches;

export function animate(el, keyframes, options = {}) {
  if (reducedMotion() || typeof el.animate !== 'function') return null;
  return el.animate(keyframes, { duration: 240, easing: EASE_OUT, fill: 'backwards', ...options });
}
