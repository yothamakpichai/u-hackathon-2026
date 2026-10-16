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
- `on('event')` passes `{ id, coinId, t, negative }`, so the Lab takes Penny's mood from the event itself (J13 QA).
- `placeOrder()` refuses a limit buy on a rug-pulled coin with `RUGGED`, like a Market buy. Orders already open on it still trigger and fail with `RUGGED`.

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

  Explorer coins launch 10/0/90 (`userCoin.explorerAllocation`): you keep 10%, buyers get 90%, and there is no team, so no NPC team sells. The Explorer design note says exactly that. Trader and Builder sliders start at 10/10/80.
- **Names and tickers.** `sim/names.js` is shared by the engine and the form. It checks the format, blocks the real tickers and brands from §10, and blocks a small profanity list stored ROT13. A blocked word matches a whole word or the start of a word, so "Grape" and "Class" pass.
- **Glyphs.** `public/assets/svg/glyphs/` doesn't exist yet, so `lab.js` draws the 24 coin glyphs inline (`GLYPHS`; `iconId` is the index, and 0–6 are the roster's). If an SVG set ships, only `coinBadge()` changes; the ids stay the same.
- **Copycat** (Builder, pool unlocked, §3.5):
  - 15 s after launch, an NPC lists "<name> Official" (ticker + X) at the same price and shills it. It takes half of the real coin's hype.
  - 30 s later it pulls its pool.
  - These fire the events `copycat` and `copycat_rug` (Builder only). Their narration comes from `events.json`, or from the Lab's fallback copy. Exposure is in `events[]`, like the BLOOP rug.
- **Outcome explained.** `designNotes()` turns a design into plain-language notes: scarcity, insider share, team selling, hype, pool lock and vesting. They show in the preview before launch, and in the Lab's "Your coin" card after it. That card also shows the price since launch, holders, curve progress or graduation day, and the copycat.

## Block explorer and Advanced view (slice J4)

- **Transactions.** Every swap (NPC, issuer, arbitrage, player) is logged as `{ t, coin, side, coins, L, who }`. `session.getTransactions(from)` returns the log from an index.
- **Blocks.** `sim/chain.js` groups transactions into blocks of 50 ticks (5 s of market time); a block still forming is left out. Each block's hash is `SHA-256(prevHash + height + timestamp + txs)`, computed with Web Crypto. Gas is shown per transaction (L$0.01, up to 4x in busy blocks) and clearly labelled as not charged.
- **`#/explorer`.** The chain, newest first. Each block opens to its first 40 transactions. The tamper demo changes the player's first trade (or the day's first trade) to 1,000x its amount; that block and every later one turn red with a text label, and Undo restores them. Short cards cover wallets and keys (concept only), confirmations and gas. The market pauses while the explorer is open, as it does on `#/create`.
- **Basic / Advanced.** Desktop only: the toggle is hidden below 1024 px, and Advanced renders only when the screen is at least 1024 px wide. The phone Lab is unchanged except for the blockchain card (13+, below the news). Advanced adds:
  - "Who's trading <coin>": buys and sells by trader type over the last market day.
  - For Builder, the wash-volume overlay (amber over the total, with a legend), and Penny's `wash_volume` lesson the first time it shows.
  - The blockchain card, for Explorer too.

  The choice is saved as `store.labAdvanced`.

## Lab tools and mission metrics (slice J5, BRIEF §14)

- **Indicators.** `sim/indicators.js` provides `sma(values, n)` and `rsi(values, 14)` (Wilder smoothing), computed on candle closes.
- **Chart tools.** Each tool is a chip under the chart with an ⓘ explainer saying what it shows and what it can't tell you:

  | Tool | Who gets it |
  |---|---|
  | Volume | Everyone |
  | SMA 7 / 25 | 13+ |
  | RSI 14 (own pane, 30/70 lines) | 16+, or in desktop Advanced |

  A tool is on by default when the tier has it, so Explorer starts with volume only. RSI needs 15 candles, so its pane is empty for about the first 30 s.
- **Price impact.** The trade preview reads "Buying L$X moves the price about Y%", or "Selling N COIN moves the price about Y%", before every trade, with an ⓘ.
- **Portfolio.** For every tier: an allocation bar (cash and each coin in its colour), total profit or loss, and each holding's profit or loss at average cost.
- **Metrics.** At close, `store.lab[tier].metrics` = `runMetrics(final, quiz)` from `sim/metrics.js`, with exactly the §14 keys:
  - `maxSingleExposurePct` and `minCashPct`: the per-tick maximum single-coin share and minimum L$ cash share, as percentages with 1 decimal.
  - `panicSellsAfterNegativeEvents`: sells of a whole position within 10 s (100 ticks) of a negative event.
  - `heldBloopAtRug`: the player held BLOOP when `rug_pull` fired.
  - `coinLaunched`: `{ lpLocked, outcome }`, where `outcome` is `'graduated'`, `'rose'` or `'fell'`; `null` when no coin was launched.
  - `quizCorrect` and `quizTotal`: the event questions answered in the Lab.
  - `finalValue`: rounded to cents.

## Coach mode (slice J7, BRIEF §15)

- **Engine.** `screens/coach.js` spotlights the real element with a ring whose shadow dims the rest of the page, and pauses the market while it runs.
  - On phones the card docks to the bottom, and the page scrolls so the element sits in the space above it. If the page can't scroll that far, the card flips to the top, so it never covers the element.
  - On wider screens the card floats below, above or beside the element. Marks follow their element on scroll and resize.
  - Steps that ask the child to do something (type an amount, tap Buy, launch) wait for it, and offer "Skip this step".
  - Esc or × closes the coach. A chapter in progress survives route changes, so chapter 5 runs through `#/create` and back.
- **Content.** `public/data/coach.json` holds the 5 chapters. A step has an optional `target` (CSS selector), `route`, `tiers`, `wait` (`tradePreview`, `tradeDone` or `launch`), `go` (navigate on Next), `art` (candle diagrams) and `drill`. Steps a tier can't see are filtered out. Chapter 5 skips its Create steps when a coin is already out, and opens after Penny's first news.
- **Drills.** `sim/drills.js` replays today's market in a sandbox session, with the same seed and the same whale:
  - `whaleDrill()` runs panic versus hold, ending 30 s after the dump. Holding won on 6 of 6 days tested, about L$955 against L$900.
  - `copycatDrill()` runs a Builder launch with an unlocked pool, so "Demo Coin Official" appears and is rugged.

  The player's real market is never touched.
- **Offer and XP.** The chapter menu opens automatically on the first Lab visit per tier ("Explore on my own" closes it), and the Lab's Coach button reopens it. Completing a chapter writes `store.coach[tier].done[chapterId] = { at, xp: 20 }`; the Learning Path (Y7) reads it to award XP and count it toward the daily goal and streak. `onChapterDone(fn)` lets other features react; J8 mints a badge there.

## Soulbound badges (slice J8, BRIEF §15)

- **Minting.** `screens/badges.js` provides `mintBadge(store, { kind: 'coach' | 'unit', ref, tier })`. It mints once per badge and keeps `store.badges[id] = { id, kind, ref, tier, at, hash, onChain }`.
  - `hash` is SHA-256 of the mint record. When a market is open, the mint is also a transaction in today's chain, from `session.recordMint(id)` with `who: 'mint'`. The explorer lists mints first in their block and gives that block a "Badge mint" chip.
  - Badge ids: `coach:<chapterId>`, one per chapter, and `unit:<tier>:<n>`, because each level's units differ.
  - The module doesn't import the Lab, so the Learning Path can use it without loading the chart.
- **For Yotha (Y7).** Call `mintBadge(store, { kind: 'unit', ref: '1', tier })` from `path.js` when a unit is completed. Coach chapters already mint through `onChapterDone`.
- **Gallery.** It sits at the top of `#/explorer`, works even before a market opens, and has an empty state. Each card shows the badge, how it was earned, when it was minted, the mint transaction's hash, and "Soulbound · no price". An NFT lesson card sits next to it.
- **No trading.** Badges have no price, no trade or transfer controls, and no market. All badge art is original SVG drawn in `badges.js`.

## Avatar and Future You (slices J10a and J10, BRIEF §16)

- **Avatar.** `public/js/avatar.js` exports `render(character, age)`, which returns an SVG string, plus `dataUri()`, `OPTIONS`, `LABELS` and `AGES`.
  - `character = { skin, hairStyle, hairColor, outfit, glasses }`, with no gender field. Every value is looked up in fixed tables, so caller text never reaches the SVG, and it uses no style attributes.
  - Ages snap to 25, 40, 60 or 80. Hair greys and thins, and lines appear on the forehead and around the eyes and mouth.
- **Future maths.** `sim/future.js` `project(data, plan)` runs a monthly, seeded Monte Carlo of at least 500 paths. One fixed seed, `hashString('future-you')`, with the same seven draws every month, so every plan and scenario runs on the same paths: saving more never lowers a percentile, and a shock that starts after the plan ends changes nothing (J13 QA).
  - New saving goes in by the chosen mix, spending comes out of every asset in proportion, and the plan is rebalanced to the mix once a year. Spending per month is capped like saving.
  - It runs in a module worker (worker-src falls back to script-src 'self'), with a main-thread fallback after 8 s or an error.
  - Four assets (cash, Thai bonds, Thai stocks, global stocks in USD), with correlated stocks.
  - A price index with an inflation scenario (low, target or high), and a THB/USD path (steady or weak baht).
  - Optional 12-month shocks for 1997, 2020 or 2022, as economic variables only.
  - Contributions are in today's baht and rise with prices, and every output is real (nominal ÷ price index). With spending after the goal, it reports the share of paths that last to the life-expectancy basis, or to 90.
- **Data.** Every constant is in `public/data/future_th.json` with its source and retrieval date (2026-10-16); a test enforces this. Values that `docs/SOURCES.md` doesn't verify are marked [unverified] in both files.
- **Screen.** `#/future` has Quick (age, saving, goal age), Standard (adds savings so far, mix and inflation) and Pro (adds a custom mix, baht, historical shock, life-expectancy basis with "plan to 90", and spending).
  - Your avatar now and at the goal age, the P10/P50/P90 fan with a table fallback, and "Projection, not prediction" always visible.
  - Amounts are shown as "THB", because the baht sign (U+0E3F) is in the Thai Unicode block that `bin/check.mjs` rejects.
  - Inputs persist in `store.future`.
  - Changing any input logs `logAction(store, { kind: 'future', xp: 5, ref: 'future:<Bangkok day>' })`, so planning counts once a day toward the streak and daily goal. Just opening the screen doesn't count.

## Piggy Bank and Farm (slice J11, BRIEF §16)

- **Piggy rules.** `sim/piggy.js` holds them, tested. Points ("feed", the same word as on the Farm; "seeds" means only the Orchard's seeds) go to log (2, three a day), plan (3, two a day), reflect (3, once a day) and streak (2, on the first action of a day that continues a streak). The daily cap is 12.
  - The reward API has no amount parameter, so the amount can never change the reward.
  - Challenges: Calendar saves the date's number. Birthday year saves 1 to 365 from a start date the user picks ("your birthday or today"), so no birth date is stored. 52 weeks saves 10 × the week number.
  - `store.piggy = { goals, entries, reflections, challenges, rewards, monthlyExpenses }`. `entries[].verified` (set by the parent link) shows a "Verified by a parent" chip only.
  - Adults (20+ from the birth year) see an emergency fund of 3–6 months of expenses. There are no leaderboards and no comparisons.
- **Farm rules.** `sim/farm.js` computes feed = Piggy feed + 5 per finished Learning Path step (lesson, mission or checkpoint, from `store.path`) + 5 per Coach chapter + 3 per Bangkok day with a finished market, per level + 2 per day with any action (J13 QA).
  - A day whose only action is the wallet's starter grant doesn't count. Feed never goes down, so a broken streak takes nothing away.
  - Cows are born at 5, 60 and 150 feed, and grow from calf to young (15) to grown (35) on the feed earned since birth.
  - Traits (name, coat, pattern, bell, horns, a rare star in about 1 in 10, milk 2–4 litres) are seeded from the cow id and the farm's seed.
  - Grown cows give milk once per Bangkok day, sold at L$5 a litre.
- **Birth certificates.** Each birth mints a soulbound certificate through `mintBadge(store, { kind: 'cow', ref, meta })`. It's a badge id `cow:<id>`, shown in the explorer gallery with its hash, and on today's chain when a market is open.
- **Routes.** `#/piggy` and `#/farm` are registered through `public/js/buildings.js` (not on main yet).

## Shared money contract (v4)

Agreed with Yotha on 16 October 2026 and kept word for word in both sessions, so it changes only when both agree.

- **One currency name, L$.** The Town wallet, the Arena and the Lab all count in L$. "Coin" only ever means a crypto coin.
- **Town wallet** (`public/js/wallet.js`, on the device). `getBalance(store)` returns the balance in L$, to the cent. Any change to the balance fires the window event `wallet:change` with `detail: { balance }`, whatever caused it: a post, the starter grant, progress swapped in from an account, or a reset. The watch starts on the first `getBalance()` or `post()` for a store, and fires only when the balance changes. `moneyText(n)` writes an amount as `L$12.50`.
- **Arena wallet** (the server, Yotha). A Town→Arena transfer goes through `POST api/arena.php` with `action=transfer`, at most 200 L$ per account per Bangkok day. The Town wallet is debited, with `post()` and a negative amount, only after the server accepts.
- **Lab.** Each market session keeps its own Practice L$. They start fresh with each market and never reach the Town wallet or the Arena.
- **Piggy Bank.** Real THB, never L$.

## Town wallet and Orchard (BRIEF §16.1)

- **Wallet.** `public/js/wallet.js` keeps `store.wallet = { ledger: [{ id, at, amount, kind, note, ref }], credit: { score, events } }`.
  - The ledger is only appended to, and a spend that would take the balance below zero is refused.
  - Every player gets an L$50 starter grant once, so the Orchard and Stall work before any cow gives milk. Milk sales post to the wallet, and farm earnings from before the wallet were moved in once.
  - The credit score runs 300–850 and starts at 600, with every change kept. `rateFor(score, base)` makes the best score borrow at 0.6× the base rate and the worst at 1.5×.
- **Orchard.** The rules are in `sim/orchard.js`, tested.

  | Plant | Cost (L$) | Ready in | Harvest (L$) |
  |---|---|---|---|
  | Herb sprout | 5 | 2 minutes | 6, once a day in each plot |
  | Fruit tree | 10 | 1 day | 20 |
  | Big mango tree | 20 | 7 days | 100, then 15 more every day |

  Waiting pays most per day, as the lesson says (J13 QA): the big tree earns +80 in its first week and then +15 a day, against +10 a day for a fruit tree and +1 a plot a day for sprouts.

  It has four plots and real-time growth, with countdowns updating each second; the card only redraws when a stage changes.
- **Time preference.** Each planting is recorded in `store.orchard.choices` with `patience` set to `now`, `soon` or `later`. `revealedPreference(choices)` returns `{ count, laterShare, nowShare, lean }` for the Money Type screen's "Your choices look more Later than your quiz said".

## Daily Stall and Bank (slice J12, BRIEF §16.1)

- **Stall rules.** `sim/stall.js` holds them, tested.
  - Seven goods; four are picked by the Bangkok date, so everyone sees the same line-up and prices. Each good gets a seeded opening price, then a walk every 10 minutes with a gentle pull back toward the open.
  - The stall buys back at 10% under its selling price. Fish and garlands spoil after 1 day, mangoes after 2, coconuts after 5; rice, pots and kites keep.
  - `store.stall = { holdings, trades }`. Buying debits the wallet, or the Town Card when one is open.
  - When the player has an unpaid loan, a just-in-time warning about borrowing to speculate shows above the goods.
- **Bank rules.** `sim/bank.js` holds them, tested.
  - Loans charge simple interest per real (Bangkok) day, counting the first day. The quote shows the total cost before the player agrees. The game rule caps total interest at the principal, and the screen says real loans have no such cap.
  - The Bank's rate is 1% a day, adjusted by `rateFor(score)`. Quick Cash lends L$30 for 3 days at 15% a day.
  - Credit changes: on-time full repayment +20, late −40 (once per loan, settled when the Bank opens), restructuring −10 once. A restructure freezes interest and splits what's owed into 4 weekly payments, and is always offered.
    - J13 QA: the +20 counts only for a loan repaid on a later Bangkok day than it was taken, never late or on a plan, and at most once every 7 days, so borrow-and-repay can't farm the score. A plan made before the due date includes the interest up to the due date. A loan repaid in full is closed and builds no more interest.
  - Borrowing limit (J13 QA): the Bank lends only while everything owed on loans plus the new loan stays within `limitFor(score)` (50–200), and not while any loan is late. Quick Cash checks nothing but lends one loan at a time. The card says why it refuses.
  - Town Card: the limit is 50–200 by score, with weekly statements. The minimum is 10% (at least 5), due 3 days after the statement. A missed minimum is −40 the day after the due date, once per statement, and the card says so. Unpaid statement balances add 5% a week, capped at what was spent on the card.
  - The minimum-payment calculator is uncapped, at the game's 5% a week, and says game rates are much higher than real ones.
  - With two or more loans, the payoff card compares highest rate first with smallest first at L$10 a day (Gal & McShane 2012), using the game's own interest rule. When both orders cost the same it shows one line. The citation shows at Builder; Explorer copy uses plainer words and costs in L$ a day.
  - `store.bank = { loans, card }`.
- **Real-world figures.** The "Real life in Thailand" card shows no numbers yet, only that limits exist, and points to the [unverified] SOURCES entries until they're checked.

## Lab tools: orders, contract and depth (slice J9)

- **Orders.** From age 13 (tier rank 1 and up), the trade panel has Market, Limit and Stop-loss. Explorer keeps the plain Market trade, and Market mode is unchanged.
  - The session holds the orders: `placeOrder({ coinId, type, price, amount })` with `limit-buy` (L$ to spend, price below today's), `limit-sell` (coins, price above) and `stop-loss` (coins, price below), plus `cancelOrder(id)`.
  - After the NPCs trade each tick, any triggered order becomes an ordinary swap at that tick's price. In a fast drop a stop-loss fills below its level: in the whale dump a stop at L$118 filled near L$99. The ⓘ explainers say so: a limit may never fill, and a stop-loss can sell lower than its level or sell out at the bottom of a dip that bounces back.
  - Orders don't reserve cash or coins. If there isn't enough when one triggers, it fills what it can, or fails with a notice.
  - Open orders lapse when the market closes, including after Finish now.
  - Orders are player actions, so the NPC market stays deterministic (tested).
- **Your coin's smart contract (Builder).** A read-only, plain-language view of the rules the coin launched with. It shows fixed supply with no mint function, the split, the team unlock, own vesting, pool locked, the trade fee and owner powers. An unlocked pool shows `withdrawPool()` as a risk. It ends with three checks to make before buying any coin.
  - It sits outside the coin card's per-tick redraw, so it stays open while the market runs.
- **Pool depth.** From age 13, "How deep is the pool?" draws the L$ it takes to push the selected coin's price from −30% to +30%, straight from the x · y = k curve (`depthTo` in `amm.js`, fee ignored).
  - Selling down never takes out more than the real L$ in the pool, so a fresh bonding curve shows no down side.
  - It also says how far spending all your cash would move the price. It only redraws while open.

## Cow Fair (BRIEF §16 stretch)

- **Cow cards, not cows.** Collectors at the fair trade cow cards, which are pictures of cows. Your own cows are never for sale: they are earned, and their birth certificates are soulbound.
- **Pretend tickets.** Each visit gives 100 fair tickets, separate from the Town wallet, so a bubble can't drain the L$ earned in other buildings.
- **Rules.** `sim/fair.js` holds them, tested.
  - Each round has 8 one-of-a-kind cards, seeded by the Bangkok date and the round number, so replays differ. Three cards share one hyped trait: star mark, gold bell, belt pattern or honey coat.
  - The round lasts 40 steps of 1.5 seconds. The hyped cards climb to 6–9 times their start, hold, then crash to about a third of it. For four steps of the crash nobody buys them at all, which teaches that a quoted price means little when there are no buyers.
  - Ordinary cards drift, and dip a little while everyone chases the hype.
  - You buy 3% over the middle price and sell 3% under it.
- **NPC hype.** Scripted fair news lines track the phases, from "a famous collector just paid a lot" to "hardly anyone new is arriving" to "nobody wants to buy".
- **Result and lesson.** The result says whether you bought early or near the top and whether you held through the crash. The lesson explains the greater-fool mechanism, and contrasts your cow's daily milk with a card that makes nothing. It cites CryptoKitties (2017) and Axie Infinity (2022) from the SOURCES entry still marked [unverified].
- **Store.** `store.fair = { played, last: { end, date, trait } }`.

## Module loading (J13)

- **Shared coin pieces.** `screens/coinkit.js` holds the coin glyphs and badge, design notes, the contract view, `coinAmount`, `WHO` and the open-market handle (`currentMarket`, `liveMarket`, `setLiveMarket`). Create, the block explorer and the Piggy Bank import it, never `lab.js`.
- **Chart library.** The library (about 200 KB) loads only in the Lab, by dynamic import alongside today's data, while the Lab shows "Opening today's market…".
- **Create.** `create.js` is a light shell. It draws the screen with "Getting the coin designer ready…" at once, then loads `coin-designer.js`. If that fails, it shows an error with Try again and Back to the market, instead of the router's bare "Loading…".
  - Once Create opens up, the Lab calls the shell's `prefetch()` (the Lab imports the 2 KB shell), so the trip from the market is usually instant.
  - A failed dynamic import stays in the page's module map, so Try again asks for `coin-designer.js?retry=N`, and the Lab's chart library retries the same way. A reload is never offered, because it restarts today's market.
  - The shell checks `blockedReason(market)` from `coinkit.js` first. With no market, a closed one, a coin already out or no news yet, it says so without loading the designer and the Coach.

## QA pass (J13 QA)

The findings, their status and what was tested are in `docs/QA-joewee.md`. Rules shared across the screens:

- **Focus.** An action never leaves focus on the page body. When it rebuilds part of a view, focus goes back to the same control or to a nearby heading or message (tabindex −1, no scroll). After the Lab draws, it focuses its h1 only when the router left focus on `#main`, so a first page load keeps its focus. The Coach gives focus back to where it was when it opened, except on a route change.
- **Disabled controls.** One look in every Joewee screen: surface-2 background, line border, ink-500 text, no shadow, not-allowed cursor. Controls that must keep focus use `aria-disabled` and say why when pressed (the trade submit, fair Buy and Sell, orchard seeds).
- **Words by level.** Explorer never sees "bonding curve": the chip says "New coin: N% grown" and the card "N% of the way to its own trading pool". Trader and Builder say "Bonding curve: N% of the way to a real pool". Lab money is always "L$9,000", never "9,000 L$".
- **Chart lines.** SMA 7 is solid blue and SMA 25 dashed pink, with a legend, and the copy names both. The chart has a text alternative that updates once per candle.
- **Money.** Town wallet amounts use `moneyText()` (`L$12.50`), or `coinText()` for a bare number, from `wallet.js`: cut to the cent, never rounded up.
- **Lab.** Fills in one tick give one notice and one announcement. A stop-loss that fills below 0.97 × its trigger is shown in amber. Open orders that lapse at the close are named in the closing panel. News that arrives while Penny's dialog is open waits in `market.queued`, even across a visit away. The wash bot is shown and explained only at Builder, in the explorer and in Who's trading.
- **Coach.** `coach.json` steps can be `interactive` (taps reach the page), `live` (the market runs), `optional` (skipped when the target isn't shown) and `also` (a second element lit with the first), and `title`/`body` can differ for Explorer. Chapter 2 is "Your chart tools". A replay is practice: no new XP or badge, and a badge already minted at another level says "You already have this badge".
- **Create.** Every roster ticker counts as taken, hidden coins included. A name reads as a real coin when a word, or the name without filler words, is a real ticker or brand, or it contains a made-up coin word. An allowlist keeps everyday words like Arsenal and Cockatoo. A half-made coin is kept as `market.draft` until it launches.
- **Block explorer.** It seals only the level's own transactions and badge mints. The tamper demo edits a trade, never a mint. The forger reseals later blocks, so each red block shows its new fingerprint against everyone else's.
- **Piggy Bank.** Amounts and targets are whole baht. Taking out more than was written down is refused. Entries and goals can be removed, with one Undo. Starting a goal or a challenge counts toward the streak. Challenges have start dates from the past year to a year ahead, and a restarted challenge begins fresh.
- **Cow Fair.** The hype rise starts with the collector news (step 3). The result buckets are early, near the top (steps 14–24), the crash and after.
- **Stall.** A trade uses the price at the moment of the tap, and refuses with "The price just changed" if it moved. Spoil copy names the last night.

## Config location

- The sim configs live in `public/data/`, so the browser can fetch them (brief §8/§11 as amended). The Lab loads them and passes the parsed objects to `createSession()`; the engine never fetches anything itself.
