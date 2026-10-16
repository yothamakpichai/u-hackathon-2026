// Daily Stall (BRIEF §16.1; slice J12). Each Bangkok date brings different goods at different prices,
// the same for everyone. Prices move every 10 minutes; some goods spoil. Buy, hold and sell with Town
// coins (or the Town Card), and learn why borrowing to speculate is dangerous.
import { GOODS, dateKeyOf, dayGoods, dayPath, minuteOf, priceAt, sellPrice, spoilState } from '../sim/stall.js';
import { addDays, loanState } from '../sim/bank.js';
import { balance as walletBalance, moneyText, ensureStarter, post } from '../../../js/wallet.js';
import { announce, delta, h, icon, number } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const coins = (n) => `${number(n, 2)} coins`;
const round = (n) => Math.round(n * 100) / 100;
const uid = () => `s${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;
const units = (qty, unit) => `${qty} ${unit}${qty > 1 ? 's' : ''}`;
// 'Fri 16 Oct' and 'Friday' for a Bangkok date key.
const dayText = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekday = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
// Goods spoil when the Bangkok date changes, so the copy names the last night they keep.
const keepsText = (days, today) => (days == null ? 'Keeps' : days === 1 ? 'Sell the same day' : days === 2 ? 'Keeps until tomorrow night' : `Keeps until ${weekday(addDays(today, days - 1))} night`);
const sellByText = (left, today) => (left <= 1 ? 'Sell by midnight tonight' : left === 2 ? 'Sell by tomorrow night' : `Sell by ${weekday(addDays(today, left - 1))} night`);

export function mount(root, ctx) {
  const { store, navigate, tier } = ctx;
  const young = tier === 'explorer';
  const view = h('section', { class: 'screen stall-screen' });
  root.append(view);
  ensureStarter(store);
  let timer = 0;
  let shownStep = -1;
  let shownDay = '';
  let notice = null; // { key, text }: why a trade didn't happen, shown in its card on the next draw
  const qtys = new Map(); // how many of each good the player picked, kept across redraws

  const stallOf = () => ({ holdings: [], trades: [], ...store.get().stall });
  const bankOf = () => ({ loans: [], card: null, ...store.get().bank });

  // focus: data-keys to put focus back on after the redraw; the first one found wins.
  function render(focus = []) {
    const now = Date.now();
    const today = dateKeyOf(now);
    const minute = minuteOf(now);
    shownStep = Math.floor(minute / 10);
    shownDay = today;
    const stall = stallOf();
    const bank = bankOf();
    const wallet = walletBalance(store.get());
    const borrowed = bank.loans.some((l) => !loanState(l, today).paid);
    const card = bank.card;
    const parts = [
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: 'Daily Stall' }),
        h('h1', { class: 'screen-title', text: 'Today’s stall', dataset: { key: 'title' } }),
        h('p', { class: 'screen-sub', text: 'Every day brings different goods. Prices change every 10 minutes, and some goods spoil if you hold them too long.' }),
      ]),
      h('div', { class: 'stall-bar' }, [
        h('p', { class: 'chip', text: `${moneyText(wallet)} in your Town wallet` }),
        card ? h('p', { class: 'chip', text: card.balance < card.limit ? `Town Card: ${moneyText(card.limit - card.balance)} left to spend` : 'Town Card: nothing left to spend' }) : null,
        h('p', { class: 'field__hint', text: `Prices for ${dayText(today)}, updated every 10 minutes. The stall buys back 10% below its selling price.` }),
      ]),
      borrowed
        ? h('div', { class: 'card stall-warn', role: 'note' }, [
            icon('alert', { size: 20 }),
            h('p', { text: young
              ? 'You’re trading with borrowed coins. If prices fall or your goods spoil, you still owe the loan and its interest.'
              : 'You’re trading with borrowed coins. If prices fall or your goods spoil, you still owe the loan and its interest. Borrowing to speculate can turn a small loss into a big one.' }),
          ])
        : null,
      h('ul', { class: 'stall-goods' }, dayGoods(today).map((g) => goodCard(g, today, minute, card, wallet))),
      holdingsCard(stall, today, minute),
      h('div', { class: 'stall-lessons' }, [
        lesson('Buy low, sell high', 'It sounds easy, but nobody knows when the price is at its lowest or highest. Traders who wait for the perfect moment often miss it.'),
        lesson('Holding costs money', 'Fish must be sold on the day you buy it, and mangoes by the next night. Whatever you can’t sell in time is worth nothing, so holding has a cost even when the price looks good.'),
        young
          ? lesson('Borrowing to bet on prices', 'Buying with borrowed coins makes wins bigger and losses bigger. When prices fall, you still have to pay back the loan and its interest.')
          : lesson('Borrowing to speculate', 'Buying with a loan makes wins bigger and losses bigger. The loan and its interest are still there when the trade goes wrong.'),
      ]),
    ];
    view.replaceChildren(...parts.filter(Boolean));
    notice = null;
    refocus(focus);
  }

  function refocus(keys) {
    for (const k of [].concat(keys)) {
      const el = k && view.querySelector(`[data-key="${k}"]`);
      if (!el) continue;
      if (!el.matches('button, a[href], summary')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      return;
    }
  }

  // A trade that didn't happen says why next to its button, and to screen readers.
  function refuse(key, text, focusKey) {
    notice = { key, text };
    announce(text);
    render([focusKey, key, 'title']);
  }
  const note = (key) => h('p', { class: 'field__error', hidden: !(notice && notice.key === key), text: notice && notice.key === key ? notice.text : '' });

  const lesson = (title, body) => h('div', { class: 'card card--quiet lesson-mini' }, [h('h2', { class: 'lesson-mini__title', text: title }), h('p', { text: body })]);

  function goodCard(good, today, minute, card, wallet) {
    const g = GOODS[good];
    const name = g.label.toLowerCase();
    const key = `good:${good}`;
    const ask = priceAt(good, today, minute);
    const path = dayPath(good, today, minute);
    const change = ((ask / path[0]) - 1) * 100;
    let qty = qtys.get(good) || 1;
    const qtyOut = h('output', { class: 'stall-qty__value', text: String(qty) });
    const total = h('p', { class: 'field__hint' });
    const msg = note(key);
    const showTotal = () => {
      const cost = round(ask * qty);
      const short = round(cost - wallet);
      const cardPays = card && cost <= round(card.limit - card.balance) + 1e-9;
      total.textContent = short > 0 ? `Total: ${coins(cost)}. You have ${moneyText(wallet)}, so you need ${number(short, 2)} more coins${cardPays ? ', or pay with the Town Card' : ''}.` : `Total: ${coins(cost)}`;
    };
    showTotal();
    const step = (d) => {
      qty = Math.max(1, Math.min(9, qty + d));
      qtys.set(good, qty);
      qtyOut.textContent = String(qty);
      showTotal();
      msg.hidden = true;
    };
    const buy = (withCard) => {
      const focusKey = withCard ? `cardbuy:${good}` : `buy:${good}`;
      // Trade at the stall's price right now; if it moved since this card was drawn, show it first.
      const nowMs = Date.now();
      const day = dateKeyOf(nowMs);
      const live = day === today ? priceAt(good, day, minuteOf(nowMs)) : null;
      if (live == null) return refuse(key, 'A new day has started at the stall, with new goods and prices.', focusKey);
      if (live !== ask) return refuse(key, `The price just changed to ${coins(live)}. Check it, then tap Buy again.`, focusKey);
      const cost = round(ask * qty);
      const what = `${units(qty, g.unit)} of ${name}`;
      if (withCard) {
        const bank = bankOf();
        if (!bank.card) return refuse(key, 'Open a Town Card at the Bank first.', focusKey);
        const room = round(Math.max(0, bank.card.limit - bank.card.balance));
        if (!(room > 0)) return refuse(key, 'Your Town Card has nothing left to spend. Pay some of it off at the Bank first.', focusKey);
        if (cost > room + 1e-9) return refuse(key, `That’s ${coins(round(cost - room))} over your Town Card limit: you have ${coins(room)} left on it. Try buying fewer.`, focusKey);
        store.set({ bank: { ...bank, card: { ...bank.card, balance: round(bank.card.balance + cost), spent: (bank.card.spent || 0) + cost } } });
      } else {
        const paid = post(store, { amount: -cost, kind: 'stall-buy', note: what });
        if (!paid.ok) return refuse(key, `${paid.error} You need ${number(paid.short, 2)} more coins. Try buying fewer.`, focusKey);
      }
      const stall = stallOf();
      store.set({ stall: { ...stall, holdings: [...stall.holdings, { id: uid(), good, qty, price: ask, boughtDate: today, card: withCard }], trades: [...stall.trades, { at: Date.now(), good, qty, side: 'buy', price: ask }] } });
      announce(`Bought ${what} for ${coins(cost)}.`);
      qtys.delete(good);
      render([focusKey]);
    };
    const lo = Math.min(...path);
    const hi = Math.max(...path);
    return h('li', { class: 'card stall-good' }, [
      h('div', { class: 'stall-good__head' }, [
        h('h2', { class: 'stall-good__name', text: g.label, dataset: { key: `name:${good}` } }),
        h('p', { class: 'chip', text: keepsText(g.spoilDays, today) }),
      ]),
      h('p', { class: 'stall-price' }, [h('span', { class: 'stall-price__value', dataset: { ask: good }, text: coins(ask) }), ` per ${g.unit} `, h('span', {}, [delta(change), ' today'])]),
      spark(path),
      h('p', { class: 'field__hint', text: path.length < 2 ? 'Prices start moving at 00:10.' : `Today so far: low ${coins(lo)}, high ${coins(hi)}.` }),
      h('p', { class: 'field__hint', text: `The stall buys back at ${coins(sellPrice(good, today, minute))}.` }),
      h('div', { class: 'stall-qty', role: 'group', 'aria-label': `How many ${g.unit}s` }, [
        h('button', { class: 'btn btn--sm', type: 'button', dataset: { key: `less:${good}` }, onClick: () => step(-1), 'aria-label': `One fewer ${g.unit} of ${name}` }, '−'),
        qtyOut,
        h('button', { class: 'btn btn--sm', type: 'button', dataset: { key: `more:${good}` }, onClick: () => step(1), 'aria-label': `One more ${g.unit} of ${name}` }, '+'),
      ]),
      total,
      msg,
      h('div', { class: 'stall-buy' }, [
        h('button', { class: 'btn btn--primary', type: 'button', dataset: { key: `buy:${good}` }, onClick: () => buy(false) }, `Buy ${name}`),
        card ? h('button', { class: 'btn', type: 'button', dataset: { key: `cardbuy:${good}` }, 'aria-label': `Pay with Town Card for ${name}`, onClick: () => buy(true) }, 'Pay with Town Card') : null,
      ]),
    ]);
  }

  function holdingsCard(stall, today, minute) {
    const rows = stall.holdings.map((hld) => {
      const g = GOODS[hld.good];
      const s = spoilState(hld, today);
      const bid = sellPrice(hld.good, today, minute);
      const value = s.spoiled ? 0 : round(bid * hld.qty);
      const cost = hld.price * hld.qty;
      const what = `${units(hld.qty, g.unit)} of ${g.label.toLowerCase()}`;
      const key = `hold:${hld.id}`;
      const sell = () => {
        // Sell at the stall's price right now; if it moved or the goods spoiled, show that first.
        const nowMs = Date.now();
        const day = dateKeyOf(nowMs);
        const s2 = spoilState(hld, day);
        const bid2 = sellPrice(hld.good, day, minuteOf(nowMs));
        if (s2.spoiled !== s.spoiled) return refuse(key, 'It just spoiled, so it’s worth nothing now.', `${key}:sell`);
        if (!s.spoiled && bid2 !== bid) return refuse(key, `The price just changed: it’s worth ${coins(round(bid2 * hld.qty))} now. Tap Sell again to sell at the new price.`, `${key}:sell`);
        const st = stallOf();
        if (value > 0) post(store, { amount: value, kind: 'stall-sell', note: what });
        store.set({ stall: { ...st, holdings: st.holdings.filter((x) => x.id !== hld.id), trades: [...st.trades, { at: Date.now(), good: hld.good, qty: hld.qty, side: s.spoiled ? 'spoiled' : 'sell', price: s.spoiled ? 0 : bid }] } });
        announce(s.spoiled ? `Threw away spoiled ${g.label.toLowerCase()}.` : `Sold ${what} for ${coins(value)}.`);
        render(['holdings']);
      };
      return h('li', { class: 'stall-holding' }, [
        h('p', { class: 'stall-holding__name', text: what }),
        h('p', { class: 'field__hint', text: `Bought at ${coins(hld.price)} on ${dayText(hld.boughtDate)}${hld.card ? ' with the Town Card' : ''}` }),
        s.spoiled
          ? h('p', { class: 'chip chip--loss', text: 'Spoiled: worth nothing now' })
          : h('p', { class: 'stall-holding__pl' }, [`Worth ${coins(value)} now `, delta(((value / cost) - 1) * 100), s.daysLeft != null ? h('span', { class: 'chip chip--warn', text: sellByText(s.daysLeft, today) }) : null]),
        note(key),
        h('button', { class: `btn btn--sm${s.spoiled ? '' : ' btn--primary'}`, type: 'button', dataset: { key: `${key}:sell` }, 'aria-label': `${s.spoiled ? 'Throw away' : `Sell for ${coins(value)}:`} ${what} bought at ${coins(hld.price)}`, onClick: sell }, s.spoiled ? 'Throw away' : `Sell for ${coins(value)}`),
      ]);
    });
    return h('div', { class: 'card stall-holdings' }, [
      h('h2', { class: 'lab-card__title', text: 'What you’re holding', dataset: { key: 'holdings' } }),
      rows.length ? h('ul', { class: 'stall-holding-list' }, rows) : h('p', { class: 'piggy-empty', text: 'Nothing yet. Buy something you think you can sell for more later, before it spoils.' }),
      h('button', { class: 'btn btn--ghost', type: 'button', dataset: { key: 'bank' }, onClick: () => navigate('/bank') }, 'Visit the Bank'),
    ]);
  }

  // The focused control's key, so a redraw can put focus back where it was.
  const focusedKey = () => (view.contains(document.activeElement) ? document.activeElement.closest('[data-key]')?.dataset.key : null);

  render();
  // Prices change every 10 minutes: redraw when the step changes, keeping focus and the picked amounts.
  // At midnight the goods change: focus on a good that is gone moves to the first new good.
  timer = setInterval(() => {
    const now = Date.now();
    const day = dateKeyOf(now);
    if (Math.floor(minuteOf(now) / 10) === shownStep && day === shownDay) return;
    const newDay = day !== shownDay;
    render(view.contains(document.activeElement) ? [focusedKey(), `name:${dayGoods(day)[0]}`, 'title'] : []);
    if (newDay) announce('A new day has started at the stall, with new goods and prices.');
  }, 15_000);
  return () => {
    clearInterval(timer);
    view.remove();
  };
}

// The day's prices as a small line. A single price (00:00 to 00:09) is drawn as a dot.
function spark(path) {
  const W = 200;
  const H = 40;
  const lo = Math.min(...path);
  const hi = Math.max(...path);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'stall-spark');
  svg.setAttribute('aria-hidden', 'true');
  if (path.length < 2) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', '4');
    dot.setAttribute('cy', String(H / 2));
    dot.setAttribute('r', '3');
    svg.append(dot);
    return svg;
  }
  svg.setAttribute('preserveAspectRatio', 'none');
  const line = document.createElementNS(SVG_NS, 'polyline');
  const n = path.length - 1;
  line.setAttribute('points', path.map((p, i) => `${((i / n) * (W - 4) + 2).toFixed(1)},${(H - 4 - ((p - lo) / Math.max(1e-9, hi - lo)) * (H - 8)).toFixed(1)}`).join(' '));
  svg.append(line);
  return svg;
}
