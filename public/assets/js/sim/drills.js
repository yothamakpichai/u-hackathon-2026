// Coach drills (BRIEF §15): replays of today's scripted market in a sandbox session, so the
// player's real run is never touched. Pure: no DOM. Same seed, same market, so both rounds of a
// drill see exactly the same whale.

import { createSession } from './session.js';

const tickOf = (scenario, id) => Math.round((scenario.events.find((e) => e.id === id).at * 1000) / scenario.tickMs);
const priceOf = (s, id) => s.getState().coins[id]?.price ?? 0;

// Chapter 4: buy VAULT, then either sell everything the moment the whale dump shows ('panic')
// or keep holding ('hold'). Both rounds end 30 s after the dump.
export function whaleDrill({ coinsConfig, agentsConfig, scenario, seed, tier }, strategy, { stakeL = 500 } = {}) {
  const s = createSession({ seed, tier, coinsConfig, agentsConfig, scenario });
  const dumpAt = tickOf(scenario, 'whale_dump');
  const from = dumpAt - 60;
  const to = dumpAt + 300;
  while (s.getState().t < from) s.tick();
  const bought = s.swap('VAULT', 'buy', stakeL);
  const prices = [{ t: from, price: priceOf(s, 'VAULT') }];
  let sold = null;
  while (s.getState().t < to) {
    s.tick();
    const t = s.getState().t;
    prices.push({ t, price: priceOf(s, 'VAULT') });
    // The dump lands in the tick it fires; the panic seller dumps everything on the next look.
    if (strategy === 'panic' && !sold && t > dumpAt) {
      const r = s.swap('VAULT', 'sell', s.getState().portfolio.holdings.VAULT);
      sold = { t, price: priceOf(s, 'VAULT'), got: r.filledL$ };
    }
  }
  const final = s.getState().portfolio;
  return {
    strategy,
    dumpAt,
    from,
    to,
    prices,
    boughtCoins: bought.filledCoins,
    sold,
    finalValue: final.value,
    startValue: final.startValue,
  };
}

// Chapter 5: a Builder sandbox where a coin launches with its pool unlocked, so the NPC copycat
// appears and rugs. Returns the look-alike's price path and the moments that matter.
export function copycatDrill({ coinsConfig, agentsConfig, scenario, seed }, { launchAt = 400 } = {}) {
  const s = createSession({ seed, tier: 'builder', coinsConfig, agentsConfig, scenario });
  while (s.getState().t < launchAt) s.tick();
  const ticker = s.createCoin({ name: 'Demo Coin', ticker: 'DEMO', iconId: 11, colorId: 9, supply: 1_000_000, lpLocked: false });
  const cc = scenario.userCoin.copycat;
  const spawnAt = launchAt + cc.delayTicks;
  const rugAt = spawnAt + cc.rugAfterTicks;
  while (s.getState().t <= spawnAt) s.tick();
  const copy = Object.values(s.getState().coins).find((c) => c.class === 'copycat');
  const prices = [];
  while (s.getState().t < rugAt + 60) {
    s.tick();
    const st = s.getState();
    prices.push({ t: st.t, price: st.coins[copy.id].price });
  }
  const end = s.getState();
  return {
    ticker,
    copy: { id: copy.id, name: copy.name, lpLocked: copy.lpLocked },
    spawnAt,
    rugAt,
    prices,
    holders: end.coins[copy.id].holders,
    rugged: end.coins[copy.id].rugged,
  };
}
