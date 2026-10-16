// Unit checks for the Future You projection. Run: node public/assets/js/sim/future.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMix, percentile, project, toReal } from './future.js';

const DATA = JSON.parse(readFileSync(new URL('../../../data/future_th.json', import.meta.url), 'utf8'));
const data = () => structuredClone(DATA);
const base = { age: 30, goalAge: 40, monthlySaving: 5000, startBalance: 0, mix: DATA.mixes.balanced, inflation: 'target', fx: 'base' };

test('the seeded Monte Carlo is deterministic and runs at least 500 paths', () => {
  const a = project(data(), base);
  const b = project(data(), base);
  assert.deepEqual(a, b);
  assert.equal(a.paths, 500);
  assert.equal(project(data(), { ...base, paths: 10 }).paths, 500, 'never fewer than 500 paths');
  assert.notDeepEqual(project(data(), { ...base, seed: 1 }).goal, project(data(), { ...base, seed: 2 }).goal);
  assert.equal(a.years.length, 11);
  for (const y of a.years) assert.ok(y.p10 <= y.p50 && y.p50 <= y.p90, `ordered at ${y.age}`);
});

test('real terms: today’s baht, exactly, in a world with no randomness', () => {
  assert.ok(Math.abs(toReal(1000, 0.02, 12) - 1000 / 1.02) < 1e-9);
  const d = data();
  for (const k of ['cash', 'bonds', 'thaiStocks', 'globalStocks']) Object.assign(d.assets[k], { mean: 0, vol: 0 });
  d.inflation.monthlyNoise.annual = 0;
  d.fx.base.vol = 0;
  const r = project(d, { ...base, age: 30, goalAge: 31, monthlySaving: 1000, inflation: 'target' });
  // Saving 1,000 of today's baht each month while prices rise 2% a year and money earns nothing:
  // month m's deposit is worth (1+i)^(m-12) in today's baht at the end of the year.
  const i = Math.pow(1.02, 1 / 12) - 1;
  let expected = 0;
  for (let m = 1; m <= 12; m++) expected += 1000 * Math.pow(1 + i, m - 12);
  assert.ok(Math.abs(r.goal.p50 - expected) < 1e-6, `${r.goal.p50} vs ${expected}`);
  assert.ok(r.goal.p10 === r.goal.p90, 'no randomness, no spread');
});

test('new money follows the mix and the plan is rebalanced once a year', () => {
  const d = data();
  for (const k of ['cash', 'bonds', 'thaiStocks', 'globalStocks']) Object.assign(d.assets[k], { mean: 0, vol: 0 });
  d.assets.thaiStocks.mean = 0.1;
  d.inflation.target.annual = 0;
  d.inflation.monthlyNoise.annual = 0;
  d.fx.base.vol = 0;
  // Half cash (0%), half Thai stocks (10% a year): rebalanced, each year grows 5%, so two years give 1.05².
  // Without the rebalance, the stocks would take over: 0.5 + 0.5 × 1.1² = 1.105.
  const r = project(d, { ...base, goalAge: 32, monthlySaving: 0, startBalance: 100000, mix: { cash: 0.5, thaiStocks: 0.5 } });
  assert.ok(Math.abs(r.goal.p50 - 100000 * 1.05 * 1.05) < 1e-6, `${r.goal.p50}`);
  // Careful really is careful: its range is much narrower than Bold's on the Explorer default plan.
  const plan = { ...base, age: 10, goalAge: 60, monthlySaving: 1000 };
  const spread = (mix) => {
    const g = project(data(), { ...plan, mix: DATA.mixes[mix] }).goal;
    return g.p90 / g.p50;
  };
  assert.ok(spread('careful') < 0.7 * spread('bold'), `${spread('careful')} vs ${spread('bold')}`);
  assert.ok(spread('careful') < spread('balanced') && spread('balanced') < spread('bold'));
});

test('every plan runs on the same market paths, so only the inputs move the result', () => {
  const plan = { ...base, age: 14, goalAge: 60, monthlySaving: 1000 };
  const goal = (extra) => project(data(), { ...plan, ...extra }).goal;
  // Spending after the goal, and how long it runs, never change the values at the goal.
  assert.deepEqual(goal({ untilAge: 90, spending: { fromAge: 60, monthly: 15000 } }), goal({}));
  // A shock that starts after the plan ends changes nothing.
  assert.deepEqual(goal({ shock: '1997', shockInYears: 70 }), goal({}));
  // Saving more never lowers the result.
  const more = goal({ monthlySaving: 1100 });
  const less = goal({});
  for (const k of ['p10', 'p50', 'p90']) assert.ok(more[k] > less[k], k);
  // Spending is capped like saving.
  const huge = project(data(), { ...plan, untilAge: 80, spending: { fromAge: 60, monthly: 99999999 } });
  const capped = project(data(), { ...plan, untilAge: 80, spending: { fromAge: 60, monthly: DATA.inputs.maxMonthlySaving } });
  assert.deepEqual(huge.years, capped.years);
});

test('scenarios move the result the right way', () => {
  const p50 = (plan) => project(data(), { ...base, goalAge: 50, startBalance: 100000, ...plan }).goal.p50;
  assert.ok(p50({ inflation: 'high' }) < p50({ inflation: 'low' }), 'high inflation shrinks real value');
  const global = { globalStocks: 1 };
  assert.ok(p50({ mix: global, fx: 'weakBaht' }) > p50({ mix: global, fx: 'base' }), 'a weak baht lifts US-dollar assets in baht');
  const thai = { thaiStocks: 1 };
  assert.ok(p50({ mix: thai, shock: '1997', shockInYears: 1 }) < p50({ mix: thai }), 'a 1997-style year hurts Thai stocks');
  assert.ok(p50({ mix: { cash: 1 } }) < p50({ mix: thai }), 'stocks grow more on average than cash');
});

test('spending after the goal: how often the money lasts', () => {
  const plan = { ...base, age: 40, goalAge: 60, untilAge: 90, monthlySaving: 10000, startBalance: 500000 };
  const light = project(data(), { ...plan, spending: { fromAge: 60, monthly: 5000 } });
  const heavy = project(data(), { ...plan, spending: { fromAge: 60, monthly: 60000 } });
  assert.ok(light.lastsShare > heavy.lastsShare, `${light.lastsShare} > ${heavy.lastsShare}`);
  assert.ok(light.lastsShare >= 0 && light.lastsShare <= 1);
  assert.equal(project(data(), plan).lastsShare, null);
  assert.equal(light.years.at(-1).age, 90);
});

test('inputs are clamped and mixes normalised', () => {
  const r = project(data(), { ...base, age: 3, goalAge: 500, monthlySaving: -10 });
  assert.equal(r.age, DATA.inputs.minAge);
  assert.equal(r.goalAge, DATA.inputs.maxAge);
  assert.deepEqual(normalizeMix({ cash: 2, bonds: 2 }), { cash: 0.5, bonds: 0.5, thaiStocks: 0, globalStocks: 0 });
  assert.deepEqual(normalizeMix({}), { cash: 1, bonds: 0, thaiStocks: 0, globalStocks: 0 });
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
});

test('every constant in future_th.json says where it comes from and when', () => {
  const missing = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    const isConstant = ['value', 'annual', 'mean', 'annualDrift', 'thaiStocks'].some((k) => typeof node[k] === 'number') && !path.startsWith('mixes');
    if (isConstant && !(node.source && node.retrieved)) missing.push(path);
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(DATA, '');
  assert.deepEqual(missing, []);
  assert.ok(DATA.mixes.source);
  assert.equal(DATA.label, 'Projection, not prediction');
  assert.equal(DATA.lifeExpectancy.female.value, 80.1);
  assert.equal(DATA.lifeExpectancy.male.value, 72.0);
});
