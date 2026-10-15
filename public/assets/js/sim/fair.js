// Cow Fair rules (BRIEF §16 stretch). Pure, no DOM. Collectors trade cow cards: pictures of cows,
// not cows. One rare trait gets hyped, so cards with it balloon in price; then new buyers stop
// coming, nobody will buy for a while, and prices crash (as with CryptoKitties in 2017 and
// Axie Infinity in 2022). Players use pretend fair tickets, never the Town wallet, and their own
// cows are never for sale: a cow's birth certificate is soulbound.
import { hashString, mulberry32 } from './prng.js';
import { cowTraits } from './farm.js';

export const FAIR = Object.freeze({ steps: 40, stepMs: 1500, tickets: 100, spread: 0.06, cards: 8, hyped: 3 });
const RISE = [5, 22]; // steps where the hype builds
const CRASH = [25, 31]; // steps where it collapses
const NO_BUYERS = [25, 29]; // nobody will buy the hyped cards
const FLOOR = 0.35; // hyped cards end at about a third of their old price

const TRAITS = [
  { id: 'star', label: 'star mark', give: (c) => ({ ...c, star: true }), take: (c) => ({ ...c, star: false }) },
  { id: 'gold', label: 'gold bell', give: (c) => ({ ...c, bell: 'gold' }), take: (c) => ({ ...c, bell: c.bell === 'gold' ? 'silver' : c.bell }) },
  { id: 'belt', label: 'belt pattern', give: (c) => ({ ...c, pattern: 'belt' }), take: (c) => ({ ...c, pattern: c.pattern === 'belt' ? 'spots' : c.pattern }) },
  { id: 'honey', label: 'honey coat', give: (c) => ({ ...c, coat: 'honey' }), take: (c) => ({ ...c, coat: c.coat === 'honey' ? 'cream' : c.coat }) },
];

const round1 = (x) => Math.round(x * 10) / 10;

// How far a hyped card's price is from its start, at a step.
export function hypeAt(step, peak) {
  if (step < RISE[0]) return 1;
  if (step < RISE[1]) return peak ** ((step - RISE[0]) / (RISE[1] - RISE[0]));
  if (step < CRASH[0]) return peak;
  if (step < CRASH[1]) return peak * (FLOOR / peak) ** ((step - CRASH[0]) / (CRASH[1] - CRASH[0]));
  return FLOOR;
}
// Ordinary cards drift, and dip a little while everyone chases the hype.
const calmAt = (step) => (step >= RISE[1] - 4 && step < CRASH[1] ? 0.9 : 1);

// One fair round, the same for everyone with the same seed.
export function makeFair(seed) {
  const r = mulberry32(hashString(`fair:${seed}`));
  const trait = TRAITS[Math.floor(r() * TRAITS.length)];
  const cards = [];
  for (let i = 0; i < FAIR.cards; i++) {
    const hyped = i < FAIR.hyped;
    const cow = cowTraits(`fair:${seed}:${i}`);
    cards.push({ ...(hyped ? trait.give(cow) : trait.take(cow)), id: `card-${i + 1}`, hyped, base: round1(6 + r() * 8) });
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const peak = 6 + r() * 3;
  const prices = cards.map((c) => {
    const path = [];
    let noise = 1;
    for (let s = 0; s <= FAIR.steps; s++) {
      const z = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
      noise = Math.min(1.2, Math.max(0.85, noise * Math.exp(0.03 * z)));
      path.push(round1(c.base * (c.hyped ? hypeAt(s, peak) : calmAt(s)) * noise));
    }
    return path;
  });
  return { seed, trait: { id: trait.id, label: trait.label }, peak, cards, prices };
}

export const noBuyers = (card, step) => card.hyped && step >= NO_BUYERS[0] && step < NO_BUYERS[1];
// You buy a little above the middle price and sell a little below it.
export const askOf = (fair, i, step) => round1(fair.prices[i][step] * (1 + FAIR.spread / 2));
export const bidOf = (fair, i, step) => (noBuyers(fair.cards[i], step) ? null : round1(fair.prices[i][step] * (1 - FAIR.spread / 2)));

// Average price of the hyped cards against their start: 1 = no change.
export function hypeIndex(fair, step) {
  const ids = fair.cards.map((c, i) => (c.hyped ? i : -1)).filter((i) => i >= 0);
  return ids.reduce((s, i) => s + fair.prices[i][step] / fair.prices[i][0], 0) / ids.length;
}

// What the fair crowd says, by step.
export function newsAt(fair, step) {
  const t = fair.trait.label;
  return {
    0: 'The fair opens. Cow cards are pictures of cows, traded by collectors.',
    3: `A famous collector just paid a lot for a ${t} card!`,
    8: `Everyone at the fair is talking about ${t} cards.`,
    14: `${t[0].toUpperCase()}${t.slice(1)} prices have doubled. “They only go up,” says a stranger.`,
    20: 'Hardly anyone new is arriving. Sellers start to line up.',
    25: `A big collector sells every ${t} card at once. Nobody wants to buy.`,
    29: `Buyers are back, but only at much lower prices.`,
    34: `The crowd moves on. ${t[0].toUpperCase()}${t.slice(1)} cards are ordinary again.`,
  }[step] ?? null;
}

// Buy one card (each card is one of a kind, so you can own it or not).
export function buyCard(fair, round, i) {
  if (round.step >= FAIR.steps) return { ok: false, error: 'The fair is over.' };
  if (round.owned[i]) return { ok: false, error: 'You already own this card.' };
  const cost = askOf(fair, i, round.step);
  if (cost > round.tickets + 1e-9) return { ok: false, error: 'Not enough tickets.' };
  return { ok: true, round: { ...round, tickets: round1(round.tickets - cost), owned: { ...round.owned, [i]: { paid: cost, step: round.step } }, trades: [...round.trades, { i, side: 'buy', price: cost, step: round.step }] } };
}

export function sellCard(fair, round, i) {
  if (round.step >= FAIR.steps) return { ok: false, error: 'The fair is over.' };
  if (!round.owned[i]) return { ok: false, error: 'You don’t own this card.' };
  const bid = bidOf(fair, i, round.step);
  if (bid == null) return { ok: false, error: 'Nobody wants to buy this card right now.' };
  const owned = { ...round.owned };
  delete owned[i];
  return { ok: true, round: { ...round, tickets: round1(round.tickets + bid), owned, trades: [...round.trades, { i, side: 'sell', price: bid, step: round.step }] } };
}

export const newRound = () => ({ step: 0, tickets: FAIR.tickets, owned: {}, trades: [] });

// Tickets plus the cards you still hold at what buyers pay at the end.
export function roundValue(fair, round) {
  const s = Math.min(round.step, FAIR.steps);
  return round1(round.tickets + Object.keys(round.owned).reduce((v, i) => v + (bidOf(fair, Number(i), s) ?? 0), 0));
}

// Plain-language summary of how the player rode the hype.
export function summary(fair, round) {
  const hypedBuys = round.trades.filter((x) => x.side === 'buy' && fair.cards[x.i].hyped);
  const late = hypedBuys.filter((x) => x.step >= 14 && x.step < CRASH[1]).length;
  const early = hypedBuys.filter((x) => x.step < 14).length;
  const held = Object.keys(round.owned).filter((i) => fair.cards[i].hyped).length;
  return { end: roundValue(fair, round), start: FAIR.tickets, early, late, heldThroughCrash: held, floor: FLOOR };
}
