// Coach mode (BRIEF §15; slice J7). A coach-mark engine that spotlights real Lab and Create UI,
// pauses the market and walks through a chapter step by step. Marks follow their element on scroll
// and resize; on phones the card docks above or below the element so it never covers it.
// Content lives in public/data/coach.json. A chapter in progress survives route changes, so
// "Build your coin" can carry on into #/create and back.
//
// Screens attach with an env: { route, tier, store, navigate, dataBase, pause, resume, select,
// tradesCount, canTrade, hasNews, hasCoin, drillConfig }. Every hook is optional.
import { copycatDrill, whaleDrill } from '../sim/drills.js';
import { animate, announce, celebrate, getJSON, h, icon, money, penny } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WAIT_POLL_MS = 250;

let content = null; // promise of coach.json
let active = null; // { chapter, steps, index, tier, trades0, drill }
let env = null; // the mounted screen's hooks
let layer = null;
let mark = null; // the element the current step explains
let frame = 0;
let waitTimer = 0;
const doneHooks = [];

// Called with { tier, chapter, xp } after a chapter is completed (J8 mints a badge here).
export const onChapterDone = (fn) => doneHooks.push(fn);

export function loadCoach(dataBase) {
  content ??= getJSON(`${dataBase}coach.json`).catch((err) => {
    content = null;
    throw err;
  });
  return content;
}

const record = (store, tier) => store.get().coach?.[tier] || {};
export const coachDone = (store, tier) => record(store, tier).done || {};

// ---- screens -------------------------------------------------------------------------------

// A screen mounts: show the chapter in progress if its current step belongs here.
export function attachCoach(screenEnv) {
  env = screenEnv;
  // Wait for the router to finish (it scrolls to the top after a screen mounts), then place the mark.
  if (active) setTimeout(() => requestAnimationFrame(() => active && env === screenEnv && showStep()), 0);
  return () => {
    if (env === screenEnv) {
      teardownLayer();
      env = null;
    }
  };
}

// The Coach button, and the automatic offer on the first Lab visit.
export async function openCoachMenu(screenEnv, { offer = false } = {}) {
  env = screenEnv;
  let data;
  try {
    data = await loadCoach(env.dataBase);
  } catch {
    announce('The coach didn’t load. Check your connection and try again.');
    return;
  }
  if (env !== screenEnv) return;
  env.store.set((s) => ({ coach: { ...s.coach, [env.tier]: { ...s.coach?.[env.tier], offered: true } } }));
  const done = coachDone(env.store, env.tier);
  const items = data.chapters.map((ch, i) => {
    const finished = Boolean(done[ch.id]);
    const blocked = ch.needs === 'news' && !env.hasNews?.() && !env.hasCoin?.();
    return h('li', { class: `coach-menu__item${finished ? ' is-done' : ''}` }, [
      h('span', { class: 'coach-menu__num', 'aria-hidden': 'true' }, finished ? [icon('check', { size: 18 })] : [String(i + 1)]),
      h('span', { class: 'coach-menu__text' }, [
        h('span', { class: 'coach-menu__title', text: ch.title }),
        h('span', { class: 'coach-menu__blurb', text: blocked ? 'Opens after Penny’s first market news.' : ch.blurb }),
      ]),
      blocked
        ? null
        : h('button', { class: `btn btn--sm${finished ? '' : ' btn--primary'}`, type: 'button', onClick: () => startChapter(ch.id) }, [
            finished ? 'Play again' : 'Start',
            h('span', { class: 'visually-hidden', text: `: ${ch.title}` }),
          ]),
    ]);
  });
  const card = h('section', { class: 'coach__card coach-menu', role: 'dialog', 'aria-labelledby': 'coach-title' }, [
    h('div', { class: 'coach__top' }, [
      penny('happy', { size: 48 }),
      h('div', {}, [
        h('p', { class: 'screen-eyebrow', text: `Coach · +${data.xp} XP per chapter` }),
        h('h2', { class: 'coach__title', id: 'coach-title', tabindex: '-1', text: offer ? 'Want a guided tour?' : 'Coach' }),
      ]),
    ]),
    h('p', { class: 'coach__body', text: 'Penny can walk you through the Lab one step at a time. The market waits while you learn.' }),
    h('ol', { class: 'coach-menu__list' }, items),
    h('div', { class: 'coach__actions' }, [
      h('button', { class: 'btn btn--block', type: 'button', onClick: closeMenu }, offer ? 'Explore on my own' : 'Close'),
    ]),
  ]);
  mark = null; // the menu explains nothing on the page, so no ring
  showCard(card, { dim: true });
  env.pause?.();
}

function closeMenu() {
  teardownLayer();
  if (!active) env?.resume?.();
}

export async function startChapter(id) {
  const data = await loadCoach(env.dataBase);
  const chapter = data.chapters.find((c) => c.id === id);
  if (!chapter || !env) return;
  const launched = Boolean(env.hasCoin?.());
  const steps = chapter.steps
    .filter((s) => !s.tiers || s.tiers.includes(env.tier))
    // Chapter 5 after a coin is already out: skip the Create steps and go straight to the outcome.
    .filter((s) => !(launched && (s.route === '/create' || s.go === '/create')));
  active = { chapter, steps, index: 0, tier: env.tier, xp: data.xp, drill: {} };
  if (id === 'trade') env.select?.('VAULT');
  showStep();
}

function exitChapter() {
  active = null;
  clearInterval(waitTimer);
  teardownLayer();
  env?.resume?.();
  announce('Coach closed.');
}

// ---- steps ---------------------------------------------------------------------------------

function showStep() {
  clearInterval(waitTimer);
  const step = active.steps[active.index];
  const route = step.route || '/lab';
  if (!env || env.route !== route) {
    teardownLayer(); // it reappears when that screen attaches
    return;
  }
  env.pause?.();
  mark = step.target ? document.querySelector(step.target) : null;
  const total = active.steps.length;
  const last = active.index === total - 1;
  const waiting = Boolean(step.wait);
  active.trades0 = env.tradesCount?.() ?? 0;

  const next = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => advance(step) }, [
    step.next || (last ? 'Finish chapter' : 'Next'),
    icon('arrow-right', { size: 18 }),
  ]);
  const extra = h('div', { class: 'coach__extra' });
  const hint = waiting ? h('p', { class: 'coach__hint', role: 'status', text: 'Try it now. The next step starts as soon as you do.' }) : null;
  const card = h('section', { class: 'coach__card', role: 'dialog', 'aria-labelledby': 'coach-title', 'aria-describedby': 'coach-body' }, [
    h('div', { class: 'coach__top' }, [
      penny('thinking', { size: 40 }),
      h('p', { class: 'coach__step', text: `${active.chapter.title} · Step ${active.index + 1} of ${total}` }),
      h('button', { class: 'icon-btn coach__close', type: 'button', onClick: exitChapter, title: 'Close the coach' }, [
        icon('close', { size: 20 }),
        h('span', { class: 'visually-hidden', text: 'Close the coach' }),
      ]),
    ]),
    h('h2', { class: 'coach__title', id: 'coach-title', tabindex: '-1', text: step.title }),
    h('p', { class: 'coach__body', id: 'coach-body', text: step.body }),
    extra,
    hint,
    h('div', { class: 'coach__actions' }, [
      active.index > 0 && !step.route && !step.drill ? h('button', { class: 'btn', type: 'button', onClick: back }, 'Back') : null,
      waiting ? h('button', { class: 'btn', type: 'button', onClick: () => advance(step) }, 'Skip this step') : next,
    ]),
  ]);
  if (step.art) extra.append(art(step.art));
  if (step.drill) runDrill(step.drill, extra, next);
  showCard(card, { dim: !mark, interactive: waiting });
  reveal();
  if (waiting) {
    waitTimer = setInterval(() => {
      if (!active || !satisfied(step.wait)) return;
      clearInterval(waitTimer);
      if (hint) hint.textContent = 'Nice!';
      setTimeout(() => active && active.steps[active.index] === step && advance(step), 600);
    }, WAIT_POLL_MS);
  }
}

function satisfied(wait) {
  if (wait === 'tradePreview') return Boolean(env?.canTrade?.());
  if (wait === 'tradeDone') return (env?.tradesCount?.() ?? 0) > active.trades0;
  if (wait === 'launch') return Boolean(env?.hasCoin?.());
  return true;
}

function advance(step) {
  if (!active) return;
  if (active.index >= active.steps.length - 1) return finishChapter();
  active.index++;
  if (step.go) {
    teardownLayer();
    env.navigate(step.go);
    return;
  }
  showStep();
}

function back() {
  if (!active || active.index === 0) return;
  active.index--;
  showStep();
}

function finishChapter() {
  const { chapter, tier, xp } = active;
  const store = env.store;
  active = null;
  clearInterval(waitTimer);
  store.set((s) => ({
    coach: {
      ...s.coach,
      [tier]: { ...s.coach?.[tier], offered: true, done: { ...s.coach?.[tier]?.done, [chapter.id]: { at: Date.now(), xp } } },
    },
  }));
  const extras = [];
  for (const fn of doneHooks) {
    try {
      const node = fn({ tier, chapter, xp, store });
      if (node instanceof Node) extras.push(node);
    } catch (err) {
      console.error(err);
    }
  }
  const card = h('section', { class: 'coach__card coach__card--done', role: 'dialog', 'aria-labelledby': 'coach-title' }, [
    h('div', { class: 'coach__done-head' }, [penny('celebrating', { size: 72 })]),
    h('h2', { class: 'coach__title', id: 'coach-title', tabindex: '-1', text: 'Chapter complete!' }),
    h('p', { class: 'coach__body', text: `${chapter.title}: done. +${xp} XP on your Learning Path.` }),
    ...extras,
    h('div', { class: 'coach__actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: () => openCoachMenu(env) }, 'More chapters'),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: closeMenu }, ['Back to the market', icon('arrow-right', { size: 18 })]),
    ]),
  ]);
  mark = null;
  showCard(card, { dim: true });
  celebrate(card, { pieces: 30 });
}

// ---- drills (sandbox replays of today's market) -------------------------------------------

function runDrill(kind, box, next) {
  const cfg = env.drillConfig?.();
  if (!cfg) {
    box.append(h('p', { class: 'coach__hint', text: 'Open today’s market first, then try this step again.' }));
    return;
  }
  const d = active.drill;
  if (kind === 'whale-panic' || kind === 'whale-hold') {
    const strategy = kind === 'whale-panic' ? 'panic' : 'hold';
    d[strategy] ??= whaleDrill(cfg, strategy);
    const run = d[strategy];
    const cut = run.prices.findIndex((p) => p.t > run.dumpAt) + 1;
    const chartBox = h('div', { class: 'coach__chart' }, [spark(run.prices.slice(0, cut), run, [{ t: run.dumpAt, label: 'Whale sells' }])]);
    const result = h('p', { class: 'coach__result', role: 'status' });
    next.disabled = true;
    const act = h('button', { class: 'btn btn--accent btn--block', type: 'button' }, strategy === 'panic' ? 'Sell everything now' : 'Hold and wait 30 seconds');
    act.addEventListener('click', () => {
      act.remove();
      chartBox.replaceChildren(spark(run.prices, run, strategy === 'panic' ? [{ t: run.dumpAt, label: 'Whale sells' }, { t: run.sold.t, label: 'You sold' }] : [{ t: run.dumpAt, label: 'Whale sells' }]));
      result.textContent = strategy === 'panic'
        ? `You sold all your VAULT for ${money(run.sold.got)}. Thirty seconds later your money is worth ${money(run.finalValue)} in total.`
        : `You kept your VAULT. Thirty seconds later your money is worth ${money(run.finalValue)} in total.`;
      next.disabled = false;
      next.focus();
    });
    box.append(chartBox, act, result);
    return;
  }
  if (kind === 'whale-compare') {
    d.panic ??= whaleDrill(cfg, 'panic');
    d.hold ??= whaleDrill(cfg, 'hold');
    const diff = d.hold.finalValue - d.panic.finalValue;
    const col = (label, run, marks) =>
      h('div', { class: 'coach__col' }, [
        h('p', { class: 'coach__col-title', text: label }),
        h('div', { class: 'coach__chart coach__chart--small' }, [spark(run.prices, run, marks)]),
        h('p', { class: 'coach__col-value', text: money(run.finalValue) }),
      ]);
    box.append(
      h('div', { class: 'coach__compare' }, [
        col('Panic-sold', d.panic, [{ t: d.panic.sold.t, label: 'Sold' }]),
        col('Held', d.hold, []),
      ]),
      h('p', { class: 'coach__result', text: diff >= 0
        ? `Holding ended ${money(diff)} better. Selling at the bottom locked in the loss, while bargain hunters bought the dip and the price partly recovered.`
        : `This time panic-selling ended ${money(-diff)} better: the price kept sliding. Holding isn’t magic. What matters is deciding calmly instead of in a panic.` }),
    );
    return;
  }
  if (kind === 'copycat') {
    d.copycat ??= copycatDrill(cfg);
    const c = d.copycat;
    box.append(
      h('div', { class: 'coach__chart' }, [spark(c.prices, { prices: c.prices }, [{ t: c.spawnAt + 1, label: `${c.copy.id} appears` }, { t: c.rugAt, label: 'Rug pull' }])]),
      h('p', { class: 'coach__result', text: `A look-alike called “${c.copy.name}” (${c.copy.id}) appeared, got pumped, and then its creator pulled the pool. Everyone who bought it lost their money.` }),
      h('p', { class: 'coach__flags-title', text: 'Red flags to check before you buy any coin:' }),
      h('ul', { class: 'coach__flags' }, [
        'A name that copies another coin, often with “Official” or “V2”.',
        'A pool that isn’t locked, so the money can be pulled out.',
        'One creator holding most of the coins.',
        'Sudden hype with no real reason behind it.',
      ].map((t) => h('li', {}, [icon('alert', { size: 16 }), h('span', { text: t })]))),
    );
  }
}

// A small price line with labelled moments. Decorative: the numbers are in the text beside it.
function spark(points, run, marks = []) {
  const W = 300;
  const H = 96;
  const pad = 6;
  const ts = (run.prices || points).map((p) => p.t);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  const ps = (run.prices || points).map((p) => p.price);
  const lo = Math.min(...ps);
  const hi = Math.max(...ps);
  const x = (t) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * pad);
  const y = (p) => pad + (1 - (p - lo) / Math.max(1e-12, hi - lo)) * (H - 2 * pad - 14);
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: `0 0 ${W} ${H}`, class: 'spark', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  const line = document.createElementNS(SVG_NS, 'polyline');
  line.setAttribute('points', points.map((p) => `${x(p.t).toFixed(1)},${y(p.price).toFixed(1)}`).join(' '));
  line.setAttribute('class', 'spark__line');
  svg.append(line);
  for (const m of marks) {
    const g = document.createElementNS(SVG_NS, 'g');
    const lx = x(m.t);
    const rule = document.createElementNS(SVG_NS, 'line');
    for (const [k, v] of Object.entries({ x1: lx, x2: lx, y1: pad, y2: H - 14, class: 'spark__mark' })) rule.setAttribute(k, String(v));
    const text = document.createElementNS(SVG_NS, 'text');
    for (const [k, v] of Object.entries({ x: Math.min(Math.max(lx, 30), W - 30), y: H - 2, 'text-anchor': 'middle', class: 'spark__label' })) text.setAttribute(k, String(v));
    text.textContent = m.label;
    g.append(rule, text);
    svg.append(g);
  }
  return svg;
}

// Original diagrams for chapter 1.
function art(kind) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const add = (tag, attrs, text) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text) el.textContent = text;
    svg.append(el);
    return el;
  };
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'coach-art');
  if (kind === 'candle') {
    svg.setAttribute('viewBox', '0 0 300 150');
    add('line', { x1: 90, x2: 90, y1: 14, y2: 136, class: 'coach-art__wick' });
    add('rect', { x: 70, y: 44, width: 40, height: 62, rx: 4, class: 'coach-art__up' });
    for (const [y, label] of [[14, 'High'], [44, 'Close'], [106, 'Open'], [136, 'Low']]) {
      add('line', { x1: 118, x2: 150, y1: y, y2: y, class: 'coach-art__guide' });
      add('text', { x: 156, y: y + 5, class: 'coach-art__label' }, label);
    }
    add('text', { x: 20, y: 30, class: 'coach-art__small' }, 'wick');
    add('text', { x: 20, y: 80, class: 'coach-art__small' }, 'body');
    return svg;
  }
  svg.setAttribute('viewBox', '0 0 300 150');
  add('line', { x1: 80, x2: 80, y1: 20, y2: 124, class: 'coach-art__wick' });
  add('rect', { x: 62, y: 36, width: 36, height: 64, rx: 4, class: 'coach-art__up' });
  add('text', { x: 80, y: 144, 'text-anchor': 'middle', class: 'coach-art__label' }, '↑ Up');
  add('line', { x1: 220, x2: 220, y1: 20, y2: 124, class: 'coach-art__wick' });
  add('rect', { x: 202, y: 40, width: 36, height: 64, rx: 4, class: 'coach-art__down' });
  add('text', { x: 220, y: 144, 'text-anchor': 'middle', class: 'coach-art__label' }, '↓ Down');
  return svg;
}

// ---- overlay and placement -------------------------------------------------------------------

function showCard(card, { dim = false, interactive = false } = {}) {
  if (!layer) {
    layer = h('div', { class: 'coach' }, [h('div', { class: 'coach__block' }), h('div', { class: 'coach__ring', hidden: true })]);
    document.body.append(layer);
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    document.addEventListener('keydown', onKey);
  }
  layer.classList.toggle('is-dim', dim);
  layer.classList.toggle('is-interactive', interactive);
  layer.querySelector('.coach__card')?.remove();
  layer.append(card);
  place();
  animate(card, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 200 });
  card.querySelector('.coach__title')?.focus({ preventScroll: true });
}

function teardownLayer() {
  cancelAnimationFrame(frame);
  if (!layer) return;
  removeEventListener('scroll', schedule);
  removeEventListener('resize', schedule);
  document.removeEventListener('keydown', onKey);
  layer.remove();
  layer = null;
  mark = null;
}

function onKey(e) {
  if (e.key !== 'Escape') return;
  if (active) exitChapter();
  else closeMenu();
}

function schedule() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(place);
}

const isNarrow = () => innerWidth < 600;
const headerBottom = () => Math.max(0, document.querySelector('.app-header')?.getBoundingClientRect().bottom || 0);

// Bring the element into view so the card never covers it: on phones the card docks to the bottom
// and the element sits in the space above it (or the card docks to the top for very tall elements).
function reveal() {
  if (!mark || !layer) return;
  const card = layer.querySelector('.coach__card');
  const r = mark.getBoundingClientRect();
  const vh = innerHeight;
  if (isNarrow()) {
    const ch = card.offsetHeight;
    const topSafe = headerBottom() + 8;
    const free = vh - ch - 24 - topSafe;
    const desiredTop = r.height <= free ? topSafe + (free - r.height) / 2 : ch + 24;
    card.dataset.dock = r.height <= free ? 'bottom' : 'top';
    scrollBy({ top: r.top - desiredTop, behavior: 'auto' });
  } else if (r.top < headerBottom() || r.bottom > vh) {
    mark.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
  place();
  // Near the end of the page the scroll can fall short: if the card still covers the element,
  // dock it to the other edge instead.
  if (isNarrow() && covers(card, mark)) {
    card.dataset.dock = card.dataset.dock === 'top' ? 'bottom' : 'top';
    place();
  }
}

function covers(card, el) {
  const c = card.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return !(c.bottom <= r.top || c.top >= r.bottom || c.right <= r.left || c.left >= r.right);
}

function place() {
  if (!layer) return;
  const card = layer.querySelector('.coach__card');
  const ring = layer.querySelector('.coach__ring');
  if (!card) return;
  const vw = innerWidth;
  const vh = innerHeight;
  const r = mark && mark.isConnected ? mark.getBoundingClientRect() : null;
  if (r) {
    const pad = 6;
    ring.hidden = false;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
  } else {
    ring.hidden = true;
  }
  if (isNarrow() || !r) {
    if (!r || isNarrow()) {
      card.dataset.dock = r && card.dataset.dock === 'top' ? 'top' : 'bottom';
      card.style.left = '';
      card.style.top = '';
    }
    return;
  }
  // Wider screens: float next to the element, preferring below, then above, then beside it.
  card.dataset.dock = 'float';
  const gap = 14;
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  let top;
  let left = clamp(r.left + r.width / 2 - cw / 2, gap, vw - cw - gap);
  if (vh - r.bottom >= ch + 2 * gap) top = r.bottom + gap;
  else if (r.top - headerBottom() >= ch + 2 * gap) top = r.top - ch - gap;
  else if (vw - r.right >= cw + 2 * gap) {
    left = r.right + gap;
    top = clamp(r.top, gap, vh - ch - gap);
  } else if (r.left >= cw + 2 * gap) {
    left = r.left - cw - gap;
    top = clamp(r.top, gap, vh - ch - gap);
  } else {
    top = clamp(vh - ch - gap, gap, vh - ch - gap);
  }
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

export const isCoaching = () => Boolean(active);
