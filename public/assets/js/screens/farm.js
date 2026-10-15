// Farm (BRIEF §16; slice J11). A cow you earn and never buy: it is born and grows from real actions
// (lessons, Coach chapters, finished markets, Piggy Bank logs) and gives milk once a day, sold for farm
// coins. Each cow has seeded traits and a soulbound birth certificate minted on the simulated chain.
import { collectMilk, cowsDue, COW_AT, feedFrom, milkReady, MILK_PRICE, STAGES, stageOf } from '../sim/farm.js';
import { mintBadge } from './badges.js';
import { announce, celebrate, h, icon, number } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COAT = { cream: '#F3E6CF', brown: '#9A6A44', black: '#3A3330', honey: '#D9A85B', grey: '#A9A9A4' };
const BELL = { gold: '#E0B100', silver: '#C9CED1', red: '#D9502F', blue: '#3F5FDB' };

export function mount(root, ctx) {
  const { store, navigate, tier } = ctx;
  const view = h('section', { class: 'screen farm-screen' });
  root.append(view);

  function render(celebrateIds = []) {
    const state = store.get();
    const feed = feedFrom(state);
    let farm = { seed: Math.floor(Date.now() % 1e9), cows: [], ...state.farm };
    // New cows are born from feed earned since the last visit; each gets a birth certificate.
    const { cows, born } = cowsDue(farm, feed.total, Date.now());
    if (born.length) {
      farm = { ...farm, cows };
      store.set({ farm });
      for (const cow of born) {
        mintBadge(store, { kind: 'cow', ref: cow.id, tier, meta: { title: `${cow.name}’s birth certificate`, how: `${cow.name} was born on your farm from your own actions.` } });
      }
      announce(`A calf called ${born.map((c) => c.name).join(' and ')} was born on your farm!`);
      celebrateIds = born.map((c) => c.id);
    }
    const next = COW_AT[farm.cows.length];
    const ready = farm.cows.filter((c) => milkReady(c, farm, feed.total, Date.now()));

    const cowCards = farm.cows.map((cow) => {
      const stage = stageOf(cow, feed.total);
      const grown = feed.total - cow.bornAtFeed;
      const nextStage = STAGES[STAGES.indexOf(stage) + 1];
      const cert = store.get().badges?.[`cow:${cow.id}`];
      return h('li', { class: 'card farm-cow', dataset: { cow: cow.id } }, [
        cowArt(cow, stage.id),
        h('div', { class: 'farm-cow__body' }, [
          h('h2', { class: 'farm-cow__name', text: cow.name }),
          h('p', { class: 'chip', text: stage.label }),
          h('p', { class: 'field__hint', text: nextStage ? `${nextStage.from - grown} more feed to become a ${nextStage.label.toLowerCase()}.` : `Gives ${cow.milk} litres of milk a day.` }),
          h('p', { class: 'farm-cow__traits', text: traitText(cow) }),
          cert
            ? h('p', { class: 'chip chip--ok' }, [icon('check', { size: 14 }), `Soulbound birth certificate · tx ${cert.hash ? cert.hash.slice(0, 10) : 'pending'}`])
            : h('p', { class: 'field__hint', text: 'Minting the birth certificate…' }),
        ]),
      ]);
    });

    view.replaceChildren(
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: 'Farm' }),
        h('h1', { class: 'screen-title', text: 'Your farm' }),
        h('p', { class: 'screen-sub', text: 'You can’t buy a cow here: you earn one. Cows are born and grow from what you do, and a grown cow gives milk every day.' }),
      ]),
      h('div', { class: 'card farm-feed' }, [
        h('p', { class: 'farm-feed__total' }, [h('strong', { text: number(feed.total, 0) }), ' feed earned']),
        h('ul', { class: 'farm-feed__parts' }, [
          `${feed.piggy} from the Piggy Bank`,
          `${feed.lessons * 5} from lessons`,
          `${feed.coach * 5} from Coach chapters`,
          `${feed.runs * 3} from finished markets`,
        ].map((t) => h('li', { text: t }))),
        h('p', { class: 'field__hint', text: next ? `Next calf at ${next} feed (${Math.max(0, next - feed.total)} to go).` : 'Your farm is full: three cows.' }),
      ]),
      farm.cows.length
        ? h('ul', { class: 'farm-cows' }, cowCards)
        : h('div', { class: 'card farm-empty' }, [
            h('h2', { class: 'lab-card__title', text: 'Earn your first calf' }),
            h('p', { text: `It takes ${COW_AT[0]} feed. Write down a saving in the Piggy Bank, finish a lesson or a Coach chapter, or finish today’s market.` }),
            h('div', { class: 'farm-actions' }, [
              h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('/piggy') }, 'Open the Piggy Bank'),
              h('button', { class: 'btn', type: 'button', onClick: () => navigate('/lab') }, 'Open today’s market'),
            ]),
          ]),
      milkCard(farm, ready, feed),
      h('div', { class: 'card card--quiet farm-lesson' }, [
        h('h2', { class: 'lesson-mini__title', text: 'A cow pays you. A meme coin doesn’t.' }),
        h('p', { text: 'Your cow is a productive asset: it makes something useful every day, and you get paid for it. A meme coin makes nothing. Its price only goes up if someone else pays more for it later, and it can fall to zero.' }),
      ]),
      h('details', { class: 'card card--quiet future-why' }, [
        h('summary', { text: 'ⓘ Why this works' }),
        h('p', { text: 'Habits form through small actions repeated every day, and they are easiest to build when young (Whitebread and Bingham, 2013). The cow makes those daily actions visible.' }),
        h('p', { class: 'field__hint', text: 'Sources: docs/SOURCES.md.' }),
      ]),
    );
    for (const id of celebrateIds) {
      const card = view.querySelector(`[data-cow="${id}"]`);
      if (card) celebrate(card, { pieces: 30 });
    }
  }

  function milkCard(farm, ready, feed) {
    const coins = farm.coins || 0;
    const litres = ready.reduce((s, c) => s + c.milk, 0);
    const btn = ready.length
      ? h('button', { class: 'btn btn--primary', type: 'button' }, `Collect ${litres} litres and sell for ${litres * MILK_PRICE} coins`)
      : null;
    btn?.addEventListener('click', () => {
      const r = collectMilk(farm, farm.cows, feed.total, Date.now());
      store.set({ farm: r.farm });
      announce(`Sold ${r.litres} litres of milk for ${r.coins} coins.`);
      render();
    });
    const grownCows = farm.cows.filter((c) => stageOf(c, feed.total).id === 'adult').length;
    return h('div', { class: 'card farm-milk' }, [
      h('h2', { class: 'lab-card__title', text: 'Milk' }),
      h('p', { class: 'farm-coins' }, [icon('check', { size: 18 }), `${number(coins, 0)} farm coins`]),
      btn || h('p', { class: 'field__hint', text: grownCows ? 'Milk collected today. Come back tomorrow for more.' : 'Grown cows give milk once a day. Keep feeding your calf by doing things around town.' }),
      h('p', { class: 'field__hint', text: 'Farm coins are game coins, not real money.' }),
    ]);
  }

  render();
  return () => view.remove();
}

function traitText(cow) {
  const parts = [`${cow.coat} coat`, cow.pattern === 'plain' ? 'no markings' : `${cow.pattern}`, `${cow.bell} bell`, cow.horns ? 'little horns' : 'no horns'];
  if (cow.star) parts.push('a rare star mark');
  return `Traits: ${parts.join(', ')}.`;
}

// Original cow art, drawn from the cow's seeded traits. Calves are smaller.
function cowArt(cow, stage) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const scale = stage === 'calf' ? 0.72 : stage === 'young' ? 0.86 : 1;
  svg.setAttribute('viewBox', '0 0 160 120');
  svg.setAttribute('class', 'farm-art');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${cow.name}, a ${stage === 'adult' ? 'grown cow' : stage === 'young' ? 'young cow' : 'calf'}`);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${80 - 80 * scale} ${118 - 118 * scale}) scale(${scale})`);
  svg.append(g);
  const add = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    g.append(el);
    return el;
  };
  const coat = COAT[cow.coat] || COAT.cream;
  const mark = cow.coat === 'black' ? '#F3E6CF' : '#3A3330';
  add('ellipse', { cx: 80, cy: 112, rx: 54, ry: 6, fill: '#000000', opacity: 0.08 });
  for (const x of [48, 64, 98, 112]) add('rect', { x, y: 82, width: 9, height: 28, rx: 4, fill: coat, stroke: '#3A3330', 'stroke-width': 2 });
  add('ellipse', { cx: 80, cy: 72, rx: 46, ry: 26, fill: coat, stroke: '#3A3330', 'stroke-width': 2.5 });
  if (cow.pattern === 'spots') for (const [x, y, r] of [[66, 66, 7], [88, 78, 6], [102, 64, 5]]) add('circle', { cx: x, cy: y, r, fill: mark });
  if (cow.pattern === 'patches') add('path', { d: 'M60 52c10-4 24 2 22 14s-20 16-28 8-4-18 6-22z', fill: mark });
  if (cow.pattern === 'belt') add('rect', { x: 72, y: 47, width: 16, height: 50, fill: mark, opacity: 0.9 });
  add('path', { d: 'M126 70c8 2 10 10 6 18', fill: 'none', stroke: '#3A3330', 'stroke-width': 3, 'stroke-linecap': 'round' });
  // Head
  add('ellipse', { cx: 36, cy: 54, rx: 20, ry: 18, fill: coat, stroke: '#3A3330', 'stroke-width': 2.5 });
  add('ellipse', { cx: 30, cy: 62, rx: 13, ry: 9, fill: '#F2B8B0', stroke: '#3A3330', 'stroke-width': 2 });
  add('circle', { cx: 26, cy: 62, r: 1.8, fill: '#3A3330' });
  add('circle', { cx: 34, cy: 62, r: 1.8, fill: '#3A3330' });
  add('circle', { cx: 32, cy: 47, r: 2.6, fill: '#1D2A25' });
  add('circle', { cx: 44, cy: 47, r: 2.6, fill: '#1D2A25' });
  add('ellipse', { cx: 18, cy: 44, rx: 7, ry: 4, fill: coat, stroke: '#3A3330', 'stroke-width': 2 });
  add('ellipse', { cx: 54, cy: 42, rx: 7, ry: 4, fill: coat, stroke: '#3A3330', 'stroke-width': 2 });
  if (cow.horns) {
    add('path', { d: 'M28 38c-2-6 0-10 4-12', fill: 'none', stroke: '#E9DCC0', 'stroke-width': 4, 'stroke-linecap': 'round' });
    add('path', { d: 'M44 37c2-6 0-10-3-12', fill: 'none', stroke: '#E9DCC0', 'stroke-width': 4, 'stroke-linecap': 'round' });
  }
  if (cow.star) add('path', { d: 'M38 30l2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5z', fill: '#F5A524' });
  add('path', { d: 'M40 72v6', stroke: '#3A3330', 'stroke-width': 2 });
  add('circle', { cx: 40, cy: 82, r: 5, fill: BELL[cow.bell] || BELL.gold, stroke: '#3A3330', 'stroke-width': 1.5 });
  return svg;
}
