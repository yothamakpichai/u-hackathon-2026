// The selected coin's trust card (BRIEF §17): who made it, how much they hold, whether the pool is locked, vesting,
// and a 0-100 red-flag score with the server's reasons. Colour is never the only signal: every level has words.
import { h, number } from '../../ui.js';
import { arenaBadge } from './launch.js';

const dateText = (v) => {
  const ms = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
};
const future = (v) => {
  const ms = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  return Number.isFinite(ms) && ms > Date.now();
};

export function level(score) {
  if (score >= 70) return { id: 'high', text: 'High risk' };
  if (score >= 40) return { id: 'mid', text: 'Some warning signs' };
  return { id: 'low', text: 'Few warning signs' };
}

export function coinPanel() {
  const el = h('section', { class: 'card arena-coincard', 'aria-labelledby': 'arena-coincard-title', hidden: true });
  let key = '';

  return {
    el,
    update(s) {
      const c = s.coins?.find((x) => x.id === s.coin) || null;
      if (!c) return (el.hidden = true);
      const flags = c.redFlags && typeof c.redFlags.score === 'number' ? c.redFlags : null;
      const next = JSON.stringify([c.id, c.creator, c.creatorPct, c.lpLocked, c.lockUntil, c.vestUntil, flags, c.rugged, c.launched]);
      el.hidden = false;
      if (next === key) return;
      key = next;
      const roster = !c.launched && !c.creator;
      const rows = [];
      if (roster) rows.push(['Made by', 'The Arena (a starter coin)']);
      else {
        rows.push(['Creator', c.creator || 'Unknown']);
        if (c.creatorPct != null) rows.push(['Creator holds', `${number(c.creatorPct, 1)}% of all coins`, c.creatorPct >= 20]);
        if (c.lpLocked != null) rows.push(['Liquidity', c.lpLocked && future(c.lockUntil) ? `Locked until ${dateText(c.lockUntil)}` : c.lpLocked ? 'Locked' : 'Not locked: the creator can pull it out', !c.lpLocked]);
        if (c.vestUntil !== undefined) rows.push(['Creator’s coins', c.vestUntil && future(c.vestUntil) ? `Vesting until ${dateText(c.vestUntil)}` : 'Not vesting: they can sell any time', !(c.vestUntil && future(c.vestUntil))]);
      }
      if (c.supply) rows.push(['Supply', `${number(c.supply, 0)} coins`]);
      const lv = flags ? level(flags.score) : null;
      el.replaceChildren(
        ...[
        c.rugged
          ? h('div', { class: 'arena-rugged', role: 'alert' }, [
              h('strong', { text: 'Rugged' }),
              h('span', { text: ' The creator pulled the liquidity out. Holders are left with coins almost nobody can buy. Unlocked liquidity and a big creator share were the warning signs.' }),
            ])
          : null,
        h('div', { class: 'arena-coincard__head' }, [arenaBadge(c), h('h2', { class: 'arena-title', id: 'arena-coincard-title', text: `About ${c.id}` })]),
        h(
          'dl',
          { class: 'arena-coincard__facts' },
          rows.flatMap(([k, v, warn]) => [h('dt', { text: k }), h('dd', { class: warn ? 'is-warn' : '', text: v })]),
        ),
        flags
          ? h('div', { class: `arena-flags is-${lv.id}` }, [
              h('div', { class: 'arena-flags__top' }, [h('span', { class: 'arena-flags__label', id: 'arena-flags-label', text: 'Red-flag meter' }), h('strong', { text: `${Math.round(flags.score)}/100 · ${lv.text}` })]),
              h('div', { class: 'arena-flags__track', role: 'meter', 'aria-labelledby': 'arena-flags-label', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(flags.score)), 'aria-valuetext': `${Math.round(flags.score)} out of 100, ${lv.text}` }, [
                h('span', { class: 'arena-flags__fill', dataset: { w: String(Math.max(0, Math.min(100, flags.score))) } }),
              ]),
              flags.reasons?.length
                ? h('ul', { class: 'arena-flags__list' }, flags.reasons.map((r) => h('li', { text: r })))
                : h('p', { class: 'arena-help', text: 'No warning signs found right now. That is not a promise: check again before you buy.' }),
            ])
          : null,
        ].filter(Boolean),
      );
      const fill = el.querySelector('.arena-flags__fill');
      if (fill) fill.style.width = `${fill.dataset.w}%`;
    },
  };
}

// A short tag for the coin tabs: launched coins show their icon, rugged ones say so.
export function tabTag(c) {
  if (c.rugged) return h('span', { class: 'arena-coin__tag is-rug', text: 'Rugged' });
  if (c.launched) return h('span', { class: 'arena-coin__tag', text: 'New' });
  return null;
}
