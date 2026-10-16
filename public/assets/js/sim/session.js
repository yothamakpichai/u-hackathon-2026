// Market Lab simulation engine (BRIEF §5). Pure ES module: no DOM, no clock, no Math.random().
// One session = one daily market. tick() advances 100 ms of real time; the UI drives the clock.

import { hashString, mulberry32 } from './prng.js';
import { buy, createPool, depthTo, graduate, poolPrice, realL, removeLiquidity, sell, tradeToPrice } from './amm.js';
import { STEPS, between } from './agents.js';
import { checkName, checkTicker } from './names.js';

export const TIERS = ['explorer', 'trader', 'builder'];
const MIN_ORDER_L = 0.01;

export class SimError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => ({ ok: false, filledCoins: 0, filledL$: 0, priceImpactPct: 0, error: { code, message } });

const fmt = (n) => (n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(3));

export function createSession({ seed, tier, coinsConfig, agentsConfig, scenario }) {
  tier = String(tier ?? '').toLowerCase();
  if (!TIERS.includes(tier)) throw new SimError('BAD_TIER', `Unknown tier "${tier}".`);
  if (seed == null || (typeof seed !== 'string' && !Number.isFinite(Number(seed)))) {
    throw new SimError('BAD_SEED', 'Missing or invalid seed. Pass dailySeed().');
  }
  const baseSeed = typeof seed === 'string' ? hashString(seed) : Number(seed) >>> 0;

  const { tickMs, ticks, ticksPerDay: TPD, candleTicks: C, startCash } = scenario;
  const fee = coinsConfig.fee;
  const archetypes = agentsConfig.archetypes;
  const hypeDecay = Math.pow(0.5, 1 / agentsConfig.hypeHalfLifeTicks);
  const fearDecay = Math.pow(0.5, 1 / agentsConfig.fearHalfLifeTicks);
  const visibleIds = new Set(scenario.tiers[tier].coins);

  let now = 0; // ticks completed; the next tick() processes tick index `now`
  let closed = false;
  const coins = []; // every coin in the market, in a fixed order
  const byId = new Map();
  const fired = [];
  const txs = [];
  const listeners = { event: [], close: [], order: [] };
  const orders = []; // the player's limit and stop-loss orders (J9)
  const pf = {
    cash: startCash,
    holdings: {},
    trades: [],
    created: [],
    risk: { ticks: 0, overExposedTicks: 0, lowSafeTicks: 0, maxShare: 0, minCashShare: 1 },
    history: [],
  };

  const schedule = new Map();
  const addScheduled = (at, e) => {
    if (!schedule.has(at)) schedule.set(at, []);
    schedule.get(at).push(e);
  };
  for (const e of scenario.events) {
    if (e.at == null) continue; // narration triggered by the UI, no market effect (wash_volume)
    addScheduled(Math.round((e.at * 1000) / tickMs), e);
  }

  // ---- market plumbing -------------------------------------------------------------------

  function addCoin(def) {
    const price = poolPrice(def.pool);
    const c = {
      trust: 1,
      hype: 0,
      hypeFloor: 0,
      burnRate: 0,
      issuance: null,
      vesting: null,
      peg: null,
      safe: false,
      lpLocked: true,
      launch: null,
      ...def,
      rng: mulberry32(hashString(`${baseSeed}:${def.id}`)),
      issued: 0,
      burned: 0,
      issuerCoins: 0,
      halvings: 0,
      fear: 0,
      rugged: false,
      graduatedAt: null,
      agents: [],
      hist: [price],
      cum: [0, price],
      candles: [{ t: now - (now % C), open: price, high: price, low: price, close: price, volume: 0, washVolume: 0 }],
      volSlots: new Float64Array(TPD),
      washSlots: new Float64Array(TPD),
      totalVolume: 0,
      totalWashVolume: 0,
    };
    coins.push(c);
    byId.set(c.id, c);
    return c;
  }

  function spawn(c, counts, overrides = {}) {
    const price = poolPrice(c.pool);
    const made = [];
    for (const [type, n] of Object.entries(counts)) {
      if (!STEPS[type] || !archetypes[type]) throw new SimError('BAD_CONFIG', `Unknown agent type "${type}".`);
      const p = { ...archetypes[type], ...overrides[type] };
      for (let i = 0; i < n; i++) {
        const cash = p.cashL ? between(c.rng(), p.cashL) : 0;
        const coinsHeld = p.holdL ? between(c.rng(), p.holdL) / price : 0;
        const a = { type, p, cash, coins: coinsHeld, dump: 0, dumpChunk: 0, toSell: 0 };
        c.agents.push(a);
        made.push(a);
      }
    }
    // On a bonding curve nobody can hold more coins than the curve has sold.
    if (c.phase === 'curve') {
      const sold = c.curveCoins - c.pool.y;
      const held = c.agents.reduce((s, a) => s + a.coins, 0);
      if (held > sold) for (const a of c.agents) a.coins *= sold / held;
    }
    return made;
  }

  function burn(c, q) {
    if (q > 0) {
      c.burned += q;
      c.supply -= q;
    }
  }

  // Every trade in the market goes through here: NPCs, arbitrage and the player. Each one is logged
  // as a transaction for the block explorer (BRIEF §7); `who` is the archetype, 'issuer' or 'player'.
  function execSwap(c, side, amount, wash = false, who = 'issuer') {
    let coinsMoved, L;
    if (side === 'buy') {
      const out = buy(c.pool, amount);
      const burned = out * c.burnRate;
      burn(c, burned);
      coinsMoved = out - burned;
      L = amount;
    } else {
      const burned = amount * c.burnRate;
      burn(c, burned);
      L = sell(c.pool, amount - burned);
      coinsMoved = amount;
    }
    const slot = now % TPD;
    c.volSlots[slot] += L;
    c.totalVolume += L;
    const k = c.candles[c.candles.length - 1];
    k.volume += L;
    if (wash) {
      c.washSlots[slot] += L;
      c.totalWashVolume += L;
      k.washVolume += L;
    }
    if (c.phase === 'curve' && realL(c.pool) >= c.graduateAtL) {
      burn(c, graduate(c.pool));
      c.phase = 'amm';
      c.graduatedAt = now;
    }
    const p = poolPrice(c.pool);
    k.close = p;
    if (p > k.high) k.high = p;
    if (p < k.low) k.low = p;
    txs.push({ t: now, coin: c.id, side, coins: coinsMoved, L, who });
    return { coins: coinsMoved, L };
  }

  // What the agents may see and do.
  const m = {
    price: (c) => poolPrice(c.pool),
    ret(c, lookback) {
      const h = c.hist;
      const n = h.length;
      return h[n - 1] / h[Math.max(0, n - 1 - lookback)] - 1;
    },
    ma(c, window) {
      const n = c.hist.length;
      const from = Math.max(0, n - window);
      return (c.cum[n] - c.cum[from]) / (n - from);
    },
    buy(a, c, L, wash = false) {
      L = Math.min(L, a.cash);
      if (!(L >= MIN_ORDER_L) || c.rugged) return 0; // nobody buys into a pulled pool

      const r = execSwap(c, 'buy', L, wash, a.type);
      a.cash -= L;
      a.coins += r.coins;
      return r.coins;
    },
    sell(a, c, q, wash = false) {
      q = Math.min(q, a.coins);
      if (!(q > 0)) return 0;
      const r = execSwap(c, 'sell', q, wash, a.type);
      a.coins -= q;
      a.cash += r.L;
      return r.L;
    },
    // Arbitrage against the issuer: redeem bought PEG at 1:1 (supply falls) or mint at 1:1 to sell (supply rises).
    arb(c, side, amount) {
      if (!(amount > 0)) return;
      if (side === 'buy') {
        const r = execSwap(c, 'buy', amount, false, 'arb');
        c.supply -= r.coins;
      } else {
        c.supply += amount;
        execSwap(c, 'sell', amount, false, 'arb');
      }
    },
  };

  function issue(c) {
    const iss = c.issuance;
    if (!iss) return;
    let amount = iss.perTick;
    if (c.maxSupply != null) amount = Math.min(amount, c.maxSupply - c.supply);
    if (iss.pool != null) amount = Math.min(amount, iss.remaining);
    if (!(amount > 0)) return;
    if (iss.pool != null) iss.remaining -= amount;
    c.supply += amount;
    if (c.maxSupply != null && c.supply > c.maxSupply) c.supply = c.maxSupply;
    c.issued += amount;
    c.issuerCoins += amount * iss.sellShare;
    if (c.issuerCoins * poolPrice(c.pool) >= iss.minOrderL) {
      execSwap(c, 'sell', c.issuerCoins);
      c.issuerCoins = 0;
    }
  }

  function unlock(c, amount) {
    const v = c.vesting;
    amount = Math.min(amount, v.locked);
    if (!(amount > 0)) return;
    v.locked -= amount;
    v.unlocked += amount;
    if (v.addsToSupply) c.supply += amount;
    v.holder.coins += amount;
    v.holder.toSell += amount * v.sellShare;
  }

  function applyEvent(e, c) {
    const fx = e.effect ?? {};
    switch (e.id) {
      case 'hype_wave':
        c.hype = Math.max(c.hype, fx.hype);
        break;
      case 'halving':
        if (c.issuance) c.issuance.perTick *= fx.issuanceFactor;
        c.halvings++;
        c.hype = Math.max(c.hype, fx.hype ?? 0);
        break;
      case 'unlock': {
        const v = c.vesting;
        unlock(c, v.locked * v.cliffShare);
        v.perTick = v.locked / v.linearTicks;
        break;
      }
      case 'whale_dump': {
        const w = c.agents.find((a) => a.type === 'whale');
        w.dump = Math.min(w.coins, c.pool.y * fx.poolShare);
        w.dumpChunk = w.dump / fx.ticks;
        break;
      }
      case 'rug_pull':
      case 'copycat_rug': {
        const r = c.agents.find((a) => a.type === 'rugger');
        const got = removeLiquidity(c.pool, fx.removeShare);
        r.cash += got.L;
        r.coins += got.coins;
        r.dump = r.coins;
        r.dumpChunk = r.coins / fx.ticks;
        c.rugged = true;
        c.hype = 0;
        c.hypeFloor = 0;
        break;
      }
      case 'depeg_scare': {
        // A rush of scared holders sells PEG until it trades near fx.price.
        const { side, amount } = tradeToPrice(c.pool, fx.price);
        if (side === 'sell') execSwap(c, 'sell', amount, false, 'panic');
        break;
      }
      default:
        break;
    }
    if (fx.fear) c.fear = Math.max(c.fear, fx.fear);
  }

  function portfolioValue() {
    let v = pf.cash;
    for (const [id, q] of Object.entries(pf.holdings)) v += q * poolPrice(byId.get(id).pool);
    return v;
  }

  function trackRisk(t) {
    const v = portfolioValue();
    if (!(v > 0)) return;
    let max = 0;
    let safe = pf.cash;
    for (const [id, q] of Object.entries(pf.holdings)) {
      const c = byId.get(id);
      const val = q * poolPrice(c.pool);
      if (c.safe) safe += val;
      if (val > max) max = val;
    }
    const r = pf.risk;
    r.ticks++;
    r.maxShare = Math.max(r.maxShare, max / v);
    r.minCashShare = Math.min(r.minCashShare, pf.cash / v);
    if (max / v > scenario.risk.maxShare) r.overExposedTicks++;
    if (safe / v < scenario.risk.minSafeShare) r.lowSafeTicks++;
    if (t % C === 0) pf.history.push({ t, value: v, maxShare: max / v, safeShare: safe / v });
  }

  function emit(name, payload) {
    for (const cb of [...listeners[name]]) {
      try {
        cb(payload);
      } catch (err) {
        queueMicrotask(() => {
          throw err;
        });
      }
    }
  }

  const isVisible = (c) => c.user || visibleIds.has(c.id);

  // Builder, pool not locked: an NPC lists a look-alike of the player's coin, shills it, then pulls
  // its pool (BRIEF §3.5). The player's own coin stays honest; its buyers are the ones exposed.
  function copycatTicker(t) {
    for (const id of [`${t.slice(0, 4)}X`, `${t.slice(0, 3)}XX`, `${t.slice(0, 2)}XXX`]) {
      if (id !== t && !byId.has(id)) return id;
    }
    return 'COPYX';
  }

  function spawnCopycat(e) {
    const orig = byId.get(e.effect.of);
    if (!orig || byId.has(e.coin)) return;
    const cc = scenario.userCoin.copycat;
    const price0 = Math.max(poolPrice(orig.pool), 1e-12);
    const c = addCoin({
      id: e.coin,
      name: `${orig.name} Official`,
      ticker: e.coin,
      cls: 'copycat',
      iconId: orig.iconId,
      colorId: orig.colorId,
      user: false,
      pool: createPool({ reserveL: cc.liquidityL, reserveCoins: cc.liquidityL / price0, fee }),
      phase: 'amm',
      supply: orig.supply,
      maxSupply: orig.supply,
      hype: cc.hype,
      hypeFloor: cc.hypeFloor,
      lpLocked: false,
    });
    visibleIds.add(c.id);
    spawn(c, cc.agents, cc.params);
    spawn(c, { rugger: 1 }, cc.params)[0].coins = (cc.liquidityL / price0) * cc.bagMultiple;
    orig.hype *= cc.hypeKept; // the look-alike steals the real coin's buzz
    addScheduled(now + cc.rugAfterTicks, {
      id: 'copycat_rug',
      coin: c.id,
      tiers: ['builder'],
      negative: true,
      effect: { removeShare: 0.99, ticks: 10, fear: 1 },
    });
  }

  // ---- the roster ------------------------------------------------------------------------

  for (const def of coinsConfig.coins) {
    const mk = def.market;
    let pool;
    let phase = 'amm';
    let curveCoins = 0;
    if (mk.kind === 'curve') {
      pool = createPool({ reserveL: 0, reserveCoins: mk.curveCoins, fee, virtualL: mk.virtualL });
      if (mk.startRealL) buy(pool, mk.startRealL);
      phase = 'curve';
      curveCoins = mk.curveCoins;
    } else {
      pool = createPool({ reserveL: mk.liquidityL, reserveCoins: mk.liquidityL / mk.price, fee });
    }
    const c = addCoin({
      id: def.id,
      name: def.name,
      ticker: def.id,
      cls: def.class,
      iconId: def.iconId,
      colorId: def.colorId,
      user: false,
      pool,
      phase,
      curveCoins,
      graduateAtL: mk.graduateAtL ?? null,
      supply: def.supply.initial,
      maxSupply: def.supply.max ?? null,
      burnRate: def.burnRate ?? 0,
      issuance: def.issuance ? { ...def.issuance, remaining: def.issuance.pool ?? null } : null,
      hype: def.hype ?? 0,
      hypeFloor: def.hypeFloor ?? 0,
      lpLocked: def.lpLocked ?? true,
      peg: def.peg ?? null,
      safe: !!def.safe,
    });
    spawn(c, def.agents, def.params);
    if (def.vesting) {
      const holder = spawn(c, { insider: 1 }, def.params)[0];
      c.vesting = { ...def.vesting, addsToSupply: true, unlocked: 0, perTick: 0, holder };
    }
    if (def.rugger) {
      const r = spawn(c, { rugger: 1 }, def.params)[0];
      r.coins = def.rugger.bagCoins;
    }
  }

  // ---- public API ------------------------------------------------------------------------

  function tick() {
    if (closed) return false;
    const t = now;
    const due = schedule.get(t) ?? [];
    const toEmit = [];
    for (const e of due) {
      if (e.id === 'copycat') spawnCopycat(e);
      const c = byId.get(e.coin);
      if (!c) continue;
      if (e.tiers.includes(tier)) {
        const held = pf.holdings[e.coin] ?? 0;
        fired.push({ id: e.id, coinId: e.coin, t, negative: !!e.negative, playerCoins: held, playerValue: held * poolPrice(c.pool) });
        toEmit.push({ id: e.id, coinId: e.coin, t });
      }
      applyEvent(e, c);
    }

    for (const c of coins) {
      issue(c);
      if (c.vesting && c.vesting.perTick > 0) unlock(c, c.vesting.perTick);
      for (const a of c.agents) {
        const u1 = c.rng();
        const u2 = c.rng();
        STEPS[a.type](a, c, m, u1, u2);
      }
    }
    const filled = checkOrders();

    for (const c of coins) {
      c.hype = Math.max(c.hype * hypeDecay, c.rugged ? 0 : c.hypeFloor);
      c.fear *= fearDecay;
      const p = poolPrice(c.pool);
      c.hist.push(p);
      c.cum.push(c.cum[c.cum.length - 1] + p);
    }
    trackRisk(t);

    now = t + 1;
    const ended = now >= ticks;
    if (ended) {
      closed = true;
      expireOrders();
    } else {
      const slot = now % TPD;
      for (const c of coins) {
        c.volSlots[slot] = 0;
        c.washSlots[slot] = 0;
        if (now % C === 0) {
          const p = poolPrice(c.pool);
          c.candles.push({ t: now, open: p, high: p, low: p, close: p, volume: 0, washVolume: 0 });
        }
      }
    }

    for (const ev of toEmit) emit('event', ev);
    for (const o of filled) emit('order', { ...o });
    // Only the natural end closes here; finish() called from a listener has already sent 'close'.
    if (ended) emit('close', getState());
    return true;
  }

  function checkTrade(coinId, side, amount) {
    if (closed) return fail('MARKET_CLOSED', 'The market has closed. Open your report card to see how you did.');
    const c = byId.get(coinId);
    if (!c || !isVisible(c)) return fail('UNKNOWN_COIN', 'That coin is not in this market.');
    // A creator trading their own coin could pump and dump it on the buyers (BRIEF §1, §3.5).
    if (c.user) {
      return fail('OWN_COIN', `You launched ${c.ticker}, so you can watch it but not trade it. That keeps it fair for everyone who buys it.`);
    }
    if (side !== 'buy' && side !== 'sell') return fail('BAD_SIDE', 'Choose Buy or Sell.');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return fail('BAD_AMOUNT', 'Enter an amount bigger than zero.');
    }
    if (side === 'buy') {
      if (c.rugged) {
        return fail('RUGGED', `${c.ticker}'s creator pulled the money out of its pool, so it can't be bought any more. You can still sell what you hold.`);
      }
      if (amount < MIN_ORDER_L) return fail('BAD_AMOUNT', 'The smallest trade is L$0.01.');
      if (amount > pf.cash + 1e-9) {
        return fail('INSUFFICIENT_CASH', `You have L$${pf.cash.toFixed(2)} to spend. Try a smaller amount.`);
      }
    } else {
      const held = pf.holdings[coinId] ?? 0;
      if (amount > held * (1 + 1e-9)) {
        return fail('INSUFFICIENT_COINS', `You have ${fmt(held)} ${c.ticker} to sell. Try a smaller amount.`);
      }
      // A bonding curve can only pay out the real L$ it holds; refuse rather than fill for nothing.
      const inEff = Math.min(amount, held) * (1 - c.burnRate) * (1 - c.pool.fee);
      if ((c.pool.x * inEff) / (c.pool.y + inEff) > realL(c.pool)) {
        return fail('NO_LIQUIDITY', `The ${c.ticker} pool only holds L$${realL(c.pool).toFixed(2)} of real money right now, so it can't pay for that many coins. Try selling fewer.`);
      }
    }
    return { ok: true, c };
  }

  // Preview a trade without making it.
  function quote(coinId, side, amount) {
    const chk = checkTrade(coinId, side, amount);
    if (!chk.ok) return chk;
    const c = chk.c;
    const pool = { ...c.pool };
    const before = poolPrice(pool);
    let filledCoins;
    let filledL;
    if (side === 'buy') {
      filledL = Math.min(amount, pf.cash);
      filledCoins = buy(pool, filledL) * (1 - c.burnRate);
    } else {
      filledCoins = Math.min(amount, pf.holdings[coinId] ?? 0);
      filledL = sell(pool, filledCoins * (1 - c.burnRate));
    }
    return { ok: true, filledCoins, filledL$: filledL, priceImpactPct: Math.abs(poolPrice(pool) / before - 1) * 100, error: null };
  }

  function swap(coinId, side, amount) {
    const chk = checkTrade(coinId, side, amount);
    if (!chk.ok) return chk;
    const c = chk.c;
    const before = poolPrice(c.pool);
    const held = pf.holdings[coinId] ?? 0;
    let r;
    if (side === 'buy') {
      const L = Math.min(amount, pf.cash);
      r = execSwap(c, 'buy', L, false, 'player');
      pf.cash = Math.max(0, pf.cash - L);
      pf.holdings[coinId] = held + r.coins;
    } else {
      const q = Math.min(amount, held);
      r = execSwap(c, 'sell', q, false, 'player');
      pf.cash += r.L;
      const left = held - q;
      if (left > held * 1e-9) pf.holdings[coinId] = left;
      else delete pf.holdings[coinId];
    }
    const priceImpactPct = Math.abs(poolPrice(c.pool) / before - 1) * 100;
    pf.trades.push({
      t: now,
      coinId,
      side,
      filledCoins: r.coins,
      filledL$: r.L,
      holdingBefore: held,
      holdingAfter: pf.holdings[coinId] ?? 0,
    });
    return { ok: true, filledCoins: r.coins, filledL$: r.L, priceImpactPct, error: null };
  }

  function createCoin(opts = {}) {
    if (closed) throw new SimError('MARKET_CLOSED', 'The market has closed, so new coins cannot launch.');
    const uc = scenario.userCoin;
    if (coins.filter((c) => c.user).length >= uc.max) {
      throw new SimError('LIMIT', 'You already launched a coin in this market.');
    }
    const name = String(opts.name ?? '').trim().replace(/\s+/g, ' ');
    const ticker = String(opts.ticker ?? '').trim().toUpperCase();
    const problem = checkName(name) || checkTicker(ticker);
    if (problem) throw new SimError(problem.code, problem.message);
    if (byId.has(ticker)) throw new SimError('TICKER_TAKEN', `${ticker} is already in this market. Pick another ticker.`);
    const toId = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);
    const iconId = toId(opts.iconId);
    const colorId = toId(opts.colorId);
    if (!Number.isInteger(iconId) || iconId < 0 || iconId >= uc.iconCount) throw new SimError('BAD_ICON', 'Pick an icon.');
    if (!Number.isInteger(colorId) || colorId < 0 || colorId >= uc.colorCount) throw new SimError('BAD_COLOR', 'Pick a colour.');
    const supply = Number(opts.supply);
    if (!Number.isFinite(supply) || supply < uc.minSupply || supply > uc.maxSupply) {
      throw new SimError('BAD_SUPPLY', `Total supply must be between ${uc.minSupply.toLocaleString('en-US')} and ${uc.maxSupply.toLocaleString('en-US')}.`);
    }

    // Knobs a tier cannot see keep their defaults (BRIEF §2). Explorer coins have no team, so no team sells.
    let alloc = { ...(tier === 'explorer' && uc.explorerAllocation ? uc.explorerAllocation : uc.defaultAllocation) };
    let hype = uc.defaultHype;
    let lpLocked = true;
    let vesting = true;
    if (tier !== 'explorer') {
      if (opts.allocation) {
        alloc = { you: Number(opts.allocation.you), team: Number(opts.allocation.team), public: Number(opts.allocation.public) };
        const parts = [alloc.you, alloc.team, alloc.public];
        if (parts.some((x) => !Number.isFinite(x) || x < 0) || Math.abs(parts[0] + parts[1] + parts[2] - 100) > 1e-6) {
          throw new SimError('BAD_ALLOCATION', 'You, team and public must add up to 100%.');
        }
        if (alloc.public < uc.minPublic) {
          throw new SimError('BAD_ALLOCATION', `Give the public at least ${uc.minPublic}% so people can buy your coin.`);
        }
      }
      if (opts.hype != null) {
        hype = Number(opts.hype);
        if (!Number.isFinite(hype) || hype < 0 || hype > 1) throw new SimError('BAD_HYPE', 'Launch hype goes from 0 to 1.');
      }
    }
    if (tier === 'builder') {
      if (opts.lpLocked != null) lpLocked = !!opts.lpLocked;
      if (opts.vesting != null) vesting = !!opts.vesting;
    }

    // How much the market trusts the design. Risk comes from design, never from cheating.
    const factors = [];
    const insiderShare = (alloc.you + alloc.team) / 100;
    if (insiderShare > uc.trust.fairInsiderShare) {
      factors.push({ id: 'big_insider_share', effect: -Math.min(uc.trust.maxPenalty, (insiderShare - uc.trust.fairInsiderShare) * uc.trust.insiderPenalty) });
    }
    if (tier === 'builder' && !lpLocked) factors.push({ id: 'lp_unlocked', effect: -uc.trust.lpUnlockedPenalty });
    if (tier === 'builder' && vesting && alloc.you > 0) factors.push({ id: 'own_vesting', effect: uc.trust.vestingBonus });
    const trust = Math.min(uc.trust.max, Math.max(uc.trust.min, 1 + factors.reduce((s, f) => s + f.effect, 0)));

    const publicCoins = (supply * alloc.public) / 100;
    const teamCoins = (supply * alloc.team) / 100;
    const youCoins = (supply * alloc.you) / 100;
    const c = addCoin({
      id: ticker,
      name,
      ticker,
      cls: 'user',
      iconId,
      colorId,
      user: true,
      pool: createPool({ reserveL: 0, reserveCoins: publicCoins, fee, virtualL: uc.virtualL }),
      phase: 'curve',
      curveCoins: publicCoins,
      graduateAtL: uc.graduateAtL,
      supply,
      maxSupply: supply,
      hype,
      lpLocked,
      trust,
      launch: { t: now, price0: uc.virtualL / publicCoins, supply, allocation: alloc, hype, lpLocked, vesting, trust, factors },
    });
    if (tier === 'builder' && !lpLocked && uc.copycat) {
      addScheduled(now + uc.copycat.delayTicks, { id: 'copycat', coin: copycatTicker(ticker), tiers: ['builder'], negative: true, effect: { of: ticker } });
    }
    spawn(c, uc.agents, uc.params);
    if (teamCoins > 0) {
      const holder = spawn(c, { insider: 1 }, uc.params)[0];
      c.vesting = { locked: teamCoins, unlocked: 0, perTick: teamCoins / uc.teamVestTicks, sellShare: uc.teamSellShare, addsToSupply: false, holder };
    }
    pf.created.push({ coinId: ticker, coins: youCoins, vesting });
    return ticker;
  }

  function coinView(c) {
    const price = poolPrice(c.pool);
    let volume = 0;
    let washVolume = 0;
    for (let i = 0; i < TPD; i++) {
      volume += c.volSlots[i];
      washVolume += c.washSlots[i];
    }
    let holders = (pf.holdings[c.id] ?? 0) > 0 ? 1 : 0;
    for (const a of c.agents) if (a.coins > 1e-9) holders++;
    return {
      id: c.id,
      name: c.name,
      ticker: c.ticker,
      class: c.cls,
      iconId: c.iconId,
      colorId: c.colorId,
      user: c.user,
      price,
      candles: c.candles.map((k) => ({ ...k })),
      volume,
      washVolume,
      totalVolume: c.totalVolume,
      totalWashVolume: c.totalWashVolume,
      supply: c.supply,
      maxSupply: c.maxSupply,
      issued: c.issued,
      burned: c.burned,
      halvings: c.halvings,
      holders,
      phase: c.phase,
      curveProgress: c.phase === 'curve' ? Math.min(1, realL(c.pool) / c.graduateAtL) : 1,
      graduatedAt: c.graduatedAt,
      lpLocked: c.lpLocked,
      rugged: c.rugged,
      launch: c.launch ? structuredClone(c.launch) : null,
    };
  }

  function getState() {
    const out = {};
    for (const c of coins) if (isVisible(c)) out[c.id] = coinView(c);
    const value = portfolioValue();
    return {
      t: now,
      ticks,
      ticksPerDay: TPD,
      tickMs,
      day: Math.min(ticks / TPD, Math.floor(now / TPD) + 1),
      closed,
      tier,
      seed: baseSeed,
      coins: out,
      portfolio: {
        cash: pf.cash,
        holdings: { ...pf.holdings },
        value,
        startValue: startCash,
        trades: pf.trades.map((x) => ({ ...x })),
        orders: orders.map((o) => ({ ...o, fill: o.fill ? { ...o.fill } : null })),
        created: pf.created.map((x) => ({ ...x })),
        risk: { ...pf.risk },
        history: pf.history.map((x) => ({ ...x })),
      },
      events: fired.map((e) => ({ ...e })),
    };
  }

  function on(name, cb) {
    if (!listeners[name]) throw new SimError('BAD_EVENT', `Unknown session event "${name}".`);
    listeners[name].push(cb);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const i = listeners[name].indexOf(cb);
      if (i >= 0) listeners[name].splice(i, 1);
    };
  }

  // "Finish now": close the market early.
  function finish() {
    if (closed) return;
    closed = true;
    expireOrders();
    emit('close', getState());
  }

  // Transactions from index `from` on (copies), for the block explorer and the order-flow panel.
  const getTransactions = (from = 0) => txs.slice(Math.max(0, from)).map((x) => ({ ...x }));

  // A soulbound badge mint (BRIEF §15): a transaction on today's chain with no price and no transfer.
  function recordMint(badgeId) {
    txs.push({ t: now, coin: 'BADGE', side: 'mint', coins: 1, L: 0, who: 'mint', badge: String(badgeId) });
  }

  // ---- limit and stop-loss orders (J9) ---------------------------------------------------------
  // limit-buy: spend `amount` L$ once the price is at or below `price`.
  // limit-sell: sell `amount` coins once the price is at or above `price`.
  // stop-loss: sell `amount` coins once the price is at or below `price`.
  // A triggered order becomes an ordinary swap at that tick's price, so it can fill worse than its
  // trigger in a fast market (slippage). Orders are player actions, so the market stays deterministic.
  const ORDER_TYPES = ['limit-buy', 'limit-sell', 'stop-loss'];

  function placeOrder({ coinId, type, price, amount } = {}) {
    if (closed) return { ok: false, error: { code: 'MARKET_CLOSED', message: 'The market has closed.' } };
    const c = byId.get(coinId);
    if (!c || !isVisible(c)) return { ok: false, error: { code: 'UNKNOWN_COIN', message: 'That coin is not in this market.' } };
    if (c.user) return { ok: false, error: { code: 'OWN_COIN', message: `You launched ${c.ticker}, so you can watch it but not trade it.` } };
    if (!ORDER_TYPES.includes(type)) return { ok: false, error: { code: 'BAD_TYPE', message: 'Choose a limit or stop-loss order.' } };
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return { ok: false, error: { code: 'BAD_PRICE', message: 'Enter a price bigger than zero.' } };
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: { code: 'BAD_AMOUNT', message: 'Enter an amount bigger than zero.' } };
    const p = poolPrice(c.pool);
    if (type === 'limit-buy' && price >= p) return { ok: false, error: { code: 'WOULD_FILL_NOW', message: `${c.ticker} is already at or below that price. Use a normal Buy instead.` } };
    if (type === 'limit-sell' && price <= p) return { ok: false, error: { code: 'WOULD_FILL_NOW', message: `${c.ticker} is already at or above that price. Use a normal Sell instead.` } };
    if (type === 'stop-loss' && price >= p) return { ok: false, error: { code: 'WOULD_FILL_NOW', message: 'A stop-loss goes below today’s price.' } };
    const id = `o${orders.length + 1}`;
    orders.push({ id, coinId, type, price, amount, status: 'open', placedT: now, filledT: null, fill: null, error: null });
    return { ok: true, id };
  }

  function cancelOrder(id) {
    const o = orders.find((x) => x.id === id);
    if (!o || o.status !== 'open') return false;
    o.status = 'cancelled';
    return true;
  }

  // Depth chart (J9): L$ it takes to move a coin's price by each percent step (+ up, - down).
  function depth(coinId, pcts) {
    const c = byId.get(coinId);
    const p0 = c ? poolPrice(c.pool) : NaN;
    if (!c || !isVisible(c) || !(p0 > 0) || !Number.isFinite(p0)) return [];
    return pcts.map((pct) => ({ pct, price: p0 * (1 + pct / 100), L: Math.max(0, depthTo(c.pool, p0 * (1 + pct / 100))) }));
  }

  // Orders still open when the market closes lapse, like a day order.
  function expireOrders() {
    for (const o of orders) if (o.status === 'open') o.status = 'expired';
  }

  function checkOrders() {
    const done = [];
    for (const o of orders) {
      if (o.status !== 'open') continue;
      const c = byId.get(o.coinId);
      const p = poolPrice(c.pool);
      const hit = o.type === 'limit-buy' ? p <= o.price : o.type === 'limit-sell' ? p >= o.price : p <= o.price;
      if (!hit) continue;
      const side = o.type === 'limit-buy' ? 'buy' : 'sell';
      const amount = side === 'buy' ? Math.min(o.amount, pf.cash) : Math.min(o.amount, pf.holdings[o.coinId] ?? 0);
      const r = amount > 0 ? swap(o.coinId, side, amount) : null;
      if (r?.ok) {
        o.status = 'filled';
        o.fill = { coins: r.filledCoins, L: r.filledL$, price: r.filledL$ / r.filledCoins };
      } else {
        o.status = 'failed';
        o.error = r ? r.error.code : side === 'buy' ? 'INSUFFICIENT_CASH' : 'INSUFFICIENT_COINS';
      }
      o.filledT = now;
      done.push(o);
    }
    return done;
  }

  return { tick, swap, quote, depth, createCoin, getState, getTransactions, recordMint, placeOrder, cancelOrder, on, finish };
}
