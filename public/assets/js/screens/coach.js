// Coach mode (BRIEF §15; slice J7). A coach-mark engine that spotlights real Lab and Create UI,
// pauses the market and walks through a chapter step by step. Marks follow their element on scroll
// and resize; on phones and short screens the card docks above or below the element so it never covers it.
// Content lives in public/data/coach.json. A chapter in progress survives route changes, so
// "Build your coin" can carry on into #/create and back.
//
// Screens attach with an env: { route, tier, store, navigate, dataBase, pause, resume, select,
// prepareTrade, tradesCount, canTrade, hasNews, hasCoin, nameReady, drillConfig }. Every hook is optional.
import { copycatDrill, whaleDrill } from '../sim/drills.js';
import { animate, announce, celebrate, getJSON, h, icon, money, penny } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WAIT_POLL_MS = 250;
const IDLE_MS = 2000; // a typed amount counts once the typing stops for this long
const EDGE = 12; // docked cards sit var(--sp-3) from the edge
const TRY_IT = 'Try it now. The next step starts as soon as you do.';
const NAME_FIRST = 'First give your coin a name and a ticker in Name it.';

let content = null; // promise of coach.json
let active = null; // { chapter, steps, index, tier, trades0, drill }
let env = null; // the mounted screen's hooks
let layer = null;
let spacer = null; // room at the end of the page, so the last element can scroll above a docked card
let mark = null; // the element the current step explains
let also = null; // a selector for what the element opens (a tool's ⓘ text), lit with it while it shows
let litHeight = 0; // the lit area's height at the last reveal()
let docked = false; // the card docks to an edge (phones, short screens, or no room to float)
let opener = null; // where focus was when the coach opened
let backdrop = null; // what a tap on the dimmed page does (menus only)
let dismiss = null; // what Escape does
let lastInput = 0;
let frame = 0;
let resizeTimer = 0;
let waitTimer = 0;
let nextTimer = 0;
const doneHooks = [];

// Called with { tier, chapter, xp, store, again } after a chapter is completed (J8 mints a badge here).
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

// Step text is a string, or { explorer, default } where the youngest level needs plainer words.
const forTier = (text, tier) => (text && typeof text === 'object' ? text[tier] ?? text.default : text);

const closeButton = (onClick) =>
  h('button', { class: 'icon-btn coach__close', type: 'button', onClick, title: 'Close the coach' }, [
    icon('close', { size: 20 }),
    h('span', { class: 'visually-hidden', text: 'Close the coach' }),
  ]);

// ---- screens -------------------------------------------------------------------------------

// A screen mounts: show the chapter in progress if its current step belongs here.
export function attachCoach(screenEnv) {
  env = screenEnv;
  // Wait for the router to finish (it scrolls to the top after a screen mounts), then place the mark.
  if (active) setTimeout(() => requestAnimationFrame(() => active && env === screenEnv && showStep()), 0);
  return () => {
    if (env === screenEnv) {
      teardownLayer({ restoreFocus: false }); // the route changed: the router moves focus
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
    // The first-visit offer stays quiet: 'offered' is still false, so it's tried again next visit.
    if (!offer && env === screenEnv) showLoadError(screenEnv);
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
  const card = h('section', { class: 'coach__card coach-menu', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'coach-title' }, [
    h('div', { class: 'coach__top' }, [
      penny('happy', { size: 48 }),
      h('div', {}, [
        h('p', { class: 'screen-eyebrow', text: `Coach · +${data.xp} XP per chapter` }),
        h('h2', { class: 'coach__title', id: 'coach-title', tabindex: '-1', text: offer ? 'Want a guided tour?' : 'Coach' }),
      ]),
      closeButton(closeMenu),
    ]),
    h('p', { class: 'coach__body', text: 'Penny can walk you through the Lab one step at a time. The market waits while you learn.' }),
    h('ol', { class: 'coach-menu__list' }, items),
    h('div', { class: 'coach__actions' }, [
      h('button', { class: 'btn btn--block', type: 'button', onClick: closeMenu }, offer ? 'Explore on my own' : 'Close'),
    ]),
  ]);
  clearWait(); // a step underneath comes back when the menu closes
  mark = null; // the menu explains nothing on the page, so no ring
  showCard(card, { dim: true, onBackdrop: closeMenu });
  env.pause?.();
}

// Tapping Coach while coach.json can't load: say so on screen, not only to screen readers.
function showLoadError(screenEnv) {
  const card = h('section', { class: 'coach__card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'coach-title', 'aria-describedby': 'coach-body' }, [
    h('div', { class: 'coach__top' }, [
      penny('worried', { size: 40 }),
      h('h2', { class: 'coach__title', id: 'coach-title', tabindex: '-1', text: 'The coach didn’t load' }),
      closeButton(closeMenu),
    ]),
    h('p', { class: 'coach__body', id: 'coach-body', text: 'Check your connection and try again.' }),
    h('div', { class: 'coach__actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: closeMenu }, 'Close'),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openCoachMenu(screenEnv) }, 'Try again'),
    ]),
  ]);
  mark = null;
  showCard(card, { dim: true, onBackdrop: closeMenu });
  screenEnv.pause?.(); // like the menu: nothing moves behind the dimmed page
}

// Close the menu or the completion card. A chapter in progress comes back if its step is on this
// screen; otherwise the market runs again.
function closeMenu() {
  teardownLayer();
  if (active && env && (active.steps[active.index].route || '/lab') === env.route) showStep();
  else env?.resume?.();
}

export async function startChapter(id) {
  const data = await loadCoach(env.dataBase);
  const chapter = data.chapters.find((c) => c.id === id);
  if (!chapter || !env) return;
  const launched = Boolean(env.hasCoin?.());
  const steps = chapter.steps
    .filter((s) => !s.tiers || s.tiers.includes(env.tier))
    // Optional steps explain a tool the screen may not show (RSI outside Advanced): skip them then.
    .filter((s) => !s.optional || document.querySelector(s.target)?.getClientRects().length)
    // Chapter 5 after a coin is already out: skip the Create steps and go straight to the outcome.
    .filter((s) => !(launched && (s.route === '/create' || s.go === '/create')));
  active = { chapter, steps, index: 0, tier: env.tier, xp: data.xp, drill: {} };
  if (id === 'trade') {
    // Market, Buy and VAULT with an empty amount, so "Choose an amount" starts clean.
    if (env.prepareTrade) env.prepareTrade();
    else env.select?.('VAULT');
  }
  showStep();
}

function exitChapter() {
  active = null;
  teardownLayer();
  env?.resume?.();
  announce('Coach closed.');
}

// ---- steps ---------------------------------------------------------------------------------

function showStep() {
  clearWait();
  const step = active.steps[active.index];
  const route = step.route || '/lab';
  if (!env || env.route !== route) {
    // The step belongs to another screen and reappears when that screen attaches. A card nobody
    // can see must never hold the market.
    env?.resume?.();
    teardownLayer();
    return;
  }
  // "Watch" steps let the market run; every other step pauses it.
  if (step.live) env.resume?.();
  else env.pause?.();
  const tier = active.tier;
  const waiting = Boolean(step.wait);
  const interactive = waiting || Boolean(step.interactive);
  // The launch step points at Name it first while the coin has no valid name or ticker yet.
  let unnamed = step.wait === 'launch' && nameMissing();
  const target = unnamed ? '[data-coach="name"]' : step.target;
  mark = target ? document.querySelector(target) : null;
  also = step.also || null;
  const total = active.steps.length;
  const last = active.index === total - 1;
  // Back only to a step on this screen that neither navigates nor waits (a finished "Try it" would
  // jump straight forward again).
  const prev = active.steps[active.index - 1];
  const canBack = prev && !step.drill && (prev.route || '/lab') === route && !prev.go && !prev.wait;
  active.trades0 = env.tradesCount?.() ?? 0;
  lastInput = Date.now();

  const next = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => advance(step) }, [
    step.next || (last ? 'Finish chapter' : 'Next'),
    icon('arrow-right', { size: 18 }),
  ]);
  const extra = h('div', { class: 'coach__extra' });
  const hint = waiting
    ? h('p', { class: 'coach__hint', role: 'status', text: unnamed ? NAME_FIRST : TRY_IT })
    : null;
  const card = h('section', {
    class: 'coach__card',
    role: 'dialog',
    'aria-modal': interactive ? null : 'true',
    'aria-labelledby': 'coach-title',
    'aria-describedby': 'coach-body',
  }, [
    h('div', { class: 'coach__top' }, [
      penny('thinking', { size: 40 }),
      h('p', { class: 'coach__step', text: `${active.chapter.title} · Step ${active.index + 1} of ${total}` }),
      closeButton(exitChapter),
    ]),
    h('h2', { class: 'coach__title', id: 'coach-title', tabindex: '-1', text: forTier(step.title, tier) }),
    h('p', { class: 'coach__body', id: 'coach-body', text: forTier(step.body, tier) }),
    extra,
    hint,
    h('div', { class: 'coach__actions' }, [
      canBack ? h('button', { class: 'btn', type: 'button', onClick: back }, 'Back') : null,
      waiting ? h('button', { class: 'btn', type: 'button', onClick: () => advance(step) }, 'Skip this step') : next,
    ]),
  ]);
  if (step.art) extra.append(art(step.art));
  if (step.drill) runDrill(step.drill, extra, next);
  showCard(card, { dim: !mark, interactive, onEscape: exitChapter });
  reveal();
  waitTimer = setInterval(() => {
    if (!active || active.steps[active.index] !== step) return clearWait();
    moreBelow(card);
    // The running market, or a tap on the page, can move things under the ring.
    if (step.live || interactive) schedule();
    // Something the element opened (a tool's ⓘ text) changes the lit area: bring all of it into view.
    if (also && mark?.isConnected && Math.abs(markRect().height - litHeight) > 1) reveal();
    // A later "Try it" done early (Launch tapped during "Name and ticker", Buy during "Choose an
    // amount") skips ahead to the step after it.
    const ahead = doneAhead();
    if (ahead >= 0) {
      clearWait();
      active.index = ahead;
      advance(active.steps[ahead]);
      return;
    }
    if (!waiting) return;
    // Once the typing stops, the ring follows the name: to Name it while it isn't ready (a Launch
    // tap on an empty form), back to Launch when it is.
    if (step.wait === 'launch' && nameMissing() !== unnamed && Date.now() - lastInput >= IDLE_MS) {
      unnamed = !unnamed;
      mark = document.querySelector(unnamed ? '[data-coach="name"]' : step.target);
      if (hint) hint.textContent = unnamed ? NAME_FIRST : 'Great! Now tap Launch.';
      reveal();
    }
    if (!satisfied(step.wait)) return;
    clearWait();
    if (hint) hint.textContent = 'Nice!';
    nextTimer = setTimeout(() => active && active.steps[active.index] === step && advance(step), 600);
  }, WAIT_POLL_MS);
}

function satisfied(wait) {
  // Wait for a pause in the typing, so "100" isn't cut off at "1".
  if (wait === 'tradePreview') return Boolean(env?.canTrade?.()) && Date.now() - lastInput >= IDLE_MS;
  if (wait === 'tradeDone') return (env?.tradesCount?.() ?? 0) > active.trades0;
  if (wait === 'launch') return Boolean(env?.hasCoin?.());
  return true;
}

// The coin still needs a valid name or ticker: env.nameReady() when the screen has it, or else the
// fields the designer marks invalid (after a Launch tap on an empty form).
function nameMissing() {
  const ready = env?.nameReady?.();
  if (typeof ready === 'boolean') return !ready;
  return Boolean(document.querySelector('[data-coach="name"] [aria-invalid="true"]'));
}

// The index of a later step whose action has already happened, or -1.
function doneAhead() {
  for (let i = active.steps.length - 1; i > active.index; i--) {
    const { wait } = active.steps[i];
    if (wait === 'launch' && env?.hasCoin?.()) return i;
    if (wait === 'tradeDone' && (env?.tradesCount?.() ?? 0) > active.trades0) return i;
  }
  return -1;
}

function clearWait() {
  clearInterval(waitTimer);
  clearTimeout(nextTimer);
}

function advance(step) {
  if (!active) return;
  if (active.index >= active.steps.length - 1) return finishChapter();
  active.index++;
  if (step.go) {
    teardownLayer({ restoreFocus: false }); // the next screen takes focus
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
  // XP and badges count once per chapter (progress.js, badges.js), so a replay is just practice.
  const again = Boolean(coachDone(store, tier)[chapter.id]);
  active = null;
  clearWait();
  store.set((s) => {
    const mine = s.coach?.[tier] || {};
    return { coach: { ...s.coach, [tier]: { ...mine, offered: true, done: { ...mine.done, [chapter.id]: mine.done?.[chapter.id] || { at: Date.now(), xp } } } } };
  });
  const extras = [];
  for (const fn of doneHooks) {
    try {
      const node = fn({ tier, chapter, xp, store, again });
      // A replay mints nothing new, so its notes would repeat old news.
      if (node instanceof Node && !again) extras.push(node);
    } catch (err) {
      console.error(err);
    }
  }
  const card = h('section', { class: 'coach__card coach__card--done', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'coach-title' }, [
    h('div', { class: 'coach__done-head' }, [penny('celebrating', { size: 72 })]),
    h('h2', { class: 'coach__title', id: 'coach-title', tabindex: '-1', text: 'Chapter complete!' }),
    h('p', {
      class: 'coach__body',
      text: again
        ? `${chapter.title}: done again, just for practice. You already have this chapter’s XP.`
        : `${chapter.title}: done. +${xp} XP on your Learning Path.`,
    }),
    ...extras,
    h('div', { class: 'coach__actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: () => openCoachMenu(env) }, 'More chapters'),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: closeMenu }, ['Back to the market', icon('arrow-right', { size: 18 })]),
    ]),
  ]);
  mark = null;
  showCard(card, { dim: true, onBackdrop: closeMenu });
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
  const young = active.tier === 'explorer';
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
        ? `You sold all your VAULT for ${money(run.sold.got)}. Thirty seconds later your Practice L$ add up to ${money(run.finalValue)} in total.`
        : `You kept your VAULT. Thirty seconds later your Practice L$ and VAULT are worth ${money(run.finalValue)} in total.`;
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
    // The small charts keep the marks but drop the labels, which would be too small to read.
    const col = (label, run, marks) =>
      h('div', { class: 'coach__col' }, [
        h('p', { class: 'coach__col-title', text: label }),
        h('div', { class: 'coach__chart coach__chart--small' }, [spark(run.prices, run, marks, { labels: false })]),
        h('p', { class: 'coach__col-value', text: money(run.finalValue) }),
      ]);
    let text;
    if (diff >= 0) {
      text = young
        ? `Holding ended ${money(diff)} better. Selling at the low point made the loss stick. Other buyers came back, and the price climbed partway.`
        : `Holding ended ${money(diff)} better. Selling at the bottom locked in the loss, while bargain hunters bought the dip and the price partly recovered.`;
    } else {
      text = young
        ? `This time selling ended ${money(-diff)} better: the price kept sliding. Holding isn’t magic. What matters is deciding calmly, not in a panic.`
        : `This time panic-selling ended ${money(-diff)} better: the price kept sliding. Holding isn’t magic. What matters is deciding calmly instead of in a panic.`;
    }
    box.append(
      h('div', { class: 'coach__compare' }, [
        col('Panic-sold', d.panic, [{ t: d.panic.sold.t, label: 'Sold' }]),
        col('Held', d.hold, []),
      ]),
      h('p', { class: 'coach__result', text }),
    );
    return;
  }
  if (kind === 'copycat') {
    d.copycat ??= copycatDrill(cfg);
    const c = d.copycat;
    box.append(
      h('div', { class: 'coach__chart' }, [spark(c.prices, { prices: c.prices }, [{ t: c.spawnAt + 1, label: `${c.copy.id} appears` }, { t: c.rugAt, label: young ? 'Money pulled out' : 'Rug pull' }])]),
      h('p', {
        class: 'coach__result',
        text: young
          ? `A look-alike called “${c.copy.name}” (${c.copy.id}) appeared. People hyped it up, then its maker took all the money out of its pool. Everyone who bought it lost their money.`
          : `A look-alike called “${c.copy.name}” (${c.copy.id}) appeared, got pumped, and then its creator pulled the pool. Everyone who bought it lost their money.`,
      }),
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
function spark(points, run, marks = [], { labels = true } = {}) {
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
  let prevX = -Infinity;
  for (const m of marks) {
    const g = document.createElementNS(SVG_NS, 'g');
    const lx = x(m.t);
    const rule = document.createElementNS(SVG_NS, 'line');
    for (const [k, v] of Object.entries({ x1: lx, x2: lx, y1: pad, y2: H - 14, class: 'spark__mark' })) rule.setAttribute(k, String(v));
    g.append(rule);
    if (labels) {
      // Two moments close together: the second label goes to the top row, to the right of its line.
      // Near an edge a label starts or ends at its line instead of being cut off.
      const crowded = lx - prevX < 70;
      const anchor = crowded || lx < 60 ? 'start' : lx > W - 60 ? 'end' : 'middle';
      const text = document.createElementNS(SVG_NS, 'text');
      for (const [k, v] of Object.entries({ x: anchor === 'start' ? lx + 3 : anchor === 'end' ? lx - 3 : lx, y: crowded ? pad + 10 : H - 2, 'text-anchor': anchor, class: 'spark__label' })) text.setAttribute(k, String(v));
      text.textContent = m.label;
      g.append(text);
    }
    prevX = lx;
    svg.append(g);
  }
  return svg;
}

// Original diagrams for chapters 1 and 2. Lines that need many candles get a picture, because the
// chart may not have drawn them yet.
function art(kind) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const add = (tag, attrs, text) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text) el.textContent = text;
    svg.append(el);
    return el;
  };
  const path = (pts) => pts.map(([px, py]) => `${px},${py}`).join(' ');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'coach-art');
  svg.setAttribute('viewBox', '0 0 300 150');
  if (kind === 'candle') {
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
  if (kind === 'sma') {
    // A jumpy price, the solid blue SMA 7 close behind it and the dashed pink SMA 25 further back.
    add('polyline', { points: path([[10, 128], [28, 110], [46, 118], [64, 96], [82, 104], [100, 82], [118, 90], [136, 66], [154, 76], [172, 54], [190, 64], [208, 46], [226, 62], [244, 80], [262, 72], [290, 98]]), class: 'coach-art__price' });
    add('polyline', { points: path([[10, 124], [46, 114], [82, 102], [118, 90], [154, 76], [190, 64], [226, 60], [262, 70], [290, 82]]), class: 'coach-art__fast' });
    add('polyline', { points: path([[10, 122], [82, 112], [154, 98], [226, 84], [290, 80]]), class: 'coach-art__slow' });
    add('line', { x1: 12, x2: 34, y1: 14, y2: 14, class: 'coach-art__fast' });
    add('text', { x: 40, y: 19, class: 'coach-art__small' }, 'SMA 7');
    add('line', { x1: 104, x2: 126, y1: 14, y2: 14, class: 'coach-art__slow' });
    add('text', { x: 132, y: 19, class: 'coach-art__small' }, 'SMA 25');
    add('line', { x1: 206, x2: 228, y1: 14, y2: 14, class: 'coach-art__price' });
    add('text', { x: 234, y: 19, class: 'coach-art__small' }, 'Price');
    return svg;
  }
  if (kind === 'rsi') {
    // A 0 to 100 score with the usual lines at 70 and 30.
    const ry = (v) => 136 - v * 1.2;
    add('rect', { x: 34, y: ry(70), width: 256, height: ry(30) - ry(70), class: 'coach-art__band' });
    for (const v of [70, 30]) {
      add('line', { x1: 34, x2: 290, y1: ry(v), y2: ry(v), class: 'coach-art__guide' });
      add('text', { x: 26, y: ry(v) + 5, 'text-anchor': 'end', class: 'coach-art__small' }, String(v));
    }
    add('text', { x: 26, y: ry(100) + 10, 'text-anchor': 'end', class: 'coach-art__small' }, '100');
    add('text', { x: 26, y: ry(0), 'text-anchor': 'end', class: 'coach-art__small' }, '0');
    const values = [50, 62, 74, 80, 68, 55, 40, 28, 22, 33, 47, 58, 65, 61];
    add('polyline', { points: path(values.map((v, i) => [40 + i * 19, ry(v)])), class: 'coach-art__rsi' });
    return svg;
  }
  add('line', { x1: 80, x2: 80, y1: 20, y2: 124, class: 'coach-art__wick' });
  add('rect', { x: 62, y: 36, width: 36, height: 64, rx: 4, class: 'coach-art__up' });
  add('text', { x: 80, y: 144, 'text-anchor': 'middle', class: 'coach-art__label' }, '↑ Up');
  add('line', { x1: 220, x2: 220, y1: 20, y2: 124, class: 'coach-art__wick' });
  add('rect', { x: 202, y: 40, width: 36, height: 64, rx: 4, class: 'coach-art__down' });
  add('text', { x: 220, y: 144, 'text-anchor': 'middle', class: 'coach-art__label' }, '↓ Down');
  return svg;
}

// ---- overlay and placement -------------------------------------------------------------------

function showCard(card, { dim = false, interactive = false, onBackdrop = null, onEscape = closeMenu } = {}) {
  if (!layer) {
    const from = document.activeElement;
    opener = from && from !== document.body && from.id !== 'main' ? from : null;
    layer = h('div', { class: 'coach' }, [h('div', { class: 'coach__block', onClick: () => backdrop?.() }), h('div', { class: 'coach__ring', hidden: true })]);
    spacer = h('div', { class: 'coach-spacer', 'aria-hidden': 'true' });
    document.body.append(layer, spacer);
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);
    document.addEventListener('input', noteInput, true);
  }
  backdrop = onBackdrop;
  dismiss = onEscape;
  layer.classList.toggle('is-dim', dim);
  layer.classList.toggle('is-interactive', interactive);
  layer.querySelector('.coach__card')?.remove();
  layer.append(card);
  card.addEventListener('scroll', () => moreBelow(card), { passive: true });
  place();
  animate(card, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 200 });
  // Someone typing in the page keeps the field (and the phone keyboard), so the card can't be modal
  // and is read out instead.
  const title = card.querySelector('.coach__title');
  if (typing()) {
    card.removeAttribute('aria-modal');
    const head = title?.textContent || '';
    announce(`${/[.!?]$/.test(head) ? head : `${head}.`} ${card.querySelector('.coach__body')?.textContent || ''}`.trim());
  } else {
    title?.focus({ preventScroll: true });
  }
}

function teardownLayer({ restoreFocus = true } = {}) {
  clearWait();
  cancelAnimationFrame(frame);
  clearTimeout(resizeTimer);
  if (!layer) return;
  const focus = document.activeElement;
  const lost = !focus || focus === document.body || layer.contains(focus);
  removeEventListener('scroll', schedule);
  removeEventListener('resize', onResize);
  document.removeEventListener('keydown', onKey);
  document.removeEventListener('input', noteInput, true);
  layer.remove();
  spacer.remove();
  Object.assign(document.documentElement.style, { scrollPaddingTop: '', scrollPaddingBottom: '' });
  layer = null;
  spacer = null;
  mark = null;
  also = null;
  docked = false;
  backdrop = null;
  dismiss = null;
  const back = opener;
  opener = null;
  if (restoreFocus && lost) focusBack(back);
}

// Focus goes back where it was before the coach opened, or else to the screen's heading.
function focusBack(el) {
  if (el?.isConnected && el.getClientRects().length) {
    el.focus({ preventScroll: true });
    if (document.activeElement === el) return;
  }
  const heading = document.querySelector('#main h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

const noteInput = () => {
  lastInput = Date.now();
};

function typing() {
  const el = document.activeElement;
  if (!el || layer?.contains(el)) return false;
  return el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|number|search|email|tel|url|password)$/.test(el.type));
}

function onKey(e) {
  if (!layer || document.querySelector('dialog[open]')) return; // Penny's own dialogs handle their keys
  if (e.key === 'Tab') {
    trapTab(e);
    return;
  }
  if (e.key === 'Escape') (dismiss || closeMenu)(); // a step's x, or a menu's Close
}

// Tab stays in the card. On "Try it" steps the element the step points at comes first, so it's
// one Tab away from the card's title. Those steps leave the page usable, so Tab from a field outside
// the element (say, one the page focused to show a problem) moves on through the page as usual.
const TABBABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]:not([contenteditable="false"])';
function trapTab(e) {
  const card = layer.querySelector('.coach__card');
  const open = layer.classList.contains('is-interactive');
  const from = document.activeElement;
  if (open && from && from !== document.body && from.id !== 'main' && !layer.contains(from) && !mark?.contains(from)) return;
  const stops = [...(open ? tabbables(mark) : []), ...tabbables(card)];
  if (!stops.length) return;
  e.preventDefault();
  const n = stops.length;
  const i = stops.indexOf(document.activeElement);
  stops[i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? n - 1 : 1)) % n].focus();
}

function tabbables(root) {
  if (!root?.isConnected) return [];
  return [root, ...root.querySelectorAll(TABBABLE)].filter((el) => {
    if (!el.matches(TABBABLE) || el.disabled || el.tabIndex < 0 || !el.getClientRects().length) return false;
    // Laid out but not focusable: Tab would stall on it.
    if (el.closest('[inert]') || getComputedStyle(el).visibility === 'hidden') return false;
    if (el.type !== 'radio' || !el.name) return true;
    // A radio group is one Tab stop: its checked option, or the first one.
    const group = [...root.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)];
    return el === (group.find((r) => r.checked) || group[0]);
  });
}

function schedule() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(place);
}

// A resize (rotation, browser bars, a phone keyboard) can leave the element under the card: once it
// settles, bring the element back into the free space.
function onResize() {
  schedule();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(reveal, 150);
}

const isNarrow = () => innerWidth < 600 || innerHeight < 600;
const headerBottom = () => Math.max(0, document.querySelector('.app-header')?.getBoundingClientRect().bottom || 0);

// Bring the element into view so the card never covers it. Wide screens float the card next to the
// element; phones, short screens and elements with no room around them dock it to an edge.
function reveal() {
  if (!layer) return;
  const card = layer.querySelector('.coach__card');
  spacer.style.height = '';
  docked = false;
  if (!mark || !card) return;
  docked = isNarrow();
  if (!docked) {
    const r = markRect();
    if (r.top < headerBottom() || r.bottom > innerHeight) {
      // With an opened explanation, centre the element and the explanation together.
      if (r.height > mark.getBoundingClientRect().height + 1) scrollBy({ top: r.top + r.height / 2 - (headerBottom() + innerHeight) / 2, behavior: 'auto' });
      else mark.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
    card.dataset.dock = 'float';
    card.style.maxHeight = '';
    docked = !floatSpot(markRect(), card);
  }
  if (docked) dockBeside(card);
  litHeight = markRect().height;
  place();
}

// The element, plus what it has opened (a tool's ⓘ text) while that shows.
function markRect() {
  const r = mark.getBoundingClientRect();
  if (!also) return r;
  let { left, top, right, bottom } = r;
  for (const el of document.querySelectorAll(also)) {
    if (!el.getClientRects().length) continue; // hidden
    const e = el.getBoundingClientRect();
    left = Math.min(left, e.left);
    top = Math.min(top, e.top);
    right = Math.max(right, e.right);
    bottom = Math.max(bottom, e.bottom);
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// A card whose text runs on under its buttons gets a shadow above them, so it's clear it scrolls.
const moreBelow = (card) => card.classList.toggle('has-more', card.scrollHeight - card.scrollTop - card.clientHeight > 2);

// Dock the card to the bottom or the top edge, whichever covers the element less (usually not at
// all), and scroll the element into the space the card leaves free.
function dockBeside(card) {
  card.dataset.dock = 'bottom';
  card.style.left = '';
  card.style.top = '';
  card.style.maxHeight = '';
  const vh = innerHeight;
  const r = markRect();
  // Beside a small element the card can grow past its usual height, so its text and pictures show.
  const room = vh - r.height - headerBottom() - 32;
  card.style.maxHeight = `${Math.max(parseFloat(getComputedStyle(card).maxHeight) || 0, room)}px`;
  const ch = card.offsetHeight;
  spacer.style.height = `${ch + 2 * EDGE}px`;
  const c = card.getBoundingClientRect();
  const across = c.left < r.right && r.left < c.right; // false when they sit side by side
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
  const plans = [
    { dock: 'bottom', from: headerBottom() + 8, to: vh - ch - 2 * EDGE, cardTop: vh - ch - (parseFloat(getComputedStyle(card).bottom) || EDGE) },
    { dock: 'top', from: ch + 2 * EDGE, to: vh - 8, cardTop: EDGE },
  ].map((p) => {
    const free = p.to - p.from;
    const want = r.height <= free ? p.from + (free - r.height) / 2 : p.from;
    const y = Math.min(Math.max(scrollY + r.top - want, 0), maxScroll);
    const top = r.top + scrollY - y;
    const overlap = across ? Math.max(0, Math.min(top + r.height, p.cardTop + ch) - Math.max(top, p.cardTop)) : 0;
    return { ...p, y, overlap };
  });
  const best = plans[1].overlap < plans[0].overlap ? plans[1] : plans[0];
  card.dataset.dock = best.dock;
  scrollTo({ top: best.y, behavior: 'auto' });
}

// Wider screens: a spot next to the element, preferring below, then above, then beside it. Null when
// none fits.
function floatSpot(r, card) {
  const vw = innerWidth;
  const vh = innerHeight;
  const gap = 14;
  const cw = card.offsetWidth;
  const ch = Math.min(card.scrollHeight, vh - 2 * EDGE);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const left = clamp(r.left + r.width / 2 - cw / 2, gap, vw - cw - gap);
  if (vh - r.bottom >= ch + 2 * gap) return { left, top: r.bottom + gap };
  if (r.top - headerBottom() >= ch + 2 * gap) return { left, top: r.top - ch - gap };
  if (vw - r.right >= cw + 2 * gap) return { left: r.right + gap, top: clamp(r.top, gap, vh - ch - gap) };
  if (r.left >= cw + 2 * gap) return { left: r.left - cw - gap, top: clamp(r.top, gap, vh - ch - gap) };
  return null;
}

function place() {
  if (!layer) return;
  const card = layer.querySelector('.coach__card');
  const ring = layer.querySelector('.coach__ring');
  if (!card) return;
  const r = mark && mark.isConnected ? markRect() : null;
  if (r) {
    const pad = 6;
    ring.hidden = false;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
  } else {
    ring.hidden = true;
  }
  const spot = r && !isNarrow() && !docked ? floatSpot(r, card) : null;
  if (spot) {
    card.dataset.dock = 'float';
    card.style.left = `${spot.left}px`;
    card.style.top = `${spot.top}px`;
  } else {
    if (!r) card.dataset.dock = 'bottom';
    else if (!isNarrow() && !docked) card.dataset.dock = r.top + r.height / 2 < innerHeight / 2 ? 'bottom' : 'top'; // scrolled out of room: the far edge
    else if (card.dataset.dock !== 'top') card.dataset.dock = 'bottom';
    card.style.left = '';
    card.style.top = '';
  }
  // Focus scrolling (Tab, a field with an error) stops clear of a docked card and the sticky header.
  const room = r && card.dataset.dock !== 'float' ? card.offsetHeight + 2 * EDGE : 0;
  const root = document.documentElement.style;
  root.scrollPaddingTop = `${room && card.dataset.dock === 'top' ? room : headerBottom() + 8}px`;
  root.scrollPaddingBottom = room && card.dataset.dock === 'bottom' ? `${room}px` : '';
  moreBelow(card);
}

export const isCoaching = () => Boolean(active);
