// Arena (BRIEF §15, §16): one live market on the server, shared by real players and four bots, polled every 1.5 s.
// Simulated L$ only. It needs a free Penny account (api/account.php). Kids enter at Trader level or above with a
// Money Health Score of 70+ in the Market Lab or a passed Unit 2 checkpoint; adults (20+) skip the score gate.
// The server decides prices, balances and trades, and checks 13+ from the account's birth year.
import { h, icon, stateView, money, price, delta, number } from '../ui.js';
import { scoreRun } from '../score.js';
import * as sync from '../sync.js';
import { walletBar } from './arena/wallet.js';
import { launchPanel } from './arena/launch.js';
import { coinPanel, tabTag } from './arena/coin.js';
import { feedView } from './arena/feed.js';
import { newsDesk } from './arena/news.js';
import { seasonPanel } from './arena/season.js';

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

export async function arenaStatus() {
  try {
    const res = await fetch(`${API}?action=status`);
    const json = res.ok ? await res.json() : null;
    return { enabled: json?.enabled === true, v2: json?.enabled === true && json?.v2 === true };
  } catch {
    return { enabled: false, v2: false };
  }
}

export async function arenaEnabled() {
  return (await arenaStatus()).enabled;
}

const REASONS = {
  NO_ACCOUNT: 'Make an account to trade. Watching is free.',
  TOO_YOUNG: 'Trading in the Arena opens at age 13. You can still watch the market.',
  NOT_QUALIFIED: 'Score 70+ in today’s market or pass the Unit 2 checkpoint to trade here. You can watch until then.',
};

export function mount(root, ctx) {
  const { store, navigate, config, tier } = ctx;
  let alive = true;
  let timer = null;
  let coin = 'VAULT';
  let side = 'buy';
  let polling = false;
  let last = null;
  let onVisible = null;
  let adultNote = null;
  let parts = []; // Arena v2 panels: each has el, update(state) and maybe destroy()

  const body = h('div', { class: 'arena__body' });
  const view = h('section', { class: 'screen arena' }, [
    h('div', { class: 'screen-head' }, [
      h('p', { class: 'screen-eyebrow', text: 'Arena · Live market' }),
      h('h1', { class: 'screen-title', tabindex: '-1', text: 'Arena' }),
      h('p', { class: 'screen-sub', text: 'Trade with real players and bots in one shared market. Simulated L$ only: never real money.' }),
    ]),
    body,
    h('p', { class: 'arena__privacy' }, [h('a', { href: '#/privacy', text: 'Privacy notice' })]),
  ]);
  root.append(view);

  async function api(action, { method = 'GET', data, query = '' } = {}) {
    let res;
    try {
      res = await fetch(`${API}?action=${action}${query}`, {
        method,
        credentials: 'same-origin',
        headers: method === 'POST' ? { 'Content-Type': 'application/json', ...(sync.csrfToken() && { 'X-CSRF-Token': sync.csrfToken() }) } : {},
        body: method === 'POST' ? JSON.stringify(data || {}) : undefined,
      });
    } catch {
      throw Object.assign(new Error('Could not reach the Arena. Check your connection.'), { code: 'NETWORK' });
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw Object.assign(new Error(json?.error?.message || `The Arena didn’t answer (error ${res.status}).`), { code: json?.error?.code || 'HTTP' });
    return json;
  }

  const show = (...nodes) => body.replaceChildren(...nodes.filter(Boolean)); // a null would print as text
  const back = (label, to) => h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate(to) }, label);

  async function start() {
    show(stateView({ kind: 'loading', title: 'Opening the Arena…' }));
    const status = await arenaStatus();
    if (!alive) return;
    if (status.enabled && status.v2) return spectate();
    if (!status.enabled) {
      if (alive) show(stateView({ kind: 'empty', title: 'The Arena is closed right now', body: 'Today’s market is open, and you can practise there any time.', actions: [back('Open today’s market', '/lab')] }));
      return;
    }
    try {
      if (!(await sync.accountsAvailable())) {
        if (alive) show(stateView({ kind: 'empty', title: 'Accounts aren’t available right now', body: 'The Arena needs a free account. Everything else still works as a guest.', actions: [back('Open today’s market', '/lab')] }));
        return;
      }
      const user = await sync.refreshMe();
      if (!alive) return;
      if (!user) return guestAge() < 13 ? tooYoung() : needAccount();
      enter(user);
    } catch (err) {
      if (alive) show(stateView({ kind: 'error', title: 'The Arena didn’t load', body: err.message, actions: [h('button', { class: 'btn', type: 'button', onClick: start }, 'Try again')] }));
    }
  }

  // Arena v2: anyone can watch the market; the server says who may trade (canTrade, reason).
  async function spectate() {
    let user = null;
    try {
      if (await sync.accountsAvailable()) user = await sync.refreshMe();
    } catch {
      user = null;
    }
    if (alive) market(user, true);
  }

  const thisYear = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: config.TIME_ZONE, year: 'numeric' }).format(new Date()));
  // Only steers a guest away from making an account they couldn't use yet; signed-in players are judged by the server.
  const guestAge = () => (store.get().birthYear ? thisYear() - Number(store.get().birthYear) : 99);
  const tooYoung = () => show(stateView({ kind: 'empty', title: 'The Arena opens at age 13', body: 'Keep exploring today’s market: every run makes you a sharper trader.', actions: [back('Open today’s market', '/lab')] }));

  // Every age decision uses the birth year stored with the account, never this browser's (the server checks too).
  async function enter(user) {
    const age = thisYear() - Number(user.birthYear);
    if (age < 13) return tooYoung();
    const adult = age >= 20;
    adultNote = adult ? h('p', { class: 'arena-adult', text: 'Kids unlock this at Money Health Score 70.' }) : null;
    if (!adult) {
      const s = store.get();
      const best = arenaScore(s);
      const unitTwo = ['trader', 'builder'].some((x) => s.path?.[x]?.done?.['u2-c']);
      if (!unitTwo && (best === null || best < ENTRY_SCORE)) return notYet(best);
      // Record the pass in the saved progress, where the server looks for it, before entering.
      if (!unitTwo && !(s.arenaPass?.score >= ENTRY_SCORE)) {
        store.set({ arenaPass: { score: best, at: Date.now() } });
        await sync.saveNow(store).catch(() => {});
      }
    }
    if (alive) market(user);
  }

  function notYet(best) {
    stop();
    show(
      stateView({
        kind: 'empty',
        title: `Score ${ENTRY_SCORE} or more to enter`,
        body: `${best === null ? 'You haven’t finished a market at Trader or Builder level yet.' : `Your best Money Health Score is ${best}.`} Spread your risk, stay calm after bad news and answer Penny’s questions, then finish today’s market with ${ENTRY_SCORE}+. Passing the Unit 2 checkpoint at School opens it too.`,
        actions: [back('Open today’s market', '/lab'), h('button', { class: 'btn', type: 'button', onClick: () => navigate('/path') }, 'Go to School')],
      }),
    );
  }

  // The Arena needs a free account; the account screen brings the player back here.
  function needAccount() {
    stop();
    show(
      adultNote,
      stateView({
        kind: 'empty',
        title: 'The Arena needs a free account',
        body: 'It’s a username, a password and your birth year: no email, no phone. Your progress then saves to your account too.',
        actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('/account?next=/arena') }, 'Log in or create an account')],
      }),
    );
  }

  // ---------------------------------------------------------------- the live market

  function market(user, v2 = false) {
    const tabs = h('div', { class: 'arena-coins', role: 'group', 'aria-label': 'Coins' });
    const chart = h('div', { class: 'arena-chart' });
    const chartHead = h('div', { class: 'arena-chart__head' });
    const washNote = h('p', { class: 'arena-chart__note', hidden: true });
    const live = h('span', { class: 'arena-live' }, [h('span', { class: 'arena-live__dot', 'aria-hidden': 'true' }), 'Live']);
    const pf = h('div', { class: 'arena-pf' });
    const board = h('ol', { class: 'board__list' });
    const feed = feedView({ botNames: BOT_NAMES });

    const amount = h('input', { id: 'arena-amount', class: 'arena-input', type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '0' });
    const amountLabel = h('label', { class: 'arena-label', for: 'arena-amount' });
    const preview = h('p', { class: 'arena-trade__preview', 'aria-live': 'polite' });
    const result = h('p', { class: 'arena-trade__result', role: 'status' });
    const go = h('button', { class: 'btn btn--primary btn--block', type: 'submit' });
    const sideBtns = ['buy', 'sell'].map((s) => h('button', { class: 'segmented__btn', type: 'button', dataset: { side: s }, onClick: () => setSide(s) }, s === 'buy' ? 'Buy' : 'Sell'));
    const quick = [0.25, 0.5, 1].map((f) => h('button', { class: 'btn btn--sm', type: 'button', onClick: () => fill(f) }, f === 1 ? 'Max' : `${f * 100}%`));
    const gate = h('div', { class: 'arena-gate', hidden: true });
    const controls = h('div', { class: 'arena-trade__controls' }, [
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Buy or sell' }, sideBtns),
      h('div', { class: 'arena-field' }, [amountLabel, amount]),
      h('div', { class: 'arena-trade__quick' }, quick),
      preview,
      go,
    ]);
    const tradeForm = h('form', { class: 'card arena-trade', novalidate: true, onSubmit: trade }, [
      h('h2', { class: 'arena-title', text: 'Trade' }),
      gate,
      controls,
      result,
      h('p', { class: 'arena-disclaimer', text: 'Simulation · No real money' }),
    ]);
    let gateReason;
    // Watchers see the market but not the controls: an account (or the reason the server gives) comes first.
    function setGate(reason) {
      if (reason === gateReason) return;
      gateReason = reason;
      controls.hidden = Boolean(reason);
      gate.hidden = !reason;
      if (!reason) return gate.replaceChildren();
      const needsAccount = reason === 'NO_ACCOUNT' || !REASONS[reason];
      gate.replaceChildren(
        h('p', { class: 'arena-gate__text', text: REASONS[reason] || REASONS.NO_ACCOUNT }),
        needsAccount ? h('a', { class: 'btn btn--primary btn--block', href: '#/account?next=/arena' }, 'Make an account to trade') : null,
      );
    }
    amount.addEventListener('input', renderPreview);
    parts.forEach((p) => p.destroy?.());
    parts = [];
    const part = (p) => (v2 ? (parts.push(p), p.el) : null);
    const walletEl = part(walletBar({ store, api, onCash: (me) => last?.me && render({ ...last, me: { ...last.me, ...me } }) }));
    const coinEl = part(coinPanel());
    const merge = (res) => last && render({ ...last, ...(res?.coins ? res : {}), me: res?.me ? res.me : last.me, coin });
    const newsEl = part(newsDesk({ api, onState: merge }));
    const seasonEl = part(seasonPanel());
    const launchEl = part(
      launchPanel({
        api,
        onLaunched: (res) => {
          const id = typeof res.coin === 'string' ? res.coin : res.coin?.id;
          if (res.coins) render({ ...last, ...res, coin: id || coin });
          if (id) pick(id);
        },
      }),
    );

    show(
      adultNote,
      h(
        'div',
        { class: 'arena-top' },
        user
          ? [h('p', { class: 'arena-top__who' }, ['Signed in as ', h('strong', { text: user.username })]), h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: logout }, 'Log out')]
          : [h('p', { class: 'arena-top__who' }, ['Watching as a guest. ', h('a', { href: '#/account?next=/arena', text: 'Log in or make an account' }), ' to trade.'])],
      ),
      walletEl,
      tabs,
      h('div', { class: 'arena-grid' }, [
        h('div', { class: 'arena-main' }, [h('div', { class: 'card' }, [chartHead, chart, washNote]), coinEl, tradeForm]),
        h('div', { class: 'arena-side' }, [
          newsEl,
          seasonEl,
          launchEl,
          h('div', { class: 'card' }, [h('div', { class: 'arena-card-head' }, [h('h2', { class: 'arena-title', text: 'Your portfolio' }), live]), pf]),
          h('div', { class: 'card' }, [h('h2', { class: 'arena-title', text: 'Leaderboard' }), h('p', { class: 'board__note', text: 'Ranked by portfolio value in simulated L$.' }), board]),
          h('div', { class: 'card' }, [h('h2', { class: 'arena-title', text: 'Latest trades' }), h('p', { class: 'board__note', text: v2 ? 'Players and named bots like Panic Pete and Ape Annie. Launches and rugs stand out.' : 'Players, the whale bot and the momentum bot.' }), feed.el]),
          h('div', { class: 'card card--quiet' }, [
            h('h2', { class: 'arena-title', text: 'Who else is trading?' }),
            h('p', { class: 'arena-help', text: 'Four bots trade here all the time. A market maker keeps prices near a fair value, a momentum bot follows trends and makes moves bigger, a whale sometimes sells a huge pile at once, and a wash bot trades FUEL with itself to fake busy volume.' }),
            user ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: removeAccount }, 'Delete my account') : null,
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
      if (!last?.me) return;
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
        amount.value = '';
        render(res);
      } catch (err) {
        result.textContent = err.message;
        if (err.code === 'SIGNED_OUT') {
          if (v2) setGate('NO_ACCOUNT');
          else needAccount();
        }
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
        if (v2 && ['SIGNED_OUT', 'NOT_QUALIFIED', 'TOO_YOUNG'].includes(err.code)) return setGate(err.code === 'SIGNED_OUT' ? 'NO_ACCOUNT' : err.code);
        if (err.code === 'SIGNED_OUT') return needAccount();
        if (err.code === 'NOT_QUALIFIED') return notYet(arenaScore(store.get()));
        if (err.code === 'TOO_YOUNG') return show(stateView({ kind: 'empty', title: 'The Arena opens at age 13', body: err.message, actions: [back('Open today’s market', '/lab')] }));
        live.classList.add('is-off');
        live.lastChild.textContent = 'Reconnecting…';
      } finally {
        polling = false;
      }
    }

    function render(raw) {
      const s = { ...raw, coins: raw.coins || [], candles: raw.candles || [], trades: raw.trades || [], leaderboard: raw.leaderboard || [] };
      last = s;
      if (!s.coins.length) return;
      if (!s.coins.some((x) => x.id === coin)) coin = s.coins[0].id;
      const c = s.coins.find((x) => x.id === coin);
      parts.forEach((p) => p.update({ ...s, coin }));
      if (v2) setGate(s.me && s.canTrade !== false ? null : s.reason || (s.me ? 'NOT_QUALIFIED' : 'NO_ACCOUNT'));
      if (tabs.childElementCount !== s.coins.length) {
        tabs.replaceChildren(
          ...s.coins.map((x) =>
            h('button', { class: 'arena-coin', type: 'button', dataset: { coin: x.id }, onClick: () => pick(x.id) }, [
              h('span', { class: 'arena-coin__id', text: x.id }),
              h('span', { class: 'arena-coin__price' }),
              h('span', { class: 'arena-coin__delta' }),
              h('span', { class: 'arena-coin__slot' }),
            ]),
          ),
        );
      }
      for (const x of s.coins) {
        const b = tabs.querySelector(`[data-coin="${x.id}"]`);
        if (!b) continue;
        b.classList.toggle('is-active', x.id === coin);
        b.setAttribute('aria-pressed', String(x.id === coin));
        const was = Number(b.dataset.price);
        if (was && x.price !== was) {
          b.classList.remove('is-flash-up', 'is-flash-down');
          void b.offsetWidth; // restart the flash
          b.classList.add(x.price > was ? 'is-flash-up' : 'is-flash-down');
        }
        b.dataset.price = String(x.price);
        b.querySelector('.arena-coin__price').textContent = price(x.price);
        b.querySelector('.arena-coin__delta').replaceChildren(delta(x.changePct));
        const slot = b.querySelector('.arena-coin__slot');
        const tag = v2 ? tabTag(x) : null;
        if ((slot.textContent || '') !== (tag?.textContent || '')) slot.replaceChildren(...(tag ? [tag] : []));
        b.classList.toggle('is-rugged', Boolean(x.rugged));
      }
      chartHead.replaceChildren(
        h('h2', { class: 'arena-title', text: `${c.id} · ${c.name}` }),
        h('p', { class: 'arena-chart__price' }, [price(c.price), ' ', delta(c.changePct)]),
      );
      chart.replaceChildren(candles(s.candles, c));
      washNote.hidden = !c.wash;
      washNote.textContent = c.wash ? 'Amber bars are wash volume: a bot buying from and selling to itself. It looks busy, but the price barely moves. Real demand is the grey part.' : '';

      const held = s.me?.holdings || [];
      if (!s.me) pf.replaceChildren(h('p', { class: 'arena-help', text: 'Make an account to get your own Arena wallet and portfolio. Watching is free.' }));
      else
        pf.replaceChildren(
        h('p', { class: 'arena-pf__value' }, [money(s.me.value), ' ', delta((s.me.value / s.me.startValue - 1) * 100)]),
        h('ul', { class: 'arena-pf__list' }, [
          h('li', {}, [h('span', { text: 'Cash' }), h('span', { text: money(s.me.cash) })]),
          ...held.map((x) => h('li', {}, [h('span', { text: `${number(x.coins, 4)} ${x.coin}` }), h('span', { text: money(x.value) })])),
        ]),
      );
      const row = (r) =>
        h('li', { class: `board__row${r.username === user?.username ? ' is-me' : ''}` }, [
          h('span', { class: 'board__rank', text: String(r.rank) }),
          h('span', { class: 'board__name', text: r.username }),
          r.username === user?.username ? h('span', { class: 'board__you', text: 'You' }) : null,
          h('span', { class: 'board__score arena-board__value', text: money(r.value, 0) }),
        ]);
      const mine = s.myRank;
      board.replaceChildren(
        ...s.leaderboard.map(row),
        ...(mine && mine.rank > s.leaderboard.length ? [row(mine)] : []),
        ...(mine || !s.me ? [] : [h('li', { class: 'board__join', text: s.leaderboard.length ? 'Make your first trade to join the leaderboard.' : 'No trades yet. Make the first one to top the leaderboard.' })]),
      );
      feed.update(s.trades);
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
      await sync.signOut();
      needAccount();
    }

    async function removeAccount() {
      if (!confirm('Delete your account? Your Arena coins, leaderboard place, saved progress and parent link are removed for good. Progress on this device stays.')) return;
      try {
        await sync.deleteAccount();
        needAccount();
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
    parts.forEach((p) => p.destroy?.());
    parts = [];
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
