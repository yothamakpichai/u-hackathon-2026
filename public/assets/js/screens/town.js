// Town (BRIEF §16): the home screen. An original illustrated town with one tile per building from
// public/js/buildings.js, usable one-handed at 360 px. Live buildings open; buildings under construction show
// scaffolding and open one real lesson card, so nothing is a dead end. Each tile has an ⓘ "Why this works" note.
// The daily goal and the streak count actions from every building (progress.js).
import { h, icon, getJSON, penny, animate } from '../ui.js';
import { BUILDINGS } from '../../../js/buildings.js';
import { dataUri } from '../../../js/avatar.js';
import { progressSummary, syncActions } from '../progress.js';
import { arenaEnabled } from './arena.js';
import * as sync from '../sync.js';

const SVG = 'http://www.w3.org/2000/svg';

export function mount(root, ctx) {
  const { store, navigate, config } = ctx;
  let alive = true;
  let sheet = null;

  // Arriving in town opens the Market Lab for this level: the Money Check (or "Take it later") came first.
  store.set((s) => ({ unlocked: { ...s.unlocked, [s.tier]: true } }));
  syncActions(store);

  const s = store.get();
  const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.TIME_ZONE, year: 'numeric' }).format(new Date()));
  const age = s.birthYear ? thisYear - Number(s.birthYear) : 25;
  const p = progressSummary(s);
  const a = s.assessment;
  let startHere = null; // the building the Money Type starts in, from money_check.json
  let arenaOn = false;

  const meter = h('span', { class: 'meter', 'aria-hidden': 'true' }, [h('span', { class: 'meter__fill' })]);
  meter.firstChild.style.setProperty('--w', `${Math.min(100, (p.todayXp / p.goal) * 100)}%`);
  const statusCard = h('div', { class: 'town-status' });

  const tiles = h('ul', { class: 'town-grid' });
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
    getJSON(`${config.DATA_BASE}money_check.json`)
      .then((data) => {
        if (!alive) return;
        startHere = data.types[a.type]?.building || null;
        renderTiles();
        statusCard.replaceChildren(
          h('a', { class: 'card town-result', href: '#/result' }, [
            h('span', { class: 'town-result__score', text: String(a.score) }),
            h('span', {}, [h('strong', { text: `Money Health ${a.score} · ${data.types[a.type]?.name || ''}` }), h('span', { text: 'See your result' })]),
            icon('chevron-right'),
          ]),
        );
      })
      .catch(() => {});
  }

  function renderTiles() {
    tiles.replaceChildren(
      ...BUILDINGS.map((b) => {
        const live = b.status === 'live';
        const links = (b.links || []).filter((l) => !l.arena || arenaOn);
        return h('li', { class: `town-tile${live ? '' : ' is-construction'}${b.id === startHere ? ' is-start' : ''}`, dataset: { building: b.id } }, [
          h('button', { class: 'town-tile__main', type: 'button', onClick: () => (live ? navigate(b.route) : lessonCard(b)) }, [
            buildingArt(b.id, !live),
            h('span', { class: 'town-tile__name', text: b.name }),
            h('span', { class: 'town-tile__blurb', text: live ? b.blurb : 'Under construction · tap for a lesson' }),
            b.id === startHere ? h('span', { class: 'chip town-tile__start', text: 'Start here' }) : null,
          ]),
          h('button', { class: 'icon-btn town-tile__why', type: 'button', title: `Why the ${b.name} works`, onClick: () => why(b) }, [icon('info', { size: 20 }), h('span', { class: 'visually-hidden', text: `Why the ${b.name} works` })]),
          live && links.length ? h('div', { class: 'town-tile__links' }, links.map((l) => h('a', { class: 'town-link', href: `#${l.route}`, text: l.label }))) : null,
        ]);
      }),
    );
  }
  // Optional account: shown only when the server has accounts on.
  sync.accountsAvailable().then(async (on) => {
    if (!on || !alive) return;
    const user = sync.currentAccount() || (await sync.refreshMe().catch(() => null));
    if (alive) accountSlot.replaceChildren(h('a', { class: 'town-account', href: '#/account' }, [icon('shield', { size: 18 }), user ? user.username : 'Save progress']));
  });

  renderTiles();
  arenaEnabled().then((on) => {
    if (!alive || !on) return;
    arenaOn = true;
    renderTiles();
  });
  animate(tiles, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]);

  function openSheet(title, nodes) {
    sheet?.remove();
    sheet = h('dialog', { class: 'tutor town-sheet', 'aria-labelledby': 'town-sheet-title' }, [
      h('div', { class: 'tutor__head' }, [
        h('h2', { class: 'tutor__title', id: 'town-sheet-title', text: title }),
        h('button', { class: 'icon-btn tutor__close', type: 'button', onClick: () => sheet.close() }, [icon('close'), h('span', { class: 'visually-hidden', text: 'Close' })]),
      ]),
      h('div', { class: 'town-sheet__body' }, nodes),
    ]);
    sheet.addEventListener('close', () => sheet?.remove());
    document.body.append(sheet);
    sheet.showModal();
  }

  function why(b) {
    openSheet(`Why the ${b.name} works`, [
      h('ul', { class: 'privacy__list' }, b.why.map((t) => h('li', { text: t }))),
      h('a', { href: '#/research', text: 'All our sources', onClick: () => sheet?.close() }),
    ]);
  }

  // A building under construction is never a dead end: it opens one real lesson card.
  function lessonCard(b) {
    openSheet(b.lesson.title, [
      h('p', { class: 'town-sheet__badge' }, [icon('blocks', { size: 18 }), `${b.name}: under construction`]),
      ...b.lesson.body.map((t) => h('p', { text: t })),
      b.lesson.source ? h('p', { class: 'part__why', text: `Source: ${b.lesson.source}` }) : null,
      h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => sheet.close() }, 'Back to my town'),
    ]);
  }

  return () => {
    alive = false;
    sheet?.remove();
    view.remove();
  };
}

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

// A row of hills, a sun and the road: decoration only.
function skyline() {
  const svg = svgEl('svg', { class: 'town-sky', viewBox: '0 0 360 90', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true' });
  svg.append(
    svgEl('circle', { class: 'town-sky__sun', cx: 300, cy: 30, r: 16 }),
    svgEl('path', { class: 'town-sky__hill', d: 'M0 70q60-40 120-6t120-8 120 4v30H0z' }),
    svgEl('path', { class: 'town-sky__hill2', d: 'M0 80q80-26 170-4t190-6v20H0z' }),
    svgEl('rect', { class: 'town-sky__road', x: 0, y: 84, width: 360, height: 6 }),
  );
  return svg;
}

// Original, simple building illustrations; scaffolding over the ones under construction.
function buildingArt(id, construction) {
  const svg = svgEl('svg', { class: `bld bld--${id}`, viewBox: '0 0 120 96', 'aria-hidden': 'true' });
  const add = (...nodes) => svg.append(...nodes);
  add(svgEl('rect', { class: 'bld__ground', x: 4, y: 88, width: 112, height: 6, rx: 3 }));
  if (id === 'school') {
    add(svgEl('rect', { class: 'bld__wall', x: 22, y: 40, width: 76, height: 48, rx: 4 }), svgEl('path', { class: 'bld__roof', d: 'M16 42L60 14l44 28z' }), svgEl('circle', { class: 'bld__accent', cx: 60, cy: 30, r: 6 }), svgEl('rect', { class: 'bld__door', x: 52, y: 64, width: 16, height: 24, rx: 3 }), svgEl('rect', { class: 'bld__glass', x: 30, y: 52, width: 14, height: 12, rx: 2 }), svgEl('rect', { class: 'bld__glass', x: 76, y: 52, width: 14, height: 12, rx: 2 }));
  } else if (id === 'market') {
    add(svgEl('rect', { class: 'bld__wall', x: 18, y: 52, width: 84, height: 36, rx: 4 }), svgEl('path', { class: 'bld__roof', d: 'M12 52l8-22h80l8 22z' }));
    for (let i = 0; i < 4; i++) add(svgEl('rect', { class: 'bld__accent', x: 22 + i * 20, y: 30, width: 10, height: 22 }));
    add(svgEl('rect', { class: 'bld__door', x: 28, y: 62, width: 64, height: 10, rx: 2 }), svgEl('path', { class: 'bld__line', d: 'M34 82l12-8 10 5 14-12 14 6' }));
  } else if (id === 'piggy') {
    add(svgEl('ellipse', { class: 'bld__wall', cx: 58, cy: 60, rx: 38, ry: 26 }), svgEl('path', { class: 'bld__roof', d: 'M40 38l6-14 10 12z' }), svgEl('ellipse', { class: 'bld__accent', cx: 96, cy: 60, rx: 9, ry: 8 }), svgEl('circle', { class: 'bld__eye', cx: 78, cy: 52, r: 3 }), svgEl('rect', { class: 'bld__door', x: 46, y: 36, width: 18, height: 5, rx: 2 }), svgEl('rect', { class: 'bld__wall', x: 32, y: 78, width: 9, height: 10, rx: 2 }), svgEl('rect', { class: 'bld__wall', x: 72, y: 78, width: 9, height: 10, rx: 2 }));
  } else if (id === 'future') {
    add(svgEl('rect', { class: 'bld__wall', x: 40, y: 18, width: 40, height: 70, rx: 4 }), svgEl('path', { class: 'bld__roof', d: 'M36 20L60 4l24 16z' }), svgEl('circle', { class: 'bld__glass', cx: 60, cy: 38, r: 12 }), svgEl('path', { class: 'bld__line', d: 'M60 30v8l6 4' }), svgEl('rect', { class: 'bld__door', x: 52, y: 70, width: 16, height: 18, rx: 3 }));
  } else if (id === 'farm') {
    add(svgEl('path', { class: 'bld__wall', d: 'M22 88V46l38-26 38 26v42z' }), svgEl('path', { class: 'bld__roof', d: 'M16 48l44-32 44 32-6 4-38-28-38 28z' }), svgEl('rect', { class: 'bld__door', x: 44, y: 58, width: 32, height: 30, rx: 2 }), svgEl('path', { class: 'bld__line', d: 'M44 58l32 30M76 58L44 88' }), svgEl('circle', { class: 'bld__glass', cx: 60, cy: 40, r: 6 }));
  } else if (id === 'stall') {
    add(svgEl('rect', { class: 'bld__wall', x: 26, y: 60, width: 68, height: 28, rx: 3 }), svgEl('path', { class: 'bld__roof', d: 'M18 58l10-18h64l10 18z' }), svgEl('rect', { class: 'bld__door', x: 22, y: 40, width: 4, height: 48 }), svgEl('rect', { class: 'bld__door', x: 94, y: 40, width: 4, height: 48 }));
    for (let i = 0; i < 3; i++) add(svgEl('circle', { class: 'bld__accent', cx: 42 + i * 18, cy: 56, r: 6 }));
  } else if (id === 'bank') {
    add(svgEl('path', { class: 'bld__roof', d: 'M14 36L60 12l46 24z' }), svgEl('rect', { class: 'bld__wall', x: 20, y: 36, width: 80, height: 8 }), svgEl('rect', { class: 'bld__wall', x: 18, y: 80, width: 84, height: 8 }));
    for (let i = 0; i < 4; i++) add(svgEl('rect', { class: 'bld__glass', x: 28 + i * 18, y: 46, width: 10, height: 32, rx: 2 }));
    add(svgEl('circle', { class: 'bld__accent', cx: 60, cy: 26, r: 5 }));
  } else if (id === 'stocks') {
    add(svgEl('rect', { class: 'bld__wall', x: 30, y: 28, width: 60, height: 60, rx: 4 }));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) add(svgEl('rect', { class: 'bld__glass', x: 38 + c * 16, y: 36 + r * 14, width: 10, height: 8, rx: 1 }));
    add(svgEl('path', { class: 'bld__line', d: 'M32 22l16-8 12 6 20-14' }));
  } else {
    add(svgEl('rect', { class: 'bld__wall', x: 22, y: 44, width: 76, height: 44, rx: 4 }), svgEl('path', { class: 'bld__roof', d: 'M16 46l8-14h72l8 14z' }), svgEl('path', { class: 'bld__accent', d: 'M46 66h28l-5 10H51z' }), svgEl('rect', { class: 'bld__door', x: 28, y: 62, width: 12, height: 26, rx: 2 }));
  }
  if (construction) {
    const scaffold = svgEl('g', { class: 'bld__scaffold' });
    scaffold.append(
      svgEl('path', { d: 'M14 88V20M106 88V20M14 30h92M14 56h92M14 30l92 26M106 30L14 56' }),
      svgEl('path', { class: 'bld__cone', d: 'M96 88l6-16 6 16z' }),
    );
    add(scaffold);
  }
  return svg;
}
