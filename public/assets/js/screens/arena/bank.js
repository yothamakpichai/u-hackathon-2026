// The Arena's central bank (BRIEF §17): how many L$ exist, how many were burned today, L$ per active player and
// today's stipend. Numbers come from the server; the explainer states the rule, not a statistic.
import { h, money, number } from '../../ui.js';

export function bankPanel() {
  const stats = h('dl', { class: 'arena-bank__stats' });
  const el = h('section', { class: 'card arena-bank', 'aria-labelledby': 'arena-bank-title', hidden: true }, [
    h('h2', { class: 'arena-title', id: 'arena-bank-title', text: 'Central Bank' }),
    stats,
    h('p', {
      class: 'arena-help',
      text: 'Listing fees and the 0.3% trade fee are burned, so L$ leave the Arena. The daily stipend shrinks to zero as L$ per player rises from 2,000 to 5,000, so new L$ aren’t handed out when there are already plenty. Fewer extra L$ chasing the same coins keeps each L$ from losing value.',
    }),
  ]);
  let key = '';

  return {
    el,
    update(s) {
      const b = s.supply;
      el.hidden = !b;
      if (!b) return;
      const next = JSON.stringify(b);
      if (next === key) return;
      key = next;
      const stat = (label, value) => (value == null ? [] : [h('div', { class: 'arena-bank__stat' }, [h('dt', { text: label }), h('dd', { text: value })])]);
      stats.replaceChildren(
        ...stat('Total L$ in the Arena', b.totalL != null ? money(b.totalL, 0) : null),
        ...stat('Burned today', b.burnedToday != null ? money(b.burnedToday, 0) : null),
        ...stat('L$ per active player', b.perPlayer != null ? money(b.perPlayer, 0) : null),
        ...stat('Active players', b.activePlayers != null ? number(b.activePlayers, 0) : null),
        ...stat('Today’s stipend', b.stipendToday != null ? money(b.stipendToday, 0) : null),
      );
    },
  };
}
