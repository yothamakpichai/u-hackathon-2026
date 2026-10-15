// Money Health Score checks (BRIEF §6): a happy path, a do-nothing path and a panic-plus-rug path. Run by bin/check.mjs.
import assert from 'node:assert/strict';
import { learned, scoreRun } from './score.js';

const base = {
  value: 1000,
  startValue: 1000,
  risk: { ticks: 2400, overExposedTicks: 0, lowSafeTicks: 0 },
  history: [{ t: 0, value: 1000, maxShare: 0.3, safeShare: 0.5 }],
  trades: [],
  events: [],
  quiz: [],
};
const buy = { t: 10, coinId: 'VAULT', side: 'buy', holdingBefore: 0, holdingAfter: 2 };
const points = (s) => Object.fromEntries(s.parts.map((p) => [p.id, p.points]));

// Balanced, calm, every answer right and +50%: a perfect 100.
{
  const run = { ...base, value: 1500, trades: [buy], events: [{ id: 'whale_dump', coinId: 'VAULT', t: 1400, negative: true, playerCoins: 2, playerValue: 240 }], quiz: [{ id: 'whale_dump', correct: true }] };
  const s = scoreRun({ run, check: { score: 3, total: 3, passed: true, skipped: false }, tier: 'explorer' });
  assert.equal(s.total, 100);
  assert.deepEqual(learned({ run, tier: 'explorer' })[0], 'One big sale can drop a price even when nothing about the coin changed.');
  assert.equal(learned({ run, tier: 'explorer' }).length, 3);
}

// Skipped check and never traded: no knowledge, risk, composure or returns points.
{
  const s = scoreRun({ run: base, check: { score: 0, total: 3, passed: false, skipped: true }, tier: 'trader' });
  assert.deepEqual(points(s), { knowledge: 0, risk: 0, scams: 20, composure: 0, returns: 0 });
  assert.equal(s.total, 20);
}

// Sold all VAULT 2 s after the whale sale, and held L$100 of BLOOP (10%) at the rug pull.
{
  const run = {
    ...base,
    value: 800,
    trades: [buy, { t: 1420, coinId: 'VAULT', side: 'sell', holdingBefore: 2, holdingAfter: 0 }],
    events: [
      { id: 'whale_dump', coinId: 'VAULT', t: 1400, negative: true, playerCoins: 2, playerValue: 240 },
      { id: 'rug_pull', coinId: 'BLOOP', t: 1750, negative: true, playerCoins: 2000, playerValue: 100 },
    ],
    history: [{ t: 1740, value: 1000, maxShare: 0.3, safeShare: 0.5 }],
  };
  const s = scoreRun({ run, check: { score: 2, total: 3, passed: true, skipped: false }, tier: 'builder' });
  assert.deepEqual(points(s), { knowledge: 20, risk: 25, scams: 10, composure: 10, returns: 0 });
  assert.match(s.parts[3].reason, /VAULT 2 seconds after/);
  assert.equal(learned({ run, tier: 'builder' })[0], 'An unlocked pool and one creator holding most coins are rug pull red flags.');
}

console.log('score: ok');
