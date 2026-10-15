// Unit checks for chart indicators and run metrics. Run: node public/assets/js/sim/indicators.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rsi, sma } from './indicators.js';
import { runMetrics } from './metrics.js';
import { createSession } from './session.js';
import { dailySeed } from './prng.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../../data/${f}`, import.meta.url), 'utf8'));
const CONFIG = { coinsConfig: load('coins.json'), agentsConfig: load('agents.json'), scenario: load('scenario.json') };

test('SMA is the mean of the last n values', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.deepEqual(sma([5, 5, 5], 1), [5, 5, 5]);
  assert.deepEqual(sma([1, 2], 7), [null, null]);
});

test('RSI follows Wilder and stays between 0 and 100', () => {
  const up = Array.from({ length: 30 }, (_, i) => 10 + i);
  const down = up.slice().reverse();
  assert.equal(rsi(up, 14)[29], 100, 'only gains');
  assert.equal(rsi(down, 14)[29], 0, 'only losses');
  assert.equal(rsi(new Array(20).fill(3), 14)[19], 50, 'flat');
  assert.deepEqual(rsi(up, 14).slice(0, 14), new Array(14).fill(null));
  const zigzag = Array.from({ length: 40 }, (_, i) => (i % 2 ? 11 : 10));
  assert.ok(Math.abs(rsi(zigzag, 14)[39] - 50) < 5, 'balanced moves stay near 50');
  // Hand-checked: 14 changes of +1 then one of -2 → avg gain 13/14, avg loss 2/14 → 100 - 100/(1 + 6.5).
  const series = [...Array.from({ length: 15 }, (_, i) => i), 12];
  assert.ok(Math.abs(rsi(series, 14)[15] - (100 - 100 / (1 + 6.5))) < 1e-9);
});

test('run metrics have exactly the §14 shape and the right values', () => {
  const s = createSession({ seed: dailySeed(new Date('2026-10-16T05:00:00Z')), tier: 'builder', ...structuredClone(CONFIG) });
  s.swap('BLOOP', 'buy', 100);
  for (let i = 0; i < 400; i++) s.tick();
  s.createCoin({ name: 'Metric Coin', ticker: 'MTRC', iconId: 1, colorId: 1, supply: 1e6, lpLocked: true });
  s.swap('VAULT', 'buy', 500);
  for (let i = 0; i < 1001; i++) s.tick(); // to tick 1401: the whale_dump has fired
  s.swap('VAULT', 'sell', s.getState().portfolio.holdings.VAULT); // panic: sold everything within 10 s
  for (let i = 0; i < 400; i++) s.tick(); // past the rug
  s.finish();
  const m = runMetrics(s.getState(), [{ id: 'hype_wave', correct: true }, { id: 'halving', correct: false }]);
  assert.deepEqual(Object.keys(m), ['maxSingleExposurePct', 'minCashPct', 'panicSellsAfterNegativeEvents', 'heldBloopAtRug', 'coinLaunched', 'quizCorrect', 'quizTotal', 'finalValue']);
  assert.equal(m.panicSellsAfterNegativeEvents, 1);
  assert.equal(m.heldBloopAtRug, true);
  assert.equal(m.coinLaunched.lpLocked, true);
  assert.ok(['graduated', 'rose', 'fell'].includes(m.coinLaunched.outcome));
  assert.equal(m.quizCorrect, 1);
  assert.equal(m.quizTotal, 2);
  assert.ok(m.maxSingleExposurePct >= 40 && m.maxSingleExposurePct <= 100, `exposure ${m.maxSingleExposurePct}`);
  assert.ok(m.minCashPct >= 0 && m.minCashPct <= 60, `cash ${m.minCashPct}`);
  assert.ok(m.finalValue > 0);

  const quiet = createSession({ seed: 3, tier: 'explorer', ...structuredClone(CONFIG) });
  quiet.finish();
  assert.deepEqual(runMetrics(quiet.getState()), {
    maxSingleExposurePct: 0, minCashPct: 100, panicSellsAfterNegativeEvents: 0, heldBloopAtRug: false,
    coinLaunched: null, quizCorrect: 0, quizTotal: 0, finalValue: 1000,
  });
});
