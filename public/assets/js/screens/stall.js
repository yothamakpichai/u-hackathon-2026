// Daily Stall (BRIEF §16.1; slice J12). Each Bangkok date brings different goods at different prices,
// the same for everyone. Prices move every 10 minutes; some goods spoil. Buy, hold and sell with Town
// coins (or the Town Card), and learn why borrowing to speculate is dangerous.
import { GOODS, dateKeyOf, dayGoods, dayPath, minuteOf, priceAt, sellPrice, spoilState } from '../sim/stall.js';
import { loanState } from '../sim/bank.js';
import { balance as walletBalance, ensureStarter, post } from '../../../js/wallet.js';
import { announce, delta, h, icon, number } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const coins = (n) => `${number(n, 2)} coins`;
const uid = () => `s${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;

export function mount(root, ctx) {
  const { store, navigate } = ctx;
  const view = h('section', { class: 'screen stall-screen' });
  root.append(view);
  ensureStarter(store);
  let timer = 0;
  let shownStep = -1;

  const stallOf = () => ({ holdings: [], trades: [], ...store.get().stall });
  const bankOf = () => ({ loans: [], card: null, ...store.get().bank });

  function render() {
    const now = Date.now();
    const today = dateKeyOf(now);
    const minute = minuteOf(now);
    shownStep = Math.floor(minute / 10);
    const stall = stallOf();
    const bank = bankOf();
    const borrowed = bank.loans.some((l) => !loanState(l, today).paid);
    const card = bank.card;
    view.replaceChildren(
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: 'Daily Stall' }),
        h('h1', { class: 'screen-title', text: 'Today’s stall' }),
        h('p', { class: 'screen-sub', text: 'Every day brings different goods. Prices change every 10 minutes, and some goods spoil if you hold them too long.' }),
      ]),
      h('div', { class: 'stall-bar' }, [
        h('p', { class: 'chip', text: `${number(walletBalance(store.get()), 0)} coins in your Town wallet` }),
        card ? h('p', { class: 'chip', text: `Town Card: ${coins(card.limit - card.balance)} left to spend` }) : null,
        h('p', { class: 'field__hint', text: `Prices for ${today}, updated every 10 minutes. The stall buys back 10% below its selling price.` }),
      ]),
      borrowed
        ? h('div', { class: 'card stall-warn', role: 'note' }, [
            icon('alert', { size: 20 }),
            h('p', { text: 'You’re trading with borrowed coins. If prices fall or your goods spoil, you still owe the loan and its interest. Borrowing to speculate can turn a small loss into a big one.' }),
          ])
        : null,
      h('ul', { class: 'stall-goods' }, dayGoods(today).map((g) => goodCard(g, today, minute, card))),
      holdingsCard(stall, today, minute),
      h('div', { class: 'stall-lessons' }, [
        lesson('Buy low, sell high', 'It sounds easy, but nobody knows when the price is at its lowest or highest. Traders who wait for the perfect moment often miss it.'),
        lesson('Holding costs money', 'Fish spoils in a day and mangoes in two. Whatever you can’t sell in time is worth nothing, so holding has a cost even when the price looks good.'),
        lesson('Borrowing to speculate', 'Buying with a loan makes wins bigger and losses bigger. The loan and its interest are still there when the trade goes wrong.'),
      ]),
    );
  }

  const lesson = (title, body) => h('div', { class: 'card card--quiet lesson-mini' }, [h('h2', { class: 'lesson-mini__title', text: title }), h('p', { text: body })]);

  function goodCard(good, today, minute, card) {
    const g = GOODS[good];
    const ask = priceAt(good, today, minute);
    const path = dayPath(good, today, minute);
    const change = ((ask / path[0]) - 1) * 100;
    let qty = 1;
    const qtyOut = h('output', { class: 'stall-qty__value', text: '1' });
    const total = h('p', { class: 'field__hint', text: `Total: ${coins(ask)}` });
    const step = (d) => {
      qty = Math.max(1, Math.min(9, qty + d));
      qtyOut.textContent = String(qty);
      total.textContent = `Total: ${coins(ask * qty)}`;
    };
    const buy = (withCard) => {
      const cost = Math.round(ask * qty * 100) / 100;
      if (withCard) {
        const bank = bankOf();
        if (!bank.card || bank.card.balance + cost > bank.card.limit) return announce('That’s over your Town Card limit.');
        store.set({ bank: { ...bank, card: { ...bank.card, balance: Math.round((bank.card.balance + cost) * 100) / 100, spent: (bank.card.spent || 0) + cost } } });
      } else {
        const paid = post(store, { amount: -cost, kind: 'stall-buy', note: `${qty} ${g.unit} of ${g.label.toLowerCase()}` });
        if (!paid.ok) return announce(paid.error);
      }
      const stall = stallOf();
      store.set({ stall: { ...stall, holdings: [...stall.holdings, { id: uid(), good, qty, price: ask, boughtDate: today, card: withCard }], trades: [...stall.trades, { at: Date.now(), good, qty, side: 'buy', price: ask }] } });
      announce(`Bought ${qty} ${g.unit} of ${g.label.toLowerCase()} for ${coins(cost)}.`);
      render();
    };
    return h('li', { class: 'card stall-good' }, [
      h('div', { class: 'stall-good__head' }, [
        h('h2', { class: 'stall-good__name', text: g.label }),
        h('p', { class: 'chip', text: g.spoilDays ? `Spoils after ${g.spoilDays} ${g.spoilDays === 1 ? 'day' : 'days'}` : 'Keeps' }),
      ]),
      h('p', { class: 'stall-price' }, [h('span', { class: 'stall-price__value', dataset: { ask: good }, text: coins(ask) }), ` per ${g.unit} `, delta(change)]),
      spark(path),
      h('p', { class: 'field__hint', text: `The stall buys back at ${coins(sellPrice(good, today, minute))}.` }),
      h('div', { class: 'stall-qty', role: 'group', 'aria-label': `How many ${g.unit}s` }, [
        h('button', { class: 'btn btn--sm', type: 'button', onClick: () => step(-1), 'aria-label': 'One fewer' }, '−'),
        qtyOut,
        h('button', { class: 'btn btn--sm', type: 'button', onClick: () => step(1), 'aria-label': 'One more' }, '+'),
      ]),
      total,
      h('div', { class: 'stall-buy' }, [
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => buy(false) }, `Buy ${g.label.toLowerCase()}`),
        card ? h('button', { class: 'btn', type: 'button', onClick: () => buy(true) }, 'Pay with Town Card') : null,
      ]),
    ]);
  }

  function holdingsCard(stall, today, minute) {
    const rows = stall.holdings.map((hld) => {
      const g = GOODS[hld.good];
      const s = spoilState(hld, today);
      const bid = sellPrice(hld.good, today, minute);
      const value = s.spoiled ? 0 : bid * hld.qty;
      const cost = hld.price * hld.qty;
      const sell = () => {
        const st = stallOf();
        if (value > 0) post(store, { amount: Math.round(value * 100) / 100, kind: 'stall-sell', note: `${hld.qty} ${g.unit} of ${g.label.toLowerCase()}` });
        store.set({ stall: { ...st, holdings: st.holdings.filter((x) => x.id !== hld.id), trades: [...st.trades, { at: Date.now(), good: hld.good, qty: hld.qty, side: s.spoiled ? 'spoiled' : 'sell', price: s.spoiled ? 0 : bid }] } });
        announce(s.spoiled ? `Threw away spoiled ${g.label.toLowerCase()}.` : `Sold for ${coins(value)}.`);
        render();
      };
      return h('li', { class: 'stall-holding' }, [
        h('p', { class: 'stall-holding__name', text: `${hld.qty} ${g.unit}${hld.qty > 1 ? 's' : ''} of ${g.label.toLowerCase()}` }),
        h('p', { class: 'field__hint', text: `Bought at ${coins(hld.price)} on ${hld.boughtDate}${hld.card ? ' with the Town Card' : ''}` }),
        s.spoiled
          ? h('p', { class: 'chip chip--loss', text: 'Spoiled: worth nothing now' })
          : h('p', { class: 'stall-holding__pl' }, [`Worth ${coins(value)} now `, delta(((value / cost) - 1) * 100), s.daysLeft != null ? h('span', { class: 'chip chip--warn', text: `Spoils in ${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'}` }) : null]),
        h('button', { class: `btn btn--sm${s.spoiled ? '' : ' btn--primary'}`, type: 'button', onClick: sell }, s.spoiled ? 'Throw away' : `Sell for ${coins(value)}`),
      ]);
    });
    return h('div', { class: 'card stall-holdings' }, [
      h('h2', { class: 'lab-card__title', text: 'What you’re holding' }),
      rows.length ? h('ul', { class: 'stall-holding-list' }, rows) : h('p', { class: 'piggy-empty', text: 'Nothing yet. Buy something you think you can sell for more later today or tomorrow.' }),
      h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => navigate('/bank') }, 'Visit the Bank'),
    ]);
  }

  render();
  // Prices change every 10 minutes: redraw when the step changes.
  timer = setInterval(() => {
    if (Math.floor(minuteOf(Date.now()) / 10) !== shownStep && !view.contains(document.activeElement)) render();
  }, 15_000);
  return () => {
    clearInterval(timer);
    view.remove();
  };
}

function spark(path) {
  const W = 200;
  const H = 40;
  const lo = Math.min(...path);
  const hi = Math.max(...path);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'stall-spark');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(SVG_NS, 'polyline');
  const n = Math.max(1, path.length - 1);
  line.setAttribute('points', path.map((p, i) => `${((i / n) * (W - 4) + 2).toFixed(1)},${(H - 4 - ((p - lo) / Math.max(1e-9, hi - lo)) * (H - 8)).toFixed(1)}`).join(' '));
  svg.append(line);
  return svg;
}
