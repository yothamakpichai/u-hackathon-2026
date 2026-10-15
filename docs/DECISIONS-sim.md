# Sim decisions (slice J1, Joewee)

Decisions for `public/assets/js/sim/` and `public/data/coins.json`, `agents.json`, `scenario.json`. Where BRIEF v2 was ambiguous I took the option with fewer moving parts.

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
| VAULT | Mints 0.12 per tick, capped at 21M; miners sell half. `halving` halves issuance. `whale_dump` sells 12% of the pool in the event's own tick, so the drop is already on the chart when Penny announces it. Spread over 3 s, selling on the popup front-ran the drop and beat holding, which taught the opposite of composure. |
| EDUU | Fixed max supply. Learner rewards are released from a 10M pool; learners sell 20%. |
| PEG | Deep AMM pool. The arb agent mints or redeems at 1:1, so supply moves with it, and closes 2% of the gap each tick. `depeg_scare` sells PEG down to 0.96. |
| FUEL | Issuance minus burn. 0.05% of the coins in every swap are burned, wash trades included. A wash bot trades all session; `volume` includes wash and `washVolume` is the wash part. The bot alternates buy-first and sell-first round trips. One-way round trips left their fees in the pool and lifted the price about 8% per session; alternating cancels that, leaving about +1% from the burn. |
| ORBIT | `unlock` releases 25% of the locked supply at the cliff, then linear vesting. Insiders sell 4% of each unlock; the cliff sale lands in the unlock tick, for the same reason as the whale dump. |
| ZOOMZ | Bonding curve, then AMM. Hype buyers pump it and later take profit; value agents keep the fade sideways. |
| BLOOP | Launched straight on an AMM pool with an unlocked LP held by its creator (the classic rug). It does not use the curve because a graduated curve's LP is burned and can't be pulled; that contrast is the lesson. `rug_pull` pulls 99% of the liquidity and dumps the creator's bag. Afterwards NPCs never buy it, and the player can only sell (error `RUGGED`). |

- **`supply`** is the headline circulating number and **`maxSupply`** is the cap or total (`null` if there isn't one). Agent inventories and pool reserves are the tradable float and are not reconciled with the headline supply.
- **`wash_volume`** has `"at": null`. It is narration the UI triggers in Builder Advanced, not a market event.

**Calibration** (4 seeds):

| Event | Result |
|---|---|
| `whale_dump` | −21 to −24% at once, recovering to −7 to −10% |
| `unlock` | About −23% at once, then a partial recovery and a slow slide |
| `hype_wave` | +300 to +400% about 30 s later, then fades |
| BLOOP before the rug | +140 to +730% |
| `rug_pull` | About −100% |
| `depeg_scare` | Low about 0.96, back within ±0.5% after 14–16 s |

A full session runs in under 0.1 s.

## API notes (additive to §5; nothing in §5 changed)

- `session.quote(coinId, side, amount)` returns the same shape as `swap()` without trading. It is for the trade-panel preview.
- `session.finish()` closes the market early ("Finish now") and fires `close` with the final state. `close` fires exactly once, even if a listener calls `finish()`.
- `on()` returns an unsubscribe function; calling it twice is harmless. A listener that throws doesn't break the tick; its error is rethrown asynchronously.
- `swap()` errors are `{ code, message }`, with plain messages that say what to do next. `createCoin()` throws a `SimError` with the same fields.
- Swap error codes: `MARKET_CLOSED`, `UNKNOWN_COIN`, `OWN_COIN`, `BAD_SIDE`, `BAD_AMOUNT`, `INSUFFICIENT_CASH`, `INSUFFICIENT_COINS`, `RUGGED`, `NO_LIQUIDITY`. `NO_LIQUIDITY` covers a bonding curve that can't pay out in full; it is refused rather than filled for nothing.
- `createSession()` throws `BAD_SEED` when there is no seed, so a forgotten seed can't silently give every day the same market. Pass `dailySeed()`.
- `createCoin()` also accepts `hype` (0–1). §2 gives Trader a "launch hype" knob, but §5's signature doesn't include it.
- Tier ids are `explorer` | `trader` | `builder` (case-insensitive).
- `iconId` (0–23) and `colorId` (0–11) are indexes into the glyph set and the coin colour tokens. EDUU uses `colorId` 0, which should map to the primary `#0DA678`.

**Proposal:** fold these additions into §5 in a brief-only commit.

## Create a coin

- One coin per session. Knobs a tier can't see keep safe defaults: allocation you/team/public 10/10/80, hype 0.4, LP locked, vesting on.
- The player can't trade their own coin at all (`OWN_COIN`). A review found that buying it at launch and selling 10 s later returned +257 to +499%, a textbook dev dump. Their allocation is locked, listed in `portfolio.created`, and not counted in `portfolio.value`.
- The team share vests over 60 s, and the NPC team sells half of it.
- **Trust** comes only from the design: insider share above 20%, an unlocked LP (Builder) and vesting (Builder). Trust scales how much hype buyers want the coin. `launch.factors` lists the reasons, so J3 can explain the outcome.
- **Left for J3:** the NPC copycat attack, and the ticker blocklist and profanity list.

## Data for the Money Health Score (Y4)

The sim records raw data; it does not compute the score.

- **`portfolio.risk`**: tick counts with one coin above 50% of value, and with less than 10% in L$ + PEG.
- **`portfolio.history`**: value, max share and safe share, once per candle.
- **`portfolio.trades`**: each trade with `t`, `holdingBefore` and `holdingAfter`.
- **`events[]`**: `negative`, plus `playerCoins` and `playerValue` at the moment the event fired, so exposure to BLOOP at `rug_pull` is visible.

## Lab screen (slice J2)

- **Clock.** The market runs only while `#/lab` is open and the tab is visible. It also pauses while Penny's event popup is open and when the player taps Pause. The live session sits in `lab.js` module state, so a trip to `#/create` (J3) and back resumes it; a page reload restarts today's market from Day 1.
- **Events.** Each event opens Penny's popup. Step 1 shows the headline and captioned narration; step 2 is the question (`ui.questionCard`), so the two audio clips never talk over each other.
  - **Content.** Read from `public/data/events.json` as `events[eventId][tier]` (or `events[tier][eventId]`) = `{ headline, narration, question: { prompt, options[3], answerIndex, explain? } }`. If an entry is missing, the Lab shows a short built-in headline and narration with no question, so the judge path never breaks before Y3.
  - **Audio ids.** `event-<eventId>-<tier>` for the narration, and `event-<eventId>-<tier>-question` (plus `-explain`) for the question.
- **For the report card (Y4).** When the market closes (time up, or Finish now), `store.lab[tier]` holds:
  - `date`, `seed`, `tier`, `t`, `ticks`, `finishedEarly`
  - `value`, `startValue`, `cash`, `holdings: { id: { coins, value } }`
  - `risk`, `history`, `trades` (the last 200), `created`, `events`
  - `quiz: [{ id, correct }]` for the event questions
  - `at`

  The popup then offers "See my report card" (`#/report`) and "Replay today's market".
- **Chart.** TradingView Lightweight Charts 5.2.1 is vendored in `public/assets/js/vendor/lightweight-charts/` with its LICENSE and NOTICE. Its built-in attribution logo injects a `<style>` element, which the CSP blocks, so it is off. A text credit linking to tradingview.com sits under the chart instead. Each candle is 6 sim hours, the axis shows "Day N", and candles fill the chart from the left.
- **Coin colours.** `colorId` in `coins.json` indexes `config.COIN_COLORS`, and the Lab maps it to `--pal-<name>`. The roster matches the `--coin-*` tokens.

## Create a coin (slice J3)

- **Entry.** Create opens from the Lab's "Your coin" card after Penny's first news. `#/create` explains itself, with a link back, when there is no open market, no news yet, the market has closed, or a coin was already launched (one per market).
- **Knobs per tier (§2):**

  | Tier | Knobs |
  |---|---|
  | All | Name, ticker, icon (24), colour (12), supply (1 thousand, 1 million or 1 billion) |
  | Trader and up | You/team split as sliders (buyers keep at least 20%), and launch hype: Quiet, Some buzz or Loud (0.2, 0.5, 0.9) |
  | Builder | Pool lock and vesting of your own coins |

  Explorer coins use the default 10/10/80 split.
- **Names and tickers.** `sim/names.js` is shared by the engine and the form. It checks the format, blocks the real tickers and brands from §10, and blocks a small profanity list stored ROT13. A blocked word matches a whole word or the start of a word, so "Grape" and "Class" pass.
- **Glyphs.** `public/assets/svg/glyphs/` doesn't exist yet, so `lab.js` draws the 24 coin glyphs inline (`GLYPHS`; `iconId` is the index, and 0–6 are the roster's). If an SVG set ships, only `coinBadge()` changes; the ids stay the same.
- **Copycat** (Builder, pool unlocked, §3.5):
  - 15 s after launch, an NPC lists "<name> Official" (ticker + X) at the same price and shills it. It takes half of the real coin's hype.
  - 30 s later it pulls its pool.
  - These fire the events `copycat` and `copycat_rug` (Builder only). Their narration comes from `events.json`, or from the Lab's fallback copy. Exposure is in `events[]`, like the BLOOP rug.
- **Outcome explained.** `designNotes()` turns a design into plain-language notes: scarcity, insider share, team selling, hype, pool lock and vesting. They show in the preview before launch, and in the Lab's "Your coin" card after it. That card also shows the price since launch, holders, curve progress or graduation day, and the copycat.

## Config location

- The sim configs live in `public/data/`, so the browser can fetch them (brief §8/§11 as amended). The Lab loads them and passes the parsed objects to `createSession()`; the engine never fetches anything itself.
