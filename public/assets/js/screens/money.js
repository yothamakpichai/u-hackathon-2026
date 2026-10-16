// Money Town (BRIEF §17 "Town groups"): the one Town building that opens a little street of its places, from the
// entries in public/js/buildings.js with group 'money' (Piggy Bank, Farm + Orchard, Daily Stall, Store, Bank), plus
// an Arena shortcut. Each place is a shop front button: a live one swings its door and opens; a closed one opens one
// real lesson card, so nothing is a dead end. The street is decoration (aria-hidden); every place is a real button.
// All coins here are pretend Town L$, except the Piggy Bank, which records real savings the player reports.
import { h, icon, getJSON, animate, reducedMotion } from '../ui.js';
import { placesIn } from '../../../js/buildings.js';
import { whySheet, lessonSheet, closeSheet } from '../town-sheets.js';
import { svgEl } from './town.js';

const OPEN_MS = 340;

export function mount(root, ctx) {
  const { navigate, store, config } = ctx;
  let alive = true;
  let opening = null;
  const places = placesIn('money');

  const shops = h('ul', { class: 'mt-street' });
  const view = h('section', { class: 'screen money-town' }, [
    h('div', { class: 'mt-top' }, [
      h('button', { class: 'btn btn--sm mt-back', type: 'button', onClick: () => navigate('/town') }, [icon('chevron-right', { size: 18, className: 'mt-back__icon' }), 'Back to my town']),
    ]),
    h('div', { class: 'mt-head' }, [
      h('p', { class: 'screen-eyebrow', text: 'Your town' }),
      h('h1', { class: 'screen-title', tabindex: '-1', text: 'Money Town' }),
      h('p', { class: 'screen-sub', text: 'Save, grow, trade and borrow. Every coin on this street is pretend Town L$, except the Piggy Bank, which records real savings you report.' }),
    ]),
    street(),
    h('h2', { class: 'visually-hidden', text: 'Places in Money Town' }),
    shops,
    h('a', { class: 'mt-arena', href: '#/arena' }, [
      h('span', { class: 'mt-arena__post', 'aria-hidden': 'true' }),
      h('span', { class: 'mt-arena__text' }, [h('strong', { text: 'Shortcut to the Arena' }), h('span', { text: 'Trade with other players · pretend L$ only' })]),
      icon('arrow-right', { size: 22 }),
    ]),
  ]);
  root.append(view);
  view.querySelector('.screen-title')?.focus({ preventScroll: true });

  function enter(p, shop) {
    if (opening) return;
    const live = p.status === 'live';
    const go = () => {
      opening = null;
      shop.classList.remove('is-opening', 'is-knocking');
      if (!alive) return;
      if (live) navigate(p.route);
      else lessonSheet(p, 'Back to Money Town');
    };
    if (reducedMotion()) return go();
    shop.classList.add(live ? 'is-opening' : 'is-knocking');
    opening = setTimeout(go, OPEN_MS);
  }

  function render(startHere) {
    shops.replaceChildren(
      ...places.map((p, i) => {
        const live = p.status === 'live';
        const shop = h('li', { class: `mt-shop mt-shop--${p.id}${live ? '' : ' is-closed'}${p.id === startHere ? ' is-start' : ''}` });
        shop.style.setProperty('--i', String(i));
        shop.append(
          ...[
            h('span', { class: 'mt-shop__awning', 'aria-hidden': 'true' }),
            h('button', { class: 'mt-shop__door', type: 'button', 'aria-label': `${p.name}, ${live ? 'open' : 'under construction, opens a lesson'}. ${p.blurb}`, onClick: () => enter(p, shop) }, [
              shopArt(p.id),
              h('span', { class: 'mt-shop__name', text: p.name }),
              h('span', { class: 'mt-shop__blurb', text: p.blurb }),
              h('span', { class: `mt-shop__sign${live ? '' : ' mt-shop__sign--closed'}`, text: live ? 'Open' : 'Closed · lesson inside' }),
              p.id === startHere ? h('span', { class: 'chip mt-shop__start', text: 'Start here' }) : null,
            ].filter(Boolean)),
            h('button', { class: 'icon-btn mt-shop__why', type: 'button', title: `Why the ${p.name} works`, onClick: () => whySheet(p) }, [icon('info', { size: 20 }), h('span', { class: 'visually-hidden', text: `Why the ${p.name} works` })]),
          ],
        );
        return shop;
      }),
    );
  }

  render(null);
  animate(shops, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 320 });

  // The Money Type's starting place, when it is on this street (money_check.json).
  const a = store.get().assessment;
  if (a) {
    getJSON(`${config.DATA_BASE}money_check.json`)
      .then((data) => {
        const id = data.types[a.type]?.building;
        if (alive && places.some((p) => p.id === id)) render(id);
      })
      .catch(() => {});
  }

  return () => {
    alive = false;
    clearTimeout(opening);
    closeSheet();
    view.remove();
  };
}

// The street: hills, rooftops, a road with moving lane marks and a little cart that drives through. Decoration only.
function street() {
  const svg = svgEl('svg', { class: 'mt-scene', viewBox: '0 0 400 120', preserveAspectRatio: 'xMidYMax meet', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('path', { class: 'mt-scene__hill', d: 'M-600 74q300-30 600-4q70-40 150-10t140-12 110 8q300 20 600-4v68H-600z' }),
    svgEl('circle', { class: 'mt-scene__sun', cx: 340, cy: 26, r: 12 }),
    svgEl('g', { class: 'mt-scene__cloud' }, [svgEl('path', { d: 'M40 30a7 7 0 0 1 2-13 10 10 0 0 1 18-3 8 8 0 0 1 14 5 6 6 0 0 1 1 11z' })]),
  );
  // rooftops: piggy, barn, stall, store, bank
  const roofs = [
    ['mt-scene__pink', 'M20 88a26 18 0 0 1 52 0z'],
    ['mt-scene__red', 'M86 88V62l22-16 22 16v26z'],
    ['mt-scene__orange', 'M146 88V70h50v18zM140 70l8-12h46l8 12z'],
    ['mt-scene__teal', 'M216 88V58h48v30z'],
    ['mt-scene__blue', 'M282 88V64h60v24zM276 64l36-18 36 18z'],
  ];
  for (const [cls, d] of roofs) svg.append(svgEl('path', { class: cls, d }));
  svg.append(
    svgEl('path', { class: 'mt-scene__tree', d: 'M368 88v-14' }),
    svgEl('circle', { class: 'mt-scene__leaf', cx: 368, cy: 66, r: 12 }),
    svgEl('circle', { class: 'mt-scene__fruit', cx: 363, cy: 63, r: 2.5 }),
    svgEl('circle', { class: 'mt-scene__fruit', cx: 373, cy: 70, r: 2.5 }),
    svgEl('rect', { class: 'mt-scene__walk', x: -600, y: 88, width: 1600, height: 8 }),
    svgEl('rect', { class: 'mt-scene__road', x: -600, y: 96, width: 1600, height: 24 }),
    svgEl('line', { class: 'mt-scene__lane', x1: -600, y1: 108, x2: 1000, y2: 108 }),
    svgEl('g', { class: 'mt-scene__cart' }, [
      svgEl('rect', { class: 'mt-scene__cart-body', x: 0, y: 92, width: 30, height: 12, rx: 3 }),
      svgEl('rect', { class: 'mt-scene__cart-top', x: 4, y: 84, width: 16, height: 9, rx: 2 }),
      svgEl('circle', { class: 'mt-scene__coin', cx: 25, cy: 88, r: 4 }),
      svgEl('circle', { class: 'mt-scene__wheel', cx: 7, cy: 106, r: 4 }),
      svgEl('circle', { class: 'mt-scene__wheel', cx: 24, cy: 106, r: 4 }),
    ]),
  );
  return h('div', { class: 'mt-scene-box' }, [svg]);
}

// Small original drawings for each shop front (100 × 70).
function shopArt(id) {
  const svg = svgEl('svg', { class: `ms ms--${id}`, viewBox: '0 0 100 70', 'aria-hidden': 'true', focusable: 'false' });
  const add = (...n) => svg.append(...n);
  if (id === 'piggy') {
    add(
      svgEl('g', { class: 'ms__drop' }, [svgEl('circle', { class: 'ms__coin', cx: 50, cy: 10, r: 6 })]),
      svgEl('ellipse', { class: 'ms__main', cx: 48, cy: 44, rx: 30, ry: 20 }),
      svgEl('path', { class: 'ms__main', d: 'M30 30l4-12 10 9z' }),
      svgEl('ellipse', { class: 'ms__deep', cx: 79, cy: 44, rx: 7, ry: 6 }),
      svgEl('circle', { class: 'ms__ink', cx: 64, cy: 38, r: 2.5 }),
      svgEl('rect', { class: 'ms__deep', x: 42, y: 25, width: 14, height: 3, rx: 1.5 }),
      svgEl('rect', { class: 'ms__main', x: 30, y: 58, width: 8, height: 10, rx: 2 }),
      svgEl('rect', { class: 'ms__main', x: 58, y: 58, width: 8, height: 10, rx: 2 }),
    );
  } else if (id === 'farm') {
    add(
      svgEl('path', { class: 'ms__main', d: 'M10 68V36l24-18 24 18v32z' }),
      svgEl('path', { class: 'ms__deep', d: 'M6 38l28-22 28 22-4 3-24-19-24 19z' }),
      svgEl('rect', { class: 'ms__white', x: 24, y: 46, width: 20, height: 22 }),
      svgEl('path', { class: 'ms__x', d: 'M24 46l20 22M44 46L24 68' }),
      svgEl('rect', { class: 'ms__trunk', x: 76, y: 46, width: 5, height: 22 }),
      svgEl('g', { class: 'ms__tree' }, [svgEl('circle', { class: 'ms__leaf', cx: 78, cy: 36, r: 15 }), svgEl('circle', { class: 'ms__fruit', cx: 72, cy: 32, r: 3 }), svgEl('circle', { class: 'ms__fruit', cx: 84, cy: 40, r: 3 }), svgEl('circle', { class: 'ms__fruit', cx: 80, cy: 28, r: 3 })]),
    );
  } else if (id === 'stall') {
    add(
      svgEl('rect', { class: 'ms__ink', x: 16, y: 20, width: 4, height: 48 }),
      svgEl('rect', { class: 'ms__ink', x: 80, y: 20, width: 4, height: 48 }),
      svgEl('path', { class: 'ms__main', d: 'M10 30l8-14h64l8 14z' }),
      svgEl('rect', { class: 'ms__deep', x: 14, y: 46, width: 72, height: 8, rx: 2 }),
      svgEl('circle', { class: 'ms__fruit ms__bob', cx: 32, cy: 40, r: 6 }),
      svgEl('circle', { class: 'ms__leaf ms__bob ms__bob--2', cx: 50, cy: 40, r: 6 }),
      svgEl('circle', { class: 'ms__coin ms__bob ms__bob--3', cx: 68, cy: 40, r: 6 }),
      svgEl('path', { class: 'ms__tag', d: 'M62 56h18l4 5-4 5H62z' }),
    );
  } else if (id === 'store') {
    add(
      svgEl('rect', { class: 'ms__main', x: 14, y: 22, width: 72, height: 46, rx: 3 }),
      svgEl('rect', { class: 'ms__white', x: 20, y: 30, width: 60, height: 4 }),
      svgEl('rect', { class: 'ms__white', x: 20, y: 46, width: 60, height: 4 }),
      svgEl('rect', { class: 'ms__deep', x: 24, y: 36, width: 10, height: 10 }),
      svgEl('rect', { class: 'ms__coin', x: 40, y: 38, width: 8, height: 8 }),
      svgEl('rect', { class: 'ms__deep', x: 56, y: 52, width: 12, height: 12 }),
      svgEl('path', { class: 'ms__scaffold', d: 'M8 68V14M92 68V14M8 22h84M8 48h84M8 22l84 26' }),
      svgEl('g', { class: 'ms__hang' }, [svgEl('line', { class: 'ms__string', x1: 40, y1: 4, x2: 50, y2: 12 }), svgEl('line', { class: 'ms__string', x1: 60, y1: 4, x2: 50, y2: 12 }), svgEl('rect', { class: 'ms__closed', x: 34, y: 10, width: 32, height: 12, rx: 2 })]),
    );
  } else {
    add(
      svgEl('path', { class: 'ms__deep', d: 'M8 26L50 6l42 20z' }),
      svgEl('rect', { class: 'ms__main', x: 12, y: 26, width: 76, height: 6 }),
      svgEl('rect', { class: 'ms__main', x: 10, y: 62, width: 80, height: 6 }),
      svgEl('circle', { class: 'ms__coin', cx: 50, cy: 18, r: 4 }),
    );
    for (let i = 0; i < 4; i++) add(svgEl('rect', { class: 'ms__white ms__col', x: 20 + i * 17, y: 33, width: 9, height: 29, rx: 2 }));
  }
  return svg;
}
