// NPC trader archetypes (BRIEF §5). Each agent reads exactly two uniform numbers (u1, u2)
// per tick, whatever it decides, so the player's trades never shift the market's random stream.
// `m` is the market interface the session hands in: price, ret, ma, buy, sell, arb.

import { tradeToPrice } from './amm.js';

export const between = (u, [lo, hi]) => lo + u * (hi - lo);
const logUniform = (u, [lo, hi]) => lo * Math.pow(hi / lo, u);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const STEPS = {
  // Many small random trades with a slight momentum bias.
  retail(a, c, m, u1, u2) {
    const p = a.p;
    if (u1 >= p.tradeProb) return;
    const trend = Math.sign(m.ret(c, p.lookback));
    const pBuy = clamp(0.5 + p.buyBias + p.momentumBias * trend, 0.05, 0.95);
    if (u2 < pBuy) m.buy(a, c, logUniform(u2 / pBuy, p.sizeL));
    else m.sell(a, c, logUniform((u2 - pBuy) / (1 - pBuy), p.sizeL) / m.price(c));
  },

  // Buys what is rising and sells what is falling over a lookback window.
  momentum(a, c, m, u1, u2) {
    const p = a.p;
    if (u1 >= p.actProb) return;
    const r = m.ret(c, p.lookback);
    if (r > p.threshold) m.buy(a, c, logUniform(u2, p.sizeL));
    else if (r < -p.threshold) m.sell(a, c, logUniform(u2, p.sizeL) / m.price(c));
  },

  // Buys below the moving average and sells above it, harder the further away it is.
  value(a, c, m, u1, u2) {
    const p = a.p;
    if (u1 >= p.actProb) return;
    const dev = m.price(c) / m.ma(c, p.window) - 1;
    const strength = Math.min(3, Math.abs(dev) / p.band);
    if (dev < -p.band) m.buy(a, c, logUniform(u2, p.sizeL) * strength);
    else if (dev > p.band) m.sell(a, c, (logUniform(u2, p.sizeL) * strength) / m.price(c));
  },

  // Rare, very large orders. The scripted dump is loaded by the whale_dump event.
  whale(a, c, m, u1, u2) {
    if (a.dump > 0) {
      const q = Math.min(a.dump, a.dumpChunk);
      a.dump -= q;
      m.sell(a, c, q);
      return;
    }
    const p = a.p;
    if (u1 >= p.tradeProb) return;
    if (u2 < 0.5) m.buy(a, c, logUniform(u2 * 2, p.sizeL));
    else m.sell(a, c, logUniform((u2 - 0.5) * 2, p.sizeL) / m.price(c));
  },

  // Sells after negative events while fear is high, then slowly buys back once it fades.
  panic(a, c, m, u1, u2) {
    const p = a.p;
    if (c.fear > 0.02) {
      if (u1 < p.actProb * c.fear) m.sell(a, c, a.coins * between(u2, p.sellFrac));
    } else if (u1 < p.reentryProb) {
      m.buy(a, c, logUniform(u2, p.sizeL));
    }
  },

  // Holds vesting allocations; sells part of each unlock, spread over time.
  insider(a, c, m) {
    if (!(a.toSell > 0) || !(a.coins > 0)) return;
    const price = m.price(c);
    const q = Math.min(a.toSell, a.coins, Math.max(a.toSell / a.p.sellTicks, a.p.minOrderL / price));
    a.toSell -= q;
    m.sell(a, c, q);
  },

  // Bursty buying while the coin's hype is high; takes profit once it fades.
  // `c.trust` scales interest in user-created coins (1 for the roster).
  hype(a, c, m, u1, u2) {
    const p = a.p;
    const h = c.hype * c.trust;
    if (h > p.exitHype) {
      if (u1 < p.actProb * h) m.buy(a, c, logUniform(u2, p.sizeL));
    } else if (a.coins > 0 && u1 < p.exitProb) {
      m.sell(a, c, a.coins * between(u2, p.exitFrac));
    }
  },

  // Defends PEG: buys below the peg and redeems at 1:1, mints at 1:1 and sells above it.
  arb(a, c, m) {
    const price = m.price(c);
    if (Math.abs(price / c.peg - 1) <= a.p.deadband) return;
    const { side, amount } = tradeToPrice(c.pool, c.peg);
    m.arb(c, side, amount * a.p.strength);
  },

  // BLOOP's creator. Holds the LP; the rug_pull event pulls it and loads the dump.
  rugger(a, c, m) {
    if (!(a.dump > 0)) return;
    const q = Math.min(a.dump, a.dumpChunk);
    a.dump -= q;
    m.sell(a, c, q);
  },

  // Wash-trading bot: trades the same coins straight back. Volume, no real demand.
  // It alternates which leg goes first so the fees it pays don't push the price one way.
  wash(a, c, m, u1, u2) {
    const p = a.p;
    if (u1 >= p.tradeProb) return;
    const L = logUniform(u2, p.sizeL);
    if (u1 < p.tradeProb / 2) {
      const got = m.buy(a, c, L, true);
      if (got > 0) m.sell(a, c, got, true);
    } else {
      const back = m.sell(a, c, L / m.price(c), true);
      if (back > 0) m.buy(a, c, back, true);
    }
  },
};
