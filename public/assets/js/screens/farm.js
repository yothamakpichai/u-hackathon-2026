// Farm (BRIEF §16; slice J11). A cow you earn and never buy: it is born and grows from real actions
// (lessons, Coach chapters, finished markets, Piggy Bank logs) and gives milk once a day, sold for farm
// coins. Each cow has seeded traits and a soulbound birth certificate minted on the simulated chain.
import { collectMilk, cowsDue, COW_AT, feedFrom, milkReady, MILK_PRICE, STAGES, stageOf } from '../sim/farm.js';
import { PLOTS, SEEDS, harvest, plant, plotState, revealedPreference } from '../sim/orchard.js';
import { FAIR, askOf, bidOf, buyCard, hypeIndex, makeFair, newRound, newsAt, sellCard, summary } from '../sim/fair.js';
import { dayKey } from '../sim/piggy.js';
import { mintBadge } from './badges.js';
import { balance as walletBalance, ensureStarter, post } from '../../../js/wallet.js';
import { announce, celebrate, h, icon, number } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COAT = { cream: '#F3E6CF', brown: '#9A6A44', black: '#3A3330', honey: '#D9A85B', grey: '#A9A9A4' };
const BELL = { gold: '#E0B100', silver: '#C9CED1', red: '#D9502F', blue: '#3F5FDB' };

export function mount(root, ctx) {
  const { store, navigate, tier } = ctx;
  const view = h('section', { class: 'screen farm-screen' });
  root.append(view);
  let ticker = 0;
  let orchardBox = null;
  let orchardKey = '';
  // The Cow Fair box lives across redraws of the farm, so a running fair keeps going.
  const fairBox = h('div', { class: 'card fair' });
  let fair = null;
  let round = null;
  let fairTimer = 0;
  let fairEls = null;

  // One Town wallet for every building (BRIEF §16.1): a starter grant once, and earlier milk coins moved in.
  ensureStarter(store);
  const old = store.get().farm;
  if (old?.coins > 0 && !old.walletMigrated) {
    post(store, { amount: old.coins, kind: 'milk', note: 'Earlier milk sales' });
    store.set({ farm: { ...old, walletMigrated: true } });
  }

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
      (orchardBox = h('div', { class: 'card orchard' })),
      fairBox,
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
    orchardKey = '';
    renderOrchard(true);
    for (const id of celebrateIds) {
      const card = view.querySelector(`[data-cow="${id}"]`);
      if (card) celebrate(card, { pieces: 30 });
    }
  }

  function milkCard(farm, ready, feed) {
    const coins = walletBalance(store.get());
    const litres = ready.reduce((s, c) => s + c.milk, 0);
    const btn = ready.length
      ? h('button', { class: 'btn btn--primary', type: 'button' }, `Collect ${litres} litres and sell for ${litres * MILK_PRICE} coins`)
      : null;
    btn?.addEventListener('click', () => {
      const r = collectMilk(farm, farm.cows, feed.total, Date.now());
      store.set({ farm: r.farm });
      post(store, { amount: r.coins, kind: 'milk', note: `${r.litres} litres of milk` });
      announce(`Sold ${r.litres} litres of milk for ${r.coins} coins.`);
      render();
    });
    const grownCows = farm.cows.filter((c) => stageOf(c, feed.total).id === 'adult').length;
    return h('div', { class: 'card farm-milk' }, [
      h('h2', { class: 'lab-card__title', text: 'Milk' }),
      h('p', { class: 'farm-coins' }, [icon('check', { size: 18 }), `${number(coins, 0)} coins in your Town wallet`]),
      btn || h('p', { class: 'field__hint', text: grownCows ? 'Milk collected today. Come back tomorrow for more.' : 'Grown cows give milk once a day. Keep feeding your calf by doing things around town.' }),
      h('p', { class: 'field__hint', text: 'Town coins are game coins, not real money.' }),
    ]);
  }

  // ---- Orchard (BRIEF §16.1): seeds bought with coins, growing in real time ---------------------
  function renderOrchard(force = false) {
    if (!orchardBox) return;
    const now = Date.now();
    const orchard = { plots: Array(PLOTS).fill(null), choices: [], ...store.get().orchard };
    // Rebuild only when a plot changes stage; otherwise just refresh the countdowns.
    const key = orchard.plots.map((p) => (p ? `${p.seed}:${plotState(p, now).stage}:${p.harvests}` : '-')).join('|');
    if (!force && key === orchardKey) {
      for (const el of orchardBox.querySelectorAll('[data-ready-at]')) el.textContent = countdown(Number(el.dataset.readyAt) - now);
      return;
    }
    orchardKey = key;
    const coins = walletBalance(store.get());
    // The wallet is shared: keep the Milk card's balance in step with the orchard.
    view.querySelector('.farm-coins')?.replaceChildren(icon('check', { size: 18 }), `${number(coins, 0)} coins in your Town wallet`);
    const pref = revealedPreference(orchard.choices);
    const plots = orchard.plots.map((p, i) => h('li', { class: 'orchard-plot' }, p ? plotView(p, i, now) : emptyPlot(i, coins)));
    orchardBox.replaceChildren(
      h('div', { class: 'card-head' }, [h('h2', { class: 'lab-card__title', text: 'Orchard' }), h('p', { class: 'chip', text: `${number(coins, 0)} coins` })]),
      h('p', { class: 'field__hint', text: 'Buy seeds with coins and plant them. Some pay a little soon; some pay a lot if you wait.' }),
      h('ul', { class: 'orchard-plots' }, plots),
      h('p', { class: 'orchard-pref', text: pref ? `Your choices so far: ${pref.count} planted, ${Math.round(pref.laterShare * 100)}% waited for the big tree.` : 'Nothing planted yet.' }),
      h('div', { class: 'card card--quiet orchard-lesson' }, [
        h('h3', { class: 'lesson-mini__title', text: 'Waiting can pay' }),
        h('p', { text: 'A sprout pays a little in 2 minutes, but only if you keep coming back to replant it. A big tree costs more and takes a week, but then it fruits every day for as long as you keep it. Patience turns a small start into a steady income.' }),
      ]),
    );
  }

  function plotView(p, i, now) {
    const seed = SEEDS[p.seed];
    const s = plotState(p, now);
    const art = h('span', { class: `orchard-art is-${p.seed} is-${s.stage}`, 'aria-hidden': 'true' });
    const label = { seed: 'Planted', sprout: 'Sprouting', growing: 'Growing', ready: 'Ready to harvest', grown: 'Growing more fruit', done: 'Harvested' }[s.stage];
    const parts = [art, h('p', { class: 'orchard-plot__name', text: seed.label }), h('p', { class: 'orchard-plot__stage', text: label })];
    if (s.stage === 'ready') {
      const b = h('button', { class: 'btn btn--sm btn--primary', type: 'button' }, `Harvest ${s.harvest} coins`);
      b.addEventListener('click', () => {
        const r = harvest({ plots: Array(PLOTS).fill(null), ...store.get().orchard }, i, Date.now());
        if (!r.coins) return;
        store.set({ orchard: { ...store.get().orchard, ...r.orchard } });
        post(store, { amount: r.coins, kind: 'harvest', note: seed.label });
        announce(`Harvested ${r.coins} coins from your ${seed.label.toLowerCase()}.`);
        renderOrchard(true);
      });
      parts.push(b);
    } else if (s.readyAt) {
      parts.push(h('p', { class: 'orchard-plot__time', dataset: { readyAt: String(s.readyAt) }, text: countdown(s.readyAt - now) }));
    }
    return parts;
  }

  function emptyPlot(i, coins) {
    const menu = Object.entries(SEEDS).map(([id, seed]) => {
      const b = h('button', { class: 'orchard-seed', type: 'button', disabled: coins < seed.cost }, [
        h('span', { class: 'orchard-seed__name', text: seed.label }),
        h('span', { class: 'orchard-seed__meta', text: `${seed.cost} coins · ready in ${seed.wait} · harvest ${seed.harvest}` }),
      ]);
      b.addEventListener('click', () => {
        const paid = post(store, { amount: -seed.cost, kind: 'seed', note: seed.label });
        if (!paid.ok) return announce(paid.error);
        store.set({ orchard: plant({ plots: Array(PLOTS).fill(null), choices: [], ...store.get().orchard }, i, id, Date.now()) });
        announce(`Planted a ${seed.label.toLowerCase()}.`);
        renderOrchard(true);
      });
      return b;
    });
    return [h('p', { class: 'orchard-plot__name', text: `Plot ${i + 1}: empty` }), h('div', { class: 'orchard-menu', role: 'group', 'aria-label': `Plant in plot ${i + 1}` }, menu)];
  }

  // ---- Cow Fair (BRIEF §16 stretch): NPC hype on a rare trait, then a crash ----------------------
  function fairIntro() {
    const saved = store.get().fair;
    fairBox.replaceChildren(
      h('div', { class: 'card-head' }, [h('h2', { class: 'lab-card__title', text: 'Cow Fair' }), h('p', { class: 'chip', text: '1 minute' })]),
      h('p', { text: `Collectors trade cow cards here: pictures of cows, not cows. Prices change fast. You get ${FAIR.tickets} pretend fair tickets each time, and your Town wallet isn’t touched.` }),
      h('p', { class: 'field__hint', text: 'Your own cows can’t be sold here. Their birth certificates are soulbound, and they give milk every day.' }),
      saved?.last ? h('p', { class: 'field__hint', text: `Last fair: you ended with ${number(saved.last.end, 0)} tickets from ${FAIR.tickets}.` }) : null,
      h('button', { class: 'btn btn--primary', type: 'button', onClick: startFair }, saved?.played ? 'Go to the fair again' : 'Go to the fair'),
    );
  }

  function startFair() {
    fair = makeFair(`${dayKey(Date.now())}:${store.get().fair?.played ?? 0}`);
    round = newRound();
    buildFair();
    clearInterval(fairTimer);
    fairTimer = setInterval(stepFair, FAIR.stepMs);
    fairEls.tickets.focus();
  }

  function buildFair() {
    const rows = fair.cards.map((card, i) => {
      const price = h('span', { class: 'fair-card__price' });
      const change = h('span', { class: 'fair-card__change' });
      const owned = h('span', { class: 'chip chip--ok', text: 'Yours', hidden: true });
      const hype = h('span', { class: 'chip chip--warn', text: `${fair.trait.label}: in demand`, hidden: true });
      const buy = h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: () => act(i, 'buy') });
      const sell = h('button', { class: 'btn btn--sm', type: 'button', onClick: () => act(i, 'sell') });
      const el = h('li', { class: 'fair-card' }, [
        cowArt(card, 'adult'),
        h('div', { class: 'fair-card__body' }, [
          h('p', { class: 'fair-card__name', text: `${card.name}’s card` }),
          h('p', { class: 'fair-card__chips' }, [owned, hype]),
          h('p', { class: 'fair-card__traits', text: traitText(card) }),
          h('p', { class: 'fair-card__quote' }, [price, change]),
          h('div', { class: 'fair-card__actions' }, [buy, sell]),
        ]),
      ]);
      return { el, price, change, owned, hype, buy, sell };
    });
    const tickets = h('p', { class: 'fair__tickets', tabindex: '-1' });
    const clock = h('p', { class: 'chip fair__clock' });
    const news = h('p', { class: 'fair__news', role: 'status' });
    const index = h('p', { class: 'fair__index' });
    fairEls = { rows, tickets, clock, news, index };
    fairBox.replaceChildren(
      h('div', { class: 'card-head' }, [h('h2', { class: 'lab-card__title', text: 'Cow Fair' }), clock]),
      tickets,
      news,
      index,
      h('ul', { class: 'fair-cards' }, rows.map((r) => r.el)),
    );
    updateFair();
  }

  function updateFair() {
    const s = Math.min(round.step, FAIR.steps);
    const held = Object.keys(round.owned).reduce((v, i) => v + (bidOf(fair, Number(i), s) ?? 0), 0);
    fairEls.clock.textContent = `${Math.ceil(((FAIR.steps - s) * FAIR.stepMs) / 1000)} s left`;
    fairEls.tickets.textContent = `${number(round.tickets, 1)} tickets${Object.keys(round.owned).length ? ` · your cards would sell for ${number(held, 1)}` : ''}`;
    const line = newsAt(fair, s);
    if (line) fairEls.news.textContent = line;
    const hi = hypeIndex(fair, s);
    fairEls.index.hidden = s < 3;
    fairEls.index.textContent = `${fair.trait.label} cards: ${hi >= 1 ? 'up' : 'down'} ${Math.round(Math.abs(hi - 1) * 100)}% since the fair opened`;
    fairEls.rows.forEach((r, i) => {
      const ask = askOf(fair, i, s);
      const bid = bidOf(fair, i, s);
      const ch = fair.prices[i][s] / fair.prices[i][0] - 1;
      const own = round.owned[i];
      r.price.textContent = `${number(fair.prices[i][s], 1)} tickets`;
      r.change.textContent = `${ch >= 0 ? '↑' : '↓'} ${Math.round(Math.abs(ch) * 100)}%`;
      r.change.className = `fair-card__change ${ch >= 0 ? 'is-up' : 'is-down'}`;
      r.owned.hidden = !own;
      r.hype.hidden = !(fair.cards[i].hyped && s >= 3 && s < 34);
      r.hype.textContent = `${fair.trait.label}: ${s < 20 ? 'in demand' : s < 25 ? 'sellers lining up' : 'crashing'}`;
      r.buy.textContent = `Buy for ${number(ask, 1)}`;
      r.buy.hidden = Boolean(own);
      r.buy.disabled = ask > round.tickets;
      r.sell.hidden = !own;
      r.sell.textContent = bid == null ? 'No buyers right now' : `Sell for ${number(bid, 1)}`;
      r.sell.disabled = bid == null;
    });
  }

  function stepFair() {
    round = { ...round, step: round.step + 1 };
    if (round.step >= FAIR.steps) endFair();
    else updateFair();
  }

  function act(i, side) {
    const r = side === 'buy' ? buyCard(fair, round, i) : sellCard(fair, round, i);
    if (!r.ok) return announce(r.error);
    round = r.round;
    announce(`${side === 'buy' ? 'Bought' : 'Sold'} ${fair.cards[i].name}’s card.`);
    updateFair();
    // The pressed button hides; keep keyboard focus on the card's other action.
    (side === 'buy' ? fairEls.rows[i].sell : fairEls.rows[i].buy).focus();
  }

  function endFair() {
    clearInterval(fairTimer);
    round = { ...round, step: FAIR.steps };
    const s = summary(fair, round);
    const prev = store.get().fair || {};
    store.set({ fair: { played: (prev.played ?? 0) + 1, last: { end: s.end, date: dayKey(Date.now()), trait: fair.trait.id } } });
    const t = fair.trait.label;
    const T = t[0].toUpperCase() + t.slice(1);
    const verdict = s.end > s.start
      ? `You ended with ${number(s.end, 1)} tickets from ${s.start}: a gain.`
      : s.end < s.start
        ? `You ended with ${number(s.end, 1)} tickets from ${s.start}: a loss.`
        : `You ended with the ${s.start} tickets you started with.`;
    const how = [];
    if (s.early) how.push(`You bought ${s.early} ${t} ${s.early === 1 ? 'card' : 'cards'} early, before the crowd.`);
    if (s.late) how.push(`You bought ${s.late} after the crowd arrived, near the top.`);
    if (s.heldThroughCrash) how.push(`You still held ${s.heldThroughCrash} when the buyers vanished.`);
    if (!round.trades.length) how.push('You watched without trading. That’s allowed, and you lost nothing.');
    const cow = (store.get().farm?.cows || [])[0];
    fairBox.replaceChildren(
      h('div', { class: 'card-head' }, [h('h2', { class: 'lab-card__title', text: 'Cow Fair' }), h('p', { class: 'chip', text: 'Closed' })]),
      h('p', { class: 'fair__result', text: verdict }),
      how.length ? h('ul', { class: 'fair__how' }, how.map((x) => h('li', { text: x }))) : null,
      h('div', { class: 'card card--quiet fair-lesson' }, [
        h('h3', { class: 'lesson-mini__title', text: 'Why prices rose and then crashed' }),
        h('p', { text: `${T} cards didn’t make anything. Their price rose only because new buyers kept paying more, hoping to sell to someone else later. When new buyers stopped coming, nobody would buy for a while, and then prices fell to about a third of where they started.` }),
        h('p', { text: 'Early buyers can win, but only because later buyers paid more. Nobody rings a bell at the top.' }),
        h('p', { text: cow ? `${cow.name} gives ${cow.milk} litres of milk a day, whatever the fair does.` : 'A cow you earn gives milk every day, whatever the fair does.' }),
        h('p', { class: 'field__hint', text: 'Real collectibles on blockchains have done this: CryptoKitties in 2017 and Axie Infinity in 2022 drew crowds of buyers, then prices fell hard. Sources: docs/SOURCES.md (not yet checked).' }),
      ]),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: startFair }, 'Go to the fair again'),
    );
    announce(verdict);
  }

  fairIntro();
  render();
  ticker = setInterval(() => renderOrchard(false), 1000);
  return () => {
    clearInterval(ticker);
    clearInterval(fairTimer);
    view.remove();
  };
}

function countdown(ms) {
  if (ms <= 0) return 'Ready now';
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `Ready in ${d} d ${hrs} h`;
  if (hrs) return `Ready in ${hrs} h ${m} min`;
  return `Ready in ${m}:${String(s % 60).padStart(2, '0')}`;
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
