// Future You (BRIEF §16; slice J10). A monthly, seeded Monte Carlo projection in today's baht.
// Pure: no DOM. Every constant comes from public/data/future_th.json (`data` below).
//
// Each path tracks a nominal portfolio, a price index and the THB/USD rate. Contributions are made in
// today's baht and rise with prices, so their real value stays the same. Results are shown in real
// terms: nominal value divided by the price index. Always a projection, never a prediction.
//
// New money goes in by the chosen mix and the portfolio is rebalanced to it once a year, so the mix
// on screen is the mix that gets projected. Every plan runs on the same seeded market paths (one
// fixed seed, the same draws every month, shock or not), so comparing two plans or scenarios shows
// the effect of the change, not of different dice.

import { hashString, mulberry32 } from './prng.js';

const ASSETS = ['cash', 'bonds', 'thaiStocks', 'globalStocks'];
const SEED = hashString('future-you');

// Standard normal draws (Marsaglia's polar method) from a seeded uniform source.
function normals(rng) {
  let spare = 0;
  let hasSpare = false;
  return () => {
    if (hasSpare) {
      hasSpare = false;
      return spare;
    }
    let u;
    let v;
    let s;
    do {
      u = 2 * rng() - 1;
      v = 2 * rng() - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const k = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * k;
    hasSpare = true;
    return u * k;
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
 * The draws up to the goal never depend on the plan, so the values at the goal don't change with
 * the spending or how long it lasts, and a shock that starts after the plan ends changes nothing.
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
  const spendMonthly = plan.spending && plan.spending.monthly > 0 ? Math.min(Number(plan.spending.monthly) || 0, data.inputs.maxMonthlySaving) : 0;
  const spendFrom = spendMonthly ? Math.max(0, (clampInt(plan.spending.fromAge, age, data.inputs.maxAge) - age) * 12) : Infinity;
  const seed = plan.seed ?? SEED;

  const [pc, pb, pt, pg] = ASSETS.map((k) => monthly(data.assets[k].mean, data.assets[k].vol));
  const rho = data.assets.stockCorrelation.value;
  const sr = Math.sqrt(rho);
  const sr1 = Math.sqrt(1 - rho);
  const fxp = monthly(fxScenario.annualDrift, fxScenario.vol);
  const inflMonthly = Math.pow(1 + infl.annual, 1 / 12) - 1;
  const inflNoise = data.inflation.monthlyNoise.annual / Math.sqrt(12);
  // A shock year, as monthly factors.
  const sPi = shock ? Math.pow(1 + shock.inflation, 1 / 12) - 1 : 0;
  const sFx = shock ? Math.pow(1 + shock.fx, 1 / 12) : 1;
  const sThai = shock ? Math.pow(1 + shock.thaiStocks, 1 / 12) : 1;
  const sGlobal = shock ? Math.pow(1 + shock.globalStocks, 1 / 12) : 1;
  const { cash: mc, bonds: mb, thaiStocks: mt, globalStocks: mg } = mix;

  const years = untilAge - age;
  const yearly = Array.from({ length: years + 1 }, () => new Float64Array(paths));
  const atGoal = new Float64Array(paths);
  let survived = 0;

  for (let p = 0; p < paths; p++) {
    const z = normals(mulberry32(hashString(`${seed}:${p}`)));
    let cash = start * mc;
    let bonds = start * mb;
    let thai = start * mt;
    let global = start * mg;
    let index = 1; // price level
    let broke = false;
    yearly[0][p] = start;
    for (let m = 1; m <= months; m++) {
      // The same seven draws every month, so a shock replaces numbers without shifting the paths.
      const zPi = z();
      const zFx = z();
      const common = z();
      const zCash = z();
      const zBonds = z();
      const zThai = z();
      const zGlobal = z();
      const inShock = shock && m > shockFrom && m <= shockFrom + 12;
      // Prices, then the baht, then each asset.
      index *= 1 + (inShock ? sPi : inflMonthly + inflNoise * zPi);
      const fxMove = inShock ? sFx : Math.exp(fxp.mu + fxp.sigma * zFx);
      cash *= Math.exp(pc.mu + pc.sigma * zCash);
      bonds *= Math.exp(pb.mu + pb.sigma * zBonds);
      thai *= inShock ? sThai : Math.exp(pt.mu + pt.sigma * (sr * common + sr1 * zThai));
      // Global stocks are held in US dollars: their baht value also moves with the exchange rate.
      global *= (inShock ? sGlobal : Math.exp(pg.mu + pg.sigma * (sr * common + sr1 * zGlobal))) * fxMove;
      // Saving until the goal (in today's baht, so it rises with prices) goes in by the mix;
      // spending after it comes out of every asset in proportion.
      let flow = 0;
      if (m <= goalMonth) flow += saving * index;
      if (m > spendFrom) flow -= spendMonthly * index;
      if (flow > 0) {
        cash += flow * mc;
        bonds += flow * mb;
        thai += flow * mt;
        global += flow * mg;
      } else if (flow < 0) {
        const total = cash + bonds + thai + global;
        if (total + flow <= 0) broke = true;
        const keep = total + flow > 0 ? (total + flow) / total : 0;
        cash *= keep;
        bonds *= keep;
        thai *= keep;
        global *= keep;
      }
      const total = cash + bonds + thai + global;
      if (m % 12 === 0) {
        // Rebalance to the chosen mix once a year.
        cash = total * mc;
        bonds = total * mb;
        thai = total * mt;
        global = total * mg;
        yearly[m / 12][p] = total / index;
      }
      if (m === goalMonth) atGoal[p] = total / index;
    }
    if (!broke) survived++;
  }

  const band = (arr) => {
    const s = arr.slice().sort();
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
    lastsShare: spendMonthly ? survived / paths : null,
  };
}

// Run as a module worker (screens/future.js): answer each { id, data, plans } with their projections.
if (typeof WorkerGlobalScope === 'function' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = ({ data: msg }) => globalThis.postMessage({ id: msg.id, results: msg.plans.map((plan) => project(msg.data, plan)) });
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
