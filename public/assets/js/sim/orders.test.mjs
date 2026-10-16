// Unit checks for limit and stop-loss orders. Run: node public/assets/js/sim/orders.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSession } from './session.js';
import { dailySeed } from './prng.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../../data/${f}`, import.meta.url), 'utf8'));
const CONFIG = { coinsConfig: load('coins.json'), agentsConfig: load('agents.json'), scenario: load('scenario.json') };
const SEED = dailySeed(new Date('2026-10-16T05:00:00Z'));
const DUMP = Math.round((CONFIG.scenario.events.find((e) => e.id === 'whale_dump').at * 1000) / CONFIG.scenario.tickMs);
const fresh = (tier = 'trader') => createSession({ seed: SEED, tier, ...structuredClone(CONFIG) });

function toDump(s, before = 10) {
  while (s.getState().t < DUMP - before) s.tick();
}

test('a stop-loss sells automatically when the whale dumps', () => {
  const s = fresh();
  s.swap('VAULT', 'buy', 500);
  toDump(s);
  const price = s.getState().coins.VAULT.price;
  const r = s.placeOrder({ coinId: 'VAULT', type: 'stop-loss', price: price * 0.92, amount: s.getState().portfolio.holdings.VAULT });
  assert.ok(r.ok);
  const fills = [];
  s.on('order', (o) => fills.push(o));
  for (let i = 0; i < 20; i++) s.tick();
  const o = s.getState().portfolio.orders[0];
  assert.equal(o.status, 'filled');
  assert.equal(fills.length, 1);
  assert.ok(o.fill.price < price * 0.92, 'in a fast drop it fills below the stop (slippage)');
  assert.equal(s.getState().portfolio.holdings.VAULT, undefined, 'all sold');
});

test('a limit buy below the market fills on the way down; a far limit sell waits', () => {
  const s = fresh();
  s.swap('VAULT', 'buy', 200);
  toDump(s);
  const price = s.getState().coins.VAULT.price;
  assert.ok(s.placeOrder({ coinId: 'VAULT', type: 'limit-buy', price: price * 0.9, amount: 100 }).ok);
  assert.ok(s.placeOrder({ coinId: 'VAULT', type: 'limit-sell', price: price * 2, amount: 0.5 }).ok);
  for (let i = 0; i < 40; i++) s.tick();
  const [buy, sell] = s.getState().portfolio.orders;
  assert.equal(buy.status, 'filled');
  assert.ok(buy.fill.L <= 100 && buy.fill.coins > 0);
  assert.equal(sell.status, 'open');
});

test('orders can be cancelled and are checked', () => {
  const s = fresh();
  s.swap('VAULT', 'buy', 300);
  toDump(s);
  const price = s.getState().coins.VAULT.price;
  const r = s.placeOrder({ coinId: 'VAULT', type: 'stop-loss', price: price * 0.95, amount: 1 });
  assert.ok(s.cancelOrder(r.id));
  assert.equal(s.cancelOrder(r.id), false, 'only open orders cancel');
  for (let i = 0; i < 20; i++) s.tick();
  assert.equal(s.getState().portfolio.orders[0].status, 'cancelled');
  const bad = (o) => s.placeOrder({ coinId: 'VAULT', ...o }).error?.code;
  assert.equal(bad({ type: 'limit-buy', price: price * 2, amount: 10 }), 'WOULD_FILL_NOW');
  assert.equal(bad({ type: 'stop-loss', price: price * 2, amount: 1 }), 'WOULD_FILL_NOW');
  assert.equal(bad({ type: 'limit-buy', price: -1, amount: 10 }), 'BAD_PRICE');
  assert.equal(bad({ type: 'take-profit', price: 1, amount: 1 }), 'BAD_TYPE');
  assert.equal(s.placeOrder({ coinId: 'BLOOP', type: 'limit-buy', price: 0.01, amount: 1 }).error.code, 'UNKNOWN_COIN');
});

test('open orders lapse when the market closes', () => {
  const s = fresh();
  s.swap('VAULT', 'buy', 300);
  const p = s.getState().coins.VAULT.price;
  assert.ok(s.placeOrder({ coinId: 'VAULT', type: 'limit-sell', price: p * 50, amount: 1 }).ok);
  while (s.tick());
  assert.equal(s.getState().portfolio.orders[0].status, 'expired');
  const f = fresh();
  f.swap('VAULT', 'buy', 300);
  f.placeOrder({ coinId: 'VAULT', type: 'stop-loss', price: p * 0.01, amount: 1 });
  f.finish();
  assert.equal(f.getState().portfolio.orders[0].status, 'expired', 'Finish now also ends them');
  assert.equal(f.placeOrder({ coinId: 'VAULT', type: 'stop-loss', price: p * 0.5, amount: 1 }).error.code, 'MARKET_CLOSED');
});

test('after the rug, a limit buy on BLOOP is refused like a normal buy', () => {
  const s = fresh('builder');
  const RUG = Math.round((CONFIG.scenario.events.find((e) => e.id === 'rug_pull').at * 1000) / CONFIG.scenario.tickMs);
  while (s.getState().t <= RUG) s.tick();
  const p = s.getState().coins.BLOOP.price;
  const r = s.placeOrder({ coinId: 'BLOOP', type: 'limit-buy', price: p / 2, amount: 10 });
  assert.equal(r.error?.code, 'RUGGED');
  assert.equal(r.error.message, s.quote('BLOOP', 'buy', 10).error.message, 'the same words as Market Buy');
  assert.equal(s.getState().portfolio.orders.length, 0);
});

test('trade messages write numbers like the Lab: L$1,000.00 and 61,223 coins', () => {
  const s = fresh();
  assert.equal(s.quote('VAULT', 'buy', 5000).error.message, 'You have L$1,000.00 to spend. Try a smaller amount.');
  assert.equal(s.quote('VAULT', 'sell', 1).error.message, 'You don’t own any VAULT to sell.');
  s.swap('ZOOMZ', 'buy', 500);
  s.swap('PEG', 'buy', 400);
  const held = s.getState().portfolio.holdings;
  const many = s.quote('ZOOMZ', 'sell', held.ZOOMZ * 2).error.message;
  assert.equal(many, `You have ${Math.round(held.ZOOMZ).toLocaleString('en-US')} ZOOMZ to sell. Try a smaller amount.`);
  assert.match(many, /^You have \d{1,3}(,\d{3})+ ZOOMZ/);
  // Under 1,000 coins keep two decimals, so 398.69 PEG is never shown as 399.
  assert.match(s.quote('PEG', 'sell', held.PEG + 1).error.message, /^You have \d{3}\.\d\d PEG to sell\./);
  s.swap('VAULT', 'buy', s.getState().portfolio.cash);
  assert.equal(s.quote('VAULT', 'buy', 5).error.message, 'You’ve spent all your L$. Sell a coin to get cash back.');
});

test('depth: buying up and selling down both cost more the further you push', () => {
  const s = fresh();
  const d = s.depth('VAULT', [-20, -10, 0, 10, 20]);
  assert.equal(d.length, 5);
  assert.equal(d[2].L, 0);
  assert.ok(d[3].L > 0 && d[4].L > d[3].L, 'up');
  assert.ok(d[1].L > 0 && d[0].L > d[1].L, 'down');
  assert.deepEqual(s.depth('NOPE', [10]), []);
});

test('orders keep the market deterministic', () => {
  const run = () => {
    const s = fresh('builder');
    s.swap('VAULT', 'buy', 400);
    toDump(s);
    const p = s.getState().coins.VAULT.price;
    s.placeOrder({ coinId: 'VAULT', type: 'stop-loss', price: p * 0.93, amount: s.getState().portfolio.holdings.VAULT });
    while (s.tick());
    return JSON.stringify(s.getState());
  };
  assert.equal(run(), run());
});
