// Unit checks for the Cow Fair. Run: node public/assets/js/sim/fair.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FAIR, askOf, bidOf, buyCard, hypeIndex, makeFair, newRound, newsAt, noBuyers, roundValue, sellCard, summary } from './fair.js';

const hypedIds = (f) => f.cards.map((c, i) => (c.hyped ? i : -1)).filter((i) => i >= 0);
const has = (f, c) => ({ star: c.star, gold: c.bell === 'gold', belt: c.pattern === 'belt', honey: c.coat === 'honey' })[f.trait.id];

test('a fair is seeded, and exactly the hyped cards carry the hyped trait', () => {
  assert.deepEqual(makeFair('2026-10-16:0'), makeFair('2026-10-16:0'));
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
    const f = makeFair(seed);
    assert.equal(f.cards.length, FAIR.cards);
    assert.equal(hypedIds(f).length, FAIR.hyped);
    for (const c of f.cards) assert.equal(has(f, c), c.hyped, `${seed}: ${c.id} ${f.trait.id}`);
    assert.equal(f.prices[0].length, FAIR.steps + 1);
  }
});

test('hype inflates the rare trait, then it crashes below where it started', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const f = makeFair(seed);
    const top = Math.max(...Array.from({ length: FAIR.steps + 1 }, (_, s) => hypeIndex(f, s)));
    assert.ok(top > 4, `${seed}: peak ${top}`);
    assert.ok(hypeIndex(f, FAIR.steps) < 0.5, `${seed}: end ${hypeIndex(f, FAIR.steps)}`);
    for (const [i, c] of f.cards.entries()) {
      if (c.hyped) continue;
      const p = f.prices[i];
      assert.ok(Math.max(...p) / p[0] < 1.6 && Math.min(...p) / p[0] > 0.6, `${seed}: ordinary card ${c.id} stays calm`);
    }
  }
});

test('in the crash, nobody buys the hyped cards for a while', () => {
  const f = makeFair('x');
  const i = hypedIds(f)[0];
  assert.equal(noBuyers(f.cards[i], 26), true);
  assert.equal(bidOf(f, i, 26), null);
  assert.ok(bidOf(f, i, 30) > 0);
  assert.ok(askOf(f, i, 10) > bidOf(f, i, 10), 'a spread between buying and selling');
  assert.ok(newsAt(f, 3).includes(f.trait.label));
  assert.equal(newsAt(f, 4), null);
});

test('buying early and selling at the top wins; buying late and holding loses', () => {
  const f = makeFair('y');
  const i = hypedIds(f)[0];
  let early = buyCard(f, newRound(), i).round;
  assert.equal(buyCard(f, early, i).ok, false, 'one of a kind');
  early = sellCard(f, { ...early, step: 23 }, i).round;
  assert.ok(roundValue(f, { ...early, step: FAIR.steps }) > FAIR.tickets);

  let late = buyCard(f, { ...newRound(), step: 21 }, i).round;
  assert.equal(sellCard(f, { ...late, step: 26 }, i).ok, false, 'no buyers in the crash');
  late = { ...late, step: FAIR.steps };
  assert.ok(roundValue(f, late) < FAIR.tickets);
  const s = summary(f, late);
  assert.equal(s.late, 1);
  assert.equal(s.heldThroughCrash, 1);
  assert.equal(buyCard(f, late, hypedIds(f)[1]).ok, false, 'the fair is over');
});

test('prices start to climb right after the hype news', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const f = makeFair(seed);
    assert.ok(hypeIndex(f, 5) > hypeIndex(f, 3) * 1.1, `${seed}: ${hypeIndex(f, 3)} then ${hypeIndex(f, 5)}`);
  }
});

test('the summary tells buys in the crash and after it apart from buys near the top', () => {
  const f = makeFair('z');
  const [a, b, c] = hypedIds(f);
  const play = (moves) => {
    let r = newRound();
    for (const [step, side, i] of moves) {
      const next = (side === 'buy' ? buyCard : sellCard)(f, { ...r, step }, i);
      assert.ok(next.ok, `${side} ${i} at step ${step}`);
      r = next.round;
    }
    return summary(f, { ...r, step: FAIR.steps });
  };
  const s = play([[6, 'buy', a], [26, 'buy', c]]);
  assert.deepEqual([s.early, s.late, s.crash, s.after, s.heldThroughCrash], [1, 0, 1, 0, 1], 'the crash buy was not held when the buyers vanished');
  const top = play([[20, 'buy', b]]);
  assert.deepEqual([top.late, top.heldThroughCrash], [1, 1]);
  const after = play([[33, 'buy', a]]);
  assert.deepEqual([after.late, after.crash, after.after, after.heldThroughCrash], [0, 0, 1, 0]);
  const sold = play([[6, 'buy', a], [23, 'sell', a]]);
  assert.deepEqual([sold.early, sold.heldThroughCrash], [1, 0], 'sold before the buyers vanished');
});
