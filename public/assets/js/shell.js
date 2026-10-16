// App shell pieces (BRIEF §17, P1.B): the L$ balance chip, the Settings gear and the "Demo profile" strip.
// Mounted once from app.js. Nothing here owns game state; it only reads the store and listens for events.
//
// Events this module listens to:
//   window 'wallet:change' { balance }  Town wallet (public/js/wallet.js) after each ledger post.
//   window 'arena:wallet'  { cash }     Arena wallet. The Arena screen (screens/arena.js) dispatches it whenever it
//                                       learns the server balance: dispatchEvent(new CustomEvent('arena:wallet',
//                                       { detail: { cash } })). Until one arrives the chip shows "Arena –" on #/arena.
import { h, reducedMotion, animate } from './ui.js';
import * as wallet from '../../js/wallet.js';

const SVG = 'http://www.w3.org/2000/svg';

const townBalance = (store) => {
  try {
    return wallet.getBalance ? wallet.getBalance(store) : wallet.balance(store.get());
  } catch {
    return null;
  }
};

const fmt = (n) => (n == null || !Number.isFinite(n) ? '–' : wallet.coinText(n));
// Narrow phones: whole coins, and 10,000 and over as 12.3K, so the header never scrolls sideways. The aria-label keeps
// the exact balance.
const narrow = matchMedia('(max-width: 399.98px)');
const fmtChip = (n) => {
  if (n == null || !Number.isFinite(n) || !narrow.matches) return fmt(n);
  const whole = Math.floor(n + 1e-6);
  return Math.abs(whole) >= 10000 ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(whole) : whole.toLocaleString('en-US');
};

function gearIcon() {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, String(v));
  const c = document.createElementNS(SVG, 'circle');
  c.setAttribute('cx', '12');
  c.setAttribute('cy', '12');
  c.setAttribute('r', '3');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
  svg.append(c, p);
  return svg;
}

// The balance chip: Town wallet everywhere, the Arena wallet inside #/arena.
function mountBalance(store, host) {
  const label = h('span', { class: 'lchip__label', text: 'L$' });
  const value = h('span', { class: 'lchip__value', text: '–' });
  const where = h('span', { class: 'lchip__where' });
  const chip = h('a', { class: 'lchip', href: '#/town', 'aria-live': 'polite', 'aria-atomic': 'true', hidden: true }, [h('span', { class: 'lchip__coin', 'aria-hidden': 'true' }), where, label, value]);
  host.prepend(chip);

  let arenaCash = null;
  let shown = null;
  let raf = 0;

  const inArena = () => location.hash.replace(/^#/, '').split('?')[0] === '/arena';

  function countTo(target) {
    cancelAnimationFrame(raf);
    const from = shown;
    shown = target;
    if (from == null || target == null || reducedMotion() || from === target) {
      value.textContent = fmtChip(target);
      return;
    }
    const t0 = performance.now();
    const dur = 420;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - (1 - k) ** 3;
      value.textContent = fmtChip(k < 1 ? from + (target - from) * e : target);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    chip.classList.remove('is-up', 'is-down');
    void chip.offsetWidth; // restart the bump
    chip.classList.add(target > from ? 'is-up' : 'is-down');
  }

  function render() {
    const s = store.get();
    chip.hidden = !s.tier;
    if (!s.tier) return;
    const arena = inArena();
    chip.classList.toggle('lchip--arena', arena);
    where.textContent = arena ? 'Arena' : '';
    chip.setAttribute('href', arena ? '#/arena' : '#/town');
    chip.setAttribute('aria-label', arena ? `Arena wallet: ${fmt(arenaCash)} L$` : `Town wallet: ${fmt(townBalance(store))} L$`);
    countTo(arena ? arenaCash : townBalance(store));
  }

  addEventListener('wallet:change', render);
  addEventListener('arena:wallet', (e) => {
    const cash = Number(e.detail?.cash);
    arenaCash = Number.isFinite(cash) ? cash : null;
    render();
  });
  addEventListener('hashchange', () => {
    shown = null; // switching wallets: no count-up between two different balances
    render();
  });
  store.subscribe(render);
  render();
}

// "Demo profile" strip, shown while the Judge demo profile is loaded (store.demo).
function mountDemoStrip(store) {
  const header = document.querySelector('.app-header');
  if (!header) return;
  const strip = h('div', { class: 'demo-strip', role: 'note', hidden: true }, [
    h('span', { class: 'demo-strip__tag', text: 'Demo profile' }),
    h('span', { class: 'demo-strip__text', text: 'A sample town for judges. Nothing here is yours.' }),
    h('button', { class: 'demo-strip__leave', type: 'button', onClick: () => leaveDemo(store) }, 'Leave demo'),
  ]);
  header.after(strip);
  const render = () => {
    strip.hidden = !store.get().demo;
  };
  store.subscribe(render);
  render();
}

export async function leaveDemo(store) {
  try {
    const sync = await import('./sync.js');
    if (sync.currentAccount()) await sync.signOut();
  } catch {
    // offline: the local reset below still happens
  }
  store.reset();
  location.hash = '#/';
}

export function mountShell({ store }) {
  const actions = document.querySelector('.app-header__actions');
  if (!actions) return;
  mountBalance(store, actions);
  const gear = h('a', { class: 'icon-btn shell-gear', href: '#/settings', title: 'Settings', hidden: true }, [gearIcon(), h('span', { class: 'visually-hidden', text: 'Settings' })]);
  actions.append(gear);
  const renderGear = () => {
    gear.hidden = !store.get().tier;
    gear.toggleAttribute('aria-current', location.hash.startsWith('#/settings'));
  };
  store.subscribe(renderGear);
  addEventListener('hashchange', renderGear);
  renderGear();
  mountDemoStrip(store);
  // Small press feedback on the gear.
  gear.addEventListener('click', () => animate(gear, [{ transform: 'rotate(-60deg)' }, { transform: 'none' }], { duration: 300 }));
}
