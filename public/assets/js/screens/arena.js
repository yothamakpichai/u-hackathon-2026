// Arena (BRIEF §15): one live market on the server, shared by real players and four bots, polled every 1.5 s.
// Simulated L$ only. Entry needs Trader level or above and a Money Health Score of 70 or more. Accounts are a
// username, a password and a birth year; no email or phone. The server decides prices, balances and trades.
import { h, icon, stateView, money, price, delta, number, announce } from '../ui.js';
import { scoreRun } from '../score.js';

const API = 'api/arena.php';
const POLL_MS = 1500;
const ENTRY_SCORE = 70;
const FEE = 0.003;
const SVG = 'http://www.w3.org/2000/svg';
const BOT_NAMES = { 'market maker': 'Market maker bot', momentum: 'Momentum bot', whale: 'Whale bot', 'wash bot': 'Wash bot' };

// The best Money Health Score from a finished market at Trader or Builder level, or null.
export function arenaScore(state) {
  let best = null;
  for (const t of ['trader', 'builder']) {
    const run = state.lab?.[t];
    if (!run) continue;
    const s = scoreRun({ run, check: state.check?.[t], lesson: state.lesson?.[t], tier: t }).total;
    best = best === null ? s : Math.max(best, s);
  }
  return best;
}

export async function arenaEnabled() {
  try {
    const res = await fetch(`${API}?action=status`);
    return res.ok && (await res.json())?.enabled === true;
  } catch {
    return false;
  }
}

export function mount(root, ctx) {
  const { store, navigate, config, tier } = ctx;
  let alive = true;
  let timer = null;
  let csrf = null;
  let coin = 'VAULT';
  let side = 'buy';
  let polling = false;
  let last = null;
  let onVisible = null;

  const body = h('div', { class: 'arena__body' });
  const view = h('section', { class: 'screen arena' }, [
    h('div', { class: 'screen-head' }, [
      h('p', { class: 'screen-eyebrow', text: 'Arena · Live market' }),
      h('h1', { class: 'screen-title', tabindex: '-1', text: 'Arena' }),
      h('p', { class: 'screen-sub', text: 'Trade with real players and bots in one shared market. Simulated L$ only: never real money.' }),
    ]),
    body,
    h('p', { class: 'arena__privacy' }, [h('a', { href: '#/privacy', text: 'Arena privacy notice' })]),
  ]);
  root.append(view);

  async function api(action, { method = 'GET', data, query = '' } = {}) {
    let res;
    try {
      res = await fetch(`${API}?action=${action}${query}`, {
        method,
        credentials: 'same-origin',
        headers: method === 'POST' ? { 'Content-Type': 'application/json', ...(csrf && { 'X-CSRF-Token': csrf }) } : {},
        body: method === 'POST' ? JSON.stringify(data || {}) : undefined,
      });
    } catch {
      throw Object.assign(new Error('Could not reach the Arena. Check your connection.'), { code: 'NETWORK' });
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw Object.assign(new Error(json?.error?.message || `The Arena didn’t answer (error ${res.status}).`), { code: json?.error?.code || 'HTTP' });
    return json;
  }

  const show = (...nodes) => body.replaceChildren(...nodes);
  const back = (label, to) => h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate(to) }, label);

  async function start() {
    show(stateView({ kind: 'loading', title: 'Opening the Arena…' }));
    if (!(await arenaEnabled())) {
      if (alive) show(stateView({ kind: 'empty', title: 'The Arena is closed right now', body: 'Today’s market is open, and you can practise there any time.', actions: [back('Open today’s market', '/lab')] }));
      return;
    }
    if (config.getTier(tier)?.rank < 1) {
      show(stateView({ kind: 'empty', title: 'The Arena opens at Trader level', body: 'It is for players aged 13 and up. Keep exploring today’s market: every run makes you a sharper trader.', actions: [back('Open today’s market', '/lab')] }));
      return;
    }
    const best = arenaScore(store.get());
    if (best === null || best < ENTRY_SCORE) {
      show(
        stateView({
          kind: 'empty',
          title: `Score ${ENTRY_SCORE} or more to enter`,
          body: `${best === null ? 'You haven’t finished a market at Trader or Builder level yet.' : `Your best Money Health Score is ${best}.`} Spread your risk, stay calm after bad news and answer Penny’s questions, then finish today’s market with ${ENTRY_SCORE}+ to unlock the Arena.`,
          actions: [back('Open today’s market', '/lab')],
        }),
      );
      return;
    }
    try {
      const me = await api('me');
      csrf = me.csrf;
      if (!alive) return;
      if (me.user) market(me.user);
      else auth('signup');
    } catch (err) {
      if (alive) show(stateView({ kind: 'error', title: 'The Arena didn’t load', body: err.message, actions: [h('button', { class: 'btn', type: 'button', onClick: start }, 'Try again')] }));
    }
  }

  // ---------------------------------------------------------------- sign up and log in

  async function auth(mode) {
    stop();
    const error = h('p', { class: 'arena-error', role: 'alert', hidden: true });
    const tabs = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Account' }, [
      h('button', { class: `segmented__btn${mode === 'signup' ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(mode === 'signup'), onClick: () => auth('signup') }, 'Create account'),
      h('button', { class: `segmented__btn${mode === 'login' ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(mode === 'login'), onClick: () => auth('login') }, 'Log in'),
    ]);
    const field = (id, label, input, hint) => h('div', { class: 'arena-field' }, [h('label', { class: 'arena-label', for: id, text: label }), input, hint ? h('p', { class: 'arena-hint', text: hint }) : null]);
    const username = h('input', { id: 'arena-user', class: 'arena-input', name: 'username', autocomplete: 'username', maxlength: 16, required: true, spellcheck: 'false' });
    const password = h('input', { id: 'arena-pass', class: 'arena-input', name: 'password', type: 'password', autocomplete: mode === 'signup' ? 'new-password' : 'current-password', minlength: 8, maxlength: 128, required: true });
    const fields = [
      field('arena-user', 'Username', username, mode === 'signup' ? '3 to 16 letters, numbers or _. Not your real name.' : null),
      field('arena-pass', 'Password', password, mode === 'signup' ? 'At least 8 characters. Don’t reuse a password from anywhere else.' : null),
    ];

    let year = null;
    const quizAnswers = [];
    if (mode === 'signup') {
      const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.TIME_ZONE, year: 'numeric' }).format(new Date()));
      year = h('select', { id: 'arena-year', class: 'arena-input' }, Array.from({ length: 98 }, (_, i) => thisYear - 3 - i).map((y) => h('option', { value: String(y), text: String(y), selected: y === store.get().birthYear })));
      fields.push(field('arena-year', 'Birth year', year, 'Only used to check you are 13 or older.'));
      let quiz = [];
      try {
        quiz = (await api('quiz')).quiz;
      } catch {
        quiz = [];
      }
      quiz.forEach((q, i) => {
        quizAnswers[i] = null;
        fields.push(
          h('fieldset', { class: 'quiz' }, [
            h('legend', { class: 'quiz__legend', text: `${i + 1}. ${q.prompt}` }),
            ...q.options.map((opt, j) =>
              h('label', { class: 'quiz__option' }, [h('input', { type: 'radio', name: `arena-q${i}`, value: String(j), onChange: () => (quizAnswers[i] = j) }), h('span', { text: opt })]),
            ),
          ]),
        );
      });
    }

    const submit = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, mode === 'signup' ? 'Create my Arena account' : 'Log in');
    const form = h('form', { class: 'card arena-auth', novalidate: true, onSubmit: send }, [
      tabs,
      h('p', { class: 'arena-auth__note', text: mode === 'signup' ? 'We keep only a username, a scrambled password and your birth year: no email, no phone, no real name.' : 'Welcome back! Log in with your Arena username.' }),
      ...fields,
      error,
      submit,
    ]);
    show(form);
    username.focus();

    async function send(e) {
      e.preventDefault();
      error.hidden = true;
      if (mode === 'signup' && quizAnswers.some((a) => a === null)) {
        error.textContent = 'Answer the 3 screening questions first.';
        error.hidden = false;
        return;
      }
      submit.disabled = true;
      try {
        const data = { username: username.value.trim(), password: password.value };
        if (mode === 'signup') Object.assign(data, { birthYear: Number(year.value), quiz: quizAnswers });
        const res = await api(mode, { method: 'POST', data });
        csrf = res.csrf;
        if (alive) market(res.user);
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        submit.disabled = false;
        password.value = '';
      }
    }
  }

  // ---------------------------------------------------------------- the live market

  function market(user) {
    const tabs = h('div', { class: 'arena-coins', role: 'group', 'aria-label': 'Coins' });
    const chart = h('div', { class: 'arena-chart' });
    const chartHead = h('div', { class: 'arena-chart__head' });
    const washNote = h('p', { class: 'arena-chart__note', hidden: true });
    const live = h('span', { class: 'arena-live' }, [h('span', { class: 'arena-live__dot', 'aria-hidden': 'true' }), 'Live']);
    const pf = h('div', { class: 'arena-pf' });
    const board = h('ol', { class: 'board__list' });
    const feed = h('ul', { class: 'arena-feed' });

    const amount = h('input', { id: 'arena-amount', class: 'arena-input', type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '0' });
    const amountLabel = h('label', { class: 'arena-label', for: 'arena-amount' });
    const preview = h('p', { class: 'arena-trade__preview', 'aria-live': 'polite' });
    const result = h('p', { class: 'arena-trade__result', role: 'status' });
    const go = h('button', { class: 'btn btn--primary btn--block', type: 'submit' });
    const sideBtns = ['buy', 'sell'].map((s) => h('button', { class: 'segmented__btn', type: 'button', dataset: { side: s }, onClick: () => setSide(s) }, s === 'buy' ? 'Buy' : 'Sell'));
    const quick = [0.25, 0.5, 1].map((f) => h('button', { class: 'btn btn--sm', type: 'button', onClick: () => fill(f) }, f === 1 ? 'Max' : `${f * 100}%`));
    const tradeForm = h('form', { class: 'card arena-trade', novalidate: true, onSubmit: trade }, [
      h('h2', { class: 'arena-title', text: 'Trade' }),
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Buy or sell' }, sideBtns),
      h('div', { class: 'arena-field' }, [amountLabel, amount]),
      h('div', { class: 'arena-trade__quick' }, quick),
      preview,
      go,
      result,
    ]);
    amount.addEventListener('input', renderPreview);

    show(
      h('div', { class: 'arena-top' }, [
        h('p', { class: 'arena-top__who' }, [`Signed in as `, h('strong', { text: user.username })]),
        h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: logout }, 'Log out'),
      ]),
      tabs,
      h('div', { class: 'arena-grid' }, [
        h('div', { class: 'arena-main' }, [h('div', { class: 'card' }, [chartHead, chart, washNote]), tradeForm]),
        h('div', { class: 'arena-side' }, [
          h('div', { class: 'card' }, [h('div', { class: 'arena-card-head' }, [h('h2', { class: 'arena-title', text: 'Your portfolio' }), live]), pf]),
          h('div', { class: 'card' }, [h('h2', { class: 'arena-title', text: 'Leaderboard' }), h('p', { class: 'board__note', text: 'Ranked by portfolio value in simulated L$.' }), board]),
          h('div', { class: 'card' }, [h('h2', { class: 'arena-title', text: 'Latest trades' }), h('p', { class: 'board__note', text: 'Players, the whale bot and the momentum bot.' }), feed]),
          h('div', { class: 'card card--quiet' }, [
            h('h2', { class: 'arena-title', text: 'Who else is trading?' }),
            h('p', { class: 'arena-help', text: 'Four bots trade here all the time. A market maker keeps prices near a fair value, a momentum bot follows trends and makes moves bigger, a whale sometimes sells a huge pile at once, and a wash bot trades FUEL with itself to fake busy volume.' }),
            h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: removeAccount }, 'Delete my Arena account'),
          ]),
        ]),
      ]),
    );
    setSide(side);
    poll();
    timer = setInterval(poll, POLL_MS);
    onVisible = poll;
    document.addEventListener('visibilitychange', onVisible);

    function setSide(s) {
      side = s;
      sideBtns.forEach((b) => {
        const on = b.dataset.side === s;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      amount.value = '';
      renderTradeLabels();
      renderPreview();
    }

    function renderTradeLabels() {
      amountLabel.textContent = side === 'buy' ? 'L$ to spend' : `${coin} to sell`;
      go.textContent = `${side === 'buy' ? 'Buy' : 'Sell'} ${coin}`;
    }

    function fill(f) {
      if (!last) return;
      const held = last.me.holdings.find((x) => x.coin === coin)?.coins || 0;
      const max = side === 'buy' ? last.me.cash : held;
      amount.value = String(Math.floor(max * f * 100) / 100);
      renderPreview();
    }

    // The same pool maths as the server, so the player sees the price impact before trading.
    function renderPreview() {
      const c = last?.coins.find((x) => x.id === coin);
      const a = Number(amount.value);
      if (!c || !(a > 0)) {
        preview.textContent = side === 'buy' ? 'Big trades move the price more than small ones.' : 'Selling adds coins to the pool, which pushes the price down.';
        return;
      }
      const rl = c.reserveL;
      const rc = c.reserveCoins;
      let after;
      let get;
      if (side === 'buy') {
        const inL = a * (1 - FEE);
        get = (rc * inL) / (rl + inL);
        after = (rl + a) / (rc - get);
        preview.textContent = `You get about ${number(get, 4)} ${coin}. Your trade moves the price about ${number(Math.abs(after / c.price - 1) * 100, 2)}%.`;
      } else {
        const inC = a * (1 - FEE);
        get = (rl * inC) / (rc + inC);
        after = (rl - get) / (rc + a);
        preview.textContent = `You get about ${money(get)}. Your trade moves the price about ${number(Math.abs(after / c.price - 1) * 100, 2)}%.`;
      }
    }

    async function trade(e) {
      e.preventDefault();
      const a = Number(amount.value);
      result.textContent = '';
      if (!(a > 0)) {
        result.textContent = side === 'buy' ? 'Type how many L$ to spend.' : `Type how many ${coin} to sell.`;
        return;
      }
      go.disabled = true;
      try {
        const res = await api('trade', { method: 'POST', data: { coin, side, amount: a } });
        const t = res.trade;
        result.textContent = `${t.side === 'buy' ? 'Bought' : 'Sold'} ${number(t.coins, 4)} ${t.coin} for ${money(t.amountL)}. Your trade moved the price ${number(t.impactPct, 2)}%.`;
        announce(result.textContent);
        amount.value = '';
        render(res);
      } catch (err) {
        result.textContent = err.message;
        if (err.code === 'SIGNED_OUT') auth('login');
      } finally {
        go.disabled = false;
      }
    }

    async function poll() {
      if (polling || !alive || document.hidden) return;
      polling = true;
      try {
        const res = await api('state', { query: `&coin=${coin}` });
        if (res.coin !== coin) return; // answered for the coin before the last tap
        live.classList.remove('is-off');
        live.lastChild.textContent = 'Live';
        if (alive) render(res);
      } catch (err) {
        if (err.code === 'SIGNED_OUT') return auth('login');
        live.classList.add('is-off');
        live.lastChild.textContent = 'Reconnecting…';
      } finally {
        polling = false;
      }
    }

    function render(s) {
      last = s;
      const c = s.coins.find((x) => x.id === coin);
      tabs.replaceChildren(
        ...s.coins.map((x) =>
          h('button', { class: `arena-coin${x.id === coin ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(x.id === coin), onClick: () => pick(x.id) }, [
            h('span', { class: 'arena-coin__id', text: x.id }),
            h('span', { class: 'arena-coin__price', text: price(x.price) }),
            delta(x.changePct),
          ]),
        ),
      );
      chartHead.replaceChildren(
        h('h2', { class: 'arena-title', text: `${c.id} · ${c.name}` }),
        h('p', { class: 'arena-chart__price' }, [price(c.price), ' ', delta(c.changePct)]),
      );
      chart.replaceChildren(candles(s.candles, c));
      washNote.hidden = !c.wash;
      washNote.textContent = c.wash ? 'Amber bars are wash volume: a bot buying from and selling to itself. It looks busy, but the price barely moves. Real demand is the grey part.' : '';

      const held = s.me.holdings;
      pf.replaceChildren(
        h('p', { class: 'arena-pf__value' }, [money(s.me.value), ' ', delta((s.me.value / s.me.startValue - 1) * 100)]),
        h('ul', { class: 'arena-pf__list' }, [
          h('li', {}, [h('span', { text: 'Cash' }), h('span', { text: money(s.me.cash) })]),
          ...held.map((x) => h('li', {}, [h('span', { text: `${number(x.coins, 4)} ${x.coin}` }), h('span', { text: money(x.value) })])),
        ]),
      );
      board.replaceChildren(
        ...s.leaderboard.map((r) =>
          h('li', { class: `board__row${r.username === user.username ? ' is-me' : ''}` }, [
            h('span', { class: 'board__rank', text: String(r.rank) }),
            h('span', { class: 'board__name', text: r.username }),
            r.username === user.username ? h('span', { class: 'board__you', text: 'You' }) : null,
            h('span', { class: 'board__score arena-board__value', text: money(r.value, 0) }),
          ]),
        ),
      );
      feed.replaceChildren(
        ...(s.trades.length
          ? s.trades.map((t) =>
              h('li', { class: `arena-feed__item${t.bot ? ' is-bot' : ''}` }, [
                h('span', { class: 'arena-feed__who', text: t.bot ? BOT_NAMES[t.who] || 'Bot' : t.who }),
                h('span', { text: `${t.side === 'buy' ? 'bought' : 'sold'} ${number(t.coins, t.coins >= 100 ? 0 : 3)} ${t.coin}` }),
                h('span', { class: 'arena-feed__l', text: money(t.amountL, 0) }),
              ]),
            )
          : [h('li', { class: 'arena-feed__item', text: 'No trades yet. Be the first!' })]),
      );
      renderTradeLabels();
      if (document.activeElement !== amount) renderPreview();
    }

    function pick(id) {
      coin = id;
      amount.value = '';
      result.textContent = '';
      renderTradeLabels();
      if (last) render({ ...last, candles: [], coins: last.coins });
      polling = false;
      poll();
    }

    async function logout() {
      try {
        await api('logout', { method: 'POST' });
      } catch {
        // already signed out on the server
      }
      csrf = null;
      auth('login');
    }

    async function removeAccount() {
      if (!confirm('Delete your Arena account, your coins and your place on the leaderboard? This can’t be undone.')) return;
      try {
        await api('delete', { method: 'POST' });
        csrf = null;
        auth('signup');
      } catch (err) {
        result.textContent = err.message;
      }
    }
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    onVisible = null;
  }

  start();

  return () => {
    alive = false;
    stop();
    view.remove();
  };
}

// Candles and a volume strip whose amber part is wash volume. Colour is never the only signal: the price line has
// a delta with an arrow next to it.
function candles(list, coin) {
  const W = 600;
  const H = 230;
  const P = 160;
  const el = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  };
  const first = list[0]?.open ?? coin.price;
  const lastClose = list.at(-1)?.close ?? coin.price;
  const svg = el('svg', { class: 'arena-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${coin.id} price over the last ${Math.max(1, Math.round((list.length * 10) / 60))} minutes, from ${price(first)} to ${price(lastClose)}` });
  if (!list.length) {
    const t = el('text', { x: W / 2, y: P / 2, 'text-anchor': 'middle', class: 'arena-svg__empty' });
    t.textContent = 'Waiting for the first trades…';
    svg.append(t);
    return svg;
  }
  const hi = Math.max(...list.map((c) => c.high));
  const lo = Math.min(...list.map((c) => c.low));
  const pad = (hi - lo) * 0.08 || hi * 0.001;
  const y = (v) => 8 + (P - 16) * (1 - (v - (lo - pad)) / (hi - lo + 2 * pad));
  const step = W / Math.max(60, list.length);
  const vmax = Math.max(...list.map((c) => c.volume)) || 1;
  list.forEach((c, i) => {
    const x = i * step + step / 2;
    const up = c.close >= c.open;
    svg.append(el('line', { x1: x, x2: x, y1: y(c.high), y2: y(c.low), class: `arena-svg__wick ${up ? 'is-up' : 'is-down'}` }));
    const top = y(Math.max(c.open, c.close));
    svg.append(el('rect', { x: x - step * 0.32, y: top, width: step * 0.64, height: Math.max(1.5, y(Math.min(c.open, c.close)) - top), class: `arena-svg__body ${up ? 'is-up' : 'is-down'}` }));
    const vh = (c.volume / vmax) * 56;
    const wh = (c.washVolume / vmax) * 56;
    svg.append(el('rect', { x: x - step * 0.32, y: H - vh, width: step * 0.64, height: vh - wh, class: 'arena-svg__vol' }));
    if (wh > 0) svg.append(el('rect', { x: x - step * 0.32, y: H - wh, width: step * 0.64, height: wh, class: 'arena-svg__wash' }));
  });
  for (const [v, cls] of [[hi, 'hi'], [lo, 'lo']]) {
    const t = el('text', { x: W - 4, y: y(v) + (cls === 'hi' ? -4 : 12), 'text-anchor': 'end', class: 'arena-svg__label' });
    t.textContent = price(v);
    svg.append(t);
  }
  return svg;
}
