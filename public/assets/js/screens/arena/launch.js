// Launch a coin into the shared Arena market (BRIEF §17). The server checks everything again and charges a
// 500 L$ listing fee (burned) plus the creator's liquidity. Names and tickers use the same filter as Create.
import { h, money, number } from '../../ui.js';
import { COIN_COLORS } from '../../config.js';
import { GLYPHS, coinBadge } from '../coinkit.js';
import { checkName, checkTicker } from '../../sim/names.js';

const FEE = 500;
const SUPPLIES = [1_000_000, 10_000_000, 100_000_000, 1_000_000_000];
const DAYS = [0, 7, 30];

export function launchPanel({ api, onLaunched }) {
  let me = null;
  let canTrade = false;
  const pick = { icon: 7, color: 'violet', supply: SUPPLIES[1], lock: 30, vest: 30 };
  const alloc = { creator: 10, community: 60, liquidity: 30 };

  const err = (id) => h('p', { id, class: 'arena-launch__err', role: 'alert' });
  const nameErr = err('arena-l-name-err');
  const tickErr = err('arena-l-tick-err');
  const name = h('input', { id: 'arena-l-name', class: 'arena-input', maxlength: '16', autocomplete: 'off', 'aria-describedby': 'arena-l-name-err' });
  const ticker = h('input', { id: 'arena-l-tick', class: 'arena-input arena-launch__ticker', maxlength: '5', autocomplete: 'off', 'aria-describedby': 'arena-l-tick-err' });
  ticker.addEventListener('input', () => {
    ticker.value = ticker.value.toUpperCase().replace(/[^A-Z]/g, '');
    paint();
  });
  name.addEventListener('input', paint);

  const preview = h('div', { class: 'arena-launch__preview', 'aria-hidden': 'true' });
  const radioRow = (label, items, key, render) =>
    h('fieldset', { class: 'arena-launch__set' }, [
      h('legend', { class: 'arena-label', text: label }),
      h(
        'div',
        { class: `arena-launch__chips arena-launch__chips--${key}` },
        items.map(([value, text, content]) => {
          const input = h('input', { type: 'radio', name: `arena-l-${key}`, value: String(value), class: 'arena-launch__radio', checked: pick[key] === value, 'aria-label': text });
          input.addEventListener('change', () => {
            pick[key] = value;
            paint();
          });
          return h('label', { class: 'arena-launch__chip' }, [input, render ? render(value, content) : h('span', { text: content ?? text })]);
        }),
      ),
    ]);

  const icons = radioRow('Icon', GLYPHS.map(([n], i) => [i, n]), 'icon', (i) => coinBadge({ iconId: i, colorId: COIN_COLORS.indexOf(pick.color) }, COIN_COLORS));
  const colors = radioRow('Colour', COIN_COLORS.map((c) => [c, c[0].toUpperCase() + c.slice(1)]), 'color', (c) => h('span', { class: `arena-launch__swatch coin--${c}` }));
  const supplies = radioRow('Supply (how many coins exist)', SUPPLIES.map((s) => [s, `${number(s, 0)} coins`, s >= 1e9 ? '1 billion' : s >= 1e6 ? `${s / 1e6} million` : number(s, 0)]), 'supply');
  const locks = radioRow('Lock liquidity', DAYS.map((d) => [d, d ? `${d} days` : 'No lock']), 'lock');
  const vests = radioRow('Vest your coins', DAYS.map((d) => [d, d ? `${d} days` : 'No vesting']), 'vest');

  const sliders = {};
  const sumOut = h('p', { class: 'arena-launch__sum', role: 'status' });
  const slider = (key, label, min, max, help) => {
    const out = h('output', { class: 'arena-launch__pct', for: `arena-l-${key}` });
    const input = h('input', { id: `arena-l-${key}`, class: 'arena-launch__range', type: 'range', min: String(min), max: String(max), step: '5', value: String(alloc[key]) });
    input.addEventListener('input', () => {
      alloc[key] = Number(input.value);
      paint();
    });
    sliders[key] = { input, out };
    return h('div', { class: 'arena-launch__slider' }, [h('label', { class: 'arena-label', for: `arena-l-${key}` }, [label, ' ', out]), input, h('p', { class: 'arena-launch__help', text: help })]);
  };

  const liq = h('input', { id: 'arena-l-liq', class: 'arena-input', type: 'number', inputmode: 'decimal', min: '100', step: '10', value: '200' });
  liq.addEventListener('input', paint);
  const cost = h('p', { class: 'arena-launch__cost' });
  const status = h('p', { class: 'arena-launch__status', role: 'status' });
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Launch');
  const close = h('button', { class: 'btn btn--ghost btn--sm arena-launch__close', type: 'button', onClick: () => dialog.close() }, 'Close');

  const form = h('form', { class: 'arena-launch__form', novalidate: true, onSubmit: launch }, [
    h('div', { class: 'arena-launch__head' }, [h('h2', { class: 'arena-title', id: 'arena-l-title', text: 'Launch a coin' }), close]),
    h('p', { class: 'arena-help', text: 'Your coin goes live for every player and bot in the Arena. Each choice below changes how much buyers can trust it.' }),
    h('div', { class: 'arena-launch__names' }, [
      h('div', { class: 'arena-field' }, [h('label', { class: 'arena-label', for: 'arena-l-name', text: 'Name' }), name, nameErr]),
      h('div', { class: 'arena-field' }, [h('label', { class: 'arena-label', for: 'arena-l-tick', text: 'Ticker' }), ticker, tickErr]),
      preview,
    ]),
    icons,
    colors,
    supplies,
    h('p', { class: 'arena-launch__help', text: 'More coins means each one starts cheaper. It doesn’t make the coin worth more.' }),
    h('fieldset', { class: 'arena-launch__set' }, [
      h('legend', { class: 'arena-label', text: 'Who gets the coins (must add up to 100%)' }),
      slider('creator', 'You (the creator)', 0, 50, 'A big creator share is a red flag: you could sell it all at once.'),
      slider('community', 'Community', 0, 80, 'Coins handed out to players. Spread out ownership is harder to crash.'),
      slider('liquidity', 'Liquidity pool', 20, 100, 'Coins in the pool make trading possible. More pool, smaller price jumps.'),
      sumOut,
    ]),
    h('div', { class: 'arena-field' }, [h('label', { class: 'arena-label', for: 'arena-l-liq', text: 'Your liquidity in L$ (at least 100)' }), liq, h('p', { class: 'arena-launch__help', text: 'The L$ you put next to your coins in the pool. It sets the starting price.' })]),
    locks,
    h('p', { class: 'arena-launch__help', text: 'Locking liquidity means you can’t pull it out: buyers trust that more.' }),
    vests,
    h('p', { class: 'arena-launch__help', text: 'Vesting means your own coins unlock slowly, so you can’t dump them on day one.' }),
    cost,
    submit,
    status,
    h('p', { class: 'arena-disclaimer', text: 'Simulation · No real money' }),
  ]);
  const dialog = h('dialog', { class: 'arena-launch', 'aria-labelledby': 'arena-l-title' }, [form]);

  const opener = h('button', { class: 'btn arena-launch__open', type: 'button', onClick: open }, 'Launch a coin');
  const openerNote = h('p', { class: 'arena-help arena-launch__note' });
  const el = h('div', { class: 'card arena-launch-card', hidden: true }, [
    h('h2', { class: 'arena-title', text: 'Make your own coin' }),
    h('p', { class: 'arena-help', text: `Costs a ${money(FEE, 0)} listing fee (burned) + your liquidity. Bots will trade it, and its red-flag score is public.` }),
    opener,
    openerNote,
    dialog,
  ]);

  function open() {
    status.textContent = '';
    paint();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    name.focus();
  }

  function total() {
    return FEE + Math.max(0, Number(liq.value) || 0);
  }

  function paint() {
    for (const [k, { input, out }] of Object.entries(sliders)) {
      input.value = String(alloc[k]);
      out.textContent = `${alloc[k]}%`;
    }
    const sum = alloc.creator + alloc.community + alloc.liquidity;
    sumOut.textContent = sum === 100 ? 'Adds up to 100%.' : `Adds up to ${sum}%. ${sum > 100 ? 'Take' : 'Add'} ${Math.abs(100 - sum)}% ${sum > 100 ? 'away' : 'more'}.`;
    sumOut.classList.toggle('is-bad', sum !== 100);
    const t = ticker.value || 'NEW';
    preview.replaceChildren(coinBadge({ iconId: pick.icon, colorId: COIN_COLORS.indexOf(pick.color) }, COIN_COLORS), h('span', { text: t }));
    icons.querySelectorAll('.coin-badge').forEach((b) => {
      COIN_COLORS.forEach((c) => b.classList.remove(`coin--${c}`));
      b.classList.add(`coin--${pick.color}`);
    });
    const cash = Number(me?.cash) || 0;
    cost.replaceChildren(
      h('strong', { text: `Cost: ${money(total(), 0)}` }),
      ` = ${money(FEE, 0)} listing fee (burned) + ${money(Math.max(0, Number(liq.value) || 0), 0)} your liquidity. `,
      me ? `Your Arena wallet: ${money(cash)}.` : '',
    );
    cost.classList.toggle('is-bad', Boolean(me) && total() > cash);
  }

  function validate() {
    const n = checkName(name.value);
    const t = checkTicker(ticker.value);
    nameErr.textContent = n?.message || '';
    tickErr.textContent = t?.message || '';
    name.setAttribute('aria-invalid', String(Boolean(n)));
    ticker.setAttribute('aria-invalid', String(Boolean(t)));
    if (n) return name.focus(), n.message;
    if (t) return ticker.focus(), t.message;
    if (alloc.creator + alloc.community + alloc.liquidity !== 100) return 'The coin shares must add up to 100%.';
    if (alloc.creator > 50) return 'The creator can keep 50% at most.';
    if (alloc.liquidity < 20) return 'Put at least 20% of the coins in the liquidity pool.';
    if (!(Number(liq.value) >= 100)) return 'Put at least 100 L$ of liquidity in.';
    if (me && total() > Number(me.cash)) return `You need ${money(total(), 0)} in your Arena wallet. Move L$ from Town first.`;
    return null;
  }

  async function launch(e) {
    e.preventDefault();
    const bad = validate();
    status.textContent = bad || '';
    status.classList.toggle('is-bad', Boolean(bad));
    if (bad) return;
    submit.disabled = true;
    status.textContent = 'Launching…';
    try {
      const res = await api('launch', {
        method: 'POST',
        data: {
          name: name.value.trim().replace(/\s+/g, ' '),
          ticker: ticker.value,
          icon: pick.icon,
          color: pick.color,
          supply: pick.supply,
          alloc: { ...alloc },
          liquidityL: Number(liq.value),
          lockDays: pick.lock,
          vestDays: pick.vest,
        },
      });
      dialog.close();
      name.value = '';
      ticker.value = '';
      onLaunched?.(res);
    } catch (err2) {
      status.textContent = err2.code === 'V2_OFF' ? 'Coin launches aren’t switched on yet. Try again later.' : err2.message;
      status.classList.add('is-bad');
      if (/TICKER/.test(err2.code || '')) tickErr.textContent = err2.message;
      if (/NAME/.test(err2.code || '')) nameErr.textContent = err2.message;
    } finally {
      submit.disabled = false;
    }
  }

  return {
    el,
    update(s) {
      el.hidden = false;
      me = s.me;
      canTrade = Boolean(s.me) && s.canTrade !== false;
      opener.disabled = !canTrade;
      openerNote.textContent = canTrade ? '' : s.me ? 'Launching opens once you can trade here.' : 'Make an account to launch a coin.';
      if (dialog.open) paint();
    },
  };
}

// The coin's icon and colour from the server; ids may arrive as an index or a colour name.
export function arenaBadge(c) {
  const colorId = typeof c.color === 'number' ? c.color : Math.max(0, COIN_COLORS.indexOf(c.color));
  return coinBadge({ iconId: Number.isInteger(c.icon) ? c.icon : 7, colorId }, COIN_COLORS);
}
