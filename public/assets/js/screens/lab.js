// Market Lab: today's market (BRIEF §3 steps 3, 4 and 6; slice J2).
// A live chart, coin list, trade panel and portfolio over the sim engine (sim/session.js).
// The market only runs while this screen is open and visible. An event pauses it while Penny
// narrates and asks one question. When it closes, the run is saved to store.lab[tier] for the
// report card (#/report).
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
} from '../vendor/lightweight-charts/lightweight-charts.standalone.production.mjs';
import { createSession } from '../sim/session.js';
import { bangkokDate, dailySeed } from '../sim/prng.js';
import {
  animate, announce, celebrate, delta, getJSON, h, icon, money, number, penny, price, questionCard, resultPanel,
  stateView, trend,
} from '../ui.js';

// The market outlives the screen, so a trip to #/create and back resumes it. One per tier and day.
let live = null;
let dataPromise = null;

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
};

const CHART_CREDIT = 'https://www.tradingview.com/';

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

  function load() {
    view.replaceChildren(stateView({ kind: 'loading', title: 'Opening today’s market…' }));
    loadData(config.DATA_BASE)
      .then((data) => alive && start(data))
      .catch((err) => {
        if (!alive) return;
        view.replaceChildren(
          stateView({
            kind: 'error',
            title: 'Today’s market didn’t open',
            body: err.message,
            actions: [
              h('button', { class: 'btn btn--primary', type: 'button', onClick: load }, 'Try again'),
              h('button', { class: 'btn', type: 'button', onClick: () => navigate('/') }, 'Back to start'),
            ],
          }),
        );
      });
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

    if (market.closed) {
      view.replaceChildren(h('div', { class: 'screen' }, [head, closedPanel(session.getState())]));
      return;
    }

    // ---- clock: day, time left, pause and finish ----------------------------------------
    let timer = 0;
    const pauses = new Set(); // 'user' | 'event' | 'hidden' | 'closed'
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
    const actions = h('div', { class: 'lab-clock__actions' }, [pauseBtn, finishBtn]);
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

    const colorOf = (c) => config.COIN_COLORS[c.colorId] || 'mint';
    const badge = (c) => h('span', { class: `coin-badge coin--${colorOf(c)}`, 'aria-hidden': 'true', text: c.ticker[0] });

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
              h('span', { class: 'coin-row__full', text: c.name }),
            ]),
            h('span', { class: 'coin-row__meta' }, [priceEl, changeEl]),
          ]);
          row = { el, priceEl, changeEl };
          rows.set(c.id, row);
          coinList.append(el);
        }
        row.el.setAttribute('aria-pressed', String(c.id === market.selected));
        row.priceEl.textContent = price(c.price);
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
    const chartCard = h('div', { class: 'card lab-chart' }, [
      h('div', { class: 'lab-chart__head' }, [chartBadge, h('div', { class: 'lab-chart__label' }, [chartTitle, chartChips]), chartPrice]),
      chartBox,
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
    const sessionCandles = scenario.ticks / scenario.candleTicks;

    // Candles fill a fixed window from the left (about 6 px each, the whole month on wide screens);
    // once it is full, the newest candle stays in view.
    function keepInView(count) {
      const span = Math.max(40, Math.min(sessionCandles, Math.floor(chartBox.clientWidth / 6)));
      if (count <= span) chart.timeScale().setVisibleLogicalRange({ from: -1.5, to: span - 1.5 });
      else chart.timeScale().scrollToRealTime();
    }

    function renderChart(st) {
      const c = st.coins[market.selected];
      const ks = c.candles;
      if (chartCoin !== c.id) {
        candleSeries.setData(ks.map(toBar));
        volumeSeries.setData(ks.map(toVolume));
        keepInView(ks.length);
        chartCoin = c.id;
        chartBadge.replaceChildren(badge(c));
        chartTitle.textContent = `${c.name} (${c.ticker})`;
      } else {
        for (let i = Math.max(0, chartCount - 1); i < ks.length; i++) {
          candleSeries.update(toBar(ks[i]));
          volumeSeries.update(toVolume(ks[i]));
        }
        if (ks.length !== chartCount) keepInView(ks.length);
      }
      chartCount = ks.length;
      chartPrice.replaceChildren(h('span', { class: 'lab-chart__value', text: price(c.price) }), delta(dayChange(c, st)));
      const chips = [];
      if (c.rugged) chips.push(h('span', { class: 'chip chip--loss', text: 'Rug pulled' }));
      else if (c.phase === 'curve') chips.push(h('span', { class: 'chip', text: `Bonding curve ${Math.round(c.curveProgress * 100)}% to launch` }));
      if (c.class === 'stablecoin') chips.push(h('span', { class: 'chip', text: 'Aims for L$1.00' }));
      if (c.maxSupply) chips.push(h('span', { class: 'chip', text: `Supply ${coinAmount(c.supply)} of ${coinAmount(c.maxSupply)}` }));
      else chips.push(h('span', { class: 'chip', text: `Supply ${coinAmount(c.supply)}` }));
      chartChips.replaceChildren(...chips);
    }

    // ---- trade panel -------------------------------------------------------------------------
    const sideButtons = ['buy', 'sell'].map((side) =>
      h('button', { class: 'segmented__btn', type: 'button', onClick: () => setSide(side) }, side === 'buy' ? 'Buy' : 'Sell'),
    );
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
    const form = h('form', { class: 'trade', novalidate: true, onSubmit: trade }, [
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Buy or sell' }, sideButtons),
      tradeLabel,
      h('div', { class: 'trade__field' }, [tradeInput, tradeUnit]),
      h('div', { class: 'trade__quick' }, quick),
      preview,
      errorEl,
      submit,
      doneEl,
    ]);
    tradeInput.setAttribute('aria-describedby', 'trade-preview');
    const tradeCard = h('div', { class: 'card lab-trade' }, [tradeTitle, form]);

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
      tradeLabel.textContent = buying ? 'How many L$ to spend' : `How many ${c.ticker} to sell`;
      tradeUnit.textContent = buying ? 'L$' : c.ticker;
      submit.replaceChildren(`${buying ? 'Buy' : 'Sell'} ${c.ticker}`);

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
          preview.textContent = buying
            ? `You get about ${coinAmount(q.filledCoins)} ${c.ticker}. Your trade moves the price ${pct(q.priceImpactPct)}.`
            : `You get about ${money(q.filledL$)}. Your trade moves the price ${pct(q.priceImpactPct)}.`;
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

    // ---- portfolio and news ------------------------------------------------------------------
    const pfValue = h('p', { class: 'lab-portfolio__value' });
    const pfRows = h('ul', { class: 'lab-portfolio__rows' });
    const portfolioCard = h('div', { class: 'card lab-portfolio' }, [
      h('h2', { class: 'lab-card__title', text: 'Your portfolio' }),
      pfValue,
      pfRows,
    ]);

    function renderPortfolio(st) {
      const p = st.portfolio;
      pfValue.replaceChildren(
        h('span', { class: 'lab-portfolio__total', text: money(p.value) }),
        delta((p.value / p.startValue - 1) * 100),
        h('span', { class: 'lab-portfolio__note', text: `Started with ${money(p.startValue)}` }),
      );
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
        items.push(
          h('li', { class: 'pf-row' }, [
            badge(c),
            h('span', { class: 'pf-row__name' }, [
              h('span', { class: 'pf-row__ticker', text: c.ticker }),
              h('span', { class: 'pf-row__coins', text: `${coinAmount(coins)} coins` }),
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
    }

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
        newsCard,
      ]),
      dialog,
    );

    function render() {
      const st = session.getState();
      renderClock(st);
      renderCoins(st);
      renderChart(st);
      renderTrade(st);
      renderPortfolio(st);
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
