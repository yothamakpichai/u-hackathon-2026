// Unit checks for the AMM and the bonding curve. Run: node public/assets/js/sim/amm.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buy, createPool, graduate, poolPrice, realL, removeLiquidity, sell, tradeToPrice } from './amm.js';
import { mulberry32 } from './prng.js';

const close = (a, b, rel = 1e-9, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), msg ?? `${a} ≉ ${b}`);

test('AMM invariant holds after swaps', () => {
  const p = createPool({ reserveL: 100000, reserveCoins: 50000, fee: 0.003 });
  const rnd = mulberry32(42);
  for (let i = 0; i < 5000; i++) {
    const { x: x0, y: y0 } = p;
    const k0 = x0 * y0;
    if (rnd() < 0.5) {
      const L = 0.01 + rnd() * 20000;
      const out = buy(p, L);
      assert.ok(out > 0 && out < y0, 'a buy pays out some, never all, of the coins');
      close((x0 + L * (1 - p.fee)) * (y0 - out), k0, 1e-9, 'x · y = k on the fee-adjusted input');
    } else {
      const q = 0.01 + rnd() * 10000;
      const out = sell(p, q);
      assert.ok(out > 0 && out < x0, 'a sell pays out some, never all, of the L$');
      close((x0 - out) * (y0 + q * (1 - p.fee)), k0, 1e-9, 'x · y = k on the fee-adjusted input');
    }
    assert.ok(p.x * p.y >= k0 * (1 - 1e-12), 'the fee stays in the pool, so k never falls');
    assert.ok(p.x > 0 && p.y > 0);
  }
});

test('a round trip costs the fee, and bigger trades move the price more', () => {
  const p = createPool({ reserveL: 50000, reserveCoins: 50000, fee: 0.003 });
  const back = sell(p, buy(p, 1000));
  assert.ok(back < 1000 && back > 1000 * 0.99, `got back ${back}`);

  const impact = (L) => {
    const q = createPool({ reserveL: 50000, reserveCoins: 50000, fee: 0.003 });
    const before = poolPrice(q);
    buy(q, L);
    return poolPrice(q) / before - 1;
  };
  assert.ok(impact(100) > 0);
  assert.ok(impact(5000) > 10 * impact(100), 'slippage grows faster than trade size');
});

test('tradeToPrice lands near the target', () => {
  for (const target of [0.9, 0.96, 1.04, 1.2]) {
    const p = createPool({ reserveL: 1e6, reserveCoins: 1e6, fee: 0.003 });
    const { side, amount } = tradeToPrice(p, target);
    if (side === 'buy') buy(p, amount);
    else sell(p, amount);
    close(poolPrice(p), target, 0.004, `target ${target}, got ${poolPrice(p)}`);
  }
});

test('bonding curve graduates to an AMM pool at the same price and burns the spare coins', () => {
  const p = createPool({ reserveL: 0, reserveCoins: 1e7, fee: 0.003, virtualL: 25000 });
  const startPrice = poolPrice(p);
  buy(p, 60000);
  assert.ok(poolPrice(p) > 4 * startPrice, 'buying up the curve raises the price');
  const before = { price: poolPrice(p), real: realL(p), y: p.y };
  const leftover = graduate(p);
  close(poolPrice(p), before.price, 1e-12, 'price is continuous');
  close(p.x, before.real, 1e-12, 'only real L$ moves into the pool');
  assert.equal(p.virtualL, 0);
  assert.ok(leftover > 0 && leftover < before.y);
  close(p.y + leftover, before.y, 1e-12);
});

test('a curve never pays out more L$ than it really holds', () => {
  const p = createPool({ reserveL: 0, reserveCoins: 1e6, fee: 0.003, virtualL: 3000 });
  buy(p, 500);
  const out = sell(p, 5e5); // far more coins than were ever sold
  assert.ok(out <= 500 + 1e-9, `paid ${out}`);
  assert.ok(realL(p) >= -1e-9);
});

test('removing liquidity keeps the price but drains the depth', () => {
  const p = createPool({ reserveL: 20000, reserveCoins: 400000, fee: 0.003 });
  const price = poolPrice(p);
  const got = removeLiquidity(p, 0.99);
  close(poolPrice(p), price, 1e-12);
  close(got.L, 19800, 1e-12);
  close(p.x, 200, 1e-9);
});
