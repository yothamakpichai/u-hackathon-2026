# Sim decisions (slice J1, Joewee)

Decisions for `public/assets/js/sim/` and `data/coins.json`, `agents.json`, `scenario.json`. Where BRIEF v2 was ambiguous I took the option with fewer moving parts.

## Engine

- **Modules.** `prng.js` (seed), `amm.js` (pool maths), `agents.js` (NPC archetypes), `session.js` (`createSession`). Pure ES modules: no DOM, no clock, no `Math.random()` (a test enforces this).
- **Seed.** `dailySeed(date)` = FNV-1a 32-bit of `"market-lab:" + YYYY-MM-DD`. The date is computed in Bangkok time as fixed UTC+7, since Thailand has no daylight saving. The PRNG is mulberry32.
- **Random streams.** Each coin has its own stream, derived from the seed and the coin id. Every agent draws exactly two numbers per tick, whatever it does. As a result, a player's trades change prices but never the random stream: coins they don't touch are identical for everyone that day.
- **Time.** `getState().t` is the number of ticks completed. Event payloads carry the tick index at which the event fired; seconds = t / 10. Each candle covers 20 ticks (2 s real, 6 sim hours), giving 120 candles per session. `candle.t` is the candle's first tick, and the chart maps it to a time.
- **AMM.** Constant product with a 0.3% fee. The fee stays in the pool (Uniswap v2 style), so k never falls on a swap. `priceImpactPct` is the size of the price move, |after / before − 1| × 100, so the UI can say "your trade moved the price by X%".
- **Bonding curve.** The same pool with a virtual L$ reserve. It graduates to an AMM pool when real L$ reaches `graduateAtL`. The price is continuous across graduation, and spare curve coins are burned. ZOOMZ starts a third of the way up its curve and graduates during the hype wave.
- **Tiers.** The whole market runs in every tier. A tier only filters which coins `getState()` returns and which events fire `on('event')`. Every tier-gated event acts on a coin that lower tiers can't see, so no tier ever sees an unexplained move.

## Coins

| Coin | How it works |
|---|---|
| VAULT | Mints 0.12 per tick, capped at 21M; miners sell half. `halving` halves issuance. `whale_dump` sells 12% of the pool over 3 s. |
| EDUU | Fixed max supply. Learner rewards are released from a 10M pool; learners sell 20%. |
| PEG | Deep AMM pool. The arb agent mints or redeems at 1:1, so supply moves with it, and closes 2% of the gap each tick. `depeg_scare` sells PEG down to 0.96. |
| FUEL | Issuance minus burn. 0.05% of the coins in every swap are burned, wash trades included. The burn is kept small so fake volume barely moves the price. A wash bot trades all session; `volume` includes wash and `washVolume` is the wash part. |
| ORBIT | `unlock` releases 25% of the locked supply at the cliff, then linear vesting. Insiders sell 4% of each unlock. |
| ZOOMZ | Bonding curve, then AMM. Hype buyers pump it and later take profit; value agents keep the fade sideways. |
| BLOOP | Launched straight on an AMM pool with an unlocked LP held by its creator (the classic rug). It does not use the curve because a graduated curve's LP is burned and can't be pulled; that contrast is the lesson. `rug_pull` pulls 99% of the liquidity and dumps the creator's bag. Afterwards NPCs never buy it, and the player can only sell (error `RUGGED`). |

- **`supply`** is the headline circulating number and **`maxSupply`** is the cap or total (`null` if there isn't one). Agent inventories and pool reserves are the tradable float and are not reconciled with the headline supply.
- **`wash_volume`** has `"at": null`. It is narration the UI triggers in Builder Advanced, not a market event.

**Calibration** (4 seeds):

| Event | Result |
|---|---|
| `whale_dump` | −20 to −23%, recovering to about −8% |
| `unlock` | −9 to −19%, then a slow slide |
| `hype_wave` | +300 to +400% about 30 s later, then fades |
| BLOOP before the rug | +140 to +730% |
| `rug_pull` | About −100% |
| `depeg_scare` | Low about 0.96, back within ±0.5% after 14–16 s |

A full session runs in under 0.1 s.

## API notes (additive to §5; nothing in §5 changed)

- `session.quote(coinId, side, amount)` returns the same shape as `swap()` without trading. It is for the trade-panel preview.
- `session.finish()` closes the market early ("Finish now") and fires `close` with the final state.
- `on()` returns an unsubscribe function. A listener that throws doesn't break the tick; its error is rethrown asynchronously.
- `swap()` errors are `{ code, message }`, with plain messages that say what to do next. `createCoin()` throws a `SimError` with the same fields.
- `createCoin()` also accepts `hype` (0–1). §2 gives Trader a "launch hype" knob, but §5's signature doesn't include it.
- Tier ids are `explorer` | `trader` | `builder` (case-insensitive).
- `iconId` (0–23) and `colorId` (0–11) are indexes into the glyph set and the coin colour tokens. EDUU uses `colorId` 0, which should map to the primary `#0DA678`.

**Proposal:** fold these additions into §5 in a brief-only commit.

## Create a coin

- One coin per session. Knobs a tier can't see keep safe defaults: allocation you/team/public 10/10/80, hype 0.4, LP locked, vesting on.
- The creator's own allocation is locked and never tradable by the player, so no user can dump on holders. It is listed in `portfolio.created` and is not counted in `portfolio.value`.
- The team share vests over 60 s, and the NPC team sells half of it.
- **Trust** comes only from the design: insider share above 20%, an unlocked LP (Builder) and vesting (Builder). Trust scales how much hype buyers want the coin. `launch.factors` lists the reasons, so J3 can explain the outcome.
- **Left for J3:** the NPC copycat attack, and the ticker blocklist and profanity list.

## Data for the Money Health Score (Y4)

The sim records raw data; it does not compute the score.

- **`portfolio.risk`**: tick counts with one coin above 50% of value, and with less than 10% in L$ + PEG.
- **`portfolio.history`**: value, max share and safe share, once per candle.
- **`portfolio.trades`**: each trade with `t`, `holdingBefore` and `holdingAfter`.
- **`events[]`**: `negative`, plus `playerCoins` and `playerValue` at the moment the event fired, so exposure to BLOOP at `rug_pull` is visible.

## Open

- **`data/` is outside the docroot** (`public/`), so the browser can't fetch the JSON yet. This needs one shared answer for all `data/*.json` files: an Apache alias or PHP passthrough, or moving the files under `public/`.
