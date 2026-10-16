// Market Lab: today's market (BRIEF §3 steps 3, 4 and 6; slice J2).
// A live chart, coin list, trade panel and portfolio over the sim engine (sim/session.js).
// The market only runs while this screen is open and visible. An event pauses it while Penny
// narrates and asks one question. When it closes, the run is saved to store.lab[tier] for the
// report card (#/report).
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
} from '../vendor/lightweight-charts/lightweight-charts.standalone.production.mjs';
import { createSession } from '../sim/session.js';
import { bangkokDate, dailySeed } from '../sim/prng.js';
import { BLOCK_TICKS } from '../sim/chain.js';
import { rsi, sma } from '../sim/indicators.js';
import { runMetrics } from '../sim/metrics.js';
import { attachCoach, isCoaching, onChapterDone, openCoachMenu } from './coach.js';
import { mintBadge, mintedNote, setChainSink } from './badges.js';

// A finished Coach chapter mints its soulbound badge (BRIEF §15) and shows it on the completion card.
onChapterDone(({ tier, chapter, store }) => mintedNote(mintBadge(store, { kind: 'coach', ref: chapter.id, tier })));
import {
  animate, announce, celebrate, delta, getJSON, h, icon, money, number, penny, price, questionCard, resultPanel,
  stateView, trend,
} from '../ui.js';

// The market outlives the screen, so a trip to #/create and back resumes it. One per tier and day.
let live = null;
let dataPromise = null;

// The open market for this tier, for the Create screen (null when the Lab hasn't opened one).
export const currentMarket = (tier) => (live && live.tier === tier ? live : null);

// Who made a trade, in kids' words (transaction `who`: an agent archetype, 'issuer' or 'player').
export const WHO = {
  player: 'You',
  retail: 'Everyday trader',
  momentum: 'Trend follower',
  value: 'Bargain hunter',
  whale: 'Whale',
  panic: 'Nervous seller',
  insider: 'Insider',
  hype: 'Hype buyer',
  arb: 'Arbitrage bot',
  rugger: 'Coin creator',
  wash: 'Wash-trading bot',
  issuer: 'New coins (miners and rewards)',
  mint: 'Badge mint',
};

// 24 original geometric coin glyphs on a 24 px grid, white on the coin colour (BRIEF §10).
// iconId indexes this list; 0 to 6 are the roster's (VAULT, EDUU, PEG, FUEL, ORBIT, ZOOMZ, BLOOP).
const SVG_NS = 'http://www.w3.org/2000/svg';
const FILL = { fill: '#FFFFFF' };
const LINE = { fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
export const GLYPHS = [
  ['Hexagon', [['polygon', { points: '12,3.5 19.5,7.8 19.5,16.2 12,20.5 4.5,16.2 4.5,7.8', ...FILL }]]],
  ['Leaf', [['path', { d: 'M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14z', ...FILL }]]],
  ['Equals', [['rect', { x: 5, y: 7.5, width: 14, height: 3.5, rx: 1.75, ...FILL }], ['rect', { x: 5, y: 13, width: 14, height: 3.5, rx: 1.75, ...FILL }]]],
  ['Bolt', [['polygon', { points: '13.5,3 6,13.5 11,13.5 10,21 18,10 13,10', ...FILL }]]],
  ['Orbit', [['circle', { cx: 12, cy: 12, r: 6.5, ...LINE }], ['circle', { cx: 18, cy: 6.5, r: 2.4, ...FILL }]]],
  ['Chevrons', [['path', { d: 'M5.5 7l5 5-5 5M12.5 7l5 5-5 5', ...LINE }]]],
  ['Bubbles', [['circle', { cx: 9, cy: 14.5, r: 4.5, ...FILL }], ['circle', { cx: 16.5, cy: 8, r: 2.8, ...FILL }], ['circle', { cx: 17, cy: 16.5, r: 1.8, ...FILL }]]],
  ['Circle', [['circle', { cx: 12, cy: 12, r: 7, ...FILL }]]],
  ['Square', [['rect', { x: 5.5, y: 5.5, width: 13, height: 13, rx: 2.5, ...FILL }]]],
  ['Triangle', [['polygon', { points: '12,4 20.5,19 3.5,19', ...FILL }]]],
  ['Diamond', [['polygon', { points: '12,3 20.5,12 12,21 3.5,12', ...FILL }]]],
  ['Star', [['polygon', { points: '12,3.5 14.6,9.2 20.6,9.6 16,13.6 17.4,19.6 12,16.4 6.6,19.6 8,13.6 3.4,9.6 9.4,9.2', ...FILL }]]],
  ['Ring', [['circle', { cx: 12, cy: 12, r: 7, ...LINE, 'stroke-width': 3.4 }]]],
  ['Plus', [['path', { d: 'M12 5v14M5 12h14', ...LINE, 'stroke-width': 3.6 }]]],
  ['Drop', [['path', { d: 'M12 3.5c3.8 4.6 6 8 6 10.8a6 6 0 0 1-12 0c0-2.8 2.2-6.2 6-10.8z', ...FILL }]]],
  ['Moon', [['path', { d: 'M15.5 4.2a8 8 0 1 0 4.6 12.9A6.6 6.6 0 0 1 15.5 4.2z', ...FILL }]]],
  ['Sun', [['circle', { cx: 12, cy: 12, r: 4, ...FILL }], ['path', { d: 'M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6', ...LINE, 'stroke-width': 2.2 }]]],
  ['Wave', [['path', { d: 'M3.5 12c2.8-4 5.7-4 8.5 0s5.7 4 8.5 0', ...LINE, 'stroke-width': 3 }]]],
  ['Heart', [['path', { d: 'M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6z', ...FILL }]]],
  ['Spark', [['path', { d: 'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z', ...FILL }]]],
  ['Tiles', [['rect', { x: 5, y: 5, width: 6, height: 6, rx: 1.5, ...FILL }], ['rect', { x: 13, y: 5, width: 6, height: 6, rx: 1.5, ...FILL }], ['rect', { x: 5, y: 13, width: 6, height: 6, rx: 1.5, ...FILL }], ['rect', { x: 13, y: 13, width: 6, height: 6, rx: 1.5, ...FILL }]]],
  ['Steps', [['rect', { x: 4.5, y: 13, width: 4, height: 6.5, rx: 1.2, ...FILL }], ['rect', { x: 10, y: 9, width: 4, height: 10.5, rx: 1.2, ...FILL }], ['rect', { x: 15.5, y: 4.5, width: 4, height: 15, rx: 1.2, ...FILL }]]],
  ['Arrow', [['path', { d: 'M12 19V5.5M6 11.5l6-6 6 6', ...LINE, 'stroke-width': 3 }]]],
  ['Pentagon', [['polygon', { points: '12,3.5 20.2,9.5 17.1,19.2 6.9,19.2 3.8,9.5', ...FILL }]]],
];

function glyph(iconId) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' })) {
    svg.setAttribute(k, String(v));
  }
  for (const [tag, attrs] of (GLYPHS[iconId] || GLYPHS[7])[1]) {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) part.setAttribute(k, String(v));
    svg.append(part);
  }
  return svg;
}

// Plain-language notes on a coin design (BRIEF §2 lenses). Used before launch (Create) and after (Lab).
// tone: 'good' | 'risk' | 'info'. Only knobs the tier can see are explained.
export function designNotes({ supply, price0, allocation, hype, lpLocked, vesting, bigInsiders }, tier) {
  const notes = [{ tone: 'info', text: `${coinAmount(supply)} coins, so each starts at ${price(price0)}. Make more and each one is worth less.` }];
  if (tier === 'explorer') {
    notes.push({ tone: 'good', text: `You keep ${allocation.you}% and buyers get ${allocation.public}%. There’s no team, so nobody sells a big pile of your coin.` });
  } else {
    const insiders = allocation.you + allocation.team;
    notes.push(
      bigInsiders
        ? { tone: 'risk', text: `You and your team keep ${insiders}%. Buyers worry big holders will sell, so fewer of them buy.` }
        : { tone: 'good', text: `You and your team keep ${insiders}%, which buyers see as fair.` },
    );
    if (allocation.team > 0) notes.push({ tone: 'risk', text: `Your team’s ${allocation.team}% unlocks over a minute, and they sell half of it.` });
    if (hype >= 0.7) notes.push({ tone: 'risk', text: 'A loud launch brings a rush of buyers, but hype fades fast.' });
    else if (hype <= 0.3) notes.push({ tone: 'info', text: 'A quiet launch: fewer buyers at first, and a smaller drop later.' });
    else notes.push({ tone: 'info', text: 'Some launch buzz: a few early buyers, then the hype fades.' });
  }
  if (tier === 'builder') {
    notes.push(
      lpLocked
        ? { tone: 'good', text: 'Your pool is locked, so buyers know its money can’t be pulled out.' }
        : { tone: 'risk', text: 'Your pool isn’t locked. Scammers can copy your coin and trick your buyers.' },
    );
    if (allocation.you > 0) {
      notes.push(
        vesting
          ? { tone: 'good', text: 'Your own coins unlock slowly, so buyers trust you more.' }
          : { tone: 'risk', text: 'Your own coins aren’t vesting, so buyers worry you might sell.' },
      );
    }
  }
  return notes;
}

// Builder tier (J9): a read-only, plain-language view of the rules the player's coin launched with.
// tone per row as in designNotes: 'good' | 'risk' | 'info'.
export function contractView(coin, { fee, teamVestDays }) {
  const L = coin.launch;
  const a = L.allocation;
  const share = (pct) => coinAmount((L.supply * pct) / 100);
  const rows = [
    ['maxSupply', `${coinAmount(L.supply)} coins`, 'Fixed. There is no mint function, so no one can make more coins later.', 'good'],
    ['split', `You ${a.you}% · Team ${a.team}% · Public ${a.public}%`, 'Who got the coins at launch.', 'info'],
    a.team > 0 && ['teamUnlock', `${share(a.team)} over ${teamVestDays} market days`, 'Team coins unlock bit by bit over about a minute of play, so they can’t all be sold on day one.', 'info'],
    a.you > 0 && ['yourVesting', L.vesting ? 'yes' : 'no', L.vesting ? 'Your own coins unlock slowly too.' : 'Your coins are free at once, so buyers worry you might sell.', L.vesting ? 'good' : 'risk'],
    ['poolLocked', L.lpLocked ? 'yes' : 'no', L.lpLocked ? 'The pool’s money is locked, so no one can pull it out.' : 'Not locked: whoever holds the pool could pull its money out (a rug pull).', L.lpLocked ? 'good' : 'risk'],
    ['tradeFee', `${number(fee * 100, 1)}% of each trade`, 'It stays in the pool, so the pool slowly grows.', 'info'],
    ['ownerPowers', L.lpLocked ? 'none' : 'withdrawPool()', L.lpLocked ? 'No mint, no pause, no upgrade. Some real contracts let the owner change the rules later; yours can’t.' : 'The pool can be emptied. This is the line to check before you buy any coin.', L.lpLocked ? 'good' : 'risk'],
  ].filter(Boolean);
  return h('details', { class: 'contract' }, [
    h('summary', { class: 'contract__summary' }, [icon('blocks', { size: 20 }), `Read ${coin.ticker}’s smart contract`]),
    h('p', { class: 'contract__intro', text: `A smart contract is code on the blockchain that sets a coin’s rules. Anyone can read it before they buy. This is a simple, read-only view of ${coin.name}’s. Nobody can edit it now, not even you.` }),
    h('dl', { class: 'contract__rows' }, rows.map(([key, value, plain, tone]) =>
      h('div', { class: `contract__row is-${tone}` }, [
        h('dt', { class: 'contract__key' }, [h('code', { text: key })]),
        h('dd', { class: 'contract__val' }, [h('span', { class: 'contract__value', text: value }), h('span', { class: 'contract__plain', text: plain })]),
      ]),
    )),
    h('p', { class: 'contract__tip', text: 'Before you buy any coin, check three things: can more coins be made, is the pool locked, and who holds the most?' }),
  ]);
}

export function notesList(notes) {
  return h(
    'ul',
    { class: 'design-notes' },
    notes.map((n) =>
      h('li', { class: `design-notes__item is-${n.tone}` }, [
        icon(n.tone === 'good' ? 'check' : n.tone === 'risk' ? 'alert' : 'compass', { size: 18 }),
        h('span', { text: n.text }),
      ]),
    ),
  );
}

// A coin's icon on its colour. Decorative: the ticker always sits next to it.
export function coinBadge(c, colors) {
  return h('span', { class: `coin-badge coin--${colors[c.colorId] || 'mint'}`, 'aria-hidden': 'true' }, [glyph(c.iconId)]);
}

// Shown only if public/data/events.json is missing an event (Penny's reviewed lines live there).
const FALLBACK_EVENTS = {
  hype_wave: {
    headline: 'ZOOMZ is trending',
    narration: 'Everyone is suddenly talking about ZOOMZ and buyers are rushing in. Prices pushed up by hype can climb fast, and they can fall just as fast when the excitement fades.',
  },
  halving: {
    headline: 'The VAULT halving',
    narration: 'From today, half as many new VAULT coins are made. Less new supply means miners have fewer coins to sell.',
  },
  unlock: {
    headline: 'ORBIT coins unlocked',
    narration: 'A big batch of ORBIT that the team and early investors were holding has just unlocked. Some of them are selling, so there are more coins for sale.',
  },
  whale_dump: {
    headline: 'A whale sold VAULT',
    narration: 'One giant holder just sold a huge pile of VAULT at once, and the price dropped fast. Calm traders ask one question first: did anything about VAULT really change?',
  },
  rug_pull: {
    headline: 'BLOOP was rug pulled',
    narration: 'BLOOP’s creator pulled the money out of its pool and sold their coins. The price crashed and holders can’t get their money back. The warning signs were there: one creator holding most coins, and a pool that wasn’t locked.',
  },
  depeg_scare: {
    headline: 'PEG slipped below L$1',
    narration: 'Scared holders sold PEG all at once, so it dipped under L$1.00. Traders who can swap PEG back for L$1 buy the cheap coins, and that pulls the price back up.',
  },
  copycat: {
    headline: 'A copycat of your coin appeared',
    narration: 'Someone listed a look-alike of your coin with “Official” in its name. Your pool isn’t locked, so buyers can’t easily tell which coin is safe. Before you buy any coin, check its name, who holds most of it, and whether its pool is locked.',
  },
  copycat_rug: {
    headline: 'The copycat was rug pulled',
    narration: 'The look-alike’s creator pulled the money out of its pool. Everyone who bought the copycat lost their money. Your real coin is still trading.',
  },
  wash_volume: {
    headline: 'Most of FUEL’s volume is fake',
    narration: 'See the amber bars? A wash-trading bot buys FUEL and sells it straight back to itself, so the volume looks huge while the price barely moves. Real demand means many different buyers, not one bot trading with itself.',
  },
};

const CHART_CREDIT = 'https://www.tradingview.com/';

// Pool depth chart (J9): steps from -30% to +30% around today's price.
const DEPTH_STEPS = Array.from({ length: 31 }, (_, i) => (i - 15) * 2);
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// ⓘ explainers (BRIEF §14): what a tool shows and what it can't tell you. One text panel per card.
const explainer = (id) => ({ el: h('p', { class: 'tool-explainer', id, hidden: true }), owners: [] });
function infoButton(label, text, panel) {
  const btn = h('button', { class: 'info-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': panel.el.id, title: `About ${label}` }, [
    h('span', { 'aria-hidden': 'true', text: 'i' }),
    h('span', { class: 'visually-hidden', text: `About ${label}` }),
  ]);
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    for (const other of panel.owners) other.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-expanded', String(open));
    panel.el.hidden = !open;
    panel.el.textContent = open ? text : '';
  });
  panel.owners.push(btn);
  return btn;
}

const INFO = {
  volume: 'Volume bars show how much was traded in each 6-hour bar. Tall bars mean busy trading. They can’t tell you whether buyers or sellers were in charge, or whether the trading was real.',
  sma: 'The blue line is the average price of the last 7 bars and the pink line of the last 25, so the noise is smoothed out. When the short line crosses the long one, the trend may be changing. Averages always lag behind the price, so they can’t predict the next move.',
  rsi: 'RSI (0 to 100) shows how strongly the price has moved up or down lately. Above 70 people call it “overbought”, below 30 “oversold”. It can’t tell you what a coin is really worth, and prices can stay above 70 or below 30 for a long time.',
  impact: 'Price impact is how much your own trade moves the price, because the pool has to rebalance. Big trades in small pools move it more. It can’t tell you where the price goes next: other traders move it too.',
  limit: 'A limit order waits for your price: buy only if the price falls to it, or sell only if it rises to it. It saves you watching the screen, but it may never fill if the price never gets there.',
  stop: 'A stop-loss sells automatically if the price falls to your level, to stop a loss from growing. In a sudden drop it can sell lower than your level, and a dip that bounces back may sell you out at the bottom.',
  depth: 'Depth shows how much money it takes to push the price down (selling, left) or up (buying, right). A deep pool barely moves when someone trades; a shallow one swings a lot. It can’t tell you which way the price will go.',
  allocation: 'This shows where your money is now, and how much each coin has gained or lost since you bought it. A gain on paper isn’t money until you sell, and it can’t tell you what happens next.',
};

// Average cost of each holding, from the player's trades (selling keeps the average cost of the rest).
function costBasis(trades) {
  const pos = {};
  for (const tr of trades) {
    const p = (pos[tr.coinId] ??= { coins: 0, cost: 0 });
    if (tr.side === 'buy') {
      p.coins += tr.filledCoins;
      p.cost += tr['filledL$'];
    } else if (p.coins > 0) {
      p.cost *= 1 - Math.min(1, tr.filledCoins / p.coins);
      p.coins = Math.max(0, p.coins - tr.filledCoins);
    }
  }
  return pos;
}
const signedMoney = (n) => `${n > 0 ? '+' : ''}${money(n)}`;

// Motion (BRIEF §10): a short tinted pulse when a number moves a lot, so big moves catch the eye.
// ui.animate already skips under prefers-reduced-motion.
function pulse(el, up) {
  const tint = up ? '24 168 103' : '229 72 77';
  animate(el, [
    { backgroundColor: `rgb(${tint} / 0.22)`, transform: 'scale(1.04)' },
    { backgroundColor: `rgb(${tint} / 0)`, transform: 'scale(1)' },
  ], { duration: 300, fill: 'none' });
}

function loadData(base) {
  dataPromise ??= Promise.all([
    getJSON(`${base}coins.json`),
    getJSON(`${base}agents.json`),
    getJSON(`${base}scenario.json`),
    getJSON(`${base}events.json`).catch(() => null), // optional until slice Y3 writes it
  ])
    .then(([coinsConfig, agentsConfig, scenario, events]) => ({ coinsConfig, agentsConfig, scenario, events }))
    .catch((err) => {
      dataPromise = null;
      throw err;
    });
  return dataPromise;
}

// Coin amounts: whole numbers when large, about four significant digits when tiny.
function coinAmount(n) {
  const abs = Math.abs(n);
  if (abs >= 1000) return number(n, 0);
  if (abs >= 1) return number(n, 2);
  if (abs === 0) return '0';
  return number(n, Math.min(8, 3 - Math.floor(Math.log10(abs))));
}

// Axis labels: the same precision as ui.price(), without the L$ prefix.
function axisPrice(p) {
  const abs = Math.abs(p);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : abs > 0 ? Math.min(10, 3 - Math.floor(Math.log10(abs))) : 2;
  return number(p, digits);
}

const pct = (n) => (Math.abs(n) < 0.1 ? 'less than 0.1%' : `${number(n, 1)}%`);
const signedPct = (n) => `${trend(n).sign}${number(Math.abs(n), 1)}%`;
const clockText = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function newMarket(data, tier, store) {
  const seed = dailySeed();
  const session = createSession({
    seed,
    tier,
    coinsConfig: data.coinsConfig,
    agentsConfig: data.agentsConfig,
    scenario: data.scenario,
  });
  const state = session.getState();
  const market = {
    tier,
    date: bangkokDate(),
    seed,
    data,
    session,
    selected: Object.keys(state.coins)[0],
    side: 'buy',
    userPaused: false,
    quiz: [],
    news: [],
    closed: false,
    ui: null, // hooks from the mounted screen
  };
  session.on('event', (e) => {
    market.news.push(e);
    market.ui?.event(e);
  });
  session.on('close', (final) => {
    market.closed = true;
    const p = final.portfolio;
    // What the report card needs (BRIEF §6). Raw data only: the score is computed there.
    const summary = {
      date: market.date,
      seed,
      tier,
      t: final.t,
      ticks: final.ticks,
      finishedEarly: final.t < final.ticks,
      value: p.value,
      startValue: p.startValue,
      cash: p.cash,
      holdings: Object.fromEntries(
        Object.entries(p.holdings).map(([id, coins]) => [id, { coins, value: coins * (final.coins[id]?.price ?? 0) }]),
      ),
      risk: p.risk,
      history: p.history,
      trades: p.trades.slice(-200),
      created: p.created,
      events: final.events,
      quiz: market.quiz.slice(),
      metrics: runMetrics(final, market.quiz), // read by Learning Path missions (BRIEF §14)
      at: Date.now(),
    };
    store.set((s) => ({ lab: { ...s.lab, [tier]: summary } }));
    market.ui?.closed(final);
  });
  return market;
}

export function mount(root, ctx) {
  const { tier, store, audio, navigate, config } = ctx;
  const tierInfo = config.getTier(tier);
  const cleanup = [];
  let alive = true;

  const view = h('section', { class: 'lab-screen' });
  root.append(view);

  function showLoadError(title, body) {
    view.replaceChildren(
      stateView({
        kind: 'error',
        title,
        body,
        actions: [
          h('button', { class: 'btn btn--primary', type: 'button', onClick: load }, 'Try again'),
          h('button', { class: 'btn', type: 'button', onClick: () => navigate('/') }, 'Back to start'),
        ],
      }),
    );
  }

  function load() {
    view.replaceChildren(stateView({ kind: 'loading', title: 'Opening today’s market…' }));
    loadData(config.DATA_BASE)
      .then((data) => {
        if (!alive) return;
        try {
          start(data);
        } catch (err) {
          // Data loaded but the screen couldn't be built (an old browser, say): say so plainly.
          console.error(err);
          for (const fn of cleanup.splice(0)) fn();
          showLoadError('The market couldn’t be drawn', 'Something in this browser stopped the chart from loading. Try again, or open the site in an up-to-date browser.');
        }
      })
      .catch((err) => alive && showLoadError('Today’s market didn’t open', err.message));
  }

  function replay() {
    live = null;
    navigate('/lab');
  }

  const reportButton = () =>
    h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onClick: () => navigate('/report') }, [
      'See my report card',
      icon('arrow-right', { size: 22 }),
    ]);
  const replayButton = () => h('button', { class: 'btn btn--block', type: 'button', onClick: replay }, 'Replay today’s market');

  function closedPanel(final) {
    const p = final.portfolio;
    const change = (p.value / p.startValue - 1) * 100;
    return resultPanel({
      mood: 'celebrating',
      title: 'The market has closed',
      text: `You finished with ${money(p.value)}, ${signedPct(change)} from your ${money(p.startValue)} start. Your report card scores how wisely you traded, not just the money.`,
      actions: [reportButton(), replayButton()],
    });
  }

  function start(data) {
    const today = bangkokDate();
    if (!live || live.tier !== tier || (live.closed && live.date !== today)) live = newMarket(data, tier, store);
    const market = live;
    const { session } = market;
    const { scenario } = data;

    const head = h('div', { class: 'screen-head lab-head' }, [
      h('p', { class: 'screen-eyebrow', text: `${tierInfo.name} · Ages ${tierInfo.ages}` }),
      h('h1', { class: 'screen-title', text: 'Today’s market' }),
    ]);
    const modeButtons = [false, true].map((adv) =>
      h('button', { class: 'segmented__btn', type: 'button', onClick: () => setMode(adv) }, adv ? 'Advanced' : 'Basic'),
    );
    const modeToggle = h('div', { class: 'segmented lab-mode', role: 'group', 'aria-label': 'Lab view' }, modeButtons);

    if (market.closed) {
      view.replaceChildren(h('div', { class: 'screen' }, [head, closedPanel(session.getState())]));
      return;
    }

    // ---- clock: day, time left, pause and finish ----------------------------------------
    let timer = 0;
    const pauses = new Set(); // 'user' | 'event' | 'hidden' | 'closed'

    // Basic / Advanced (BRIEF §3): desktop only. Advanced never renders below 1024 px, whatever was saved.
    const wide = matchMedia('(min-width: 1024px)');
    if (market.advanced === undefined) market.advanced = store.get().labAdvanced === true;
    const advancedOn = () => market.advanced && wide.matches;
    if (market.userPaused) pauses.add('user');
    const dayText = h('p', { class: 'lab-clock__day' });
    const leftText = h('p', { class: 'lab-clock__left' });
    const fill = h('span', { class: 'lab-clock__fill' });
    const bar = h('div', { class: 'lab-clock__bar', role: 'progressbar', 'aria-label': 'Market day', 'aria-valuemin': 1 }, [fill]);
    const pauseBtn = h('button', { class: 'btn btn--sm', type: 'button', onClick: togglePause });
    const finishBtn = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: () => askFinish(true) }, 'Finish now');
    const confirm = h('div', { class: 'lab-confirm', hidden: true }, [
      h('p', { class: 'lab-confirm__text', text: 'Close the market now and see your report card?' }),
      h('div', { class: 'lab-confirm__actions' }, [
        h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: () => session.finish() }, 'Finish'),
        h('button', { class: 'btn btn--sm', type: 'button', onClick: () => askFinish(false) }, 'Keep trading'),
      ]),
    ]);
    const coachBtn = h('button', { class: 'btn btn--sm', type: 'button', onClick: () => openCoachMenu(coachEnv) }, 'Coach');
    const actions = h('div', { class: 'lab-clock__actions' }, [pauseBtn, coachBtn, finishBtn]);
    const clock = h('div', { class: 'card lab-clock' }, [
      h('div', { class: 'lab-clock__row' }, [dayText, leftText]),
      bar,
      actions,
      confirm,
    ]);

    function togglePause() {
      market.userPaused = !market.userPaused;
      if (market.userPaused) pauses.add('user');
      else pauses.delete('user');
      announce(market.userPaused ? 'Market paused.' : 'Market running.');
      renderClock(session.getState());
    }

    function askFinish(open) {
      confirm.hidden = !open;
      actions.hidden = open;
      if (open) confirm.querySelector('.btn--primary').focus();
      else finishBtn.focus();
    }

    function renderClock(st) {
      const days = st.ticks / st.ticksPerDay;
      dayText.textContent = `Day ${st.day} of ${days}`;
      const secondsLeft = ((st.ticks - st.t) * st.tickMs) / 1000;
      leftText.textContent = pauses.has('user') ? 'Paused' : `${clockText(secondsLeft)} left`;
      fill.style.setProperty('--p', String(st.t / st.ticks));
      bar.setAttribute('aria-valuemax', String(days));
      bar.setAttribute('aria-valuenow', String(st.day));
      bar.setAttribute('aria-valuetext', `Day ${st.day} of ${days}, ${clockText(secondsLeft)} left`);
      const paused = pauses.has('user');
      pauseBtn.replaceChildren(paused ? 'Resume' : 'Pause');
      pauseBtn.setAttribute('aria-pressed', String(paused));
    }

    // ---- coin list -------------------------------------------------------------------------
    const coinList = h('div', { class: 'lab-coins__list', role: 'group', 'aria-label': 'Coins' });
    const coinsCard = h('div', { class: 'card lab-coins' }, [h('h2', { class: 'lab-card__title', text: 'Coins' }), coinList]);
    const rows = new Map();

    const badge = (c) => coinBadge(c, config.COIN_COLORS);

    function dayChange(c, st) {
      const perDay = st.ticksPerDay / scenario.candleTicks;
      const ks = c.candles;
      const ref = ks.length > perDay ? ks[ks.length - 1 - perDay].close : ks[0].open;
      return ref > 0 ? (c.price / ref - 1) * 100 : 0;
    }

    function renderCoins(st) {
      for (const c of Object.values(st.coins)) {
        let row = rows.get(c.id);
        if (!row) {
          const priceEl = h('span', { class: 'coin-row__price' });
          const changeEl = h('span', { class: 'coin-row__change' });
          const el = h('button', { class: 'coin-row', type: 'button', onClick: () => select(c.id) }, [
            badge(c),
            h('span', { class: 'coin-row__name' }, [
              h('span', { class: 'coin-row__ticker', text: c.ticker }),
              c.user ? h('span', { class: 'chip chip--mine', text: 'Yours' }) : h('span', { class: 'coin-row__full', text: c.name }),
            ]),
            h('span', { class: 'coin-row__meta' }, [priceEl, changeEl]),
          ]);
          row = { el, priceEl, changeEl };
          rows.set(c.id, row);
          coinList.append(el);
        }
        row.el.setAttribute('aria-pressed', String(c.id === market.selected));
        row.priceEl.textContent = price(c.price);
        if (row.mark == null) row.mark = c.price;
        else if (Math.abs(c.price / row.mark - 1) >= 0.03) {
          pulse(row.priceEl, c.price > row.mark);
          row.mark = c.price;
        }
        row.changeEl.replaceChildren(delta(dayChange(c, st)));
      }
    }

    function select(id) {
      market.selected = id;
      tradeInput.value = '';
      delete tradeInput.dataset.exact;
      clearMessages();
      render();
    }

    // ---- chart -------------------------------------------------------------------------------
    const chartBox = h('div', { class: 'lab-chart__canvas' });
    const chartTitle = h('h2', { class: 'lab-chart__title' });
    const chartPrice = h('p', { class: 'lab-chart__price' });
    const chartChips = h('div', { class: 'lab-chart__chips' });
    const chartBadge = h('span', { class: 'lab-chart__badge' });
    // Chart tools (BRIEF §14): volume for all, SMA 7/25 from 13, RSI 14 from 16 or in desktop Advanced.
    // A tool is on by default when the tier has it; chips switch them, and each has an ⓘ explainer.
    const chartInfo = explainer('chart-tool-info');
    const TOOLS = [
      { id: 'volume', label: 'Volume', available: () => true },
      { id: 'sma', label: 'SMA 7 / 25', available: () => tierInfo.rank >= 1 },
      { id: 'rsi', label: 'RSI 14', available: () => tierInfo.rank >= 2 || advancedOn() },
    ];
    market.tools ??= {};
    const toolOn = (t) => t.available() && market.tools[t.id] !== false;
    const toolEls = new Map();
    const toolsRow = h('div', { class: 'chart-tools', role: 'group', 'aria-label': 'Chart tools' });
    for (const t of TOOLS) {
      const chip = h('button', {
        class: 'chip-toggle',
        type: 'button',
        onClick: () => {
          market.tools[t.id] = !toolOn(t);
          renderChart(session.getState());
        },
      }, t.label);
      const wrap = h('span', { class: 'chart-tool', dataset: { tool: t.id } }, [chip, infoButton(t.label, INFO[t.id], chartInfo)]);
      toolEls.set(t.id, { wrap, chip });
      toolsRow.append(wrap);
    }
    const washLegend = h('p', { class: 'lab-chart__legend', hidden: true }, [
      h('span', { class: 'legend-key legend-key--real', 'aria-hidden': 'true' }),
      'Real volume',
      h('span', { class: 'legend-key legend-key--wash', 'aria-hidden': 'true' }),
      'Wash volume (a bot trading with itself)',
    ]);
    const chartCard = h('div', { class: 'card lab-chart' }, [
      h('div', { class: 'lab-chart__head' }, [chartBadge, h('div', { class: 'lab-chart__label' }, [chartTitle, chartChips]), chartPrice]),
      chartBox,
      toolsRow,
      chartInfo.el,
      washLegend,
      h('p', { class: 'lab-chart__credit' }, [
        'Chart by ',
        h('a', { href: CHART_CREDIT, target: '_blank', rel: 'noopener noreferrer', text: 'TradingView Lightweight Charts™' }),
      ]),
    ]);

    const css = getComputedStyle(document.documentElement);
    const token = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const up = token('--gain-500', '#18A867');
    const down = token('--loss-500', '#E5484D');
    const fade = (hex) => {
      const n = parseInt(hex.slice(1, 7), 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.35)`; // volume bars
    };
    const secondsPerTick = 86400 / scenario.ticksPerDay;
    const toTime = (t) => (t + scenario.ticksPerDay) * secondsPerTick; // day 1 starts at 86400
    const dayOf = (time) => Math.floor(time / 86400);

    const chart = createChart(chartBox, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: token('--ink-500', '#5D6B65'),
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        attributionLogo: false, // the logo needs inline styles the CSP blocks; the credit link above the fold replaces it
      },
      grid: { vertLines: { color: token('--line-soft', '#EAEFEC') }, horzLines: { color: token('--line-soft', '#EAEFEC') } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.26 } },
      timeScale: {
        borderVisible: false,
        rightOffset: 2,
        barSpacing: 7,
        shiftVisibleRangeOnNewBar: false, // keepInView() decides
        tickMarkFormatter: (time) => (time % 86400 === 0 ? `Day ${dayOf(time)}` : ''),
      },
      localization: {
        timeFormatter: (time) => `Day ${dayOf(time)}, ${String(Math.floor((time % 86400) / 3600)).padStart(2, '0')}:00`,
        priceFormatter: axisPrice,
      },
      handleScroll: { vertTouchDrag: false },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
      priceFormat: { type: 'custom', formatter: axisPrice, minMove: 1e-10 },
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: '',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    cleanup.push(() => chart.remove());

    const toBar = (k) => ({ time: toTime(k.t), open: k.open, high: k.high, low: k.low, close: k.close });
    const toVolume = (k) => ({ time: toTime(k.t), value: k.volume, color: fade(k.close >= k.open ? up : down) });
    let chartCoin = null;
    let chartCount = 0;
    const priceMark = { coin: null, price: 0 };
    const sessionCandles = scenario.ticks / scenario.candleTicks;

    // Candles fill a fixed window from the left (about 6 px each, the whole month on wide screens);
    // once it is full, the newest candle stays in view.
    function keepInView(count) {
      const span = Math.max(40, Math.min(sessionCandles, Math.floor(chartBox.clientWidth / 6)));
      if (count <= span) chart.timeScale().setVisibleLogicalRange({ from: -1.5, to: span - 1.5 });
      else chart.timeScale().scrollToRealTime();
    }

    // Builder, Advanced: wash volume drawn over the total, so the fake share of each bar shows.
    const amber = token('--amber-500', '#F5A524');
    const toWash = (k) => ({ time: toTime(k.t), value: k.washVolume, color: amber });
    let washSeries = null;

    const blue = token('--pal-blue', '#3F5FDB');
    const pink = token('--pal-magenta', '#B0399F');
    const ink = token('--ink-700', '#34443D');
    const lineOpts = (color, width) => ({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    let smaFast = null;
    let smaSlow = null;
    let rsiLine = null;
    let toolsFresh = true;

    // Add or remove indicator series so the chart matches the chips. Returns true when one was added.
    function syncTools() {
      let added = false;
      for (const t of TOOLS) {
        const el = toolEls.get(t.id);
        el.wrap.hidden = !t.available();
        el.chip.setAttribute('aria-pressed', String(toolOn(t)));
      }
      const [vol, avg, osc] = TOOLS.map(toolOn);
      volumeSeries.applyOptions({ visible: vol });
      if (avg && !smaFast) {
        smaFast = chart.addSeries(LineSeries, lineOpts(blue, 2));
        smaSlow = chart.addSeries(LineSeries, lineOpts(pink, 2));
        added = true;
      } else if (!avg && smaFast) {
        chart.removeSeries(smaFast);
        chart.removeSeries(smaSlow);
        smaFast = null;
        smaSlow = null;
      }
      if (osc && !rsiLine) {
        rsiLine = chart.addSeries(LineSeries, {
          ...lineOpts(ink, 2),
          lastValueVisible: true,
          priceFormat: { type: 'custom', formatter: (v) => String(Math.round(v)), minMove: 1 }, // RSI is a 0 to 100 score
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        }, 1);
        rsiLine.createPriceLine({ price: 70, color: down, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
        rsiLine.createPriceLine({ price: 30, color: up, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
        // Its own margins (the price pane's would push the 0 to 100 scale below zero), a quarter of the height.
        rsiLine.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });
        chartBox.classList.add('has-rsi');
        chart.panes()[0]?.setStretchFactor(3);
        chart.panes()[1]?.setStretchFactor(1);
        added = true;
      } else if (!osc && rsiLine) {
        chart.removeSeries(rsiLine);
        rsiLine = null;
        if (chart.panes().length > 1) chart.removePane(1);
        chartBox.classList.remove('has-rsi');
      }
      return added;
    }

    function renderTools(ks, full, from) {
      if (!smaFast && !rsiLine) return;
      const closes = ks.map((k) => k.close);
      const point = (vals, i) => (vals[i] == null ? { time: toTime(ks[i].t) } : { time: toTime(ks[i].t), value: vals[i] });
      const sets = [];
      if (smaFast) sets.push([smaFast, sma(closes, 7)], [smaSlow, sma(closes, 25)]);
      if (rsiLine) sets.push([rsiLine, rsi(closes, 14)]);
      for (const [series, vals] of sets) {
        if (full) series.setData(vals.map((_, i) => point(vals, i)));
        else for (let i = from; i < ks.length; i++) series.update(point(vals, i));
      }
    }

    function renderChart(st) {
      const c = st.coins[market.selected];
      const ks = c.candles;
      if (syncTools()) toolsFresh = true;
      const washOn = advancedOn() && tier === 'builder' && c.totalWashVolume > 0 && toolOn(TOOLS[0]);
      if (washOn && !washSeries) {
        washSeries = chart.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
        washSeries.setData(ks.map(toWash));
      } else if (!washOn && washSeries) {
        chart.removeSeries(washSeries);
        washSeries = null;
      }
      washLegend.hidden = !washOn;
      if (chartCoin !== c.id) {
        candleSeries.setData(ks.map(toBar));
        volumeSeries.setData(ks.map(toVolume));
        washSeries?.setData(ks.map(toWash));
        keepInView(ks.length);
        requestAnimationFrame(() => alive && keepInView(chartCount)); // again once the chart has its size
        renderTools(ks, true, 0);
        toolsFresh = false;
        chartCoin = c.id;
        chartBadge.replaceChildren(badge(c));
        chartTitle.textContent = `${c.name} (${c.ticker})`;
      } else {
        for (let i = Math.max(0, chartCount - 1); i < ks.length; i++) {
          candleSeries.update(toBar(ks[i]));
          volumeSeries.update(toVolume(ks[i]));
          washSeries?.update(toWash(ks[i]));
        }
        if (ks.length !== chartCount) keepInView(ks.length);
        renderTools(ks, toolsFresh, Math.max(0, chartCount - 1));
        toolsFresh = false;
      }
      chartCount = ks.length;
      const valueEl = h('span', { class: 'lab-chart__value', text: price(c.price) });
      chartPrice.replaceChildren(valueEl, delta(dayChange(c, st)));
      // Pulse the big price on a sharp move (1% or more since the last pulse on this coin).
      if (priceMark.coin !== c.id) Object.assign(priceMark, { coin: c.id, price: c.price });
      else if (Math.abs(c.price / priceMark.price - 1) >= 0.01) {
        pulse(valueEl, c.price > priceMark.price);
        priceMark.price = c.price;
      }
      const chips = [];
      if (c.rugged) chips.push(h('span', { class: 'chip chip--loss', text: 'Rug pulled' }));
      else if (c.phase === 'curve') chips.push(h('span', { class: 'chip', text: `Bonding curve ${Math.round(c.curveProgress * 100)}% to launch` }));
      if (c.class === 'stablecoin') chips.push(h('span', { class: 'chip', text: 'Aims for L$1.00' }));
      if (!c.lpLocked && !c.rugged) chips.push(h('span', { class: 'chip chip--warn', text: 'Pool not locked' }));
      if (c.maxSupply) chips.push(h('span', { class: 'chip', text: `Supply ${coinAmount(c.supply)} of ${coinAmount(c.maxSupply)}` }));
      else chips.push(h('span', { class: 'chip', text: `Supply ${coinAmount(c.supply)}` }));
      chartChips.replaceChildren(...chips);
    }

    // ---- trade panel -------------------------------------------------------------------------
    const sideButtons = ['buy', 'sell'].map((side) =>
      h('button', { class: 'segmented__btn', type: 'button', onClick: () => setSide(side) }, side === 'buy' ? 'Buy' : 'Sell'),
    );
    // Limit and stop-loss orders (J9), from age 13. Market mode is the plain trade above.
    market.orderType ??= 'market';
    const ordersOn = tierInfo.rank >= 1;
    const orderInfo = explainer('order-info');
    const orderTypeBtns = [['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop-loss']].map(([id, label]) =>
      h('button', { class: 'segmented__btn', type: 'button', onClick: () => setOrderType(id) }, label),
    );
    const orderInfoBtn = h('span', { class: 'trade__order-info' });
    const orderTypeRow = ordersOn
      ? h('div', { class: 'trade__order-type' }, [h('div', { class: 'segmented', role: 'group', 'aria-label': 'Order type' }, orderTypeBtns), orderInfoBtn])
      : null;
    const triggerInput = h('input', { id: 'trade-trigger', class: 'trade__input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0' });
    const triggerLabel = h('label', { class: 'trade__label', for: 'trade-trigger' });
    const triggerField = h('div', { class: 'trade__trigger', hidden: true }, [triggerLabel, h('div', { class: 'trade__field' }, [triggerInput, h('span', { class: 'trade__unit', 'aria-hidden': 'true', text: 'L$' })])]);
    triggerInput.addEventListener('input', () => {
      clearMessages();
      renderTrade(session.getState());
    });
    const ordersList = h('div', { class: 'trade__orders' });

    function setOrderInfo(id) {
      orderInfo.el.hidden = true;
      orderInfo.owners.length = 0;
      orderInfoBtn.replaceChildren(id === 'market' ? '' : infoButton(id === 'limit' ? 'limit orders' : 'stop-loss orders', INFO[id === 'limit' ? 'limit' : 'stop'], orderInfo));
    }
    function setOrderType(id) {
      market.orderType = id;
      if (id === 'stop') market.side = 'sell';
      triggerInput.value = '';
      clearMessages();
      setOrderInfo(id);
      renderTrade(session.getState());
    }
    if (ordersOn) setOrderInfo(market.orderType);

    const tradeInput = h('input', {
      id: 'trade-amount',
      class: 'trade__input',
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: '0',
    });
    const tradeLabel = h('label', { class: 'trade__label', for: 'trade-amount' });
    const tradeUnit = h('span', { class: 'trade__unit', 'aria-hidden': 'true' });
    const quick = [0.25, 0.5, 1].map((share) =>
      h('button', { class: 'btn btn--sm trade__quick-btn', type: 'button', onClick: () => pick(share) }, share === 1 ? 'Max' : `${share * 100}%`),
    );
    const preview = h('p', { class: 'trade__preview', id: 'trade-preview' });
    const errorEl = h('p', { class: 'trade__error', role: 'alert', hidden: true });
    const doneEl = h('p', { class: 'trade__done', role: 'status', hidden: true });
    const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' });
    const tradeTitle = h('h2', { class: 'lab-card__title' });
    const sideGroup = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Buy or sell' }, sideButtons);
    const form = h('form', { class: 'trade', novalidate: true, onSubmit: trade }, [
      orderTypeRow,
      orderInfo.el,
      sideGroup,
      tradeLabel,
      h('div', { class: 'trade__field' }, [tradeInput, tradeUnit]),
      h('div', { class: 'trade__quick' }, quick),
      triggerField,
      preview,
      errorEl,
      submit,
      doneEl,
    ]);
    tradeInput.setAttribute('aria-describedby', 'trade-preview');
    const ownNote = h('p', { class: 'lab-trade__own', hidden: true });
    const impactInfo = explainer('impact-info');

    // Pool depth (J9), from age 13: how much L$ it takes to move the selected coin's price.
    const depthInfo = explainer('depth-info');
    const depthDown = svgEl('path', { class: 'depth__down' });
    const depthUp = svgEl('path', { class: 'depth__up' });
    const depthSvg = svgEl('svg', { class: 'depth__chart', viewBox: '0 0 300 120', preserveAspectRatio: 'none', role: 'img' });
    depthSvg.append(depthDown, depthUp, svgEl('line', { class: 'depth__now', x1: 150, x2: 150, y1: 0, y2: 120 }));
    const depthText = h('p', { class: 'depth__text' });
    const depthBox = ordersOn
      ? h('details', { class: 'depth', onToggle: () => renderDepth(session.getState()) }, [
        h('summary', { class: 'depth__summary', text: 'How deep is the pool?' }),
        h('div', { class: 'depth__body' }, [
          h('div', { class: 'depth__head' }, [
            h('p', { class: 'depth__lead', text: 'Money it takes to push the price' }),
            infoButton('pool depth', INFO.depth, depthInfo),
          ]),
          depthInfo.el,
          depthSvg,
          h('div', { class: 'depth__axis', 'aria-hidden': 'true' }, [h('span', { text: '−30%' }), h('span', { text: 'now' }), h('span', { text: '+30%' })]),
          depthText,
        ]),
      ])
      : null;
    const tradeCard = h('div', { class: 'card lab-trade' }, [
      h('div', { class: 'card-head' }, [tradeTitle, infoButton('price impact', INFO.impact, impactInfo)]),
      impactInfo.el,
      form,
      ordersList,
      ownNote,
      depthBox,
    ]);

    tradeInput.addEventListener('input', () => {
      delete tradeInput.dataset.exact;
      clearMessages();
      renderTrade(session.getState());
    });

    function clearMessages() {
      errorEl.hidden = true;
      doneEl.hidden = true;
    }

    function setSide(side) {
      market.side = side;
      tradeInput.value = '';
      delete tradeInput.dataset.exact;
      clearMessages();
      renderTrade(session.getState());
    }

    function amount() {
      if (tradeInput.dataset.exact) return Number(tradeInput.dataset.exact);
      const text = tradeInput.value.trim();
      return text === '' ? null : Number(text.replace(/[,\s]/g, ''));
    }

    function pick(share) {
      const st = session.getState();
      const id = market.selected;
      const exact = market.side === 'buy' ? st.portfolio.cash * share : (st.portfolio.holdings[id] ?? 0) * share;
      if (!(exact > 0)) return;
      const shown = market.side === 'buy' ? Math.floor(exact * 100) / 100 : exact;
      tradeInput.value = market.side === 'buy' ? shown.toFixed(2) : String(Number(shown.toPrecision(8)));
      if (share === 1) tradeInput.dataset.exact = String(exact);
      else delete tradeInput.dataset.exact;
      clearMessages();
      renderTrade(st);
    }

    function renderTrade(st) {
      const c = st.coins[market.selected];
      const buying = market.side === 'buy';
      const held = st.portfolio.holdings[c.id] ?? 0;
      sideButtons[0].setAttribute('aria-pressed', String(buying));
      sideButtons[1].setAttribute('aria-pressed', String(!buying));
      tradeTitle.textContent = `Trade ${c.ticker}`;
      renderOrders(st);
      // Creators watch their own coin but never trade it (no pump and dump on buyers).
      form.hidden = c.user;
      ownNote.hidden = !c.user;
      if (c.user) {
        ownNote.textContent = `You launched ${c.ticker}. Creators can watch their coin but not trade it, so it stays fair for everyone who buys it.`;
        return;
      }
      tradeLabel.textContent = buying ? 'How many L$ to spend' : `How many ${c.ticker} to sell`;
      tradeUnit.textContent = buying ? 'L$' : c.ticker;
      submit.replaceChildren(`${buying ? 'Buy' : 'Sell'} ${c.ticker}`);
      const mode = ordersOn ? market.orderType : 'market';
      orderTypeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['market', 'limit', 'stop'][i] === mode)));
      sideGroup.hidden = mode === 'stop';
      triggerField.hidden = mode === 'market';
      if (mode !== 'market') return renderOrderPreview(st, c, mode, held);

      const amt = amount();
      let ok = false;
      if (amt == null) {
        preview.textContent = buying
          ? `You have ${money(st.portfolio.cash)} to spend.`
          : held > 0
            ? `You own ${coinAmount(held)} ${c.ticker}, worth about ${money(held * c.price)}.`
            : `You don’t own any ${c.ticker} yet. Switch to Buy first.`;
      } else {
        const q = session.quote(c.id, market.side, amt);
        if (!q.ok) {
          preview.textContent = q.error.message;
        } else {
          ok = true;
          const moves = q.priceImpactPct < 0.1 ? 'barely moves the price (less than 0.1%)' : `moves the price about ${number(q.priceImpactPct, 1)}%`;
          preview.textContent = buying
            ? `Buying ${money(q.filledL$)} ${moves}. You get about ${coinAmount(q.filledCoins)} ${c.ticker}.`
            : `Selling ${coinAmount(q.filledCoins)} ${c.ticker} ${moves}. You get about ${money(q.filledL$)}.`;
        }
      }
      preview.classList.toggle('is-problem', amt != null && !ok);
      submit.disabled = !ok;
      for (const b of quick) b.disabled = buying ? !(st.portfolio.cash > 0.01) : !(held > 0);
    }

    function trade(event) {
      event.preventDefault();
      const amt = amount();
      if (amt == null) return;
      const c = session.getState().coins[market.selected];
      if (ordersOn && market.orderType !== 'market') {
        const type = market.orderType === 'stop' ? 'stop-loss' : market.side === 'buy' ? 'limit-buy' : 'limit-sell';
        const r = session.placeOrder({ coinId: c.id, type, price: triggerPrice(), amount: amt });
        if (!r.ok) {
          errorEl.textContent = r.error.message;
          errorEl.hidden = false;
          doneEl.hidden = true;
          return;
        }
        tradeInput.value = '';
        triggerInput.value = '';
        delete tradeInput.dataset.exact;
        errorEl.hidden = true;
        doneEl.textContent = 'Order placed. It runs by itself while the market is open.';
        doneEl.hidden = false;
        render();
        return;
      }
      const r = session.swap(c.id, market.side, amt);
      if (!r.ok) {
        errorEl.textContent = r.error.message;
        errorEl.hidden = false;
        doneEl.hidden = true;
        return;
      }
      const verb = market.side === 'buy' ? 'Bought' : 'Sold';
      const message = `${verb} ${coinAmount(r.filledCoins)} ${c.ticker} for ${money(r.filledL$)}.`;
      tradeInput.value = '';
      delete tradeInput.dataset.exact;
      errorEl.hidden = true;
      doneEl.textContent = message;
      doneEl.hidden = false;
      animate(doneEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      render();
    }

    const triggerPrice = () => {
      const t = triggerInput.value.trim();
      return t === '' ? null : Number(t.replace(/[,\s]/g, ''));
    };

    function renderOrderPreview(st, c, mode, held) {
      const amt = amount();
      const trig = triggerPrice();
      const buying = mode === 'limit' && market.side === 'buy';
      triggerLabel.textContent = mode === 'stop' ? 'Sell if the price falls to (L$)' : buying ? 'Buy if the price falls to (L$)' : 'Sell if the price rises to (L$)';
      submit.replaceChildren(mode === 'stop' ? `Place stop-loss on ${c.ticker}` : `Place limit ${buying ? 'buy' : 'sell'}`);
      let ok = false;
      let text;
      if (amt == null || trig == null) {
        text = `${c.ticker} is ${price(c.price)} now. Choose an amount and a price.`;
      } else if (!(amt > 0) || !(trig > 0) || !Number.isFinite(amt) || !Number.isFinite(trig)) {
        text = 'Enter an amount and a price bigger than zero.';
      } else if ((mode === 'stop' || buying) && trig >= c.price) {
        text = `Pick a price below today’s ${price(c.price)}.`;
      } else if (mode === 'limit' && !buying && trig <= c.price) {
        text = `Pick a price above today’s ${price(c.price)}.`;
      } else if (!buying && amt > held * (1 + 1e-9)) {
        text = `You own ${coinAmount(held)} ${c.ticker}. Try a smaller amount.`;
      } else if (buying && amt > st.portfolio.cash + 1e-9) {
        text = `You have ${money(st.portfolio.cash)} to spend. Try a smaller amount.`;
      } else {
        ok = true;
        text = mode === 'stop'
          ? `If ${c.ticker} falls to ${price(trig)} (now ${price(c.price)}), sell ${coinAmount(amt)} to stop the loss growing. In a fast drop it can sell lower.`
          : buying
            ? `If ${c.ticker} falls to ${price(trig)} (now ${price(c.price)}), spend ${money(amt)}. If it never gets there, nothing happens.`
            : `If ${c.ticker} rises to ${price(trig)} (now ${price(c.price)}), sell ${coinAmount(amt)}. If it never gets there, nothing happens.`;
      }
      preview.textContent = text;
      preview.classList.toggle('is-problem', amt != null && trig != null && !ok);
      submit.disabled = !ok;
      for (const b of quick) b.disabled = buying ? !(st.portfolio.cash > 0.01) : !(held > 0);
    }

    let ordersKey = '';
    function renderOrders(st) {
      const list = st.portfolio.orders || [];
      const key = list.map((o) => `${o.id}:${o.status}`).join('|');
      if (key === ordersKey) return;
      ordersKey = key;
      const open = list.filter((o) => o.status === 'open');
      const recent = list.filter((o) => o.status !== 'open' && o.status !== 'cancelled').slice(-3).reverse();
      if (!open.length && !recent.length) {
        ordersList.replaceChildren();
        return;
      }
      const label = (o) => {
        const t = st.coins[o.coinId]?.ticker || o.coinId;
        if (o.type === 'limit-buy') return `Buy ${t} with ${money(o.amount)} at ${price(o.price)} or less`;
        if (o.type === 'limit-sell') return `Sell ${coinAmount(o.amount)} ${t} at ${price(o.price)} or more`;
        return `Stop-loss: sell ${coinAmount(o.amount)} ${t} at ${price(o.price)} or less`;
      };
      ordersList.replaceChildren(
        h('h3', { class: 'trade__orders-title', text: 'Your orders' }),
        h('ul', { class: 'trade__orders-list' }, [
          ...open.map((o) => h('li', { class: 'trade__order' }, [
            h('span', { text: label(o) }),
            h('button', { class: 'btn btn--sm', type: 'button', onClick: () => { session.cancelOrder(o.id); announce('Order cancelled.'); render(); } }, ['Cancel', h('span', { class: 'visually-hidden', text: `: ${label(o)}` })]),
          ])),
          ...recent.map((o) => h('li', { class: 'trade__order is-done' }, [
            h('span', { text: label(o) }),
            o.status === 'filled'
              ? h('span', { class: 'chip chip--ok', text: `Filled at ${price(o.fill.price)}` })
              : h('span', { class: o.status === 'expired' ? 'chip' : 'chip chip--warn', text: o.status === 'expired' ? 'Ended at the close' : 'Couldn’t fill' }),
          ])),
        ]),
      );
    }

    function renderDepth(st) {
      if (!depthBox?.open) return;
      const c = st.coins[market.selected];
      const d = session.depth(c.id, DEPTH_STEPS);
      if (!d.length) {
        depthDown.setAttribute('d', '');
        depthUp.setAttribute('d', '');
        depthText.textContent = `${c.ticker}’s pool is empty, so it can’t be traded.`;
        depthSvg.setAttribute('aria-label', depthText.textContent);
        return;
      }
      const max = Math.max(...d.map((p) => p.L)) || 1;
      const X = (pct) => 150 + pct * 5;
      const Y = (L) => 120 - (L / max) * 112;
      const area = (pts) => `M150,120 ${pts.map((p) => `L${X(p.pct).toFixed(1)},${Y(p.L).toFixed(1)}`).join(' ')} L${X(pts[pts.length - 1].pct)},120 Z`;
      depthDown.setAttribute('d', area(d.filter((p) => p.pct <= 0).reverse()));
      depthUp.setAttribute('d', area(d.filter((p) => p.pct >= 0)));
      const at = (pct) => d.find((p) => p.pct === pct).L;
      let text = `To push ${c.ticker} up 10% takes about ${money(at(10), 0)} of buying. Down 10%: about ${money(at(-10), 0)} of selling.`;
      if (at(-30) < 1) text = `To push ${c.ticker} up 10% takes about ${money(at(10), 0)} of buying. It can’t fall lower yet: nobody has paid real money in.`;
      const q = st.portfolio.cash > 1 && !c.user ? session.quote(c.id, 'buy', st.portfolio.cash) : null;
      if (q?.ok) text += ` Spending all your ${money(st.portfolio.cash, 0)} would move it about ${number(q.priceImpactPct, 1)}%.`;
      depthText.textContent = text;
      depthSvg.setAttribute('aria-label', `Depth chart for ${c.ticker}. ${text}`);
    }

    // ---- portfolio and news ------------------------------------------------------------------
    const pfValue = h('p', { class: 'lab-portfolio__value' });
    const pfTotal = h('span', { class: 'lab-portfolio__total' }); // kept between ticks so its pulse can finish
    let totalMark = null;
    const pfRows = h('ul', { class: 'lab-portfolio__rows' });
    const allocInfo = explainer('alloc-info');
    const allocBar = h('div', { class: 'alloc', 'aria-hidden': 'true' });
    const portfolioCard = h('div', { class: 'card lab-portfolio' }, [
      h('div', { class: 'card-head' }, [h('h2', { class: 'lab-card__title', text: 'Your portfolio' }), infoButton('your portfolio', INFO.allocation, allocInfo)]),
      allocInfo.el,
      pfValue,
      allocBar,
      pfRows,
    ]);

    function renderPortfolio(st) {
      const p = st.portfolio;
      pfTotal.textContent = money(p.value);
      if (totalMark == null) totalMark = p.value;
      else if (Math.abs(p.value / totalMark - 1) >= 0.01) {
        pulse(pfTotal, p.value > totalMark);
        totalMark = p.value;
      }
      pfValue.replaceChildren(
        pfTotal,
        delta((p.value / p.startValue - 1) * 100),
        h('span', { class: 'lab-portfolio__note', text: `Started with ${money(p.startValue)} · profit or loss ${signedMoney(p.value - p.startValue)}` }),
      );
      const basis = costBasis(p.trades);
      const segments = [h('span', { class: 'alloc__seg alloc__seg--cash' })];
      segments[0].style.flexGrow = String(p.cash);
      const items = [
        h('li', { class: 'pf-row' }, [
          h('span', { class: 'coin-badge coin-badge--cash', 'aria-hidden': 'true', text: 'L$' }),
          h('span', { class: 'pf-row__name', text: 'Cash' }),
          h('span', { class: 'pf-row__value', text: money(p.cash) }),
          h('span', { class: 'pf-row__share', text: `${number((p.cash / p.value) * 100, 0)}%` }),
        ]),
      ];
      for (const [id, coins] of Object.entries(p.holdings)) {
        const c = st.coins[id];
        if (!c) continue;
        const value = coins * c.price;
        const cost = basis[id]?.cost ?? 0;
        const seg = h('span', { class: `alloc__seg coin--${config.COIN_COLORS[c.colorId] || 'mint'}` });
        seg.style.flexGrow = String(value);
        segments.push(seg);
        items.push(
          h('li', { class: 'pf-row' }, [
            badge(c),
            h('span', { class: 'pf-row__name' }, [
              h('span', { class: 'pf-row__ticker', text: c.ticker }),
              h('span', { class: 'pf-row__coins', text: `${coinAmount(coins)} coins` }),
              cost > 0
                ? h('span', { class: 'pf-row__pl' }, [`${signedMoney(value - cost)} `, delta((value / cost - 1) * 100)])
                : null,
            ]),
            h('span', { class: 'pf-row__value', text: money(value) }),
            h('span', { class: 'pf-row__share', text: `${number((value / p.value) * 100, 0)}%` }),
          ]),
        );
      }
      if (items.length === 1) {
        items.push(h('li', { class: 'pf-empty', text: 'No coins yet. Pick a coin, choose an amount and tap Buy.' }));
      }
      pfRows.replaceChildren(...items);
      allocBar.replaceChildren(...segments);
    }

    // ---- your coin: the entry to Create, then the launch outcome explained --------------------
    const mineBody = h('div', { class: 'lab-mine__body' });
    // The contract sits outside mineBody, which redraws every tick, so an open <details> stays open.
    const contractBox = h('div', { class: 'lab-contract' });
    const mineCard = h('div', { class: 'card lab-mine' }, [h('h2', { class: 'lab-card__title', text: 'Your coin' }), mineBody, contractBox]);
    let mineMode = null;
    let contractFor = null;

    function renderMine(st) {
      const coin = Object.values(st.coins).find((c) => c.user);
      const mode = coin ? 'live' : market.news.length ? 'ready' : 'wait';
      if (mode !== 'live' && mode === mineMode) return;
      // Coin launch (BRIEF §10): celebrate once, the first time the Lab shows the new coin.
      if (mode === 'live' && mineMode !== 'live' && market.justLaunched === coin.id) {
        market.justLaunched = null;
        requestAnimationFrame(() => {
          animate(mineCard, [{ transform: 'scale(0.96)' }, { transform: 'scale(1.02)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 300 });
          celebrate(mineCard, { pieces: 24 });
        });
      }
      mineMode = mode;
      if (mode === 'wait') {
        mineBody.replaceChildren(h('p', { class: 'lab-mine__text', text: 'After Penny’s first news, you can launch your own coin here and watch how buyers react.' }));
        return;
      }
      if (mode === 'ready') {
        mineBody.replaceChildren(
          h('p', { class: 'lab-mine__text', text: 'Design a coin and launch it into today’s market. How it does depends on your design.' }),
          h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => navigate('/create') }, [
            'Create a coin',
            icon('arrow-right', { size: 20 }),
          ]),
        );
        return;
      }
      const L = coin.launch;
      const day = (t) => Math.floor(t / st.ticksPerDay) + 1;
      if (tier === 'builder' && contractFor !== coin.id) {
        contractFor = coin.id;
        const teamVestDays = number(data.scenario.userCoin.teamVestTicks / st.ticksPerDay, 1);
        contractBox.replaceChildren(contractView(coin, { fee: data.coinsConfig.fee, teamVestDays }));
      }
      const stage = coin.phase === 'curve'
        ? `On its bonding curve: ${Math.round(coin.curveProgress * 100)}% of the way to a real pool`
        : `Moved from its bonding curve to a real pool on Day ${day(coin.graduatedAt)}`;
      const notes = designNotes({ ...L, bigInsiders: L.factors.some((f) => f.id === 'big_insider_share') }, tier);
      const copy = Object.values(st.coins).find((c) => c.class === 'copycat');
      if (copy) {
        notes.push({
          tone: 'risk',
          text: copy.rugged
            ? `The copycat ${copy.ticker} was rug pulled. Everyone who bought it lost their money.`
            : `A copycat, ${copy.ticker}, is pretending to be your coin.`,
        });
      }
      mineBody.replaceChildren(
        h('div', { class: 'lab-mine__head' }, [
          badge(coin),
          h('div', { class: 'lab-mine__label' }, [
            h('p', { class: 'lab-mine__name', text: `${coin.name} (${coin.ticker})` }),
            h('p', { class: 'lab-mine__stage', text: stage }),
          ]),
        ]),
        h('p', { class: 'lab-mine__price' }, [
          h('span', { class: 'lab-mine__value', text: price(coin.price) }),
          delta((coin.price / L.price0 - 1) * 100),
          h('span', { class: 'lab-mine__since', text: `since launch on Day ${day(L.t)} · ${coin.holders} holders` }),
        ]),
        notesList(notes),
      );
    }

    // ---- Advanced (desktop): who is trading the selected coin over the last sim day -----------
    const flowTitle = h('h2', { class: 'lab-card__title' });
    const flowList = h('ul', { class: 'flow' });
    const flowCard = h('div', { class: 'card lab-flow', hidden: true }, [
      flowTitle,
      h('p', { class: 'lab-flow__note', text: 'Every trade in the last market day, by type of trader.' }),
      flowList,
    ]);
    let txIndex = 0;
    let recent = [];

    function renderFlow(st) {
      flowCard.hidden = !advancedOn();
      if (flowCard.hidden) return;
      const fresh = session.getTransactions(txIndex);
      txIndex += fresh.length;
      recent = recent.concat(fresh).filter((x) => x.t >= st.t - st.ticksPerDay);
      const c = st.coins[market.selected];
      const by = new Map();
      for (const x of recent) {
        if (x.coin !== c.id) continue;
        const r = by.get(x.who) || { buy: 0, sell: 0 };
        r[x.side] += x.L;
        by.set(x.who, r);
      }
      const rows = [...by.entries()].sort((a, b) => b[1].buy + b[1].sell - (a[1].buy + a[1].sell));
      flowTitle.textContent = `Who’s trading ${c.ticker}`;
      if (!rows.length) {
        flowList.replaceChildren(h('li', { class: 'lab-news__empty', text: 'No trades in the last market day.' }));
        return;
      }
      const top = rows[0][1].buy + rows[0][1].sell;
      flowList.replaceChildren(
        ...rows.slice(0, 8).map(([who, r]) => {
          const barBuy = h('span', { class: 'flow__buy' });
          const barSell = h('span', { class: 'flow__sell' });
          barBuy.style.width = `${(r.buy / top) * 100}%`;
          barSell.style.width = `${(r.sell / top) * 100}%`;
          return h('li', { class: 'flow__row' }, [
            h('span', { class: 'flow__who', text: WHO[who] || who }),
            h('span', { class: 'flow__bar', 'aria-hidden': 'true' }, [barBuy, barSell]),
            h('span', { class: 'flow__amounts', text: `↑ ${money(r.buy, 0)} bought · ↓ ${money(r.sell, 0)} sold` }),
          ]);
        }),
      );
    }

    // ---- blockchain card (13+ everywhere, and in Advanced) ---------------------------------------
    const chainText = h('p', { class: 'lab-mine__text' });
    const chainCard = h('div', { class: 'card lab-chain', hidden: true }, [
      h('h2', { class: 'lab-card__title', text: 'Blockchain' }),
      chainText,
      h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate('/explorer') }, ['Open the block explorer', icon('blocks', { size: 20 })]),
    ]);

    function renderChainCard(st) {
      chainCard.hidden = !(tierInfo.rank >= 1 || advancedOn());
      if (chainCard.hidden) return;
      const sealed = Math.floor(st.t / BLOCK_TICKS);
      chainText.textContent = `Every trade is a transaction. ${sealed} ${sealed === 1 ? 'block' : 'blocks'} sealed so far, with a new one every 5 seconds.`;
    }

    function setMode(adv) {
      market.advanced = adv;
      store.set({ labAdvanced: adv });
      render();
    }

    function renderMode() {
      modeButtons[0].setAttribute('aria-pressed', String(!market.advanced));
      modeButtons[1].setAttribute('aria-pressed', String(market.advanced));
    }

    // The wash-volume lesson plays once, the first time a Builder sees the overlay (BRIEF §5 events).
    function maybeWashLesson(st) {
      const c = st.coins[market.selected];
      if (market.washSeen || market.closed || dialog.open || !advancedOn() || tier !== 'builder' || !(c.totalWashVolume > 0)) return;
      market.washSeen = true;
      const e = { id: 'wash_volume', coinId: c.id, t: st.t };
      market.news.push(e);
      openEvent(e);
    }

    const newsList = h('ol', { class: 'lab-news__list' });
    const newsCard = h('div', { class: 'card lab-news' }, [h('h2', { class: 'lab-card__title', text: 'Market news' }), newsList]);

    function renderNews() {
      if (!market.news.length) {
        newsList.replaceChildren(h('li', { class: 'lab-news__empty', text: 'Nothing big has happened yet. Penny will tell you when it does.' }));
        return;
      }
      newsList.replaceChildren(
        ...market.news
          .slice()
          .reverse()
          .map((e) =>
            h('li', { class: 'lab-news__item' }, [
              h('span', { class: 'lab-news__day', text: `Day ${Math.floor(e.t / scenario.ticksPerDay) + 1}` }),
              h('span', { class: 'lab-news__text', text: eventCopy(e.id).headline }),
            ]),
          ),
      );
      if (newsList.childElementCount > newsShown) {
        animate(newsList.firstElementChild, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
      }
      newsShown = newsList.childElementCount;
    }
    let newsShown = 0;

    // ---- events: Penny pauses the market, narrates and asks one question -------------------
    const dialog = h('dialog', { class: 'lab-dialog', 'aria-labelledby': 'lab-dialog-title' });
    view.append(dialog);
    dialog.addEventListener('close', () => {
      audio.stop();
      pauses.delete('event');
      // Closing the end-of-market panel (Esc) leaves the same panel in the page, never a frozen market.
      if (market.closed) view.replaceChildren(h('div', { class: 'screen' }, [head, closedPanel(session.getState())]));
      else renderClock(session.getState());
    });

    function eventCopy(id) {
      const ev = market.data.events;
      const fromFile = ev?.[id]?.[tier] ?? ev?.[tier]?.[id];
      return fromFile?.headline && fromFile?.narration ? fromFile : FALLBACK_EVENTS[id] || { headline: 'Something happened in the market', narration: '' };
    }

    function openEvent(e) {
      pauses.add('event');
      const copy = eventCopy(e.id);
      const negative = Boolean(scenario.events.find((x) => x.id === e.id)?.negative);
      const day = Math.floor(e.t / scenario.ticksPerDay) + 1;
      announce(`News: ${copy.headline}`);
      renderNews();

      const back = () =>
        h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => dialog.close() }, [
          'Back to the market',
          icon('arrow-right', { size: 20 }),
        ]);
      const body = h('div', { class: 'lab-dialog__body' });
      const q = copy.question;
      const hasQuestion = q && Array.isArray(q.options) && q.options.length === 3;

      // Step 1: the news. Step 2: Penny's question, so her two lines never talk over each other.
      function ask() {
        body.replaceChildren(
          questionCard({
            audio,
            audioId: `event-${e.id}-${tier}-question`,
            prompt: q.prompt,
            options: q.options,
            answerIndex: q.answerIndex,
            explain: q.explain || `The answer is “${q.options[q.answerIndex]}”.`,
            nextLabel: 'Back to the market',
            onAnswer: (correct) => market.quiz.push({ id: e.id, correct }),
            onNext: () => dialog.close(),
          }),
        );
        body.querySelector('.question__prompt .narration__text')?.setAttribute('id', 'lab-dialog-title');
        body.querySelector('.option')?.focus();
      }

      body.replaceChildren(
        h('div', { class: 'lab-dialog__head' }, [
          penny(negative ? 'worried' : 'happy', { size: 64 }),
          h('div', {}, [
            h('p', { class: 'screen-eyebrow', text: `Day ${day} · ${e.coinId}` }),
            h('h2', { class: 'lab-dialog__title', id: 'lab-dialog-title', text: copy.headline }),
          ]),
        ]),
        copy.narration ? audio.line({ id: `event-${e.id}-${tier}`, text: copy.narration, className: 'lab-dialog__say', autoplay: true }) : null,
        hasQuestion
          ? h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: ask }, [
              'Answer Penny’s question',
              icon('arrow-right', { size: 20 }),
            ])
          : back(),
      );
      dialog.replaceChildren(body);
      if (!dialog.open) dialog.showModal();
      animate(dialog, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }]);
      // Penny reacts: a worried wobble for bad news, a happy hop for good news.
      const mascot = body.querySelector('.penny');
      if (mascot) {
        animate(
          mascot,
          negative
            ? [{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(0)' }]
            : [{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }],
          { duration: 300, delay: 160, fill: 'none' },
        );
      }
    }

    function showClosed(final) {
      pauses.add('closed');
      clearInterval(timer);
      audio.stop();
      announce('The market has closed.');
      const panel = h('div', { class: 'lab-dialog__body' }, [closedPanel(final)]);
      dialog.replaceChildren(panel);
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('.result__title')?.setAttribute('id', 'lab-dialog-title');
      celebrate(panel);
    }

    market.ui = { event: openEvent, closed: showClosed };
    cleanup.push(() => {
      if (market.ui?.event === openEvent) market.ui = null;
      if (dialog.open) dialog.close();
    });

    // ---- layout and the clock ----------------------------------------------------------------
    view.replaceChildren(
      h('div', { class: 'lab' }, [
        h('div', { class: 'lab-top' }, [head, clock]),
        coinsCard,
        chartCard,
        tradeCard,
        portfolioCard,
        mineCard,
        newsCard,
        flowCard,
        chainCard,
      ]),
      dialog,
    );
    head.append(modeToggle);
    const onWide = () => render();
    wide.addEventListener('change', onWide);
    cleanup.push(() => wide.removeEventListener('change', onWide));

    function render() {
      const st = session.getState();
      renderClock(st);
      renderCoins(st);
      renderChart(st);
      renderTrade(st);
      renderDepth(st);
      renderPortfolio(st);
      renderMine(st);
      renderMode();
      renderFlow(st);
      renderChainCard(st);
      maybeWashLesson(st);
    }

    function step() {
      if (pauses.size || market.closed) return;
      session.tick();
      if (!market.closed) render();
    }

    const onVisibility = () => {
      if (document.hidden) pauses.add('hidden');
      else pauses.delete('hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));

    // Coach mode (BRIEF §15): the market waits while Penny coaches. Offered once, on the first visit.
    const coachEnv = {
      route: '/lab',
      tier,
      store,
      navigate,
      dataBase: config.DATA_BASE,
      pause: () => pauses.add('coach'),
      resume: () => pauses.delete('coach'),
      select: (id) => session.getState().coins[id] && select(id),
      tradesCount: () => session.getState().portfolio.trades.length,
      canTrade: () => !form.hidden && !submit.disabled,
      hasNews: () => market.news.length > 0,
      hasCoin: () => Object.values(session.getState().coins).some((c) => c.user),
      drillConfig: () => ({ ...structuredClone({ coinsConfig: market.data.coinsConfig, agentsConfig: market.data.agentsConfig, scenario: market.data.scenario }), seed: market.seed, tier }),
    };
    cleanup.push(attachCoach(coachEnv));
    cleanup.push(session.on('order', (o) => {
      const t = session.getState().coins[o.coinId]?.ticker || o.coinId;
      const msg = o.status === 'filled'
        ? `Your ${o.type === 'stop-loss' ? 'stop-loss' : 'limit order'} on ${t} filled at ${price(o.fill.price)}.`
        : `Your order on ${t} couldn’t fill: not enough ${o.type === 'limit-buy' ? 'cash' : 'coins'} by then.`;
      announce(msg);
      doneEl.textContent = msg;
      doneEl.hidden = false;
    }));
    // Badge mints go into today's chain while this market is open (BRIEF §15).
    setChainSink((id) => {
      if (market.closed || live !== market) return false;
      session.recordMint(id);
      return true;
    });
    if (!store.get().coach?.[tier]?.offered && !isCoaching()) openCoachMenu(coachEnv, { offer: true });

    render();
    renderNews();
    timer = setInterval(step, scenario.tickMs);
    cleanup.push(() => clearInterval(timer));
  }

  load();

  return () => {
    alive = false;
    for (const fn of cleanup.splice(0)) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
    audio.stop();
    view.remove();
  };
}
