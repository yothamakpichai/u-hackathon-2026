// Shared coin pieces for the Lab, Create, the block explorer and the Piggy Bank (J13). They live apart from
// lab.js so those screens never load the Lab or its chart library. DOM helpers plus the open-market handle.
import { h, icon, number, price } from '../ui.js';

// The market outlives the Lab screen, so a trip to #/create and back resumes it. One per tier and day.
let live = null;
export const liveMarket = () => live;
export const setLiveMarket = (market) => {
  live = market;
};

// The open market for this tier, for the Create screen (null when the Lab hasn't opened one).
export const currentMarket = (tier) => (live && live.tier === tier ? live : null);

// Why Create can't open the coin designer yet, or null when it can. The light Create shell checks this
// before it loads the designer, so these notes never wait for the engine and the Coach (J13).
export function blockedReason(market) {
  if (!market) return { title: 'Open today’s market first', body: 'Coins launch into today’s market. Open it, wait for Penny’s first news, then come back here.' };
  if (market.closed) return { title: 'Today’s market has closed', body: 'Coins can only launch while the market is open. Replay today’s market to try again.' };
  const existing = Object.values(market.session.getState().coins).find((c) => c.user);
  if (existing) return { title: `You already launched ${existing.ticker}`, body: 'One coin per market. Go back and see how buyers are reacting to it.' };
  if (!market.news.length) return { title: 'Not open yet', body: 'Create a coin opens after Penny’s first market news. Keep watching the market, then come back.' };
  return null;
}

// Who made a trade, in kids' words (transaction `who`: an agent archetype, 'issuer' or 'player').
export const WHO = {
  player: 'You',
  retail: 'Everyday trader',
  momentum: 'Trend follower',
  value: 'Bargain hunter',
  whale: 'Whale',
  panic: 'Nervous seller',
  insider: 'Insider',
  hype: 'Hype buyer',
  arb: 'Arbitrage bot',
  rugger: 'Coin creator',
  wash: 'Wash-trading bot',
  issuer: 'New coins (miners and rewards)',
  mint: 'Badge mint',
};

// 24 original geometric coin glyphs on a 24 px grid, white on the coin colour (BRIEF §10).
// iconId indexes this list; 0 to 6 are the roster's (VAULT, EDUU, PEG, FUEL, ORBIT, ZOOMZ, BLOOP).
const SVG_NS = 'http://www.w3.org/2000/svg';
const FILL = { fill: '#FFFFFF' };
const LINE = { fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
export const GLYPHS = [
  ['Hexagon', [['polygon', { points: '12,3.5 19.5,7.8 19.5,16.2 12,20.5 4.5,16.2 4.5,7.8', ...FILL }]]],
  ['Leaf', [['path', { d: 'M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14z', ...FILL }]]],
  ['Equals', [['rect', { x: 5, y: 7.5, width: 14, height: 3.5, rx: 1.75, ...FILL }], ['rect', { x: 5, y: 13, width: 14, height: 3.5, rx: 1.75, ...FILL }]]],
  ['Bolt', [['polygon', { points: '13.5,3 6,13.5 11,13.5 10,21 18,10 13,10', ...FILL }]]],
  ['Orbit', [['circle', { cx: 12, cy: 12, r: 6.5, ...LINE }], ['circle', { cx: 18, cy: 6.5, r: 2.4, ...FILL }]]],
  ['Chevrons', [['path', { d: 'M5.5 7l5 5-5 5M12.5 7l5 5-5 5', ...LINE }]]],
  ['Bubbles', [['circle', { cx: 9, cy: 14.5, r: 4.5, ...FILL }], ['circle', { cx: 16.5, cy: 8, r: 2.8, ...FILL }], ['circle', { cx: 17, cy: 16.5, r: 1.8, ...FILL }]]],
  ['Circle', [['circle', { cx: 12, cy: 12, r: 7, ...FILL }]]],
  ['Square', [['rect', { x: 5.5, y: 5.5, width: 13, height: 13, rx: 2.5, ...FILL }]]],
  ['Triangle', [['polygon', { points: '12,4 20.5,19 3.5,19', ...FILL }]]],
  ['Diamond', [['polygon', { points: '12,3 20.5,12 12,21 3.5,12', ...FILL }]]],
  ['Star', [['polygon', { points: '12,3.5 14.6,9.2 20.6,9.6 16,13.6 17.4,19.6 12,16.4 6.6,19.6 8,13.6 3.4,9.6 9.4,9.2', ...FILL }]]],
  ['Ring', [['circle', { cx: 12, cy: 12, r: 7, ...LINE, 'stroke-width': 3.4 }]]],
  ['Plus', [['path', { d: 'M12 5v14M5 12h14', ...LINE, 'stroke-width': 3.6 }]]],
  ['Drop', [['path', { d: 'M12 3.5c3.8 4.6 6 8 6 10.8a6 6 0 0 1-12 0c0-2.8 2.2-6.2 6-10.8z', ...FILL }]]],
  ['Moon', [['path', { d: 'M15.5 4.2a8 8 0 1 0 4.6 12.9A6.6 6.6 0 0 1 15.5 4.2z', ...FILL }]]],
  ['Sun', [['circle', { cx: 12, cy: 12, r: 4, ...FILL }], ['path', { d: 'M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6', ...LINE, 'stroke-width': 2.2 }]]],
  ['Wave', [['path', { d: 'M3.5 12c2.8-4 5.7-4 8.5 0s5.7 4 8.5 0', ...LINE, 'stroke-width': 3 }]]],
  ['Heart', [['path', { d: 'M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6z', ...FILL }]]],
  ['Spark', [['path', { d: 'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z', ...FILL }]]],
  ['Tiles', [['rect', { x: 5, y: 5, width: 6, height: 6, rx: 1.5, ...FILL }], ['rect', { x: 13, y: 5, width: 6, height: 6, rx: 1.5, ...FILL }], ['rect', { x: 5, y: 13, width: 6, height: 6, rx: 1.5, ...FILL }], ['rect', { x: 13, y: 13, width: 6, height: 6, rx: 1.5, ...FILL }]]],
  ['Steps', [['rect', { x: 4.5, y: 13, width: 4, height: 6.5, rx: 1.2, ...FILL }], ['rect', { x: 10, y: 9, width: 4, height: 10.5, rx: 1.2, ...FILL }], ['rect', { x: 15.5, y: 4.5, width: 4, height: 15, rx: 1.2, ...FILL }]]],
  ['Arrow', [['path', { d: 'M12 19V5.5M6 11.5l6-6 6 6', ...LINE, 'stroke-width': 3 }]]],
  ['Pentagon', [['polygon', { points: '12,3.5 20.2,9.5 17.1,19.2 6.9,19.2 3.8,9.5', ...FILL }]]],
];

function glyph(iconId) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' })) {
    svg.setAttribute(k, String(v));
  }
  for (const [tag, attrs] of (GLYPHS[iconId] || GLYPHS[7])[1]) {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) part.setAttribute(k, String(v));
    svg.append(part);
  }
  return svg;
}

// Coin amounts: whole numbers when large, about four significant digits when tiny.
export function coinAmount(n) {
  const abs = Math.abs(n);
  if (abs >= 1000) return number(n, 0);
  if (abs >= 1) return number(n, 2);
  if (abs === 0) return '0';
  return number(n, Math.min(8, 3 - Math.floor(Math.log10(abs))));
}

// Plain-language notes on a coin design (BRIEF §2 lenses). Used before launch (Create) and after (Lab).
// tone: 'good' | 'risk' | 'info'; id 'insiders' marks the trust note. Only knobs the tier can see are explained.
// price0 null: no starting price yet (a Create design that leaves buyers too little), so no supply note.
export function designNotes({ supply, price0, allocation, hype, lpLocked, vesting, bigInsiders }, tier) {
  const notes = price0 == null ? [] : [{ tone: 'info', text: `${coinAmount(supply)} coins, so each starts at ${price(price0)}. Make more and each one is worth less.` }];
  if (tier === 'explorer') {
    notes.push({ tone: 'good', text: `You keep ${allocation.you}% and buyers get ${allocation.public}%. There’s no team, so nobody sells a big pile of your coin.` });
  } else {
    const insiders = allocation.you + allocation.team;
    notes.push(
      bigInsiders
        ? { id: 'insiders', tone: 'risk', text: `You and your team keep ${insiders}%. Buyers worry big holders will sell, so fewer of them buy.` }
        : { id: 'insiders', tone: 'good', text: `You and your team keep ${insiders}%, which buyers see as fair.` },
    );
    if (allocation.team > 0) notes.push({ tone: 'risk', text: `Your team’s ${allocation.team}% unlocks over a minute, and they sell half of it.` });
    if (hype >= 0.7) notes.push({ tone: 'risk', text: 'A loud launch brings a rush of buyers, but hype fades fast.' });
    else if (hype <= 0.3) notes.push({ tone: 'info', text: 'A quiet launch: fewer buyers at first, and a smaller drop later.' });
    else notes.push({ tone: 'info', text: 'Some launch buzz: a few early buyers, then the hype fades.' });
  }
  if (tier === 'builder') {
    notes.push(
      lpLocked
        ? { tone: 'good', text: 'Your pool is locked, so buyers know its money can’t be pulled out.' }
        : { tone: 'risk', text: 'Your pool isn’t locked. Scammers can copy your coin and trick your buyers.' },
    );
    if (allocation.you > 0) {
      notes.push(
        vesting
          ? { tone: 'good', text: 'Your own coins unlock slowly, so buyers trust you more.' }
          : { tone: 'risk', text: 'Your own coins aren’t vesting, so buyers worry you might sell.' },
      );
    }
  }
  return notes;
}

// Builder tier (J9): a read-only, plain-language view of the rules the player's coin launched with.
// tone per row as in designNotes: 'good' | 'risk' | 'info'.
export function contractView(coin, { fee, teamVestDays }) {
  const L = coin.launch;
  const a = L.allocation;
  const share = (pct) => coinAmount((L.supply * pct) / 100);
  const rows = [
    ['maxSupply', `${coinAmount(L.supply)} coins`, 'Fixed. There is no mint function, so no one can make more coins later.', 'good'],
    ['split', `You ${a.you}% · Team ${a.team}% · Public ${a.public}%`, 'Who got the coins at launch.', 'info'],
    a.team > 0 && ['teamUnlock', `${share(a.team)} over ${teamVestDays} market days`, 'Team coins unlock bit by bit over about a minute of play, so they can’t all be sold on day one.', 'info'],
    a.you > 0 && ['yourVesting', L.vesting ? 'yes' : 'no', L.vesting ? 'Your own coins unlock slowly too.' : 'Your coins are free at once, so buyers worry you might sell.', L.vesting ? 'good' : 'risk'],
    ['poolLocked', L.lpLocked ? 'yes' : 'no', L.lpLocked ? 'The pool’s money is locked, so no one can pull it out.' : 'Not locked: whoever holds the pool could pull its money out (a rug pull).', L.lpLocked ? 'good' : 'risk'],
    ['tradeFee', `${number(fee * 100, 1)}% of each trade`, 'It stays in the pool, so the pool slowly grows.', 'info'],
    ['ownerPowers', L.lpLocked ? 'none' : 'withdrawPool()', L.lpLocked ? 'No mint, no pause, no upgrade. Some real contracts let the owner change the rules later; yours can’t.' : 'The pool can be emptied. This is the line to check before you buy any coin.', L.lpLocked ? 'good' : 'risk'],
  ].filter(Boolean);
  return h('details', { class: 'contract' }, [
    h('summary', { class: 'contract__summary' }, [icon('blocks', { size: 20 }), `Read ${coin.ticker}’s smart contract`]),
    h('p', { class: 'contract__intro', text: `A smart contract is code on the blockchain that sets a coin’s rules. Anyone can read it before they buy. This is a simple, read-only view of ${coin.name}’s. Nobody can edit it now, not even you.` }),
    h('dl', { class: 'contract__rows' }, rows.map(([key, value, plain, tone]) =>
      h('div', { class: `contract__row is-${tone}` }, [
        h('dt', { class: 'contract__key' }, [h('code', { text: key })]),
        h('dd', { class: 'contract__val' }, [h('span', { class: 'contract__value', text: value }), h('span', { class: 'contract__plain', text: plain })]),
      ]),
    )),
    h('p', { class: 'contract__tip', text: 'Before you buy any coin, check three things: can more coins be made, is the pool locked, and who holds the most?' }),
  ]);
}

export function notesList(notes) {
  return h(
    'ul',
    { class: 'design-notes' },
    notes.map((n) =>
      h('li', { class: `design-notes__item is-${n.tone}` }, [
        icon(n.tone === 'good' ? 'check' : n.tone === 'risk' ? 'alert' : 'compass', { size: 18 }),
        h('span', { text: n.text }),
      ]),
    ),
  );
}

// A coin's icon on its colour. Decorative: the ticker always sits next to it.
export function coinBadge(c, colors) {
  return h('span', { class: `coin-badge coin--${colors[c.colorId] || 'mint'}`, 'aria-hidden': 'true' }, [glyph(c.iconId)]);
}
