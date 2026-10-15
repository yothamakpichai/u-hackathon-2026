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
  speaker: [
    ['path', { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z', fill: 'currentColor' }],
    ['path', { d: 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11' }],
  ],
  'speaker-off': [
    ['path', { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z', fill: 'currentColor' }],
    ['path', { d: 'M16 9.5l5 5M21 9.5l-5 5' }],
  ],
  stop: [['rect', { x: 7, y: 7, width: 10, height: 10, rx: 2, fill: 'currentColor' }]],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  close: [['path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }]],
  'arrow-right': [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
  unlock: [
    ['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }],
    ['path', { d: 'M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2' }],
  ],
  lock: [
    ['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }],
    ['path', { d: 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3' }],
  ],
  flame: [['path', { d: 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.6 4.1-8.8.5 2 1.7 3.1 2.9 3.6.4-2.2 1.4-4.2 3-5.6.3 3.6 3 5.7 3 10.3 0 4-2.6 6.7-6.5 6.7z' }]],
  star: [['path', { d: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z' }]],
  book: [
    ['path', { d: 'M4 5.5c2.7-1 5.4-1 8 .5v13c-2.6-1.5-5.3-1.5-8-.5z' }],
    ['path', { d: 'M20 5.5c-2.7-1-5.4-1-8 .5v13c2.6-1.5 5.3-1.5 8-.5z' }],
  ],
  target: [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
    ['circle', { cx: 12, cy: 12, r: 4.5 }],
    ['circle', { cx: 12, cy: 12, r: 1, fill: 'currentColor' }],
  ],
  trophy: [
    ['path', { d: 'M8 4h8v5a4 4 0 0 1-8 0z' }],
    ['path', { d: 'M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4' }],
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

// Penny, the mascot: happy, thinking, worried or celebrating. Decorative (alt=""): her words are text.
export const PENNY_MOODS = ['happy', 'thinking', 'worried', 'celebrating'];

export function penny(mood = 'happy', { size = 72, className = '' } = {}) {
  const img = h('img', {
    class: `penny ${className}`.trim(),
    src: `assets/svg/penny/${PENNY_MOODS.includes(mood) ? mood : 'happy'}.svg`,
    alt: '',
    width: size,
    height: size,
  });
  img.dataset.mood = mood;
  return img;
}

export function setPennyMood(img, mood) {
  if (!img || img.dataset.mood === mood) return;
  img.dataset.mood = mood;
  img.src = `assets/svg/penny/${mood}.svg`;
  animate(img, [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { duration: 200 });
}

// Segmented progress: done, current and upcoming steps.
export function progress({ total, current, label }) {
  const bar = h('div', {
    class: 'progress',
    role: 'progressbar',
    'aria-label': label,
    'aria-valuemin': 0,
    'aria-valuemax': total,
    'aria-valuenow': current,
    'aria-valuetext': `${label}: step ${Math.min(current + 1, total)} of ${total}`,
  });
  for (let i = 0; i < total; i++) {
    bar.append(h('span', { class: `progress__seg${i < current ? ' is-done' : i === current ? ' is-current' : ''}` }));
  }
  return bar;
}

// One multiple-choice question, shared by the Money Health Check, the lesson quiz and event checks.
// Narrated prompt (captions always shown), three options, feedback that never relies on colour alone,
// then a Next button. onAnswer(correct, chosenIndex) fires once.
export function questionCard({ audio, audioId, prompt, options, answerIndex, explain, onAnswer, onNext, nextLabel = 'Next' }) {
  const mascot = penny('thinking', { size: 72, className: 'question__penny' });
  const bubble = h('div', { class: 'bubble question__bubble' }, [
    audio.line({ id: audioId, text: prompt, tag: 'h2', className: 'question__prompt', autoplay: true }),
  ]);
  const letters = ['A', 'B', 'C', 'D'];
  const feedback = h('div', { class: 'feedback', role: 'status' });
  let answered = false;

  const buttons = options.map((text, i) =>
    h('button', { class: 'option', type: 'button', onClick: () => choose(i) }, [
      h('span', { class: 'option__key', 'aria-hidden': 'true', text: letters[i] }),
      h('span', { class: 'option__text', text }),
      h('span', { class: 'option__mark' }),
    ]),
  );

  function choose(i) {
    if (answered) return;
    answered = true;
    const correct = i === answerIndex;
    buttons.forEach((b, j) => {
      b.disabled = true;
      const mark = b.querySelector('.option__mark');
      if (j === answerIndex) {
        b.classList.add('is-correct');
        mark.replaceChildren(icon('check', { size: 20 }), h('span', { class: 'visually-hidden', text: ' (correct answer)' }));
      } else if (j === i) {
        b.classList.add('is-wrong');
        mark.replaceChildren(icon('close', { size: 20 }), h('span', { class: 'visually-hidden', text: ' (your answer)' }));
      } else {
        b.classList.add('is-dim');
      }
    });
    setPennyMood(mascot, correct ? 'happy' : 'worried');

    const next = h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => onNext && onNext(correct) }, [
      nextLabel,
      icon('arrow-right', { size: 20 }),
    ]);
    feedback.className = `feedback ${correct ? 'feedback--correct' : 'feedback--wrong'}`;
    feedback.replaceChildren(
      h('p', { class: 'feedback__title' }, [
        icon(correct ? 'check' : 'close', { size: 22 }),
        correct ? 'Correct!' : 'Not quite',
      ]),
      audio.line({ id: `${audioId}-explain`, text: explain, className: 'feedback__explain', autoplay: true }),
      next,
    );
    animate(feedback, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }]);
    next.focus({ preventScroll: true });
    feedback.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (onAnswer) onAnswer(correct, i);
  }

  return h('div', { class: 'question' }, [
    h('div', { class: 'penny-says question__header' }, [mascot, bubble]),
    h('div', { class: 'options', role: 'group', 'aria-label': 'Answers' }, buttons),
    feedback,
  ]);
}

// End-of-step panel: Penny, a heading, one line of text and the next actions.
export function resultPanel({ mood = 'happy', title, text, actions = [] }) {
  return h('div', { class: 'result' }, [
    penny(mood, { size: 120, className: 'result__penny' }),
    h('h2', { class: 'result__title', text: title }),
    h('p', { class: 'result__text', text }),
    h('div', { class: 'result__actions' }, actions.filter(Boolean)),
  ]);
}

// Celebration (BRIEF §10: unlock, coin launch, report). A short confetti burst over `host`,
// which must be position: relative. Nothing happens under prefers-reduced-motion.
const CONFETTI = ['mint', 'blue', 'pink', 'gold', 'violet', 'coral'];

export function celebrate(host, { pieces = 36 } = {}) {
  if (reducedMotion() || !host || typeof host.animate !== 'function') return;
  const layer = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  host.append(layer);
  const anims = [];
  for (let i = 0; i < pieces; i++) {
    const bit = h('span', { class: `confetti__bit confetti__bit--${CONFETTI[i % CONFETTI.length]}${i % 3 === 0 ? ' is-round' : ''}` });
    bit.style.left = `${20 + Math.random() * 60}%`;
    layer.append(bit);
    const dx = (Math.random() - 0.5) * 320;
    const dy = 140 + Math.random() * 220;
    const spin = (Math.random() - 0.5) * 720;
    anims.push(
      bit.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx * 0.6}px, ${-dy * 0.55}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px, ${dy * 0.35}px) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 1100 + Math.random() * 500, delay: Math.random() * 120, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'both' },
      ).finished,
    );
  }
  Promise.allSettled(anims).then(() => layer.remove());
}
