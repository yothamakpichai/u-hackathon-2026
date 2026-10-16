// Farm (BRIEF §16; slice J11). A cow you earn and never buy: it is born and grows from real actions
// (Learning Path steps, Coach chapters, finished markets, Piggy Bank logs and the days that make your
// streak) and gives milk once a day, sold for farm coins. Each cow has seeded traits and a soulbound
// birth certificate minted on the simulated chain.
import { collectMilk, cowsDue, COW_AT, feedFrom, milkReady, MILK_PRICE, STAGES, stageOf } from '../sim/farm.js';
import { PLOTS, SEEDS, canPlant, harvest, plant, plotState, revealedPreference } from '../sim/orchard.js';
import { FAIR, askOf, bidOf, buyCard, hypeIndex, makeFair, newRound, newsAt, sellCard, summary } from '../sim/fair.js';
import { dayKey } from '../sim/piggy.js';
import { mintBadge } from './badges.js';
import { balance as walletBalance, coinText, ensureStarter, post } from '../../../js/wallet.js';
import { announce, celebrate, h, icon, number } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COAT = { cream: '#F3E6CF', brown: '#9A6A44', black: '#3A3330', honey: '#D9A85B', grey: '#A9A9A4' };
const BELL = { gold: '#E0B100', silver: '#C9CED1', red: '#D9502F', blue: '#3F5FDB' };
const CALVES = ['', 'A calf', 'Two calves', 'Three calves'];
const CHEAPEST_SEED = Math.min(...Object.values(SEEDS).map((s) => s.cost));

export function mount(root, ctx) {
  const { store, navigate, tier } = ctx;
  const view = h('section', { class: 'screen farm-screen' });
  root.append(view);
  let ticker = 0;
  let orchardBox = null;
  let orchardKey = '';
  let plotStages = [];
  let shownDay = '';
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
        // The mint is async: swap in the certificate when it lands, without a redraw that would replay the confetti.
        mintBadge(store, { kind: 'cow', ref: cow.id, tier, meta: { title: `${cow.name}’s birth certificate`, how: `${cow.name} was born on your farm from your own actions.` } }).then((cert) => {
          if (cert) view.querySelector(`[data-cow="${cow.id}"] .farm-cow__cert`)?.replaceWith(certLine(cert));
        });
      }
      const names = listText(born.map((c) => c.name));
      announce(born.length > 1 ? `${CALVES[born.length]}, ${names}, were born on your farm!` : `A calf called ${names} was born on your farm!`);
      celebrateIds = born.map((c) => c.id);
    }
    const next = COW_AT[farm.cows.length];
    const ready = farm.cows.filter((c) => milkReady(c, farm, feed.total, Date.now()));

    const cowCards = farm.cows.map((cow) => {
      const stage = stageOf(cow, feed.total);
      const grown = feed.total - cow.bornAtFeed;
      const nextStage = STAGES[STAGES.indexOf(stage) + 1];
      return h('li', { class: 'card farm-cow', dataset: { cow: cow.id } }, [
        cowArt(cow, stage.id),
        h('div', { class: 'farm-cow__body' }, [
          h('h2', { class: 'farm-cow__name', text: cow.name }),
          h('p', { class: 'chip', text: stage.label }),
          h('p', { class: 'field__hint', text: nextStage ? `${nextStage.from - grown} more feed to become a ${nextStage.label.toLowerCase()}.` : `Gives ${cow.milk} litres of milk a day.` }),
          h('p', { class: 'farm-cow__traits', text: traitText(cow) }),
          certLine(store.get().badges?.[`cow:${cow.id}`]),
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
          `${feed.lessons * 5} from the Learning Path`,
          `${feed.coach * 5} from Coach chapters`,
          `${feed.runs * 3} from finished markets`,
          `${feed.days * 2} from days you did something in town`,
        ].map((t) => h('li', { text: t }))),
        h('p', { class: 'field__hint', text: next ? `Next calf at ${next} feed (${Math.max(0, next - feed.total)} to go).` : 'Your farm is full: three cows.' }),
      ]),
      farm.cows.length
        ? h('ul', { class: 'farm-cows' }, cowCards)
        : h('div', { class: 'card farm-empty' }, [
            h('h2', { class: 'lab-card__title', text: 'Earn your first calf' }),
            h('p', { text: `It takes ${COW_AT[0]} feed. Write down a saving in the Piggy Bank, finish a Learning Path lesson or a Coach chapter, or finish today’s market. Every day you do something in town adds feed too.` }),
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
        h('p', { class: 'field__hint' }, [h('a', { href: '#/research', text: 'See our sources' })]),
      ]),
    );
    shownDay = dayKey(Date.now());
    orchardKey = '';
    renderOrchard(true);
    for (const id of celebrateIds) {
      const card = view.querySelector(`[data-cow="${id}"]`);
      if (card) celebrate(card, { pieces: 30 });
    }
  }

  // A cow's birth certificate is a soulbound badge. Explorer gets plain words instead of "soulbound" and "tx".
  function certLine(cert) {
    if (!cert) return h('p', { class: 'field__hint farm-cow__cert', text: 'Minting the birth certificate…' });
    const text = tier === 'explorer' ? 'Birth certificate: yours forever, can’t be sold' : `Soulbound birth certificate · tx ${cert.hash ? cert.hash.slice(0, 10) : 'pending'}`;
    return h('p', { class: 'chip chip--ok farm-cow__cert' }, [icon('check', { size: 14 }), text]);
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
      // The button is gone after the redraw: keep focus on the Milk card's message.
      view.querySelector('.farm-milk__status')?.focus({ preventScroll: true });
    });
    const grownCows = farm.cows.filter((c) => stageOf(c, feed.total).id === 'adult').length;
    const status = grownCows
      ? 'Milk collected today. Come back tomorrow for more.'
      : farm.cows.length
        ? `Grown cows give milk once a day. Keep feeding your ${farm.cows.length > 1 ? 'calves' : 'calf'} by doing things around town.`
        : 'Grown cows give milk once a day. Earn feed around town and your first calf will be born.';
    return h('div', { class: 'card farm-milk' }, [
      h('h2', { class: 'lab-card__title', text: 'Milk' }),
      h('p', { class: 'farm-coins', text: `${coinText(coins)} coins in your Town wallet` }),
      btn || h('p', { class: 'field__hint farm-milk__status', tabindex: '-1', text: status }),
      h('p', { class: 'field__hint', text: 'Town coins are game coins, not real money.' }),
    ]);
  }

  // A new Bangkok day while the farm is open: milk can be collected again without a reload.
  function refreshMilk() {
    const card = view.querySelector('.farm-milk');
    shownDay = dayKey(Date.now());
    if (!card) return;
    const state = store.get();
    const feed = feedFrom(state);
    const farm = { cows: [], ...state.farm };
    const ready = farm.cows.filter((c) => milkReady(c, farm, feed.total, Date.now()));
    const hadFocus = card.contains(document.activeElement);
    const fresh = milkCard(farm, ready, feed);
    card.replaceWith(fresh);
    if (hadFocus) (fresh.querySelector('button') || fresh.querySelector('.farm-milk__status'))?.focus({ preventScroll: true });
  }

  // ---- Orchard (BRIEF §16.1): seeds bought with coins, growing in real time ---------------------
  function renderOrchard(force = false) {
    if (!orchardBox) return;
    const now = Date.now();
    const orchard = { plots: Array(PLOTS).fill(null), choices: [], ...store.get().orchard };
    const stages = orchard.plots.map((p) => (p ? plotState(p, now).stage : null));
    // Rebuild only when a plot changes stage (or a new day lets sprouts grow again); otherwise just refresh the countdowns.
    const key = `${orchard.plots.map((p, i) => (p ? `${p.seed}:${stages[i]}:${p.harvests}` : '-')).join('|')}|${dayKey(now)}`;
    if (!force && key === orchardKey) {
      for (const el of orchardBox.querySelectorAll('[data-ready-at]')) el.textContent = countdown(Number(el.dataset.readyAt) - now);
      return;
    }
    // A plot that became ready on its own is announced; planting and harvesting announce themselves.
    if (!force) {
      const turned = orchard.plots
        .map((p, i) => (p && stages[i] === 'ready' && plotStages[i] && plotStages[i] !== 'ready' ? `Your ${SEEDS[p.seed].label.toLowerCase()} in plot ${i + 1} is ready to harvest.` : null))
        .filter(Boolean);
      if (turned.length) announce(turned.join(' '));
    }
    orchardKey = key;
    plotStages = stages;
    // A timer redraw keeps keyboard focus on the same plot and control.
    const had = orchardBox.contains(document.activeElement) ? document.activeElement : null;
    const hadPlot = had?.closest('[data-plot]')?.dataset.plot;
    const hadControl = had?.dataset.seed ? `[data-seed="${had.dataset.seed}"]` : had?.classList.contains('orchard-harvest') ? '.orchard-harvest' : null;
    const coins = walletBalance(store.get());
    // The wallet is shared: keep the Milk card's balance in step with the orchard.
    const coinsLine = view.querySelector('.farm-coins');
    if (coinsLine) coinsLine.textContent = `${coinText(coins)} coins in your Town wallet`;
    const need = coins < CHEAPEST_SEED && orchard.plots.some((p) => !p);
    const pref = revealedPreference(orchard.choices);
    const plots = orchard.plots.map((p, i) => h('li', { class: 'orchard-plot', tabindex: '-1', dataset: { plot: String(i) } }, p ? plotView(p, i, now) : emptyPlot(i, coins, orchard, now, need)));
    orchardBox.replaceChildren(
      ...[
        h('div', { class: 'card-head' }, [h('h2', { class: 'lab-card__title', text: 'Orchard' }), h('p', { class: 'chip', text: `${coinText(coins)} coins` })]),
        h('p', { class: 'field__hint', text: 'Buy seeds with coins and plant them. Some pay a little soon; some pay a lot if you wait.' }),
        need ? h('p', { class: 'orchard-need', id: 'orchard-need', text: `You need ${CHEAPEST_SEED} coins to plant. Sell milk from a grown cow, sell at the Stall, or harvest a plant to earn coins.` }) : null,
        h('ul', { class: 'orchard-plots' }, plots),
        h('p', { class: 'orchard-pref', text: pref ? `Your choices so far: ${pref.count} planted, ${Math.round(pref.laterShare * 100)}% waited for the big tree.` : 'Nothing planted yet.' }),
        h('div', { class: 'card card--quiet orchard-lesson' }, [
          h('h3', { class: 'lesson-mini__title', text: 'Waiting can pay' }),
          h('p', { text: `A herb sprout pays a little in 2 minutes, once a day in each plot. A big mango tree costs more and takes a week, but then it pays ${SEEDS.big.harvest} coins and fruits every day for as long as you keep it. Patience turns a small start into a steady income.` }),
        ]),
      ].filter(Boolean),
    );
    if (had && hadPlot != null) focusPlot(Number(hadPlot), hadControl);
  }

  // Focus a plot after it changes: the given control inside it if there is one, else the plot itself.
  function focusPlot(i, selector = null) {
    const li = orchardBox?.querySelector(`[data-plot="${i}"]`);
    ((selector && li?.querySelector(selector)) || li)?.focus({ preventScroll: true });
  }

  function plotView(p, i, now) {
    const seed = SEEDS[p.seed];
    const s = plotState(p, now);
    // plant-* names the plant and is-* the stage, so the herb sprout's id never reads as the sprout stage.
    const art = h('span', { class: `orchard-art plant-${p.seed} is-${s.stage}`, 'aria-hidden': 'true' });
    const label = { seed: 'Planted', sprout: 'Sprouting', growing: 'Growing', ready: 'Ready to harvest', grown: 'Growing more fruit', done: 'Harvested' }[s.stage];
    const parts = [art, h('p', { class: 'orchard-plot__name', text: seed.label }), h('p', { class: 'orchard-plot__stage', text: label })];
    if (s.stage === 'ready') {
      const b = h('button', { class: 'btn btn--sm btn--primary orchard-harvest', type: 'button', 'aria-label': `Harvest ${s.harvest} coins from plot ${i + 1}, your ${seed.label.toLowerCase()}` }, `Harvest ${s.harvest} coins`);
      b.addEventListener('click', () => {
        const r = harvest({ plots: Array(PLOTS).fill(null), ...store.get().orchard }, i, Date.now());
        if (!r.coins) return;
        store.set({ orchard: { ...store.get().orchard, ...r.orchard } });
        post(store, { amount: r.coins, kind: 'harvest', note: seed.label });
        announce(`Harvested ${r.coins} coins from your ${seed.label.toLowerCase()}.`);
        renderOrchard(true);
        focusPlot(i, '.orchard-seed:not([aria-disabled])');
      });
      parts.push(b);
    } else if (s.readyAt) {
      parts.push(h('p', { class: 'orchard-plot__time', dataset: { readyAt: String(s.readyAt) }, text: countdown(s.readyAt - now) }));
    }
    return parts;
  }

  function emptyPlot(i, coins, orchard, now, need) {
    const menu = Object.entries(SEEDS).map(([id, seed]) => {
      const allowed = canPlant(orchard, i, id, now).ok;
      const short = coins < seed.cost;
      const meta = allowed
        ? `${seed.cost} coins · ready in ${seed.wait} · harvest ${seed.harvest}${seed.refruit ? `, then ${seed.refruitHarvest} every day` : ''}${seed.daily ? ' · one a day in each plot' : ''}`
        : 'One a day in each plot. Plant another tomorrow.';
      // aria-disabled rather than disabled: keyboard users can still reach the seed and hear why it can't be planted.
      const b = h('button', { class: 'orchard-seed', type: 'button', dataset: { seed: id }, 'aria-disabled': short || !allowed ? 'true' : null, 'aria-describedby': short && need ? 'orchard-need' : null }, [
        h('span', { class: 'orchard-seed__name', text: seed.label }),
        h('span', { class: 'orchard-seed__meta', text: meta }),
      ]);
      b.addEventListener('click', () => {
        // One clock reading for the check, the payment and the planting, so they can't disagree at midnight.
        const at = Date.now();
        const latest = { plots: Array(PLOTS).fill(null), choices: [], ...store.get().orchard };
        const check = canPlant(latest, i, id, at);
        if (!check.ok) return announce(check.error);
        const paid = post(store, { amount: -seed.cost, kind: 'seed', note: seed.label }, at);
        if (!paid.ok) return announce(paid.error);
        store.set({ orchard: plant(latest, i, id, at) });
        announce(`Planted a ${seed.label.toLowerCase()}.`);
        renderOrchard(true);
        focusPlot(i);
      });
      return b;
    });
    return [h('p', { class: 'orchard-plot__name', text: `Plot ${i + 1}: empty` }), h('div', { class: 'orchard-menu', role: 'group', 'aria-label': `Plant in plot ${i + 1}` }, menu)];
  }

  // ---- Cow Fair (BRIEF §16 stretch): NPC hype on a rare trait, then a crash ----------------------
  function fairIntro() {
    const saved = store.get().fair;
    const own = tier === 'explorer'
      ? 'Your own cows can’t be sold here. Their birth certificates stay yours forever, and they give milk every day.'
      : 'Your own cows can’t be sold here. Their birth certificates are soulbound, and they give milk every day.';
    fairBox.replaceChildren(
      ...[
        h('div', { class: 'card-head' }, [h('h2', { class: 'lab-card__title', text: 'Cow Fair' }), h('p', { class: 'chip', text: '1 minute' })]),
        h('p', { text: `Collectors trade cow cards here: pictures of cows, not cows. Prices change fast. You get ${FAIR.tickets} pretend fair tickets each time, and your Town wallet isn’t touched.` }),
        h('p', { class: 'field__hint', text: own }),
        saved?.last ? h('p', { class: 'field__hint', text: `Last fair: you ended with ${ticketText(saved.last.end)} tickets from ${FAIR.tickets}.` }) : null,
        h('button', { class: 'btn btn--primary', type: 'button', onClick: startFair }, saved?.played ? 'Go to the fair again' : 'Go to the fair'),
      ].filter(Boolean),
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
    const T = capital(fair.trait.label);
    const rows = fair.cards.map((card, i) => {
      const name = h('p', { class: 'fair-card__name', tabindex: '-1', text: `${card.name}’s card` });
      const price = h('span', { class: 'fair-card__price' });
      const change = h('span', { class: 'fair-card__change' });
      const owned = h('span', { class: 'chip chip--ok', text: 'Yours', hidden: true });
      const hype = h('span', { class: 'chip chip--warn', text: `${T}: in demand`, hidden: true });
      const buy = h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: () => act(i, 'buy') });
      const sell = h('button', { class: 'btn btn--sm', type: 'button', onClick: () => act(i, 'sell') });
      const el = h('li', { class: 'fair-card' }, [
        cowArt(card, 'adult'),
        h('div', { class: 'fair-card__body' }, [
          name,
          h('p', { class: 'fair-card__chips' }, [owned, hype]),
          h('p', { class: 'fair-card__traits', text: traitText(card) }),
          h('p', { class: 'fair-card__quote' }, [price, change]),
          h('div', { class: 'fair-card__actions' }, [buy, sell]),
        ]),
      ]);
      return { el, name, price, change, owned, hype, buy, sell };
    });
    const tickets = h('p', { class: 'fair__tickets', tabindex: '-1' });
    const clock = h('p', { class: 'chip fair__clock' });
    const news = h('p', { class: 'fair__news', role: 'status' });
    const index = h('p', { class: 'fair__index' });
    // Time left, tickets and news: on a phone this block stays in view while the cards scroll.
    const status = h('div', { class: 'fair__status' }, [h('div', { class: 'fair__bar' }, [tickets, clock]), news]);
    fairEls = { T, rows, tickets, clock, news, index, status };
    fairBox.replaceChildren(
      h('div', { class: 'card-head' }, [h('h2', { class: 'lab-card__title', text: 'Cow Fair' })]),
      status,
      index,
      h('ul', { class: 'fair-cards' }, rows.map((r) => r.el)),
    );
    updateFair();
  }

  function updateFair() {
    const s = Math.min(round.step, FAIR.steps);
    const { T } = fairEls;
    const held = Object.keys(round.owned).reduce((v, i) => v + (bidOf(fair, Number(i), s) ?? 0), 0);
    fairEls.clock.textContent = `${Math.ceil(((FAIR.steps - s) * FAIR.stepMs) / 1000)} s left`;
    fairEls.tickets.textContent = `${ticketText(round.tickets)} tickets${Object.keys(round.owned).length ? ` · your cards would sell for ${ticketText(Math.round(held * 10) / 10)}` : ''}`;
    const line = newsAt(fair, s);
    if (line) fairEls.news.textContent = line;
    const hi = hypeIndex(fair, s);
    // The collector's buy is news at step 3; prices start to climb on the next step.
    fairEls.index.hidden = s < 4;
    fairEls.index.textContent = `${T} cards: ${hi >= 1 ? 'up' : 'down'} ${Math.round(Math.abs(hi - 1) * 100)}% since the fair opened`;
    fairEls.rows.forEach((r, i) => {
      const ask = askOf(fair, i, s);
      const bid = bidOf(fair, i, s);
      const ch = fair.prices[i][s] / fair.prices[i][0] - 1;
      const own = round.owned[i];
      const name = `${fair.cards[i].name}’s card`;
      r.price.textContent = `${number(fair.prices[i][s], 1)} tickets`;
      r.change.textContent = `${ch >= 0 ? '↑' : '↓'} ${Math.round(Math.abs(ch) * 100)}%`;
      r.change.className = `fair-card__change ${ch >= 0 ? 'is-up' : 'is-down'}`;
      r.owned.hidden = !own;
      r.hype.hidden = !(fair.cards[i].hyped && s >= 3 && s < 34);
      r.hype.textContent = `${T}: ${s < 20 ? 'in demand' : s < 25 ? 'sellers lining up' : s < 31 ? 'crashing' : 'crashed'}`;
      // The accessible names start with the visible text and add the card and the unit.
      r.buy.textContent = `Buy for ${number(ask, 1)}`;
      r.buy.setAttribute('aria-label', `Buy for ${number(ask, 1)} tickets, ${name}`);
      r.buy.hidden = Boolean(own);
      usable(r.buy, ask <= round.tickets);
      r.sell.hidden = !own;
      r.sell.textContent = bid == null ? 'No buyers right now' : `Sell for ${number(bid, 1)}`;
      r.sell.setAttribute('aria-label', bid == null ? `No buyers right now for ${name}` : `Sell for ${number(bid, 1)} tickets, ${name}`);
      usable(r.sell, bid != null);
    });
    // The status block grows when its lines wrap; lab.css uses its height to keep focused cards clear of it on phones.
    fairBox.style.setProperty('--fair-status-h', `${fairEls.status.offsetHeight}px`);
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
    // The pressed button hides; keep keyboard focus on the card's other action, or on the card's name.
    const row = fairEls.rows[i];
    const other = side === 'buy' ? row.sell : row.buy;
    (other.hidden ? row.name : other).focus();
  }

  function endFair() {
    clearInterval(fairTimer);
    // The result takes focus only from inside the fair: the timer never pulls focus from elsewhere.
    const focusResult = fairBox.contains(document.activeElement) || document.activeElement === document.body;
    round = { ...round, step: FAIR.steps };
    const s = summary(fair, round);
    const prev = store.get().fair || {};
    store.set({ fair: { played: (prev.played ?? 0) + 1, last: { end: s.end, date: dayKey(Date.now()), trait: fair.trait.id } } });
    const t = fair.trait.label;
    const T = capital(t);
    const cards = (n) => `${n} ${t} ${n === 1 ? 'card' : 'cards'}`;
    const verdict = s.end > s.start
      ? `You ended with ${ticketText(s.end)} tickets from ${s.start}: a gain.`
      : s.end < s.start
        ? `You ended with ${ticketText(s.end)} tickets from ${s.start}: a loss.`
        : `You ended with the ${s.start} tickets you started with.`;
    const how = [];
    if (s.early) how.push(`You bought ${cards(s.early)} early, before the crowd.`);
    if (s.late) how.push(`You bought ${s.early ? `${s.late} more` : s.late} ${t} ${s.late === 1 ? 'card' : 'cards'} after the crowd arrived, near the top.`);
    if (s.crash) how.push(`You bought ${cards(s.crash)} while the price was crashing.`);
    if (s.after) how.push(`You bought ${cards(s.after)} after the crash, when the price was low.`);
    if (s.heldThroughCrash) how.push(`You still held ${cards(s.heldThroughCrash)} when the buyers vanished.`);
    if (!round.trades.length) how.push('You watched without trading. That’s allowed, and you lost nothing.');
    else if (!how.length) how.push(`You only traded ordinary cards, so the ${t} hype and crash didn’t touch you.`);
    const cow = (store.get().farm?.cows || [])[0];
    const result = h('p', { class: 'fair__result', tabindex: '-1', text: verdict });
    fairBox.replaceChildren(
      h('div', { class: 'card-head' }, [h('h2', { class: 'lab-card__title', text: 'Cow Fair' }), h('p', { class: 'chip', text: 'Closed' })]),
      result,
      h('ul', { class: 'fair__how' }, how.map((x) => h('li', { text: x }))),
      h('div', { class: 'card card--quiet fair-lesson' }, [
        h('h3', { class: 'lesson-mini__title', text: 'Why prices rose and then crashed' }),
        h('p', { text: `${T} cards didn’t make anything. Their price rose only because new buyers kept paying more, hoping to sell to someone else later. When new buyers stopped coming, nobody would buy for a while, and then prices fell to about a third of where they started.` }),
        h('p', { text: 'Early buyers can win, but only because later buyers paid more. Nobody tells you when the price has reached the top.' }),
        h('p', { text: cow ? `${cow.name} gives ${cow.milk} litres of milk a day, whatever the fair does.` : 'A cow you earn gives milk every day, whatever the fair does.' }),
        h('p', { class: 'field__hint' }, [
          'Real collectibles on blockchains have drawn crowds like this: CryptoKitties got so popular in 2017 that it clogged its blockchain, and Axie Infinity prices collapsed in 2022 (sources not yet checked). ',
          h('a', { href: '#/research', text: 'See our sources' }),
        ]),
      ]),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: startFair }, 'Go to the fair again'),
    );
    if (focusResult) result.focus({ preventScroll: true });
    announce(verdict);
  }

  fairIntro();
  render();
  ticker = setInterval(() => {
    renderOrchard(false);
    if (dayKey(Date.now()) !== shownDay) refreshMilk();
  }, 1000);
  return () => {
    clearInterval(ticker);
    clearInterval(fairTimer);
    view.remove();
  };
}

// A fair button that can't be used right now keeps focus (aria-disabled, not disabled); pressing it says why.
function usable(btn, ok) {
  if (ok) btn.removeAttribute('aria-disabled');
  else btn.setAttribute('aria-disabled', 'true');
}

const capital = (s) => s[0].toUpperCase() + s.slice(1);
// Names in a sentence: "Mali", "Mali and Loli", "Mali, Loli and Surin".
const listText = (names) => (names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and '));
// Fair tickets keep one decimal, and whole numbers show none: 18.9, 100.
const ticketText = (n) => number(n, Number.isInteger(n) ? 0 : 1);

function countdown(ms) {
  if (ms <= 0) return 'Ready now';
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (d) return `Ready in ${unit(d, 'day')}${hrs ? ` ${unit(hrs, 'hour')}` : ''}`;
  if (hrs) return `Ready in ${unit(hrs, 'hour')}${m ? ` ${unit(m, 'minute')}` : ''}`;
  return `Ready in ${m}:${String(s % 60).padStart(2, '0')}`;
}

function traitText(cow) {
  const pattern = { plain: 'no markings', belt: 'belt pattern' }[cow.pattern] || cow.pattern;
  const parts = [`${cow.coat} coat`, pattern, `${cow.bell} bell`, cow.horns ? 'little horns' : 'no horns'];
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
