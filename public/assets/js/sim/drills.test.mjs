// Unit checks for the Coach drills. Run: node public/assets/js/sim/drills.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copycatDrill, whaleDrill } from './drills.js';
import { dailySeed } from './prng.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../../data/${f}`, import.meta.url), 'utf8'));
const config = () => ({ coinsConfig: load('coins.json'), agentsConfig: load('agents.json'), scenario: load('scenario.json') });
const SEED = dailySeed(new Date('2026-10-16T05:00:00Z'));

test('the whale drill replays the same dump for both rounds', () => {
  const panic = whaleDrill({ ...config(), seed: SEED, tier: 'explorer' }, 'panic');
  const hold = whaleDrill({ ...config(), seed: SEED, tier: 'explorer' }, 'hold');
  assert.deepEqual(panic.prices.slice(0, 61), hold.prices.slice(0, 61), 'identical market up to the dump');
  assert.equal(panic.boughtCoins, hold.boughtCoins);
  const before = panic.prices.find((p) => p.t === panic.dumpAt).price;
  assert.ok(panic.sold && panic.sold.t === panic.dumpAt + 1, 'the panic seller sells right after the drop shows');
  assert.ok(panic.sold.price < before * 0.85, `sold into the dip (${before} → ${panic.sold.price})`);
  assert.equal(hold.sold, null);
  assert.ok(Number.isFinite(panic.finalValue) && Number.isFinite(hold.finalValue));
  assert.equal(panic.prices.at(-1).t, panic.to);
});

test('the copycat drill shows a look-alike appearing and being rugged', () => {
  const d = copycatDrill({ ...config(), seed: SEED });
  assert.equal(d.ticker, 'DEMO');
  assert.equal(d.copy.id, 'DEMOX');
  assert.match(d.copy.name, /Official/);
  assert.equal(d.copy.lpLocked, false);
  assert.ok(d.rugged);
  const peak = Math.max(...d.prices.filter((p) => p.t < d.rugAt).map((p) => p.price));
  assert.ok(d.prices.at(-1).price < peak * 0.1, 'the rug wipes out the price');
});
