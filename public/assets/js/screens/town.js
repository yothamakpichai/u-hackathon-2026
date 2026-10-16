// Town (BRIEF §16, §17): the home screen. An original illustrated town with the five group buildings from
// public/js/buildings.js (school, market, future, money, research), usable one-handed at 360 px. Each group has its
// own colour, its own drawing and a short opening motion (doors swing open, then the building opens; skipped when
// the device asks for reduced motion). A building under construction shows scaffolding and opens one real lesson
// card, so nothing is a dead end. Each building has an ⓘ "Why this works" note.
// The daily goal and the streak count actions from every building (progress.js).
import { h, icon, getJSON, penny, animate, reducedMotion } from '../ui.js';
import { TOWN, townBuildingOf } from '../../../js/buildings.js';
import { dataUri } from '../../../js/avatar.js';
import { progressSummary, syncActions } from '../progress.js';
import { arenaEnabled } from './arena.js';
import { whySheet, lessonSheet, closeSheet } from '../town-sheets.js';
import * as sync from '../sync.js';

const SVG = 'http://www.w3.org/2000/svg';
export const OPEN_MS = 420; // the doors-open motion before a building opens

export function mount(root, ctx) {
  const { store, navigate, config } = ctx;
  let alive = true;
  let opening = null; // the timer of a building that is opening

  // Arriving in town opens the Market Lab for this level: the Money Check (or "Take it later") came first.
  store.set((s) => ({ unlocked: { ...s.unlocked, [s.tier]: true } }));
  syncActions(store);

  const s = store.get();
  const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.TIME_ZONE, year: 'numeric' }).format(new Date()));
  const age = s.birthYear ? thisYear - Number(s.birthYear) : 25;
  const p = progressSummary(s);
  const a = s.assessment;
  let startHere = null; // the Town building the Money Type starts in, from money_check.json
  let arenaOn = false;

  const meter = h('span', { class: 'meter', 'aria-hidden': 'true' }, [h('span', { class: 'meter__fill' })]);
  meter.firstChild.style.setProperty('--w', `${Math.min(100, (p.todayXp / p.goal) * 100)}%`);
  const statusCard = h('div', { class: 'town-status' });

  const tiles = h('ul', { class: 'tg-grid' });
  const accountSlot = h('div', { class: 'town-head__account' });
  const view = h('section', { class: 'screen town' }, [
    h('div', { class: 'town-head' }, [
      s.profile?.character ? h('img', { class: 'town-head__avatar', src: dataUri(s.profile.character, age), alt: '', width: 64, height: 64 }) : penny('happy', { size: 64 }),
      h('div', { class: 'town-head__titles' }, [h('p', { class: 'screen-eyebrow', text: config.TAGLINE }), h('h1', { class: 'screen-title', tabindex: '-1', text: 'Your town' })]),
      accountSlot,
    ]),
    h('div', { class: 'path-stats town-stats' }, [
      h('div', { class: 'path-stat' }, [icon('flame', { size: 24, className: p.streak ? 'is-lit' : '' }), h('span', {}, [h('strong', { text: `${p.streak}-day streak` }), h('span', { text: p.activeToday ? 'Done for today' : 'Do one thing in any building' })])]),
      h('div', { class: 'path-stat' }, [icon('star', { size: 24 }), h('span', {}, [h('strong', { text: `${p.xp} XP` }), h('span', { text: 'from every building' })])]),
      h('div', { class: 'path-stat path-goal' }, [h('span', {}, [h('strong', { text: `Daily goal ${Math.min(p.todayXp, p.goal)} / ${p.goal} XP` }), meter])]),
    ]),
    statusCard,
    skyline(),
    h('h2', { class: 'visually-hidden', text: 'Buildings' }),
    tiles,
    h('p', { class: 'welcome__research' }, [h('a', { href: '#/research', text: 'Why this works: the research behind Penny' })]),
  ]);
  root.append(view);
  view.querySelector('.screen-title')?.focus({ preventScroll: true });

  if (!a) {
    statusCard.replaceChildren(
      h('div', { class: 'card town-check' }, [
        penny('thinking', { size: 56 }),
        h('div', {}, [h('p', { class: 'town-check__title', text: 'Your Money Check is waiting' }), h('p', { text: '15 quick questions give you a Money Health Score and your Money Type.' })]),
        h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => navigate('/money-check') }, 'Take it now'),
      ]),
    );
  } else {
    const resultCard = (typeName) =>
      statusCard.replaceChildren(
        h('a', { class: 'card town-result', href: '#/result' }, [
          h('span', { class: 'town-result__score', text: String(a.score) }),
          h('span', {}, [h('strong', { text: typeName ? `Money Health ${a.score} · ${typeName}` : `Money Health ${a.score}` }), h('span', { text: 'See your result' })]),
          icon('chevron-right'),
        ]),
      );
    resultCard(null);
    getJSON(`${config.DATA_BASE}money_check.json`)
      .then((data) => {
        if (!alive) return;
        startHere = townBuildingOf(data.types[a.type]?.building) || null;
        renderTiles();
        resultCard(data.types[a.type]?.name || null);
      })
      .catch(() => {}); // the score card above stays; only the type's name and "Start here" wait for the next visit
  }

  // Tapping a building: the doors open (or a closed one shakes its sign), then it opens.
  function enter(b, tile) {
    if (opening) return;
    const live = b.status === 'live';
    const go = () => {
      opening = null;
      tile.classList.remove('is-opening', 'is-knocking');
      if (!alive) return;
      if (live) navigate(b.route);
      else lessonSheet(b);
      if (stale) renderTiles();
    };
    if (reducedMotion()) return go();
    tile.classList.add(live ? 'is-opening' : 'is-knocking');
    opening = setTimeout(go, OPEN_MS);
  }

  let stale = false; // new data arrived while a building was opening: redraw once it has opened
  function renderTiles() {
    stale = Boolean(opening);
    if (stale) return;
    tiles.replaceChildren(
      ...TOWN.map((b, i) => {
        const live = b.status === 'live';
        const links = (b.links || []).filter((l) => !l.arena || (arenaOn && age >= 13));
        const tile = h('li', { class: `tg tg--${b.id}${live ? '' : ' is-construction'}${b.id === startHere ? ' is-start' : ''}`, dataset: { building: b.id } });
        tile.style.setProperty('--i', String(i));
        tile.append(...[
          h('button', { class: 'tg__main', type: 'button', onClick: () => enter(b, tile) }, [
            h('span', { class: 'tg__art' }, [townArt(b.id)]),
            h('span', { class: 'tg__text' }, [
              h('span', { class: 'tg__name', text: b.name }),
              h('span', { class: 'tg__blurb', text: live ? b.blurb : `${b.blurb} · tap for a lesson` }),
              b.id === startHere ? h('span', { class: 'chip tg__start', text: 'Start here' }) : null,
              live ? null : h('span', { class: 'tg__closed' }, [icon('blocks', { size: 16 }), 'Under construction']),
            ]),
          ]),
          h('button', { class: 'icon-btn tg__why', type: 'button', title: `Why the ${b.name} works`, onClick: () => whySheet(b) }, [icon('info', { size: 20 }), h('span', { class: 'visually-hidden', text: `Why the ${b.name} works` })]),
          live && links.length ? h('div', { class: 'tg__links' }, links.map((l) => h('a', { class: 'tg__link', href: `#${l.route}`, text: l.label }))) : null,
          ].filter(Boolean), // a null would print as text
        );
        return tile;
      }),
    );
  }
  // Optional account: shown only when the server has accounts on.
  sync.accountsAvailable().then(async (on) => {
    if (!on || !alive) return;
    const user = sync.currentAccount() || (await sync.refreshMe().catch(() => null));
    if (alive) accountSlot.replaceChildren(h('a', { class: 'town-account', href: '#/account' }, [icon('shield', { size: 18 }), user ? (sync.choicePending(store) ? 'Choose your progress' : user.username) : 'Save progress']));
  });

  renderTiles();
  arenaEnabled().then((on) => {
    if (!alive || !on) return;
    arenaOn = true;
    renderTiles();
  });
  animate(tiles, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]);

  return () => {
    alive = false;
    clearTimeout(opening);
    closeSheet();
    view.remove();
  };
}

export function svgEl(tag, attrs = {}, children = []) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.append(...children);
  return n;
}

// A row of hills, a sun, drifting clouds and the road: decoration only.
// The hills stretch to any width; the sun is drawn on its own, so it stays round and in view on wide screens.
function skyline() {
  const sun = svgEl('svg', { class: 'town-sky__sunbox', viewBox: '0 0 32 32' });
  sun.append(svgEl('circle', { class: 'town-sky__sun', cx: 16, cy: 16, r: 16 }));
  const cloud = (cls) => {
    const c = svgEl('svg', { class: `town-sky__cloud ${cls}`, viewBox: '0 0 60 24' });
    c.append(svgEl('path', { d: 'M10 22a8 8 0 0 1 2-15 11 11 0 0 1 20-3 9 9 0 0 1 16 5 7 7 0 0 1 2 13z' }));
    return c;
  };
  const land = svgEl('svg', { class: 'town-sky__land', viewBox: '0 0 360 90', preserveAspectRatio: 'none' });
  land.append(
    svgEl('path', { class: 'town-sky__hill', d: 'M0 70q60-40 120-6t120-8 120 4v30H0z' }),
    svgEl('path', { class: 'town-sky__hill2', d: 'M0 80q80-26 170-4t190-6v20H0z' }),
    svgEl('rect', { class: 'town-sky__road', x: 0, y: 84, width: 360, height: 6 }),
  );
  return h('div', { class: 'town-sky', 'aria-hidden': 'true' }, [cloud('town-sky__cloud--a'), cloud('town-sky__cloud--b'), sun, land]);
}

// Doors on a hinge each side, with a warm light behind them: the opening motion swings them apart.
function doors(x, y, w, hgt) {
  return [
    svgEl('rect', { class: 'ta__glow', x, y, width: w, height: hgt, rx: 2 }),
    svgEl('rect', { class: 'ta__door ta__door--l', x, y, width: w / 2, height: hgt, rx: 2 }),
    svgEl('rect', { class: 'ta__door ta__door--r', x: x + w / 2, y, width: w / 2, height: hgt, rx: 2 }),
  ];
}

// Original drawings of the five Town buildings (200 × 140). Decoration only: each tile's text names the building.
export function townArt(id) {
  const svg = svgEl('svg', { class: `ta ta--${id}`, viewBox: '0 0 200 140', 'aria-hidden': 'true', focusable: 'false' });
  const add = (...nodes) => svg.append(...nodes.flat());
  add(svgEl('rect', { class: 'ta__ground', x: 0, y: 128, width: 200, height: 12 }));
  if (id === 'school') {
    add(
      svgEl('rect', { class: 'ta__wall', x: 90, y: 14, width: 20, height: 22 }),
      svgEl('path', { class: 'ta__roof', d: 'M85 16L100 3l15 13z' }),
      svgEl('circle', { class: 'ta__trim ta__bell', cx: 100, cy: 26, r: 4 }),
      svgEl('rect', { class: 'ta__wall', x: 40, y: 56, width: 120, height: 72, rx: 3 }),
      svgEl('path', { class: 'ta__roof', d: 'M30 60l70-32 70 32z' }),
      svgEl('circle', { class: 'ta__trim', cx: 100, cy: 47, r: 7 }),
      svgEl('path', { class: 'ta__line', d: 'M96 47h8M100 43v8' }),
      svgEl('line', { class: 'ta__pole', x1: 160, y1: 58, x2: 160, y2: 16 }),
      svgEl('path', { class: 'ta__flag', d: 'M160 17h22l-6 7 6 7h-22z' }),
    );
    for (const [x, y] of [[50, 68], [134, 68], [50, 98], [134, 98], [72, 68], [112, 68]]) add(svgEl('rect', { class: 'ta__glass', x, y, width: 16, height: 16, rx: 2 }));
    add(doors(84, 92, 32, 36), svgEl('rect', { class: 'ta__trim', x: 76, y: 125, width: 48, height: 4, rx: 1 }));
  } else if (id === 'market') {
    add(
      svgEl('rect', { class: 'ta__pole', x: 72, y: 38, width: 4, height: 10 }),
      svgEl('rect', { class: 'ta__pole', x: 124, y: 38, width: 4, height: 10 }),
      svgEl('rect', { class: 'ta__sign', x: 58, y: 6, width: 84, height: 34, rx: 7 }),
      svgEl('path', { class: 'ta__wick', d: 'M80 12v28M100 9v28M120 14v24' }),
      svgEl('rect', { class: 'ta__candle ta__candle--up', x: 75, y: 20, width: 10, height: 12, rx: 2 }),
      svgEl('rect', { class: 'ta__candle ta__candle--down', x: 95, y: 14, width: 10, height: 18, rx: 2 }),
      svgEl('rect', { class: 'ta__candle ta__candle--up', x: 115, y: 18, width: 10, height: 10, rx: 2 }),
      svgEl('rect', { class: 'ta__wall', x: 30, y: 60, width: 140, height: 68, rx: 3 }),
      svgEl('path', { class: 'ta__roof', d: 'M22 62l12-16h132l12 16z' }),
    );
    for (let i = 0; i < 6; i++) add(svgEl('path', { class: 'ta__stripe', d: `M${40 + i * 22} 46h11l-2 16h-11z` }));
    add(
      svgEl('rect', { class: 'ta__glass', x: 40, y: 72, width: 56, height: 36, rx: 3 }),
      svgEl('path', { class: 'ta__line ta__chart', d: 'M46 100l10-9 8 4 12-14 14 6' }),
      doors(112, 82, 44, 46),
    );
  } else if (id === 'money') {
    add(
      svgEl('rect', { class: 'ta__b1', x: 8, y: 74, width: 46, height: 54, rx: 2 }),
      svgEl('path', { class: 'ta__b1roof', d: 'M4 76l27-22 27 22z' }),
      svgEl('path', { class: 'ta__b2roof', d: 'M144 70l26-16 26 16z' }),
      svgEl('rect', { class: 'ta__b2', x: 148, y: 70, width: 44, height: 58 }),
    );
    for (const x of [154, 166, 178]) add(svgEl('rect', { class: 'ta__glass', x, y: 80, width: 6, height: 40, rx: 2 }));
    add(svgEl('rect', { class: 'ta__glass', x: 22, y: 92, width: 18, height: 16, rx: 2 }));
    add(
      svgEl('rect', { class: 'ta__wall', x: 56, y: 44, width: 16, height: 84, rx: 3 }),
      svgEl('rect', { class: 'ta__wall', x: 128, y: 44, width: 16, height: 84, rx: 3 }),
      svgEl('path', { class: 'ta__roof', d: 'M50 46q50-30 100 0v10q-50-26-100 0z' }),
      doors(72, 62, 56, 66),
      svgEl('g', { class: 'ta__coin' }, [svgEl('circle', { cx: 100, cy: 24, r: 14 }), svgEl('circle', { class: 'ta__coin-ring', cx: 100, cy: 24, r: 9 })]),
      svgEl('circle', { class: 'ta__trim ta__pop ta__pop--a', cx: 42, cy: 50, r: 5 }),
      svgEl('circle', { class: 'ta__trim ta__pop ta__pop--b', cx: 160, cy: 40, r: 4 }),
    );
  } else if (id === 'future') {
    for (const [x, y, r] of [[28, 24, 3], [170, 30, 2.5], [150, 12, 2], [44, 56, 2], [182, 70, 2]]) add(svgEl('circle', { class: 'ta__star', cx: x, cy: y, r }));
    add(
      svgEl('rect', { class: 'ta__wall ta__wing', x: 36, y: 92, width: 36, height: 36, rx: 3 }),
      svgEl('rect', { class: 'ta__wall ta__wing', x: 128, y: 92, width: 36, height: 36, rx: 3 }),
      svgEl('rect', { class: 'ta__wall', x: 68, y: 44, width: 64, height: 84, rx: 3 }),
      svgEl('path', { class: 'ta__roof', d: 'M62 46a38 38 0 0 1 76 0z' }),
      svgEl('path', { class: 'ta__trim ta__scope', d: 'M108 22l26-14 4 8-26 14z' }),
      svgEl('circle', { class: 'ta__glass', cx: 100, cy: 70, r: 15 }),
      svgEl('line', { class: 'ta__hand ta__hand--long', x1: 100, y1: 70, x2: 100, y2: 59 }),
      svgEl('line', { class: 'ta__hand', x1: 100, y1: 70, x2: 107, y2: 70 }),
      doors(86, 98, 28, 30),
    );
  } else {
    // research: closed, with scaffolding and a crane
    add(
      svgEl('rect', { class: 'ta__wall', x: 36, y: 62, width: 120, height: 66, rx: 3 }),
      svgEl('path', { class: 'ta__roof', d: 'M30 64h132v-8H30z' }),
      svgEl('path', { class: 'ta__roof', d: 'M74 56a22 22 0 0 1 44 0z' }),
      svgEl('path', { class: 'ta__trim', d: 'M90 72h12v8l9 16H81l9-16z' }),
      svgEl('rect', { class: 'ta__glass', x: 46, y: 76, width: 22, height: 18, rx: 2 }),
      svgEl('rect', { class: 'ta__glass', x: 124, y: 76, width: 22, height: 18, rx: 2 }),
      doors(80, 102, 32, 26),
      svgEl('path', { class: 'ta__plank', d: 'M76 106l40 16M76 122l40-16' }),
      svgEl('path', { class: 'ta__scaffold', d: 'M30 128V40M160 128V40M30 50h130M30 90h130M30 50l130 40' }),
      svgEl('line', { class: 'ta__crane-mast', x1: 182, y1: 128, x2: 182, y2: 10 }),
      svgEl('g', { class: 'ta__crane' }, [svgEl('line', { x1: 120, y1: 12, x2: 196, y2: 12 }), svgEl('line', { x1: 140, y1: 12, x2: 140, y2: 34 }), svgEl('rect', { class: 'ta__crane-load', x: 132, y: 34, width: 16, height: 10, rx: 2 })]),
      svgEl('path', { class: 'ta__cone', d: 'M10 128l7-18 7 18z' }),
    );
  }
  return svg;
}
