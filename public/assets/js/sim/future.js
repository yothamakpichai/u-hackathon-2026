// Future You (BRIEF §16; slice J10). A monthly, seeded Monte Carlo projection in today's baht.
// Pure: no DOM. Every constant comes from public/data/future_th.json (`data` below).
//
// Each path tracks a nominal portfolio, a price index and the THB/USD rate. Contributions are made in
// today's baht and rise with prices, so their real value stays the same. Results are shown in real
// terms: nominal value divided by the price index. Always a projection, never a prediction.

import { hashString, mulberry32 } from './prng.js';

const ASSETS = ['cash', 'bonds', 'thaiStocks', 'globalStocks'];

// Standard normal draws (Box–Muller) from a seeded uniform source.
function normals(rng) {
  let spare = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = rng();
    const v = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

// Monthly log-return parameters for an annual arithmetic mean and volatility.
function monthly(mean, vol) {
  const sigma = vol / Math.sqrt(12);
  return { mu: Math.log(1 + mean) / 12 - (sigma * sigma) / 2, sigma };
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Today's-baht value of a nominal amount after `months`, at a steady annual inflation rate.
export const toReal = (nominal, annualInflation, months) => nominal / Math.pow(1 + annualInflation, months / 12);

export function normalizeMix(mix) {
  const m = Object.fromEntries(ASSETS.map((k) => [k, Math.max(0, Number(mix?.[k]) || 0)]));
  const total = ASSETS.reduce((s, k) => s + m[k], 0);
  if (!(total > 0)) return { cash: 1, bonds: 0, thaiStocks: 0, globalStocks: 0 };
  for (const k of ASSETS) m[k] /= total;
  return m;
}

/**
 * Run the projection.
 * plan: { age, goalAge, monthlySaving, startBalance, mix, inflation: 'low'|'target'|'high',
 *         fx: 'base'|'weakBaht', shock: null|'1997'|'2020'|'2022', shockInYears,
 *         spending: { fromAge, monthly } | null, untilAge, paths, seed }
 * Returns yearly P10/P50/P90 in today's baht from `age` to `untilAge` (or goalAge), the values at
 * goalAge, and, with spending, the share of paths that still have money at `untilAge`.
 */
export function project(data, plan) {
  const age = clampInt(plan.age, data.inputs.minAge, data.inputs.maxAge - 1);
  const goalAge = clampInt(plan.goalAge, age + 1, data.inputs.maxAge);
  const untilAge = clampInt(plan.untilAge ?? goalAge, goalAge, data.inputs.maxAge);
  const months = (untilAge - age) * 12;
  const goalMonth = (goalAge - age) * 12;
  const paths = Math.max(data.simulation.paths, Math.floor(plan.paths || 0));
  const saving = Math.min(Math.max(0, Number(plan.monthlySaving) || 0), data.inputs.maxMonthlySaving);
  const start = Math.min(Math.max(0, Number(plan.startBalance) || 0), data.inputs.maxStartBalance);
  const mix = normalizeMix(plan.mix || data.mixes.balanced);
  const infl = data.inflation[plan.inflation] || data.inflation.target;
  const fxScenario = data.fx[plan.fx] || data.fx.base;
  const shock = plan.shock && data.shocks[plan.shock] ? data.shocks[plan.shock] : null;
  const shockFrom = shock ? Math.max(0, Math.round((plan.shockInYears ?? 1) * 12)) : -1;
  const spend = plan.spending && plan.spending.monthly > 0 ? plan.spending : null;
  const spendFrom = spend ? Math.max(0, (clampInt(spend.fromAge, age, data.inputs.maxAge) - age) * 12) : Infinity;
  const seed = plan.seed ?? hashString(JSON.stringify({ age, goalAge, untilAge, saving, start, mix, i: plan.inflation, f: plan.fx, s: plan.shock, sp: spend }));

  const params = Object.fromEntries(ASSETS.map((k) => [k, monthly(data.assets[k].mean, data.assets[k].vol)]));
  const rho = data.assets.stockCorrelation.value;
  const fxp = monthly(fxScenario.annualDrift, fxScenario.vol);
  const inflMonthly = Math.pow(1 + infl.annual, 1 / 12) - 1;
  const inflNoise = data.inflation.monthlyNoise.annual / Math.sqrt(12);

  const years = untilAge - age;
  const yearly = Array.from({ length: years + 1 }, () => new Float64Array(paths));
  const atGoal = new Float64Array(paths);
  let survived = 0;

  for (let p = 0; p < paths; p++) {
    const z = normals(mulberry32(hashString(`${seed}:${p}`)));
    const hold = Object.fromEntries(ASSETS.map((k) => [k, start * mix[k]]));
    let index = 1; // price level
    let fx = 1; // THB per USD, relative to today
    let broke = false;
    yearly[0][p] = start;
    for (let m = 1; m <= months; m++) {
      const inShock = shock && m > shockFrom && m <= shockFrom + 12;
      // Prices, then the baht, then each asset.
      const pi = inShock ? Math.pow(1 + shock.inflation, 1 / 12) - 1 : inflMonthly + inflNoise * z();
      index *= 1 + pi;
      const fxMove = inShock ? Math.pow(1 + shock.fx, 1 / 12) : Math.exp(fxp.mu + fxp.sigma * z());
      fx *= fxMove;
      const common = z();
      for (const k of ASSETS) {
        let r;
        if (inShock && (k === 'thaiStocks' || k === 'globalStocks')) r = Math.pow(1 + shock[k], 1 / 12) - 1;
        else {
          const e = k === 'thaiStocks' || k === 'globalStocks' ? Math.sqrt(rho) * common + Math.sqrt(1 - rho) * z() : z();
          r = Math.exp(params[k].mu + params[k].sigma * e) - 1;
        }
        // Global stocks are held in US dollars: their baht value also moves with the exchange rate.
        hold[k] *= 1 + r;
        if (k === 'globalStocks') hold[k] *= fxMove;
      }
      // Saving until the goal (in today's baht, so it rises with prices), spending after.
      let total = ASSETS.reduce((s, k) => s + hold[k], 0);
      let flow = 0;
      if (m <= goalMonth) flow += saving * index;
      if (m > spendFrom) flow -= spend.monthly * index;
      if (flow !== 0) {
        const after = Math.max(0, total + flow);
        if (total + flow <= 0) broke = true;
        for (const k of ASSETS) hold[k] = total > 0 ? (hold[k] / total) * after : after * mix[k];
        total = after;
      }
      if (m % 12 === 0) yearly[m / 12][p] = total / index;
      if (m === goalMonth) atGoal[p] = total / index;
    }
    if (!broke) survived++;
  }

  const band = (arr) => {
    const s = Array.from(arr).sort((a, b) => a - b);
    return { p10: percentile(s, 0.1), p50: percentile(s, 0.5), p90: percentile(s, 0.9) };
  };
  return {
    label: data.label,
    seed,
    paths,
    age,
    goalAge,
    untilAge,
    mix,
    years: yearly.map((arr, i) => ({ age: age + i, ...band(arr) })),
    goal: band(atGoal),
    contributed: saving * goalMonth + start,
    lastsShare: spend ? survived / paths : null,
  };
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
