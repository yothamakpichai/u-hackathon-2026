// Today's season (BRIEF §17): ranked by net worth, ends at midnight Bangkok time. The top three get a soulbound
// medal: a badge that can't be sold or moved, stamped with a short hash on the simulated chain.
import { h, money } from '../../ui.js';

const MEDALS = { 1: ['gold', 'Gold'], 2: ['silver', 'Silver'], 3: ['bronze', 'Bronze'] };
const BKK = 7 * 3600 * 1000; // Bangkok is UTC+7 all year

const toMs = (v) => (typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v));
export function nextBangkokMidnight(now = Date.now()) {
  const day = 24 * 3600 * 1000;
  return Math.floor((now + BKK) / day) * day + day - BKK;
}
export function leftText(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const hrs = Math.floor(m / 60);
  return hrs ? `${hrs} h ${m % 60} min left` : `${m} min left`;
}
const shortHash = (x) => (x ? `${String(x).slice(0, 8)}…` : '');

function medal(m) {
  const [id, label] = MEDALS[m.rank] || ['bronze', `#${m.rank}`];
  return h('li', { class: `arena-medal is-${id}` }, [
    h('span', { class: 'arena-medal__disc', 'aria-hidden': 'true', text: String(m.rank) }),
    h('span', { class: 'arena-medal__body' }, [
      h('strong', { text: `${label}${m.username ? ` · ${m.username}` : ''}` }),
      h('span', { class: 'arena-medal__meta', text: [m.day ? `Day ${m.day}` : '', m.hash ? `Soulbound · ${shortHash(m.hash)}` : 'Soulbound'].filter(Boolean).join(' · ') }),
    ]),
  ]);
}

export function seasonPanel() {
  const left = h('p', { class: 'arena-season__left' });
  const top = h('ol', { class: 'arena-season__top' });
  const history = h('ul', { class: 'arena-medals' });
  const mine = h('ul', { class: 'arena-medals' });
  const mineWrap = h('div', { class: 'arena-season__mine' }, [h('h3', { class: 'arena-season__h', text: 'My medals' }), mine]);
  const el = h('section', { class: 'card arena-season', 'aria-labelledby': 'arena-season-title', hidden: true }, [
    h('div', { class: 'arena-card-head' }, [h('h2', { class: 'arena-title', id: 'arena-season-title', text: 'Today’s season' }), left]),
    h('p', { class: 'board__note', text: 'Ranked by net worth: cash plus coins at today’s prices. The top three at midnight Bangkok time win a soulbound medal. It can’t be sold or traded.' }),
    top,
    mineWrap,
    h('h3', { class: 'arena-season__h', text: 'Medal history' }),
    history,
  ]);
  let key = '';

  return {
    el,
    update(s) {
      const season = s.season;
      el.hidden = !season;
      if (!season) return;
      const ends = toMs(season.endsAt);
      left.textContent = leftText((Number.isFinite(ends) ? ends : nextBangkokMidnight()) - Date.now());
      const next = JSON.stringify([season.day, season.medals, s.leaderboard?.slice(0, 3), s.me?.medals]);
      if (next === key) return;
      key = next;
      const podium = (s.leaderboard || []).slice(0, 3);
      top.replaceChildren(
        ...(podium.length
          ? podium.map((r) =>
              h('li', { class: `arena-season__row is-${(MEDALS[r.rank] || ['bronze'])[0]}` }, [
                h('span', { class: 'arena-medal__disc', 'aria-hidden': 'true', text: String(r.rank) }),
                h('span', { class: 'arena-season__name', text: r.username }),
                h('span', { class: 'arena-season__value', text: money(r.value, 0) }),
              ]),
            )
          : [h('li', { class: 'arena-help', text: 'Nobody has traded today yet.' })]),
      );
      const medals = Array.isArray(season.medals) ? season.medals.slice(-9).reverse() : [];
      history.replaceChildren(...(medals.length ? medals.map(medal) : [h('li', { class: 'arena-help', text: 'The first medals are handed out tonight at midnight Bangkok time.' })]));
      const my = Array.isArray(s.me?.medals) ? s.me.medals : [];
      mineWrap.hidden = !s.me;
      mine.replaceChildren(...(my.length ? my.map((m) => medal({ ...m, username: '' })) : [h('li', { class: 'arena-help', text: 'No medals yet. Finish a day in the top three to earn one.' })]));
    },
  };
}
