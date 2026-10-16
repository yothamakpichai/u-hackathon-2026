// Unit checks for the market session (BRIEF §5). Run: node public/assets/js/sim/session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSession, SimError } from './session.js';
import { bangkokDate, dailySeed } from './prng.js';
import { checkName, checkTicker } from './names.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../../data/${f}`, import.meta.url), 'utf8'));
const CONFIG = { coinsConfig: load('coins.json'), agentsConfig: load('agents.json'), scenario: load('scenario.json') };
const config = () => structuredClone(CONFIG);
const SEEDS = ['2026-10-16', '2026-10-17', '2026-10-18', '2026-11-02', '2027-01-01'].map((d) => dailySeed(new Date(`${d}T05:00:00Z`)));
const tickOf = (id) => Math.round((CONFIG.scenario.events.find((e) => e.id === id).at * 1000) / CONFIG.scenario.tickMs);

function run(seed, tier, actions = {}, until = Infinity) {
  const s = createSession({ seed, tier, ...config() });
  const results = [];
  for (let t = 0; t < until; t++) {
    if (actions[t]) results.push(actions[t](s));
    if (!s.tick()) break;
  }
  return { s, results };
}

// One scripted player: trades, launches a coin and trades through events.
const SCRIPT = {
  10: (s) => s.swap('VAULT', 'buy', 300),
  360: (s) => s.swap('ZOOMZ', 'buy', 150),
  400: (s) => s.createCoin({ name: 'Moon Pie', ticker: 'PIE', iconId: 3, colorId: 7, supply: 1e6, allocation: { you: 20, team: 10, public: 70 }, hype: 0.7, lpLocked: false, vesting: true }),
  700: (s) => s.swap('VAULT', 'sell', s.getState().portfolio.holdings.VAULT / 2),
  1500: (s) => s.swap('ZOOMZ', 'sell', s.getState().portfolio.holdings.ZOOMZ),
  2060: (s) => s.swap('PEG', 'buy', 200),
};

test('the same seed with the same actions gives an identical state', () => {
  const a = run(SEEDS[0], 'builder', SCRIPT);
  const b = run(SEEDS[0], 'builder', SCRIPT);
  assert.ok(a.results.every((r) => r === 'PIE' || r.ok), 'every scripted action succeeded');
  assert.equal(JSON.stringify(a.s.getState()), JSON.stringify(b.s.getState()));

  const mid = (seed) => JSON.stringify(run(seed, 'builder', SCRIPT, 1200).s.getState());
  assert.equal(mid(SEEDS[0]), mid(SEEDS[0]));
  assert.notEqual(mid(SEEDS[0]), mid(SEEDS[1]), 'a different day is a different market');
});

test('the player cannot change the random stream, only prices', () => {
  // NPCs draw the same random numbers whatever the player does, so a quiet market and a busy one
  // stay close on coins the player never touched.
  const quiet = run(SEEDS[2], 'trader').s.getState();
  const busy = run(SEEDS[2], 'trader', { 50: (s) => s.swap('VAULT', 'buy', 900) }).s.getState();
  assert.equal(quiet.coins.EDUU.price, busy.coins.EDUU.price, 'untouched coin is identical');
  assert.notEqual(quiet.coins.VAULT.price, busy.coins.VAULT.price);
});

test('the sim never calls Math.random()', () => {
  const original = Math.random;
  Math.random = () => {
    throw new Error('Math.random() called inside the sim');
  };
  try {
    run(SEEDS[1], 'builder', SCRIPT);
  } finally {
    Math.random = original;
  }
});

test('the 21M cap is never exceeded', () => {
  const vault = (s) => s.getState().coins.VAULT;
  const s = createSession({ seed: SEEDS[0], tier: 'explorer', ...config() });
  do assert.ok(vault(s).supply <= 21_000_000);
  while (s.tick());

  // Stress: start 10 coins below the cap and issue 1 coin per tick.
  const cfg = config();
  const def = cfg.coinsConfig.coins.find((c) => c.id === 'VAULT');
  def.supply.initial = 20_999_990;
  def.issuance.perTick = 1;
  const t = createSession({ seed: SEEDS[0], tier: 'explorer', ...cfg });
  do assert.ok(vault(t).supply <= 21_000_000, `supply ${vault(t).supply}`);
  while (t.tick());
  assert.equal(vault(t).supply, 21_000_000);
  assert.ok(vault(t).issued <= 10 + 1e-9);
});

test('PEG returns to within ±0.5% of 1.00 after depeg_scare', () => {
  const at = tickOf('depeg_scare');
  for (const seed of SEEDS) {
    const s = createSession({ seed, tier: 'explorer', ...config() });
    let low = Infinity;
    while (s.tick()) {
      const { t, coins } = s.getState();
      const price = coins.PEG.price;
      if (t <= at) assert.ok(Math.abs(price - 1) <= 0.005, `pinned before the scare (t ${t}: ${price})`);
      else if (t <= at + 50) low = Math.min(low, price);
      else if (t >= at + 250) assert.ok(Math.abs(price - 1) <= 0.005, `restored 25 s after the scare (t ${t}: ${price})`);
    }
    assert.ok(low <= 0.97 && low >= 0.94, `the scare pushed PEG to about 0.96 (low ${low})`);
  }
});

test("BLOOP's price falls by at least 90% at rug_pull", () => {
  const at = tickOf('rug_pull');
  for (const seed of SEEDS) {
    const s = createSession({ seed, tier: 'builder', ...config() });
    for (let i = 0; i < at; i++) s.tick();
    const before = s.getState().coins.BLOOP.price;
    for (let i = 0; i < 20; i++) s.tick();
    const after = s.getState();
    assert.ok(after.coins.BLOOP.rugged);
    assert.ok(after.coins.BLOOP.price <= before * 0.1, `${before} → ${after.coins.BLOOP.price}`);
    assert.ok(after.events.some((e) => e.id === 'rug_pull' && e.t === at));
  }
});

test('each tier sees its own coins and events', () => {
  const expected = {
    explorer: { coins: ['VAULT', 'EDUU', 'PEG'], events: ['halving', 'whale_dump', 'depeg_scare'] },
    trader: { coins: ['VAULT', 'EDUU', 'PEG', 'FUEL', 'ORBIT', 'ZOOMZ'], events: ['hype_wave', 'halving', 'unlock', 'whale_dump', 'depeg_scare'] },
    builder: { coins: ['VAULT', 'EDUU', 'PEG', 'FUEL', 'ORBIT', 'ZOOMZ', 'BLOOP'], events: ['hype_wave', 'halving', 'unlock', 'whale_dump', 'rug_pull', 'depeg_scare'] },
  };
  for (const [tier, want] of Object.entries(expected)) {
    const s = createSession({ seed: SEEDS[0], tier, ...config() });
    const heard = [];
    let closedWith = null;
    s.on('event', (e) => heard.push(e));
    s.on('close', (state) => (closedWith = state));
    while (s.tick());
    const state = s.getState();
    assert.deepEqual(Object.keys(state.coins), want.coins);
    assert.deepEqual(heard.map((e) => e.id), want.events);
    assert.deepEqual(state.events.map((e) => e.id), want.events);
    assert.ok(heard.every((e) => typeof e.coinId === 'string' && Number.isInteger(e.t)));
    // Each event says whether it is bad news, as scenario.json marks it (Penny's mood in the Lab).
    const negative = Object.fromEntries(CONFIG.scenario.events.map((e) => [e.id, !!e.negative]));
    assert.deepEqual(heard.map((e) => e.negative), heard.map((e) => negative[e.id]));
    assert.equal(state.t, 2400);
    assert.equal(state.closed, true);
    assert.ok(closedWith && closedWith.closed);
    assert.equal(s.tick(), false, 'a closed market does not tick');
  }
});

test('trades are checked and explain what went wrong', () => {
  const s = createSession({ seed: SEEDS[0], tier: 'explorer', ...config() });
  assert.equal(s.swap('VAULT', 'buy', 5000).error.code, 'INSUFFICIENT_CASH');
  assert.equal(s.swap('VAULT', 'sell', 1).error.code, 'INSUFFICIENT_COINS');
  assert.equal(s.swap('BLOOP', 'buy', 10).error.code, 'UNKNOWN_COIN', 'BLOOP is Builder-only');
  assert.equal(s.swap('VAULT', 'hold', 10).error.code, 'BAD_SIDE');
  for (const bad of [0, -5, NaN, Infinity, '10']) assert.equal(s.swap('VAULT', 'buy', bad).error.code, 'BAD_AMOUNT');

  const q = s.quote('VAULT', 'buy', 500);
  const r = s.swap('VAULT', 'buy', 500);
  assert.ok(r.ok && r.error === null);
  assert.equal(r.filledCoins, q.filledCoins, 'quote matches the fill');
  assert.equal(r.filledL$, 500);
  assert.ok(r.priceImpactPct > 0 && r.priceImpactPct < 5);
  const st = s.getState();
  assert.equal(st.portfolio.cash, 500);
  assert.equal(st.portfolio.holdings.VAULT, r.filledCoins);

  const back = s.swap('VAULT', 'sell', r.filledCoins);
  assert.ok(back.ok && back.filledL$ < 500, 'selling straight back costs the fee');
  assert.equal(s.getState().portfolio.holdings.VAULT, undefined);
  assert.equal(s.getState().portfolio.trades.length, 2);

  s.finish();
  assert.equal(s.swap('VAULT', 'buy', 10).error.code, 'MARKET_CLOSED');
});

test('after the rug, BLOOP can be sold but not bought', () => {
  const s = createSession({ seed: SEEDS[0], tier: 'builder', ...config() });
  assert.ok(s.swap('BLOOP', 'buy', 100).ok);
  const at = tickOf('rug_pull');
  let exposure = null;
  s.on('event', (e) => {
    if (e.id === 'rug_pull') exposure = s.getState().events.at(-1);
  });
  for (let i = 0; i <= at + 20; i++) s.tick();
  assert.ok(exposure && exposure.playerCoins > 0, 'the report can see the player held BLOOP at the rug');
  assert.equal(s.swap('BLOOP', 'buy', 10).error.code, 'RUGGED');
  const sold = s.swap('BLOOP', 'sell', s.getState().portfolio.holdings.BLOOP);
  assert.ok(sold.ok && sold.filledL$ < 1, `the bag is worth almost nothing (${sold.filledL$})`);
});

test('Explorer coins launch 10/0/90 with no team to sell; Trader keeps the 10/10/80 default', () => {
  const e = createSession({ seed: SEEDS[3], tier: 'explorer', ...config() });
  for (let i = 0; i < 400; i++) e.tick();
  e.createCoin({ name: 'Kid Coin', ticker: 'KIDC', iconId: 1, colorId: 2, supply: 1_000_000, allocation: { you: 60, team: 20, public: 20 } });
  const k = e.getState().coins.KIDC;
  assert.deepEqual(k.launch.allocation, { you: 10, team: 0, public: 90 }, 'Explorer cannot set the split');
  assert.equal(k.launch.factors.length, 0);
  assert.equal(e.getState().portfolio.created[0].coins, 100_000);
  for (let i = 0; i < 900; i++) e.tick();
  assert.ok(!e.getTransactions().some((x) => x.coin === 'KIDC' && x.who === 'insider'), 'no team insider trades');
  const t = createSession({ seed: SEEDS[3], tier: 'trader', ...config() });
  for (let i = 0; i < 400; i++) t.tick();
  t.createCoin({ name: 'Teen Coin', ticker: 'TEEN', iconId: 1, colorId: 2, supply: 1_000_000 });
  assert.deepEqual(t.getState().coins.TEEN.launch.allocation, { you: 10, team: 10, public: 80 });
});

test('createCoin launches an honest coin on the bonding curve', () => {
  const s = createSession({ seed: SEEDS[3], tier: 'builder', ...config() });
  for (let i = 0; i < 400; i++) s.tick();
  const id = s.createCoin({ name: ' Space  Cats ', ticker: 'meow', iconId: 0, colorId: 11, supply: 1_000_000, allocation: { you: 10, team: 10, public: 80 }, hype: 0.8 });
  assert.equal(id, 'MEOW');
  let c = s.getState().coins.MEOW;
  assert.equal(c.name, 'Space Cats');
  assert.equal(c.phase, 'curve');
  assert.equal(c.user, true);
  assert.equal(c.supply, 1_000_000);
  assert.ok(c.launch.trust > 0 && c.launch.trust <= 1.1);
  assert.equal(s.getState().portfolio.created[0].coins, 100_000);
  assert.equal(s.swap('MEOW', 'buy', 50).error.code, 'OWN_COIN', 'creators cannot pump and dump their own coin');
  assert.equal(s.quote('MEOW', 'buy', 50).error.code, 'OWN_COIN');
  for (let i = 0; i < 600; i++) s.tick();
  c = s.getState().coins.MEOW;
  assert.ok(c.holders > 0 && c.totalVolume > 0, 'agents react to the launch');
  assert.ok(c.candles.length > 1);

  // More coins, each worth less.
  const price = (supply) => {
    const t = createSession({ seed: SEEDS[3], tier: 'explorer', ...config() });
    t.createCoin({ name: 'Test', ticker: 'TST', iconId: 0, colorId: 0, supply });
    return t.getState().coins.TST.price;
  };
  assert.ok(Math.abs(price(1e6) / price(1e7) - 10) < 1e-9);

  const err = (fn) => {
    try {
      fn();
    } catch (e) {
      assert.ok(e instanceof SimError);
      return e.code;
    }
    return null;
  };
  const fresh = () => createSession({ seed: SEEDS[3], tier: 'trader', ...config() });
  const ok = { name: 'Good Coin', ticker: 'GOOD', iconId: 1, colorId: 1, supply: 1e6 };
  assert.equal(err(() => fresh().createCoin({ ...ok, ticker: 'ZOOMZ' })), 'TICKER_TAKEN');
  assert.equal(err(() => fresh().createCoin({ ...ok, ticker: 'AB' })), 'BAD_TICKER');
  assert.equal(err(() => fresh().createCoin({ ...ok, name: 'R2D2' })), 'BAD_NAME');
  assert.equal(err(() => fresh().createCoin({ ...ok, iconId: 24 })), 'BAD_ICON');
  assert.equal(err(() => fresh().createCoin({ ...ok, supply: 10 })), 'BAD_SUPPLY');
  assert.equal(err(() => fresh().createCoin({ ...ok, allocation: { you: 50, team: 40, public: 10 } })), 'BAD_ALLOCATION');
  assert.equal(err(() => fresh().createCoin({ ...ok, allocation: { you: 50, team: 40, public: 20 } })), 'BAD_ALLOCATION');
  const once = fresh();
  once.createCoin(ok);
  assert.equal(err(() => once.createCoin({ ...ok, ticker: 'MORE' })), 'LIMIT');
  assert.equal(err(() => fresh().createCoin({ ...ok, iconId: null })), 'BAD_ICON');
  assert.equal(err(() => createSession({ seed: 1, tier: 'grownup', ...config() })), 'BAD_TIER');
  assert.equal(err(() => createSession({ tier: 'explorer', ...config() })), 'BAD_SEED');
});

test('close fires once, even when a listener ends the market early', () => {
  const s = createSession({ seed: SEEDS[0], tier: 'explorer', ...config() });
  let closes = 0;
  s.on('close', () => closes++);
  s.on('event', (e) => {
    if (e.id === 'halving') s.finish();
  });
  while (s.tick());
  s.finish();
  assert.equal(closes, 1);

  const off = s.on('event', () => {});
  off();
  off(); // calling unsubscribe twice is harmless
});

test('a dump is already on the chart when its event fires', () => {
  // Penny announces what the chart shows, so panic-selling on the popup can't front-run the drop.
  for (const [id, coin, tier] of [['whale_dump', 'VAULT', 'explorer'], ['unlock', 'ORBIT', 'trader']]) {
    const at = tickOf(id);
    const s = createSession({ seed: SEEDS[1], tier, ...config() });
    for (let i = 0; i < at; i++) s.tick();
    const before = s.getState().coins[coin].price;
    let atEvent = null;
    s.on('event', (e) => {
      if (e.id === id) atEvent = s.getState().coins[coin].price;
    });
    s.tick();
    assert.ok(atEvent <= before * 0.92, `${id}: ${before} → ${atEvent} when the event fires`);
  }
});

test('a greedy design earns less trust than a fair one', () => {
  const trust = (tier, opts) => {
    const s = createSession({ seed: SEEDS[0], tier, ...config() });
    s.createCoin({ name: 'Trust', ticker: 'TRU', iconId: 0, colorId: 0, supply: 1e6, ...opts });
    return s.getState().coins.TRU.launch.trust;
  };
  const fair = trust('builder', { allocation: { you: 5, team: 5, public: 90 }, lpLocked: true, vesting: true });
  const greedy = trust('builder', { allocation: { you: 60, team: 20, public: 20 }, lpLocked: false, vesting: false });
  assert.ok(fair > greedy, `${fair} vs ${greedy}`);
  // Knobs a tier cannot see are ignored.
  assert.equal(trust('explorer', { allocation: { you: 60, team: 20, public: 20 } }), trust('explorer', {}));
});

test('an unlocked pool invites a copycat that rugs its buyers (Builder only)', () => {
  const cc = CONFIG.scenario.userCoin.copycat;
  const s = createSession({ seed: SEEDS[2], tier: 'builder', ...config() });
  for (let i = 0; i < 400; i++) s.tick();
  s.createCoin({ name: 'Moon Pie', ticker: 'MOON', iconId: 1, colorId: 2, supply: 1e6, lpLocked: false });
  const heard = [];
  s.on('event', (e) => heard.push(e));
  for (let i = 0; i < cc.delayTicks + 5; i++) s.tick();
  const copy = Object.values(s.getState().coins).find((c) => c.class === 'copycat');
  assert.ok(copy, 'a look-alike appeared');
  assert.equal(copy.ticker, 'MOONX');
  assert.equal(copy.name, 'Moon Pie Official');
  assert.ok(heard.some((e) => e.id === 'copycat' && e.coinId === 'MOONX' && e.negative === true), 'a copycat is bad news');
  assert.ok(s.swap('MOONX', 'buy', 50).ok, 'the player can be fooled');
  for (let i = 0; i < cc.rugAfterTicks - 10; i++) s.tick();
  const before = s.getState().coins.MOONX.price;
  for (let i = 0; i < 30; i++) s.tick();
  const after = s.getState();
  assert.ok(heard.some((e) => e.id === 'copycat_rug' && e.negative === true), 'so is its rug pull');
  assert.ok(after.coins.MOONX.rugged);
  assert.ok(after.coins.MOONX.price <= before * 0.1, `${before} → ${after.coins.MOONX.price}`);
  const rug = after.events.find((e) => e.id === 'copycat_rug');
  assert.ok(rug && rug.playerCoins > 0, 'the report can see the player held the copycat');

  // A locked pool, or a tier without the knob: no copycat.
  for (const [tier, opts] of [['builder', { lpLocked: true }], ['trader', {}]]) {
    const t = createSession({ seed: SEEDS[2], tier, ...config() });
    t.createCoin({ name: 'Moon Pie', ticker: 'MOON', iconId: 1, colorId: 2, supply: 1e6, ...opts });
    for (let i = 0; i < 600; i++) t.tick();
    assert.ok(!Object.values(t.getState().coins).some((c) => c.class === 'copycat'), tier);
  }
});

test('names and tickers keep real coins and rude words out', () => {
  for (const t of ['BTC', 'eth', 'Doge', 'EDUU', 'usdt']) assert.equal(checkTicker(t)?.code, 'BLOCKED_TICKER', t);
  for (const n of ['Bitcoin', 'Super Ethereum', 'Cenedury']) assert.equal(checkName(n)?.code, 'BLOCKED_NAME', n);
  assert.equal(checkName('Shit Coin')?.code, 'BLOCKED_NAME');
  assert.equal(checkTicker('SHITX')?.code, 'BLOCKED_TICKER');
  for (const n of ['Grape Coin', 'Class Act', 'Peacock', 'Scrap Metal', 'Space Cats']) assert.equal(checkName(n), null, n);
  for (const t of ['PASS', 'MOON', 'GRAPE', 'SCRAP']) assert.equal(checkTicker(t), null, t);
  const s = createSession({ seed: 1, tier: 'trader', ...config() });
  assert.throws(() => s.createCoin({ name: 'Bitcoin', ticker: 'BITS', iconId: 0, colorId: 0, supply: 1e6 }), /real coin/);
  assert.throws(() => s.createCoin({ name: 'Good Name', ticker: 'ETH', iconId: 0, colorId: 0, supply: 1e6 }), /real coin/);
});

test('the daily seed follows the Bangkok calendar', () => {
  assert.equal(bangkokDate(new Date('2026-10-15T16:59:59Z')), '2026-10-15');
  assert.equal(bangkokDate(new Date('2026-10-15T17:00:00Z')), '2026-10-16');
  assert.equal(dailySeed(new Date('2026-10-15T17:00:00Z')), dailySeed(new Date('2026-10-16T16:59:59Z')));
  assert.notEqual(dailySeed(new Date('2026-10-16T05:00:00Z')), dailySeed(new Date('2026-10-17T05:00:00Z')));
});
