// Unit checks for the Orchard and the Town wallet. Run: node public/assets/js/sim/orchard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLOTS, SEEDS, canPlant, harvest, perDay, plant, plotState, revealedPreference } from './orchard.js';
import { CREDIT, STARTER_GRANT, adjustCredit, balance, creditScore, ensureStarter, ledger, post, rateFor } from '../../../js/wallet.js';

const memStore = (init = {}) => {
  let state = init;
  return { get: () => state, set: (patch) => (state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }) };
};
const T0 = Date.parse('2026-10-16T05:00:00Z');
const MIN = 60_000;
const DAY = 86_400_000;

test('the menu trades waiting for yield', () => {
  assert.ok(SEEDS.sprout.grow < SEEDS.fruit.grow && SEEDS.fruit.grow < SEEDS.big.grow);
  assert.ok(SEEDS.sprout.harvest - SEEDS.sprout.cost < SEEDS.fruit.harvest - SEEDS.fruit.cost, 'waiting a day earns more per planting');
  assert.ok(SEEDS.big.harvest > SEEDS.fruit.harvest && SEEDS.big.refruit > 0, 'the big tree yields most and keeps fruiting');
});

test('plants grow in real time, are harvested, and the big tree fruits again', () => {
  let o = { plots: Array(PLOTS).fill(null) };
  o = plant(o, 0, 'sprout', T0);
  o = plant(o, 1, 'big', T0);
  assert.equal(plotState(o.plots[0], T0 + 10_000).stage, 'seed');
  assert.equal(plotState(o.plots[0], T0 + MIN).stage, 'sprout');
  assert.equal(plotState(o.plots[0], T0 + 2 * MIN).stage, 'ready');
  assert.equal(harvest(o, 0, T0 + MIN).coins, 0, 'not before it is ready');
  const r = harvest(o, 0, T0 + 2 * MIN);
  assert.equal(r.coins, SEEDS.sprout.harvest);
  assert.equal(r.orchard.plots[0], null, 'the plot is free to replant');
  assert.equal(harvest(r.orchard, 0, T0 + 3 * MIN).coins, 0, 'nothing to harvest in an empty plot');
  const big = harvest(r.orchard, 1, T0 + 7 * DAY);
  assert.equal(big.coins, SEEDS.big.harvest);
  assert.equal(plotState(big.orchard.plots[1], T0 + 7 * DAY + DAY / 2).stage, 'grown');
  assert.equal(harvest(big.orchard, 1, T0 + 8 * DAY).coins, SEEDS.big.refruitHarvest, 'fruit again a day later');
});

test('choices reveal a time preference', () => {
  let o = {};
  for (const [i, s] of ['big', 'big', 'fruit', 'sprout'].entries()) o = plant(o, i, s, T0);
  assert.deepEqual(revealedPreference(o.choices), { count: 4, laterShare: 0.5, nowShare: 0.25, lean: 'Later' });
  assert.equal(revealedPreference([]), null);
});

test('per day of waiting the patient choice pays most, and sprouts are no coin loop', () => {
  assert.ok(perDay('big') > perDay('fruit') && perDay('fruit') > perDay('sprout'), `${perDay('big')} ${perDay('fruit')} ${perDay('sprout')}`);
  // A fruit tree replanted every day against one big mango tree, coins ahead after n days.
  const fruitBy = (n) => n * (SEEDS.fruit.harvest - SEEDS.fruit.cost);
  const bigBy = (n) => (n < 7 ? -SEEDS.big.cost : SEEDS.big.harvest - SEEDS.big.cost + (n - 7) * SEEDS.big.refruitHarvest);
  assert.ok(bigBy(7) > fruitBy(7) && bigBy(14) > fruitBy(14), 'the big tree leads from day 7');
  // A herb sprout grows once a day in each plot: no replanting all day for coins.
  let o = plant({ plots: Array(PLOTS).fill(null) }, 0, 'sprout', T0);
  assert.equal(canPlant(o, 0, 'fruit', T0).ok, false, 'the plot is busy');
  assert.equal(plant(o, 0, 'fruit', T0), o, 'plant() keeps the same rules');
  o = harvest(o, 0, T0 + 2 * MIN).orchard;
  assert.equal(canPlant(o, 0, 'sprout', T0 + 2 * MIN).ok, false, 'one sprout a day in this plot');
  assert.equal(plant(o, 0, 'sprout', T0 + 2 * MIN), o, 'nothing planted, no choice recorded');
  assert.equal(canPlant(o, 0, 'fruit', T0 + 2 * MIN).ok, true, 'other seeds can go in');
  assert.equal(canPlant(o, 1, 'sprout', T0 + 2 * MIN).ok, true, 'other plots can grow a sprout');
  assert.equal(canPlant(o, 0, 'sprout', T0 + DAY).ok, true, 'again tomorrow');
});

test('the wallet is an append-only ledger with a credit score', () => {
  const store = memStore();
  assert.equal(ensureStarter(store, T0), true);
  assert.equal(ensureStarter(store, T0), false, 'the starter grant comes once');
  assert.equal(balance(store.get()), STARTER_GRANT);
  assert.equal(post(store, { amount: -(STARTER_GRANT + 10), kind: 'seed' }, T0).ok, false, 'cannot go below zero');
  assert.ok(post(store, { amount: -20, kind: 'seed' }, T0).ok);
  assert.ok(post(store, { amount: 6, kind: 'harvest' }, T0).ok);
  assert.equal(balance(store.get()), STARTER_GRANT - 20 + 6);
  const before = ledger(store.get());
  post(store, { amount: 1, kind: 'grant' }, T0);
  assert.deepEqual(ledger(store.get()).slice(0, before.length), before, 'earlier entries never change');
  assert.equal(creditScore(store.get()), CREDIT.start);
  assert.equal(adjustCredit(store, 1000, 'on time'), CREDIT.max);
  assert.equal(adjustCredit(store, -9999, 'late'), CREDIT.min);
  assert.ok(rateFor(CREDIT.max, 0.1) < rateFor(CREDIT.start, 0.1) && rateFor(CREDIT.start, 0.1) < rateFor(CREDIT.min, 0.1));
});
