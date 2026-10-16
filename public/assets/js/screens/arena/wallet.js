// The Arena header (BRIEF §17): the Arena wallet lives on the server, the Town wallet on this device. A move goes
// to the server first (max 200 L$ per Bangkok day); the Town wallet is debited only once the server accepts.
import { h, money } from '../../ui.js';
import * as wallet from '../../../../js/wallet.js';

const CAP = 200;
const townBalance = (store) => (wallet.getBalance ? wallet.getBalance(store) : wallet.balance(store.get()));
const floor2 = (n) => Math.floor(Math.max(0, Number(n) || 0) * 100) / 100;

export function walletBar({ store, api, onCash }) {
  let me = null;
  const cash = h('strong', { class: 'arena-wallet__cash', text: '—' });
  const town = h('span', { class: 'arena-wallet__town' });
  const moved = h('span', { class: 'arena-wallet__moved' });
  const bar = h('span', { class: 'arena-wallet__bar', 'aria-hidden': 'true' }, [h('span', { class: 'arena-wallet__fill' })]);
  const input = h('input', { id: 'arena-move', class: 'arena-input arena-wallet__input', type: 'number', inputmode: 'decimal', min: '1', step: '1', placeholder: '0' });
  const go = h('button', { class: 'btn btn--primary arena-wallet__go', type: 'submit' }, 'Move to Arena');
  const msg = h('p', { class: 'arena-wallet__msg', role: 'status' });
  const form = h('form', { class: 'arena-wallet__form', novalidate: true, onSubmit: move }, [
    h('label', { class: 'arena-wallet__label', for: 'arena-move', text: 'Move L$ from Town' }),
    h('div', { class: 'arena-wallet__row' }, [input, go]),
  ]);
  const el = h('section', { class: 'arena-wallet', 'aria-label': 'Arena wallet', hidden: true }, [
    h('div', { class: 'arena-wallet__main' }, [
      h('p', { class: 'arena-wallet__kicker', text: 'Arena wallet' }),
      cash,
      town,
    ]),
    h('div', { class: 'arena-wallet__move' }, [form, h('p', { class: 'arena-wallet__cap' }, [moved, bar]), msg]),
  ]);

  const used = () => floor2(me?.transferredToday);
  const cap = () => Number(me?.transferCap) || CAP;
  const maxMove = () => floor2(Math.min(cap() - used(), townBalance(store)));

  function paint() {
    if (!me) return;
    cash.textContent = money(me.cash);
    // The header chip shows the Arena wallet while the Arena is open (shell.js listens for this).
    dispatchEvent(new CustomEvent('arena:wallet', { detail: { cash: me.cash } }));
    town.textContent = `Town wallet: ${money(townBalance(store))}`;
    moved.textContent = `${money(used(), 0)} of ${money(cap(), 0)} moved today`;
    bar.firstChild.style.width = `${Math.min(100, (used() / cap()) * 100)}%`;
    const max = maxMove();
    input.max = String(max);
    input.placeholder = max > 0 ? `Up to ${Math.floor(max)}` : '0';
    go.disabled = max <= 0;
  }

  async function move(e) {
    e.preventDefault();
    const a = floor2(input.value);
    msg.textContent = '';
    msg.classList.remove('is-bad');
    if (!(a > 0)) return say('Type how many L$ to move.', true);
    if (a > cap() - used()) return say(`You can move ${money(Math.max(0, cap() - used()), 0)} more today. The limit resets at midnight Bangkok time.`, true);
    if (a > townBalance(store)) return say(`Your Town wallet has ${money(townBalance(store))}.`, true);
    go.disabled = true;
    try {
      const res = await api('transfer', { method: 'POST', data: { amount: a } });
      const got = floor2(res.amount ?? a);
      me = { ...me, cash: res.cash ?? me.cash + got, transferredToday: res.transferredToday ?? used() + got };
      const debit = wallet.post(store, { amount: -got, kind: 'transfer', note: 'To the Arena' });
      input.value = '';
      if (debit?.ok === false) say(`The Arena added ${money(got)}, but your Town wallet couldn’t be updated (${debit.error}). Ask a grown-up or the team to check it.`, true);
      else say(`Moved ${money(got)} to the Arena.`);
      onCash?.(me);
    } catch (err) {
      say(err.code === 'CAP_REACHED' ? 'You’ve moved the most you can today. The limit resets at midnight Bangkok time.' : err.message, true);
    } finally {
      paint();
    }
  }

  function say(text, bad = false) {
    msg.textContent = text;
    msg.classList.toggle('is-bad', bad);
  }

  const onTown = () => paint();
  window.addEventListener('wallet:change', onTown);

  return {
    el,
    update(s) {
      el.hidden = !s.me;
      if (!s.me) return;
      me = { ...s.me };
      paint();
    },
    destroy: () => window.removeEventListener('wallet:change', onTown),
  };
}
