// The trade feed (BRIEF §17): bot personas by name, launches and rugs highlighted. New items slide in (CSS, off
// under reduced motion); only launches and rugs are read aloud, so a screen reader isn't flooded with every trade.
import { h, money, number } from '../../ui.js';

const RUG_TIP = 'A rug pull: the creator takes the liquidity out of the pool and the price collapses. Warning signs: unlocked liquidity, a big creator share and no vesting. Check the red-flag meter before you buy.';

export function feedView({ botNames = {} } = {}) {
  const list = h('ul', { class: 'arena-feed' });
  const say = h('p', { class: 'visually-hidden', 'aria-live': 'polite', role: 'status' });
  const tip = h('details', { class: 'arena-rugtip', hidden: true }, [h('summary', { text: 'What is a rug pull?' }), h('p', { text: RUG_TIP })]);
  const el = h('div', { class: 'arena-feedwrap' }, [list, tip, say]);
  let seen = null;

  const who = (t) => (t.persona ? t.persona : t.bot ? botNames[t.who] || 'Bot' : t.who || 'A player');
  const amount = (t) => `${number(t.coins, t.coins >= 100 ? 0 : 3)} ${t.coin}`;

  function line(t) {
    if (t.kind === 'rug') return `${who(t)} pulled the liquidity out of ${t.coin}. ${t.coin} was rugged.`;
    if (t.kind === 'launch') return `${who(t)} launched ${t.coin}.`;
    return `${who(t)} ${t.side === 'buy' ? 'bought' : 'sold'} ${amount(t)}`;
  }

  function item(t, fresh) {
    const kind = t.kind === 'rug' || t.kind === 'launch' ? t.kind : 'trade';
    return h('li', { class: `arena-feed__item is-${kind}${t.bot ? ' is-bot' : ''}${t.persona ? ' is-persona' : ''}${fresh ? ' is-new' : ''}` }, [
      kind !== 'trade' ? h('span', { class: 'arena-feed__badge', text: kind === 'rug' ? 'Rug pull' : 'Launch' }) : null,
      ...(kind === 'trade'
        ? [h('span', { class: 'arena-feed__who', text: who(t) }), h('span', { text: `${t.side === 'buy' ? 'bought' : 'sold'} ${amount(t)}` })]
        : [h('span', { class: 'arena-feed__text', text: line(t) })]),
      kind === 'trade' && t.amountL != null ? h('span', { class: 'arena-feed__l', text: money(t.amountL, 0) }) : null,
    ]);
  }

  return {
    el,
    update(trades = []) {
      const ids = trades.map((t, i) => String(t.id ?? `${t.who}-${t.coin}-${t.amountL}-${i}`));
      const first = seen === null;
      const fresh = new Set(first ? [] : ids.filter((id) => !seen.has(id)));
      if (!first && !fresh.size && list.childElementCount === trades.length) return;
      list.replaceChildren(...(trades.length ? trades.map((t, i) => item(t, fresh.has(ids[i]))) : [h('li', { class: 'arena-feed__item', text: 'No trades yet. Be the first!' })]));
      const loud = trades.filter((t, i) => fresh.has(ids[i]) && (t.kind === 'rug' || t.kind === 'launch'));
      if (loud.length) say.textContent = loud.map(line).join(' ');
      tip.hidden = !trades.some((t) => t.kind === 'rug');
      seen = new Set(ids);
    },
  };
}
