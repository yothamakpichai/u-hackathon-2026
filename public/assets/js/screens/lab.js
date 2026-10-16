// Market Lab: today's market (BRIEF §3 steps 3, 4 and 6; slice J2).
// A live chart, coin list, trade panel and portfolio over the sim engine (sim/session.js).
// The market only runs while this screen is open and visible. An event pauses it while Penny
// narrates and asks one question. When it closes, the run is saved to store.lab[tier] for the
// report card (#/report).
import { WHO, coinAmount, coinBadge, contractView, designNotes, liveMarket, notesList, setLiveMarket } from './coinkit.js';
import { createSession } from '../sim/session.js';
import { bangkokDate, dailySeed } from '../sim/prng.js';
import { BLOCK_TICKS } from '../sim/chain.js';
import { rsi, sma } from '../sim/indicators.js';
import { runMetrics } from '../sim/metrics.js';
import { attachCoach, isCoaching, onChapterDone, openCoachMenu } from './coach.js';
import { mintBadge, mintedNote, setChainSink } from './badges.js';
import { prefetch as prefetchDesigner } from './create.js';

// A finished Coach chapter mints its soulbound badge (BRIEF §15) and shows it on the completion card.
onChapterDone(({ tier, chapter, store }) => mintedNote(mintBadge(store, { kind: 'coach', ref: chapter.id, tier })));
import {
  animate, announce, celebrate, delta, getJSON, h, icon, money, number, penny, price, questionCard, resultPanel,
  stateView, trend,
} from '../ui.js';

let dataPromise = null;
// The chart library (about 200 KB) loads only here, alongside today's data (J13).
let chartsPromise = null;
let CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart;

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
const SVG_NS = 'http://www.w3.org/2000/svg';
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
  sma: 'The solid blue line (SMA 7) is the average price of the last 7 bars and the dashed pink line (SMA 25) of the last 25, so the noise is smoothed out. When the short line crosses the long one, the trend may be changing. Averages always lag behind the price, so they can’t predict the next move.',
  rsi: 'RSI (0 to 100) shows how strongly the price has moved up or down lately. Above 70 people call it “overbought”, below 30 “oversold”. It can’t tell you what a coin is really worth, and prices can stay above 70 or below 30 for a long time.',
  impact: 'Price impact is how much your own trade moves the price, because the pool has to rebalance. Big trades in small pools move it more. It can’t tell you where the price goes next: other traders move it too.',
  impactExplorer: 'Your own trade moves the price a little: buying leaves fewer coins for sale, so the next one costs more, and selling does the opposite. Big trades move it more. It can’t tell you where the price goes next: other traders move it too.',
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

// The chart library, loaded once on the first Lab visit. A failed dynamic import stays in the page's module map,
// so each retry asks for a fresh URL (the library imports nothing, so a second copy is harmless).
const CHARTS_URL = '../vendor/lightweight-charts/lightweight-charts.standalone.production.mjs';
let chartFails = 0;
function loadCharts() {
  chartsPromise ??= import(chartFails ? `${CHARTS_URL}?retry=${chartFails}` : CHARTS_URL)
    .then((m) => {
      ({ CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart } = m);
    })
    .catch((err) => {
      chartsPromise = null;
      chartFails += 1;
      throw err;
    });
  return chartsPromise;
}

// Axis labels: the same precision as ui.price(), without the L$ prefix. No price is below zero, so the labels in
// the volume margin under a crashed coin stay blank, and rounding noise at zero reads 0.00.
function axisPrice(p) {
  if (p < -1e-10) return '';
  const abs = Math.abs(p) < 1e-10 ? 0 : Math.abs(p);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : abs > 0 ? Math.min(10, 3 - Math.floor(Math.log10(abs))) : 2;
  return number(abs, digits);
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
    queued: [], // news still waiting for Penny's dialog; kept here, so it opens on the next visit if the player leaves
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

  // The screen's heading shows from the start, over the loading and error states too, so the page always has one h1.
  const screenHead = () =>
    h('div', { class: 'screen-head lab-head' }, [
      h('p', { class: 'screen-eyebrow', text: `${tierInfo.name} · Ages ${tierInfo.ages}` }),
      h('h1', { class: 'screen-title', text: 'Today’s market' }),
    ]);

  // Focus (BRIEF §10, a full keyboard path): the router focuses the h1 right after mount, but the Lab redraws once it
  // has loaded. When focus was in this screen, or on the router's fallback (#main), it moves on to the new view. A
  // first page load keeps its focus, and the Coach offer takes focus after this.
  const ownsFocus = () => document.activeElement === root || view.contains(document.activeElement);
  function focusOn(el) {
    if (!el) return;
    if (/^H[1-6]$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }

  function showLoadError(title, body) {
    const keep = ownsFocus();
    const retry = h('button', { class: 'btn btn--primary', type: 'button', onClick: load }, 'Try again');
    view.replaceChildren(
      h('div', { class: 'screen' }, [
        screenHead(),
        stateView({
          kind: 'error',
          title,
          body,
          actions: [retry, h('button', { class: 'btn', type: 'button', onClick: () => navigate('/town') }, 'Back to my town')],
        }),
      ]),
    );
    if (keep) focusOn(retry);
  }

  function load() {
    const keep = ownsFocus();
    view.replaceChildren(h('div', { class: 'screen' }, [screenHead(), stateView({ kind: 'loading', title: 'Opening today’s market…' })]));
    if (keep) focusOn(view.querySelector('h1'));
    Promise.all([loadData(config.DATA_BASE), loadCharts()])
      .then(([data]) => {
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
      .catch((err) => {
        if (!alive) return;
        console.error(err); // the browser's own message names files and URLs: a plain line instead
        showLoadError('Today’s market didn’t open', 'Part of the market didn’t load. Check your connection, then try again.');
      });
  }

  function replay() {
    setLiveMarket(null);
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
    // Open orders lapse at the close (J9), and the player is told.
    const lapsed = (p.orders || []).filter((o) => o.status === 'expired').length;
    const ordersNote = !lapsed ? '' : lapsed === 1 ? ' Your open order ended when the market closed.' : ` Your ${lapsed} open orders ended when the market closed.`;
    return resultPanel({
      mood: 'celebrating',
      title: 'The market has closed',
      text: `You finished with ${money(p.value)}, ${signedPct(change)} from your ${money(p.startValue)} start.${ordersNote} Your report card scores how wisely you traded, not just the money.`,
      actions: [reportButton(), replayButton()],
    });
  }

  function start(data) {
    const keepFocus = ownsFocus();
    const today = bangkokDate();
    let live = liveMarket();
    if (!live || live.tier !== tier || (live.closed && live.date !== today)) setLiveMarket((live = newMarket(data, tier, store)));
    const market = live;
    const { session } = market;
    const { scenario } = data;

    const head = screenHead();
    const modeButtons = [false, true].map((adv) =>
      h('button', { class: 'segmented__btn', type: 'button', onClick: () => setMode(adv) }, adv ? 'Advanced' : 'Basic'),
    );
    const modeToggle = h('div', { class: 'segmented lab-mode', role: 'group', 'aria-label': 'Lab view' }, modeButtons);

    if (market.closed) {
      view.replaceChildren(h('div', { class: 'screen' }, [head, closedPanel(session.getState())]));
      if (keepFocus) focusOn(head.querySelector('h1'));
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
    // The question is the group's name and the Finish button's description, so it is read with the focused button.
    const confirm = h('div', { class: 'lab-confirm', role: 'group', 'aria-labelledby': 'lab-confirm-text', hidden: true }, [
      h('p', { class: 'lab-confirm__text', id: 'lab-confirm-text', text: 'Close the market now and see your report card?' }),
      h('div', { class: 'lab-confirm__actions' }, [
        h('button', { class: 'btn btn--sm btn--primary', type: 'button', 'aria-describedby': 'lab-confirm-text', onClick: () => session.finish() }, 'Finish'),
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
      if (stripShown !== market.selected) {
        stripShown = market.selected;
        showSelectedRow();
      }
    }

    // Phones: the strip scrolls sideways, so a newly selected coin (a coin just launched, say) is brought into view.
    let stripShown = null;
    function showSelectedRow() {
      const el = rows.get(market.selected)?.el;
      if (!el || coinList.scrollWidth <= coinList.clientWidth) return;
      const box = coinList.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.left < box.left) coinList.scrollLeft -= box.left - r.left + 8;
      else if (r.right > box.right) coinList.scrollLeft += r.right - box.right + 8;
    }

    function select(id) {
      market.selected = id;
      tradeInput.value = '';
      delete tradeInput.dataset.exact;
      triggerInput.value = ''; // a price typed for one coin means nothing for another
      clearMessages();
      render();
    }

    // ---- chart -------------------------------------------------------------------------------
    // The canvases have no text, so the box is one image with a short summary, updated once per candle.
    const chartBox = h('div', { class: 'lab-chart__canvas', role: 'img' });
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
    // The two averages differ by line style as well as colour, and the legend says which is which.
    // Each key stays next to its words when a legend wraps on a phone.
    const legendItem = (key, text) => h('span', { class: 'legend-item' }, [h('span', { class: key, 'aria-hidden': 'true' }), text]);
    const smaLegend = h('p', { class: 'lab-chart__legend', hidden: true }, [
      legendItem('legend-line', 'SMA 7 (solid blue line)'),
      legendItem('legend-line legend-line--dashed', 'SMA 25 (dashed pink line)'),
    ]);
    const washLegend = h('p', { class: 'lab-chart__legend', hidden: true }, [
      legendItem('legend-key legend-key--real', 'Real volume'),
      legendItem('legend-key legend-key--wash', 'Wash volume (a bot trading with itself)'),
    ]);
    const chartCard = h('div', { class: 'card lab-chart' }, [
      h('div', { class: 'lab-chart__head' }, [chartBadge, h('div', { class: 'lab-chart__label' }, [chartTitle, chartChips]), chartPrice]),
      chartBox,
      toolsRow,
      smaLegend,
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
      // No chart-wide priceFormatter: it would override every series, and RSI is a whole-number score.
      localization: {
        timeFormatter: (time) => `Day ${dayOf(time)}, ${String(Math.floor((time % 86400) / 3600)).padStart(2, '0')}:00`,
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
    let chartLabelFor = null;
    const priceMark = { coin: null, price: 0 };
    const sessionCandles = scenario.ticks / scenario.candleTicks;

    // Candles fill a fixed window from the left (about 6 px each, the whole month on wide screens);
    // once it is full, the newest candle stays in view. The window starts about 24 px early, so the
    // centred "Day 1" label on the first candle is never cut off at the left edge.
    function keepInView(count) {
      const width = chartBox.clientWidth;
      if (!width) return; // not laid out yet (or hidden): the next candle sets the window
      const span = Math.max(40, Math.min(sessionCandles, Math.floor(width / 6)));
      const pad = Math.max(2, Math.ceil(24 / Math.max(1, width / span)));
      if (count <= span - pad) chart.timeScale().setVisibleLogicalRange({ from: -pad, to: span - pad });
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
      smaLegend.hidden = !avg;
      if (avg && !smaFast) {
        smaFast = chart.addSeries(LineSeries, lineOpts(blue, 2));
        smaSlow = chart.addSeries(LineSeries, { ...lineOpts(pink, 2), lineStyle: 2 }); // dashed
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
        // Its tick labels stay blank: the 70 and 30 tags and the current value would half cover them.
        rsiLine.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 }, textColor: 'transparent' });
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
      // Adding a series can move the visible window, so the window is set again once the new data is in.
      let reframe = false;
      if (syncTools()) toolsFresh = reframe = true;
      const washOn = advancedOn() && tier === 'builder' && c.totalWashVolume > 0 && toolOn(TOOLS[0]);
      if (washOn && !washSeries) {
        washSeries = chart.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
        washSeries.setData(ks.map(toWash));
        reframe = true;
      } else if (!washOn && washSeries) {
        chart.removeSeries(washSeries);
        washSeries = null;
      }
      washLegend.hidden = !washOn;
      if (chartCoin !== c.id) {
        // A blank point one candle before the first: the library weighs a tick mark against the point before it,
        // so "Day 1" counts as a new day and is not dropped for the unlabelled hours while the chart is short.
        candleSeries.setData([{ time: toTime(ks[0].t - scenario.candleTicks) }, ...ks.map(toBar)]);
        volumeSeries.setData(ks.map(toVolume));
        washSeries?.setData(ks.map(toWash));
        renderTools(ks, true, 0);
        toolsFresh = false;
        keepInView(ks.length);
        requestAnimationFrame(() => alive && keepInView(chartCount)); // again once the chart has its size
        chartCoin = c.id;
        chartBadge.replaceChildren(badge(c));
        chartTitle.textContent = `${c.name} (${c.ticker})`;
      } else {
        for (let i = Math.max(0, chartCount - 1); i < ks.length; i++) {
          candleSeries.update(toBar(ks[i]));
          volumeSeries.update(toVolume(ks[i]));
          washSeries?.update(toWash(ks[i]));
        }
        renderTools(ks, toolsFresh, Math.max(0, chartCount - 1));
        toolsFresh = false;
        if (ks.length !== chartCount || reframe) keepInView(ks.length);
      }
      const change = dayChange(c, st);
      if (chartCount !== ks.length || chartLabelFor !== c.id) {
        chartLabelFor = c.id;
        chartBox.setAttribute('aria-label', `${c.name} price chart. Day ${st.day}: ${price(c.price)}, ${signedPct(change)} over the last day.`);
      }
      chartCount = ks.length;
      const valueEl = h('span', { class: 'lab-chart__value', text: price(c.price) });
      chartPrice.replaceChildren(valueEl, delta(change));
      // Pulse the big price on a sharp move (1% or more since the last pulse on this coin).
      if (priceMark.coin !== c.id) Object.assign(priceMark, { coin: c.id, price: c.price });
      else if (Math.abs(c.price / priceMark.price - 1) >= 0.01) {
        pulse(valueEl, c.price > priceMark.price);
        priceMark.price = c.price;
      }
      const chips = [];
      // Explorers never meet the words "bonding curve" (BRIEF §2); every level counts progress to a pool, not to launch.
      const grown = Math.round(c.curveProgress * 100);
      if (c.rugged) chips.push(h('span', { class: 'chip chip--loss', text: 'Rug pulled' }));
      else if (c.phase === 'curve') chips.push(h('span', { class: 'chip', text: tierInfo.rank === 0 ? `New coin: ${grown}% grown` : `Bonding curve: ${grown}% of the way to a real pool` }));
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
    const triggerInput = h('input', { id: 'trade-trigger', class: 'trade__input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', 'aria-describedby': 'trade-preview' });
    const triggerLabel = h('label', { class: 'trade__label', for: 'trade-trigger' });
    const triggerField = h('div', { class: 'trade__trigger', hidden: true }, [triggerLabel, h('div', { class: 'trade__field' }, [triggerInput, h('span', { class: 'trade__unit', 'aria-hidden': 'true', text: 'L$' })])]);
    triggerInput.addEventListener('input', () => {
      clearMessages();
      renderTrade(session.getState());
      sayProblemSoon();
    });
    const ordersList = h('div', { class: 'trade__orders' });

    function setOrderInfo(id) {
      orderInfo.el.hidden = true;
      orderInfo.owners.length = 0;
      orderInfoBtn.replaceChildren(...(id === 'market' ? [] : [infoButton(id === 'limit' ? 'limit orders' : 'stop-loss orders', INFO[id === 'limit' ? 'limit' : 'stop'], orderInfo)]));
    }
    function setOrderType(id) {
      const side = market.side;
      // A stop-loss always sells; leaving it brings back the side you had before.
      if (id === 'stop') {
        market.sideBeforeStop ??= market.side;
        market.side = 'sell';
      } else if (market.sideBeforeStop) {
        market.side = market.sideBeforeStop;
        market.sideBeforeStop = null;
      }
      market.orderType = id;
      // The amount means L$ to spend on Buy and coins on Sell, so a new side starts empty.
      if (market.side !== side) clearAmount();
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
    const doneEl = h('p', { class: 'trade__done', tabindex: '-1', hidden: true }); // read out through announce()
    // The button is aria-disabled, not disabled, while it can't be used: it keeps keyboard focus
    // after a trade, and a tap says what is missing instead of doing nothing.
    const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit', 'aria-describedby': 'trade-preview' });
    let ready = false;
    let hint = ''; // what to do first; empty when the preview already says what's wrong
    function setReady(ok, why = '') {
      ready = ok;
      hint = ok ? '' : why;
      submit.setAttribute('aria-disabled', String(!ok));
      // Once no problem shows (fixed, or a new coin, side or order type), the same problem is read out again.
      if (!preview.classList.contains('is-problem')) lastProblem = '';
    }
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
        h('summary', { class: 'depth__summary' }, ['How deep is the pool?', icon('chevron-right', { size: 20, className: 'depth__chev' })]),
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
      h('div', { class: 'card-head' }, [tradeTitle, infoButton('price impact', tierInfo.rank === 0 ? INFO.impactExplorer : INFO.impact, impactInfo)]),
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
      sayProblemSoon();
    });

    function clearMessages() {
      errorEl.hidden = true;
      doneEl.hidden = true;
    }

    function clearAmount() {
      tradeInput.value = '';
      delete tradeInput.dataset.exact;
    }

    // The result of an action: shown under the button and read out once. warn is for orders that
    // didn't go as planned (a stop-loss far below its level, or no fill at all).
    function notify(text, { warn = false, say = text } = {}) {
      errorEl.hidden = true;
      doneEl.textContent = text;
      doneEl.classList.toggle('trade__done--warn', warn);
      doneEl.hidden = false;
      if (say) announce(say);
    }

    function showError(text) {
      errorEl.textContent = text;
      errorEl.hidden = false;
      doneEl.hidden = true;
    }

    // A problem in the preview is read out once typing pauses. The preview itself is not a live
    // region, because it is rewritten on every tick.
    let problemTimer = 0;
    let lastProblem = '';
    function sayProblemSoon() {
      clearTimeout(problemTimer);
      problemTimer = setTimeout(() => {
        const text = preview.classList.contains('is-problem') ? preview.textContent : '';
        if (text && text !== lastProblem) announce(text);
        lastProblem = text;
      }, 500);
    }
    cleanup.push(() => clearTimeout(problemTimer));

    function setSide(side) {
      market.side = side;
      clearAmount();
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
      const cash = st.portfolio.cash;
      let ok = false;
      let why = '';
      if (amt == null) {
        if (buying && c.rugged) {
          preview.textContent = session.quote(c.id, 'buy', 1).error?.message;
        } else if (buying && cash >= 0.01) {
          preview.textContent = `You have ${money(cash)}. Type how many L$ to spend, or tap 25%, 50% or Max.`;
          why = 'Type how many L$ to spend first.';
        } else if (buying) {
          preview.textContent = 'You’ve spent all your L$. Sell a coin to get cash back.';
        } else if (held > 0) {
          preview.textContent = `You own ${coinAmount(held)} ${c.ticker}, worth about ${money(held * c.price)}.`;
          why = `Type how many ${c.ticker} to sell first.`;
        } else {
          preview.textContent = `You don’t own any ${c.ticker}.${c.rugged ? '' : ' Switch to Buy to get some.'}`;
        }
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
      preview.classList.toggle('is-problem', (amt != null || (buying && c.rugged)) && !ok);
      setReady(ok, why);
      for (const b of quick) b.disabled = buying ? !(cash > 0.01) || c.rugged : !(held > 0);
    }

    function trade(event) {
      event.preventDefault();
      if (!ready) {
        // A tap on the dimmed button says what is missing. A problem the preview already states
        // isn't copied into the alert line: it is read out again and the preview gives a shake.
        if (hint) return showError(hint);
        clearMessages();
        clearTimeout(problemTimer); // read out now, not again once typing pauses
        if (preview.classList.contains('is-problem')) lastProblem = preview.textContent;
        announce(preview.textContent);
        animate(preview, [{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 300 });
        return;
      }
      const amt = amount();
      if (amt == null) return;
      const c = session.getState().coins[market.selected];
      if (ordersOn && market.orderType !== 'market') {
        const type = market.orderType === 'stop' ? 'stop-loss' : market.side === 'buy' ? 'limit-buy' : 'limit-sell';
        const r = session.placeOrder({ coinId: c.id, type, price: triggerPrice(), amount: amt });
        if (!r.ok) return showError(r.error.message);
        clearAmount();
        triggerInput.value = '';
        notify('Order placed. It runs by itself while the market is open.');
        render();
        return;
      }
      const r = session.swap(c.id, market.side, amt);
      if (!r.ok) return showError(r.error.message);
      const verb = market.side === 'buy' ? 'Bought' : 'Sold';
      clearAmount();
      notify(`${verb} ${coinAmount(r.filledCoins)} ${c.ticker} for ${money(r.filledL$)}.`);
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
      let why = '';
      if (buying && c.rugged) {
        text = session.quote(c.id, 'buy', 1).error?.message; // the same words as Market Buy
      } else if (!buying && !(held > 0)) {
        text = `You don’t own any ${c.ticker}, so there’s nothing to ${mode === 'stop' ? 'protect' : 'sell'}.${c.rugged ? '' : ' Buy some first.'}`;
      } else if (amt == null || trig == null) {
        text = `${c.ticker} is ${price(c.price)} now. Choose an amount and a price.`;
        why = 'Type an amount and a price first.';
      } else if (!(amt > 0) || !(trig > 0) || !Number.isFinite(amt) || !Number.isFinite(trig)) {
        text = 'Enter an amount and a price bigger than zero.';
      } else if ((mode === 'stop' || buying) && trig >= c.price) {
        text = `Pick a price below today’s ${price(c.price)}.`;
      } else if (mode === 'limit' && !buying && trig <= c.price) {
        text = `Pick a price above today’s ${price(c.price)}.`;
      } else if (!buying && amt > held * (1 + 1e-9)) {
        text = `You own ${coinAmount(held)} ${c.ticker}. Try a smaller amount.`;
      } else if (buying && amt > st.portfolio.cash + 1e-9) {
        text = st.portfolio.cash >= 0.005 ? `You have ${money(st.portfolio.cash)} to spend. Try a smaller amount.` : 'You’ve spent all your L$. Sell a coin to get cash back.';
      } else {
        ok = true;
        text = mode === 'stop'
          ? `If ${c.ticker} falls to ${price(trig)} (now ${price(c.price)}), sell ${coinAmount(amt)} ${c.ticker} to stop the loss growing. In a fast drop it can sell lower.`
          : buying
            ? `If ${c.ticker} falls to ${price(trig)} (now ${price(c.price)}), spend ${money(amt)}. If it never gets there, nothing happens.`
            : `If ${c.ticker} rises to ${price(trig)} (now ${price(c.price)}), sell ${coinAmount(amt)} ${c.ticker}. If it never gets there, nothing happens.`;
      }
      preview.textContent = text;
      preview.classList.toggle('is-problem', (buying && c.rugged) || (amt != null && trig != null && !ok));
      setReady(ok, why);
      for (const b of quick) b.disabled = buying ? !(st.portfolio.cash > 0.01) || c.rugged : !(held > 0);
    }

    // Order fills. A stop-loss that sold well below its level (a fast drop) says so, and isn't
    // shown as a success.
    const soldLow = (o) => o.status === 'filled' && o.type === 'stop-loss' && o.fill.price < o.price * 0.97;
    // Why an order couldn't fill, from the engine's error code: a sentence and a short chip.
    function fillProblem(o, ticker) {
      if (o.error === 'RUGGED') return { why: `${ticker}’s creator pulled the money out of its pool, so nobody can buy it`, chip: 'rug pulled' };
      if (o.error === 'NO_LIQUIDITY') return { why: 'its pool didn’t hold enough real money to pay', chip: 'pool too small' };
      const what = o.type === 'limit-buy' ? 'cash' : 'coins';
      return { why: `not enough ${what} by then`, chip: `not enough ${what}` };
    }
    function fillText(o, st) {
      const t = st.coins[o.coinId]?.ticker || o.coinId;
      if (o.status !== 'filled') return `Your order on ${t} couldn’t fill: ${fillProblem(o, t).why}.`;
      if (soldLow(o)) return `Your stop-loss on ${t} sold at ${price(o.fill.price)}, below your ${price(o.price)} level, because the price fell fast.`;
      return `Your ${o.type === 'stop-loss' ? 'stop-loss' : 'limit order'} on ${t} filled at ${price(o.fill.price)}.`;
    }
    // Every fill of one tick goes into one message, so none is lost.
    let fills = [];
    function reportFills() {
      const batch = fills;
      fills = [];
      if (!alive || !batch.length) return;
      const st = session.getState();
      const text = batch.map((o) => fillText(o, st)).join(' ');
      // News from the same tick shares the one announcement, so neither line wipes the other.
      const news = market.news.filter((e) => e.t === batch[0].filledT).map((e) => `News: ${eventCopy(e.id).headline}.`);
      notify(text, { warn: batch.some((o) => o.status !== 'filled' || soldLow(o)), say: market.closed ? '' : [...news, text].join(' ') });
    }

    let ordersKey = '';
    function renderOrders(st) {
      const list = st.portfolio.orders || [];
      const key = list.map((o) => `${o.id}:${o.status}`).join('|');
      if (key === ordersKey) return;
      ordersKey = key;
      // A rebuild keeps keyboard focus in the list: the same order's Cancel, the next one, or ordersFocus().
      const was = [...ordersList.querySelectorAll('.trade__order-cancel')];
      const at = was.indexOf(document.activeElement);
      const open = list.filter((o) => o.status === 'open');
      const recent = list.filter((o) => o.status !== 'open' && o.status !== 'cancelled').slice(-3).reverse();
      const label = (o) => {
        const t = st.coins[o.coinId]?.ticker || o.coinId;
        if (o.type === 'limit-buy') return `Buy ${t} with ${money(o.amount)} at ${price(o.price)} or less`;
        if (o.type === 'limit-sell') return `Sell ${coinAmount(o.amount)} ${t} at ${price(o.price)} or more`;
        return `Stop-loss: sell ${coinAmount(o.amount)} ${t} at ${price(o.price)} or less`;
      };
      const chip = (o) => {
        if (o.status === 'expired') return h('span', { class: 'chip', text: 'Ended at the close' });
        if (o.status !== 'filled') return h('span', { class: 'chip chip--warn', text: `Couldn’t fill: ${fillProblem(o).chip}` });
        if (soldLow(o)) return h('span', { class: 'chip chip--warn', text: `Sold lower, at ${price(o.fill.price)}` });
        return h('span', { class: 'chip chip--ok', text: `Filled at ${price(o.fill.price)}` });
      };
      const cancel = (o) => {
        session.cancelOrder(o.id);
        notify('Order cancelled.', { say: '' });
        render();
        if (document.activeElement !== doneEl) announce('Order cancelled.'); // focus there reads it already
      };
      ordersList.replaceChildren(...(!open.length && !recent.length ? [] : [
        h('h3', { class: 'trade__orders-title', tabindex: '-1', text: 'Your orders' }),
        h('ul', { class: 'trade__orders-list' }, [
          ...open.map((o) => h('li', { class: 'trade__order' }, [
            h('span', { text: label(o) }),
            h('button', { class: 'btn btn--sm trade__order-cancel', type: 'button', dataset: { order: o.id }, onClick: () => cancel(o) }, ['Cancel', h('span', { class: 'visually-hidden', text: `: ${label(o)}` })]),
          ])),
          ...recent.map((o) => h('li', { class: 'trade__order is-done' }, [h('span', { text: label(o) }), chip(o)])),
        ]),
      ]));
      if (at >= 0) {
        const btns = [...ordersList.querySelectorAll('.trade__order-cancel')];
        const next = btns.find((b) => b.dataset.order === was[at].dataset.order) || btns[Math.min(at, btns.length - 1)];
        (next || ordersFocus()).focus({ preventScroll: true });
      }
    }
    // Where focus goes when its button in the list is gone: a Cancel, the list's heading, or the
    // notice. Never the amount field, which would open the keyboard on a phone.
    const ordersFocus = () =>
      ordersList.querySelector('.trade__order-cancel') || ordersList.querySelector('.trade__orders-title') || (doneEl.hidden ? submit : doneEl);
    // A news dialog gives focus back to the Cancel it came from, but if that order filled while the
    // dialog was open the button is gone. The dialog's close listener below catches that.
    let ordersHadFocus = false;
    ordersList.addEventListener('focusout', (e) => {
      ordersHadFocus = Boolean(e.relatedTarget?.closest('.lab-dialog'));
    });

    function renderDepth(st) {
      if (!depthBox?.open) return;
      const c = st.coins[market.selected];
      const d = session.depth(c.id, DEPTH_STEPS);
      if (!d.length || c.rugged) {
        depthDown.setAttribute('d', '');
        depthUp.setAttribute('d', '');
        depthText.textContent = c.rugged
          ? `${c.ticker}’s creator pulled the money out of its pool. Nobody can buy it now, and selling pays almost nothing.`
          : `${c.ticker}’s pool is empty, so it can’t be traded.`;
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
      if (c.phase === 'curve' && at(-30) < 1) text = `To push ${c.ticker} up 10% takes about ${money(at(10), 0)} of buying. It can’t fall lower yet: nobody has paid real money in.`;
      const q = st.portfolio.cash > 1 && !c.user ? session.quote(c.id, 'buy', st.portfolio.cash) : null;
      if (q?.ok) text += ` Spending all your ${money(st.portfolio.cash, 0)} would move it about ${number(q.priceImpactPct, 1)}%.`;
      depthText.textContent = text;
      depthSvg.setAttribute('aria-label', `Depth chart for ${c.ticker}. ${text}`);
    }

    // ---- portfolio and news ------------------------------------------------------------------
    // Numbers that change every tick are updated in place, so a screen reader keeps its place.
    const setText = (el, text) => {
      if (el.textContent === text) return;
      if (el.childNodes.length === 1 && el.firstChild.nodeType === Node.TEXT_NODE) el.firstChild.data = text;
      else el.textContent = text;
    };
    // A fresh delta() goes in only when its text or colour changes.
    const setDelta = (el, pct) => {
      const next = delta(pct);
      if (next.textContent === el.textContent && next.className === el.className) return el;
      el.replaceWith(next);
      return next;
    };
    const pfTotal = h('span', { class: 'lab-portfolio__total' }); // kept between ticks so its pulse can finish
    let pfDelta = h('span');
    const pfNote = h('span', { class: 'lab-portfolio__note' });
    const pfValue = h('p', { class: 'lab-portfolio__value' }, [pfTotal, pfDelta, pfNote]);
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

    // The rows are rebuilt only when the set of coins held changes; each tick updates their numbers.
    let pfKey = null;
    let pfLive = [];

    function buildPortfolioRows(st, held) {
      const cash = { value: h('span', { class: 'pf-row__value' }), share: h('span', { class: 'pf-row__share' }), seg: h('span', { class: 'alloc__seg alloc__seg--cash' }) };
      pfLive = [cash];
      const items = [
        h('li', { class: 'pf-row' }, [
          h('span', { class: 'coin-badge coin-badge--cash', 'aria-hidden': 'true', text: 'L$' }),
          h('span', { class: 'pf-row__name', text: 'Cash' }),
          cash.value,
          cash.share,
        ]),
      ];
      for (const id of held) {
        const c = st.coins[id];
        const row = {
          id,
          coins: h('span', { class: 'pf-row__coins' }),
          plText: document.createTextNode(''),
          plDelta: h('span'),
          value: h('span', { class: 'pf-row__value' }),
          share: h('span', { class: 'pf-row__share' }),
          seg: h('span', { class: `alloc__seg coin--${config.COIN_COLORS[c.colorId] || 'mint'}` }),
        };
        row.pl = h('span', { class: 'pf-row__pl', hidden: true }, [row.plText, row.plDelta]);
        pfLive.push(row);
        items.push(
          h('li', { class: 'pf-row' }, [
            badge(c),
            h('span', { class: 'pf-row__name' }, [h('span', { class: 'pf-row__ticker', text: c.ticker }), row.coins, row.pl]),
            row.value,
            row.share,
          ]),
        );
      }
      if (!held.length) items.push(h('li', { class: 'pf-empty', text: 'No coins yet. Pick a coin, choose an amount and tap Buy.' }));
      pfRows.replaceChildren(...items);
      allocBar.replaceChildren(...pfLive.map((r) => r.seg));
    }

    function renderPortfolio(st) {
      const p = st.portfolio;
      setText(pfTotal, money(p.value));
      if (totalMark == null) totalMark = p.value;
      else if (Math.abs(p.value / totalMark - 1) >= 0.01) {
        pulse(pfTotal, p.value > totalMark);
        totalMark = p.value;
      }
      pfDelta = setDelta(pfDelta, (p.value / p.startValue - 1) * 100);
      setText(pfNote, `Started with ${money(p.startValue)} · profit or loss ${signedMoney(p.value - p.startValue)}`);
      const held = Object.keys(p.holdings).filter((id) => st.coins[id]);
      if (held.join('|') !== pfKey) {
        pfKey = held.join('|');
        buildPortfolioRows(st, held);
      }
      const basis = costBasis(p.trades);
      const [cash, ...coinRows] = pfLive;
      setText(cash.value, money(p.cash));
      setText(cash.share, `${number((p.cash / p.value) * 100, 0)}%`);
      cash.seg.style.flexGrow = String(p.cash);
      for (const row of coinRows) {
        const coins = p.holdings[row.id];
        const value = coins * st.coins[row.id].price;
        const cost = basis[row.id]?.cost ?? 0;
        setText(row.coins, `${coinAmount(coins)} coins`);
        setText(row.value, money(value));
        setText(row.share, `${number((value / p.value) * 100, 0)}%`);
        row.seg.style.flexGrow = String(value);
        row.pl.hidden = !(cost > 0);
        if (cost > 0) {
          const pl = `${signedMoney(value - cost)} `;
          if (row.plText.data !== pl) row.plText.data = pl;
          row.plDelta = setDelta(row.plDelta, (value / cost - 1) * 100);
        }
      }
    }

    // ---- your coin: the entry to Create, then the launch outcome explained --------------------
    const mineBody = h('div', { class: 'lab-mine__body' });
    // The contract sits outside mineBody, which changes every tick, so an open <details> stays open.
    const contractBox = h('div', { class: 'lab-contract' });
    const mineCard = h('div', { class: 'card lab-mine' }, [h('h2', { class: 'lab-card__title', text: 'Your coin' }), mineBody, contractBox]);
    let mineMode = null;
    let contractFor = null;
    // The live card is built once per coin; each tick only changes its numbers and stage text, so a screen
    // reader keeps its place. The notes list is rebuilt only when its text changes (the copycat line, say).
    let mineLive = null;

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
      if (mode !== 'live') mineLive = null;
      if (mode === 'wait') {
        mineBody.replaceChildren(h('p', { class: 'lab-mine__text', text: 'After Penny’s first news, you can launch your own coin here and watch how buyers react.' }));
        return;
      }
      if (mode === 'ready') {
        setTimeout(prefetchDesigner, 1500);
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
      // Explorers get plain words for the bonding curve (BRIEF §2); Traders and Builders keep the real terms.
      const grown = Math.round(coin.curveProgress * 100);
      const stage = tierInfo.rank === 0
        ? coin.phase === 'curve'
          ? `A brand-new coin: its price rises as people buy. ${grown}% of the way to its own trading pool.`
          : `Has its own trading pool since Day ${day(coin.graduatedAt)}`
        : coin.phase === 'curve'
          ? `On its bonding curve: ${grown}% of the way to a real pool`
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
      if (mineLive?.id !== coin.id) {
        mineLive = {
          id: coin.id,
          stage: h('p', { class: 'lab-mine__stage' }),
          value: h('span', { class: 'lab-mine__value' }),
          change: h('span'),
          since: h('span', { class: 'lab-mine__since' }),
          notes: h('ul'),
          notesKey: null,
        };
        mineBody.replaceChildren(
          h('div', { class: 'lab-mine__head' }, [
            badge(coin),
            h('div', { class: 'lab-mine__label' }, [h('p', { class: 'lab-mine__name', text: `${coin.name} (${coin.ticker})` }), mineLive.stage]),
          ]),
          h('p', { class: 'lab-mine__price' }, [mineLive.value, mineLive.change, mineLive.since]),
          mineLive.notes,
        );
      }
      const m = mineLive;
      setText(m.stage, stage);
      setText(m.value, price(coin.price));
      m.change = setDelta(m.change, (coin.price / L.price0 - 1) * 100);
      setText(m.since, `since launch on Day ${day(L.t)} · ${coin.holders} holders`);
      const notesKey = notes.map((n) => `${n.tone}:${n.text}`).join('|');
      if (notesKey !== m.notesKey) {
        const list = notesList(notes);
        m.notes.replaceWith(list);
        m.notes = list;
        m.notesKey = notesKey;
      }
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

    // The wash-volume lesson plays once, the first time a Builder sees the overlay (BRIEF §5 events). It waits
    // while the Volume tool is off, since the overlay is drawn only with it.
    function maybeWashLesson(st) {
      const c = st.coins[market.selected];
      if (market.washSeen || market.closed || dialog.open || !advancedOn() || !toolOn(TOOLS[0]) || tier !== 'builder' || !(c.totalWashVolume > 0)) return;
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
      if (!alive) return;
      // Closing the end-of-market panel (Esc) leaves the same panel in the page, never a frozen market. The
      // Basic / Advanced toggle has nothing left to switch there, and focus moves to the report card button.
      if (market.closed) {
        modeToggle.remove();
        view.replaceChildren(h('div', { class: 'screen' }, [head, closedPanel(session.getState())]));
        focusOn(view.querySelector('.result__actions .btn'));
      } else if (market.queued.length) openEvent(market.queued.shift());
      else renderClock(session.getState());
    });

    function eventCopy(id) {
      const ev = market.data.events;
      const fromFile = ev?.[id]?.[tier] ?? ev?.[tier]?.[id];
      return fromFile?.headline && fromFile?.narration ? fromFile : FALLBACK_EVENTS[id] || { headline: 'Something happened in the market', narration: '' };
    }

    // Two events can fire in the same tick (the copycat is timed from the launch), so a second one waits for
    // the first dialog to close, and each gets its own narration and question.
    function openEvent(e) {
      if (dialog.open) {
        market.queued.push(e);
        renderNews();
        return;
      }
      pauses.add('event');
      const copy = eventCopy(e.id);
      // The engine says whether the news is bad (the copycat events are made at run time, not in scenario.json).
      const negative = e.negative ?? Boolean(scenario.events.find((x) => x.id === e.id)?.negative);
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
    // Two column wrappers. From 1024 px each one stacks its cards on its own, so a tall card never leaves a gap
    // beside it, and news follows the chart. On phones they let their cards join the one-column grid (display:
    // contents), and news sits after Your coin there, so the reading order matches what is on screen.
    const mainCol = h('div', { class: 'lab-col lab-col--main' }, [chartCard]);
    const sideCol = h('div', { class: 'lab-col lab-col--side' }, [tradeCard, portfolioCard, mineCard, chainCard]);
    const placeColumns = () => (wide.matches ? mainCol.append(newsCard, flowCard) : chainCard.before(newsCard, flowCard));
    placeColumns();
    view.replaceChildren(
      h('div', { class: 'lab' }, [h('div', { class: 'lab-top' }, [head, clock]), coinsCard, mainCol, sideCol]),
      dialog,
    );
    head.append(modeToggle);
    if (keepFocus) focusOn(head.querySelector('h1')); // before the Coach offer, which takes focus from here
    const onWide = () => {
      placeColumns();
      render();
    };
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
      // The first coached trade needs Market and Buy, whatever the panel was left on (contract C3).
      prepareTrade: () => {
        if (ordersOn) setOrderType('market');
        setSide('buy');
        select('VAULT');
      },
      tradesCount: () => session.getState().portfolio.trades.length,
      canTrade: () => !form.hidden && ready,
      hasNews: () => market.news.length > 0,
      hasCoin: () => Object.values(session.getState().coins).some((c) => c.user),
      drillConfig: () => ({ ...structuredClone({ coinsConfig: market.data.coinsConfig, agentsConfig: market.data.agentsConfig, scenario: market.data.scenario }), seed: market.seed, tier }),
    };
    cleanup.push(attachCoach(coachEnv));
    // The engine sends one 'order' event per fill; they are reported together once the tick is done.
    cleanup.push(session.on('order', (o) => {
      if (!fills.length) queueMicrotask(reportFills);
      fills.push(o);
    }));
    // At the close the list behind the closing panel shows which open orders ended.
    cleanup.push(session.on('close', (final) => renderOrders(final)));
    dialog.addEventListener('close', () => {
      // Focus still in the closed dialog (or on the page) means the way back was gone.
      const lost = document.activeElement === document.body || dialog.contains(document.activeElement);
      if (ordersHadFocus && lost) ordersFocus().focus({ preventScroll: true });
      ordersHadFocus = false;
    });
    // Badge mints go into today's chain while this market is open (BRIEF §15).
    setChainSink((id) => {
      if (market.closed || liveMarket() !== market) return false;
      session.recordMint(id);
      return true;
    });
    if (!store.get().coach?.[tier]?.offered && !isCoaching()) openCoachMenu(coachEnv, { offer: true });

    render();
    renderNews();
    if (market.queued.length) openEvent(market.queued.shift()); // news the player left before it opened
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
