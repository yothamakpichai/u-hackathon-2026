# U-Hackathon 2026 — Market Lab (team Cenedury) — BRIEF v2

Single source of truth. Read all of it before writing code. This brief replaces v1 entirely.

## 0. Hard facts

- Event: U-Hackathon 2026, AI track. **Submissions close Fri 16 Oct 14:00 ICT.** Feature freeze 12:00.
- Rule: "Existing Project is NOT allowed. Pre-research is acceptable." Every line of code is written in this repo during the event. Do not import code from elsewhere. Vendored third-party libraries are allowed if their licence permits it.
- Submission: public GitHub repo, a demo site that shows the real product (`https://u-hackathon-2026.cenedury.com`), and a pitch deck.
- Judging:

  | Weight | Criterion |
  |---|---|
  | 40% | App execution |
  | 40% | Practicality |
  | 10% | Usability & design |
  | 5% | Innovation & ecosystem (partners: ElevenLabs, Tokenomist, Avalanche) |
  | 5% | U-Bot |

- First-round judges open the link on their own device, often a phone, possibly with **sound off**, hours after submission, without us present. The worst moment of the demo sets the score.
  - Every path must work.
  - Every state explains itself.
  - Every voice line also appears as on-screen text.
  - Unfinished features are deleted, never shown disabled.
- Deploy: push to `main` → GitHub webhook → Plesk auto-deploys → live in seconds. Document root is `public/`. Server is PHP 8.3 with Apache behind nginx, so `.htaccess` works.
- **English only, everywhere.** No language toggle. No Thai strings in the UI.

## 1. Product

**One line:** A safe, simulated crypto market where kids aged 8–16 learn how money and markets really work, including how hype, unlocks and scams move prices, so they grow up as the generation nobody can fool.

**Positioning rules (non-negotiable):**
- Simulation only. No real money, no real crypto, no wallets, no deposits, no links to exchanges, no "buy real crypto" prompts anywhere.
- A persistent badge reads `Simulation · No real money`. The footer on every screen reads: "Educational simulation. Not financial advice. No real cryptocurrency is bought, sold or held."
- Kids learn to **recognise** manipulation, never to perform it.
  - Scams, rug pulls and wash trading are done only by NPC agents.
  - No user, at any age tier, can rug, wash-trade or deceive.
- No accounts, no sign-up, no personal data, no cookies, no analytics, no third-party requests. State lives in `localStorage`. The leaderboard stores only an auto-generated nickname, tier, score and date.
- Brand: **Cenedury** builds it. **EDUU** is the official in-game coin. Never claim that real students receive EDUU today; that belongs on the roadmap slide.

**Working name:** `Market Lab`. It is defined once as `PRODUCT_NAME` in `public/assets/js/config.js`, so renaming is a one-line change.

## 2. Age tiers (the product's core logic)

The tiers follow cognitive development plus legal thresholds. The same features appear in every tier with progressive depth, Duolingo-style.

| Tier | Why this boundary | Coins visible | Create-a-coin knobs | Lens |
|---|---|---|---|---|
| **Explorer 8–12** | Money habits form by about age 7 and thinking is concrete. Money is exchange; earn / save / spend / share; waiting pays. | VAULT, EDUU, PEG | Name, icon, colour, total supply | Scarcity: "make more, each is worth less" |
| **Trader 13–15** | Abstract reasoning develops: probability, risk, supply and demand. Age 13 is the common digital-consent line. | + FUEL, ORBIT, ZOOMZ | + allocation split (you / team / public) + launch hype | Concentration risk; hype cycles |
| **Builder 16+** | Approaching legal autonomy; can handle speculation and token design. | + BLOOP, wash-volume overlay | + bonding-curve launch, LP lock on/off, vesting for own allocation | Full launch anatomy and rug recognition |

Graduation to real markets happens at legal majority (20 in Thailand). That is roadmap only, shown on a single "For parents" card with no link.

## 3. The judge path (about 3 minutes, mobile-first)

1. **Welcome.** Mascot Penny, one sentence, the badge, and three big tier buttons. A small "For parents" card explains safety. No sign-up.
2. **Money Health Check.** Three questions for the chosen tier, each narrated (audio plus caption).
   - Pass (≥ 2/3) unlocks the Lab.
   - Fail leads to one **lesson**: 4 cards, each with a micro-interaction, then a 1-question quiz, then the Lab unlocks with a celebratory animation.
   - Also show a "Skip for demo" link, small and honest, labelled `Skip check (demo)`, so judges in a hurry are not trapped.
3. **Market Lab: Today's Market.** Every player gets the same daily scenario (Wordle-style; the seed is the Bangkok date) lasting 4 real minutes, which represents 30 simulated days.
   - Live candlestick chart, coin list, buy/sell panel, portfolio, and L$1,000 starting cash.
   - Prices are driven by AMM pools plus NPC agents (§5).
4. **Events.** Events fire at fixed offsets. Penny pops in with tier-specific narration plus a one-question check, then the market continues.
5. **Create a coin.** Available from the Lab once ≥ 1 event has been seen. The knobs depend on tier (§2).
   - The user chooses a curated icon and colour plus a name and ticker, then launches. Agents react, and the outcome is explained.
   - The user's coin is always honest. Its risk comes from its design (over-supply, greedy allocation, no LP lock leaves holders exposed to an NPC copycat attack), never from the user cheating.
6. **Report card** when the market closes, or via "Finish now".
   - Money Health Score with an explainable breakdown, plus "3 things you learned".
   - Nickname plus leaderboard for today's market and tier.
   - Replay button.
   - Score wisdom, not profit (§6).

Desktop (≥ 1024 px) gets a **Basic / Advanced** toggle in the Lab. Advanced adds:
- agent order-flow breakdown;
- the real-vs-wash volume overlay (Builder tier);
- the block explorer (§7).

Mobile shows Basic only.

## 4. Coin roster (all fictional; never use real tickers or brands)

Quote currency is **L$ (Lab Dollar)**. The PEG stablecoin targets L$1.00.

| Coin | Class | Supply model | Teaching point |
|---|---|---|---|
| **VAULT** | Store of value | Hard cap 21,000,000; issuance halves on a fixed schedule ("halving") | Scarcity; issuance schedules |
| **EDUU** | Official Cenedury coin (education rewards token) | Fixed supply; transparent emissions to a "learner rewards" pool | Emissions and transparency |
| **PEG** | Stablecoin | Collateralised 1:1; arbitrage agents defend the peg | What "stable" means; depeg risk |
| **FUEL** | Platform / utility | Inflationary issuance plus a burn per transaction | Net supply = issuance − burn |
| **ORBIT** | Partner-style project token | Team/investor allocations with cliff + linear vesting | Unlocks create sell pressure |
| **ZOOMZ** | Meme (survives) | Bonding-curve launch, then AMM; hype-driven | Hype cycles; volatility |
| **BLOOP** | Meme (NPC rug) | Creator holds the LP and pulls it at the scripted time | Rug-pull anatomy and red flags |

If a Tokenomist key is available, ORBIT's vesting curve may be derived from one real token's public unlock schedule, scaled to sim time. Cite it as "modeled on real-world unlock data from Tokenomist" and never show the real token's name. Otherwise use a typical cliff + linear schedule. ORBIT is optional polish, not a dependency.

## 5. Simulation engine (`public/assets/js/sim/`, pure ES modules, no DOM)

### Time

- Fixed-step ticks of 100 ms of real time.
- Session = 2,400 ticks (4 minutes). 1 sim day = 80 ticks.
- `tick()` is deterministic given the seed and the player's actions.

### Randomness

A seeded PRNG (mulberry32 or xoshiro128**). The seed is `hash("market-lab:" + YYYY-MM-DD Asia/Bangkok)`. Never use `Math.random()` inside the sim.

### Pricing

- One constant-product AMM per coin against L$: `x · y = k`, with a 0.3% fee.
- Price = reserve_L$ / reserve_coin. Swaps move the price, so slippage and price impact are real.
- Meme coins launch on a **virtual bonding curve**, pump.fun-style: virtual reserves at start, graduating to an AMM pool at a threshold. Parameters live in `data/coins.json`.
- PEG runs at a pinned price, with a depeg event that pushes it to about 0.96. Arbitrage agents restore 1.00 over about 20 s.

### Agents

Each archetype is a parameter block in `data/coins.json` or `data/agents.json` and is evaluated every tick.

| Archetype | Behaviour |
|---|---|
| `retail` | Many agents, small random trades, slight momentum bias |
| `momentum` | Buys rising and sells falling over a lookback window (amplifies moves) |
| `value` | Buys when price is below its moving average, sells above |
| `whale` | Rare, very large orders; scripted dump event |
| `panic` | Sells after negative events, then decays |
| `insider` | Holds vesting allocations and sells part of each unlock |
| `hype` | Bursty buying driven by a per-coin hype variable that decays |
| `arb` | Defends PEG |
| `rugger` | NPC creator of BLOOP; removes liquidity at the scripted time |
| `wash` | NPC wash-trading bot: inflates volume with self-trades, so price barely moves |

The wash bot is shown and explained only in the Builder tier, with the overlay "real vs wash volume". It answers the obvious judge question about bots pumping volume: in our lab, bots *exist so kids learn to spot them*.

### Events

The ids are fixed and form the contract with the narration content.

| Offset (s) | id | Coin | Tiers |
|---|---|---|---|
| 35 | `hype_wave` | ZOOMZ | 13+ |
| 70 | `halving` | VAULT | all |
| 105 | `unlock` | ORBIT | 13+ |
| 140 | `whale_dump` | VAULT | all |
| 175 | `rug_pull` | BLOOP | 16+ |
| 205 | `depeg_scare` | PEG | all |
| any (Builder, Advanced) | `wash_volume` | FUEL | 16+ |

The Explorer tier sees `halving`, `whale_dump` and `depeg_scare` so that it still gets three teaching moments.

### API (the contract with the UI)

```js
createSession({ seed, tier, coinsConfig, agentsConfig, scenario }) -> session
session.tick()                         // advance one step
session.swap(coinId, 'buy'|'sell', amountL$OrCoins) -> { ok, filledCoins, filledL$, priceImpactPct, error }
session.createCoin({ name, ticker, iconId, colorId, supply, allocation?, lpLocked?, vesting? }) -> coinId
session.getState() -> { t, coins:{[id]:{price, candles[], volume, washVolume, supply, holders}}, portfolio, events[] }
session.on('event', cb)                // cb({ id, coinId, t })
session.on('close', cb)
```

### Unit checks

Plain Node, run by `bin/check.mjs`, in `public/assets/js/sim/*.test.mjs`. They must cover:
- the AMM invariant holds after swaps;
- the same seed with the same actions gives an identical state;
- the 21M cap is never exceeded;
- PEG returns to within ±0.5% of 1.00 after `depeg_scare`;
- BLOOP's price falls by ≥ 90% at `rug_pull`.

## 6. Money Health Score (0–100, explainable)

| Component | Points | Rule |
|---|---|---|
| Knowledge | 30 | Health check + event quizzes answered correctly |
| Risk management | 25 | Max single-coin exposure ≤ 50% of portfolio for most of the session; keep ≥ 10% in L$ or PEG |
| Scam avoidance | 20 | Exposure to BLOOP at `rug_pull` (Builder) or to the copycat coin; full points if none |
| Composure | 15 | No sell-everything within 10 s after a negative event |
| Returns | 10 | Final value vs L$1,000, capped at +50% |

The report card shows each component with a one-line reason. The leaderboard ranks by score, not by profit, and says so.

## 7. Blockchain layer (honest simulation, real cryptography)

- Every swap in the session becomes a transaction. Every 5 s, a block is formed:
  - `hash = SHA-256(prevHash + height + timestamp + txs)` via `crypto.subtle`;
  - a fee ("gas") is shown per transaction.
- **Block explorer** (Advanced / desktop, and a simplified card on mobile at 13+): a chain of blocks, each opening to its transactions.
- **Tamper demo:** edit an old transaction. Its hash and every later block turn red, explaining "why history can't be quietly rewritten".
- Lesson cards cover wallets and keys (concept only; never generate or display real seed phrases), confirmations, and fees.

## 8. Content (in `public/data/`, generated at build time, reviewed by a human)

Every `data/…` path in this brief means `public/data/…`: the browser loads these files and the document root is `public/` (DECISIONS.md #1).

| File | Contents |
|---|---|
| `data/gate.json` | Per tier: 3 questions `{id, prompt, options[3], answerIndex, explain}` |
| `data/lessons.json` | Per tier: 1 lesson of 4 cards `{title, body (≤ 45 words), interaction:{type, ...}}` + 1 quiz |
| `data/events.json` | Per event id × tier: `{headline, narration (≤ 60 words), question:{prompt, options[3], answerIndex, explain}}` |
| `data/tutor_faq.json` | Per tier: 6 suggested questions `{id, question, answer (≤ 60 words), source}`; `source` is `claude` or `u-bot` |
| `data/facts.json` | Canonical facts the generator must not contradict. 21M cap; halving roughly every 4 years in Bitcoin's design; AMM `x·y=k`; stablecoins can depeg; unlocks increase circulating supply; wash trading inflates volume without real demand; rug pull = creators remove liquidity. |
| `data/coins.json`, `data/agents.json` | Sim parameters (owned by Joewee) |

Voice for kids:
- Short sentences and concrete examples.
- No fear-mongering, no hype language, no real coin names.
- Never "you should buy/sell" about real assets.
- English only.

## 9. AI and voice

**Claude API** (key `ANTHROPIC_API_KEY`, server only):
- **Build time** (`bin/generate-content.mjs`, Node, run locally, outputs committed): model `ANTHROPIC_MODEL_CONTENT` (default `claude-sonnet-5-5`). Use tool use with a JSON `input_schema` per file to force structure, then validate against the schema and `facts.json` before writing.
- **Runtime "Ask Penny"** (P1, `public/api/tutor.php`): model `ANTHROPIC_MODEL_RUNTIME` (default `claude-haiku-5-5`).
  - `max_tokens` 300, temperature 0.3.
  - System prompt sets the persona and safety rules, with prompt caching on the system block.
  - Input ≤ 300 chars. Strip and refuse emails, phone numbers and URLs.
  - Refuse real-asset advice, price predictions, personal questions and off-topic requests with a friendly redirect.
  - Per-IP limit 6/min; `DAILY_AI_CAP` global daily cap. On cap, serve suggested-question answers from `data/tutor_faq.json` only.
- Before the API is wired, the UI uses `data/tutor_faq.json`.

**ElevenLabs** (key `ELEVENLABS_API_KEY`, voice `ELEVENLABS_VOICE_ID`):
- **Build time** (`bin/generate-audio.mjs`, Node): text-to-speech for every narration string in `gate/lessons/events` into `public/assets/audio/<id>.mp3`, committed.
  - Use the highest-quality English model in the current docs.
  - Choose a **premade library voice** (warm, clear, friendly). Never clone a real person.
  - Record the model id and voice in DECISIONS.md.
- **Runtime** (P2, only if time allows): the tutor's answer is streamed through the low-latency model. If anything fails, show text only.
- The audio player:
  - always shows captions;
  - starts muted-safe (the first play follows a user gesture);
  - has a global mute toggle remembered in `localStorage`.

**U-Bot:** no public API. A team member uses U-Bot to draft part of `data/tutor_faq.json`. The README and deck state exactly what U-Bot produced. Do not fake an integration.

## 10. Design system ("world class", modern, credible; no slop)

- **Feel:** Duolingo's warmth × a pro trading app's precision. One mascot, generous whitespace, strong hierarchy, real data density only in the Lab.
- **Fonts:** self-hosted woff2 (OFL), with no Google Fonts requests.
  - **Nunito** for headings and UI labels.
  - **Inter** for body and all numbers (`font-variant-numeric: tabular-nums`).
- **Colour tokens** in `tokens.css`:
  - neutral ink/surface scale;
  - primary `#0DA678` (also EDUU's colour);
  - accent amber, warning and loss red, gain green;
  - each coin has a token colour.
  - All text meets WCAG AA. Gains and losses are never shown by colour alone (use an arrow and a sign too).
- **Motion:** CSS/WAAPI only.
  - 150–300 ms ease-out.
  - Celebratory moments: unlock, coin launch, report.
  - `prefers-reduced-motion` disables non-essential motion.
- **Mascot Penny:** an original round coin-sprite drawn as inline SVG, with 4 expressions (happy, thinking, worried, celebrating). It must **not** resemble Duolingo's owl, the MetaMask fox, Doge/Shiba, Pepe or any existing character.
- **Coin icons:** an original set of 24 geometric SVG glyphs plus 12 colours, shared by the fictional roster and user-created coins.
  - No emoji images, no third-party icon sets, no logos.
  - User coin names: 3–16 letters/spaces. Tickers: 3–5 A–Z.
  - Block real major tickers and brands (BTC, ETH, USDT, USDC, BNB, SOL, XRP, DOGE, SHIB, PEPE, AVAX, TON, ADA, TRX, LINK, DOT, MATIC, LTC, BCH, XLM, UTOPIA, EDUU) and a small profanity list. Show a friendly error.
- **Chart:** TradingView Lightweight Charts (Apache-2.0), vendored at `public/assets/js/vendor/`, with the attribution its licence requires. Candles plus a volume histogram.
- **Layout:** mobile-first from 360 px; desktop ≥ 1024 px gets two- or three-column Lab layouts. Tap targets ≥ 44 px. Full keyboard path, visible focus and `aria-live` for events.
- **States:** every async thing has loading, empty and error states, each saying what happened and what to do next.
- **Never:** lorem ipsum, placeholder images, fake testimonials, fake user counts, fake partner logos, or "coming soon" buttons.

## 11. Stack, repo layout and ownership

- Vanilla HTML/CSS/JS (ES modules, no build step) and vanilla PHP 8.3. No framework. Hash router SPA.
- Secrets and writable state live outside the repo, in `dirname(REPO_ROOT)/u-hackathon-2026-private/`:
  - Production: `/var/www/vhosts/cenedury.com/u-hackathon-2026-private/`
  - Local: `C:\Users\yotha-hack\code\u-hackathon-2026-private\`
  - Contents: `.env`, `cache/`, `ratelimit/`, `leaderboard/`, `logs/`.
- `.env` keys:
  - `APP_ENV`
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_MODEL_CONTENT`
  - `ANTHROPIC_MODEL_RUNTIME`
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_ID`
  - `TOKENOMIST_API_KEY` (optional)
  - `DAILY_AI_CAP` (default 300)
- `.env.example` is committed with names only.

```
public/
  index.html, .htaccess (security headers, caching)                — Yotha
  assets/fonts/  css/tokens.css base.css components.css            — Yotha
  assets/css/lab.css                                               — Joewee
  assets/js/config.js app.js router.js state.js audio.js ui.js     — Yotha
  assets/js/screens/welcome.js gate.js lesson.js report.js tutor.js — Yotha
  assets/js/screens/lab.js create.js explorer.js                   — Joewee
  assets/js/sim/*.js, *.test.mjs                                   — Joewee
  assets/js/vendor/                                                — Joewee
  assets/svg/penny/*.svg  assets/svg/glyphs/*.svg                  — Yotha
  assets/audio/*.mp3 (generated)                                   — Yotha
  api/health.php tutor.php leaderboard.php                         — Yotha
  data/gate.json lessons.json events.json facts.json tutor_faq.json — Yotha
  data/coins.json agents.json scenario.json                        — Joewee
src/ (PHP: bootstrap, config, http, ratelimit, cache, anthropic, elevenlabs) — Yotha
bin/check.mjs generate-content.mjs generate-audio.mjs              — Yotha
docs/BRIEF.md DECISIONS.md STATUS.md EVIDENCE.md
README.md (written last, for judges)                               — Yotha
```

**Screen contract:** every screen module exports `mount(root, ctx)` and returns an `unmount` function. `ctx = { tier, store, audio, navigate, config }`. Routes:
- `#/` welcome
- `#/check`
- `#/lesson`
- `#/lab`
- `#/create`
- `#/explorer`
- `#/report`
- `#/arena` (Y10; shows only "closed" unless the server sets `ARENA_ENABLED=1`)
- `#/privacy` (Arena privacy notice)

**Security:**
- **CSP:** `default-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; font-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'`.
- **Other headers:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a `Permissions-Policy` that disables camera, microphone and geolocation.
- **Content safety:** all dynamic text goes in via `textContent`.
- **PHP API:** every endpoint validates input, returns JSON errors `{ok:false,error:{code,message}}`, and never exposes stack traces.

## 12. Slices (time-boxed; each ends with STOP and a short report)

| # | Owner | Box | Slice |
|---|---|---|---|
| Y1 | Yotha | 40 min | Scaffold: `.gitignore`, `.gitattributes`, `.env.example`, `bin/check.mjs`, `.htaccess`, fonts, tokens/base/components CSS, `index.html` shell, router, store, `config.js`, footer and badge, welcome screen with tier choice. **Push early. Joewee depends on the shell.** |
| J1 | Joewee | 60 min | Sim core: PRNG, AMM, bonding curve, agents, scenario/events, `createSession` API, `coins/agents/scenario.json`, unit checks. No UI. Can start immediately. |
| Y2 | Yotha | 45 min | Gate + lesson screens with draft content in the JSON shapes from §8, Penny SVG (4 states), audio player with captions (silent until audio exists). |
| J2 | Joewee | 60 min | Lab screen: chart, coin list, trade panel, portfolio, event toasts that call `ctx.audio` + narration from `data/events.json`, close → report. Mobile first. |
| Y3 | Yotha | 45 min | `bin/generate-content.mjs` (Claude, schema-validated) → final `gate/lessons/events/tutor_faq.json`; then `bin/generate-audio.mjs` (ElevenLabs) → committed mp3. |
| J3 | Joewee | 45 min | Create-a-coin with tiered knobs, curated icons/colours, validation and blocklist, launch on the bonding curve, outcome explained. |
| Y4 | Yotha | 40 min | Report card + Money Health Score + `leaderboard.php` (file-locked JSON, nickname generator, rate limit) + `health.php`. |
| J4 | Joewee | 45 min | Block explorer + tamper demo; desktop Basic/Advanced toggle; wash-volume overlay (Builder). |
| Y5 | Yotha | 40 min | `tutor.php` "Ask Penny" with guardrails, FAQ fallback and cap. |
| Y6 | Yotha | 30 min | README for judges: what it is, demo link, safety design, partners and U-Bot usage stated exactly, how to run locally, team. |

- **Core path = Y1, J1, Y2, J2, Y3**, live by ~04:00.
- J3 and Y4 by 10:00. J4 and Y5 if time allows.
- If behind: cut J4, then Y5. Never cut the core path.

## 13. Working rules

- Work on `main`. Stay inside your own files (§11). Shared contracts (§5 API, §8 shapes, §11 screen contract) change only by editing this brief in its own commit first.
- Per slice:
  1. `git pull`
  2. build
  3. `node bin/check.mjs` must pass (node --check on all JS, JSON validity, sim unit tests, `php -l` when PHP is present)
  4. commit as `area: what changed`
  5. `git pull`
  6. `git push`
  7. open the live URL on a phone
- Verification is proportionate: one happy path plus one failure path per feature, plus the sim unit checks. No exhaustive test suites, no refactors, no documentation beyond the README and DECISIONS.
- Never force push, never change remotes, never write files with PowerShell redirection, never commit secrets.
- When the brief is ambiguous, choose the option with fewer moving parts, record it in `docs/DECISIONS.md` and continue without asking.

## 14. Depth layer (v2.1)

Learning Path (Yotha; route #/path, shown right after tier choice; owns path.js and public/data/path.json). Per tier: 3 units × 4 nodes. Unit 1 Money basics, Unit 2 Markets & prices, Unit 3 Crypto & blockchain (wallets and keys as concepts only, never real seed phrases; blocks, fees, confirmations, links to #/explorer). Node types: lesson (cards + quiz, same shape as lessons.json), mission (opens #/lab with a goal, completed from the Lab run metrics), checkpoint (5-question quiz). Nodes unlock in order; the Money Health Check acts as a placement test that can unlock Unit 1 checkpoint directly. XP 10/20/30 by node type, a daily goal of 30 XP, and a daily streak 🔥 (consecutive Asia/Bangkok dates with ≥ 1 node completed), all in localStorage with try/catch. No hearts, no punishment, no locked "coming soon" content: every node shown must be playable when unlocked.

Missions read store.lab[tier].metrics = { maxSingleExposurePct, minCashPct, panicSellsAfterNegativeEvents, heldBloopAtRug, coinLaunched: { lpLocked, outcome } | null, quizCorrect, quizTotal, finalValue }. Joewee's Lab writes these.

Tools in the Lab (Joewee, slice J5): SMA(7) and SMA(25) overlays (13+), volume bars (all), RSI(14) pane (16+ or desktop Advanced), a price-impact preview before every trade (all: "Buying L$X moves the price about Y%"), and a portfolio allocation chart with P/L (all). Indicator maths lives in sim/indicators.js with unit tests. Each tool has an ⓘ explainer saying what it shows and what it cannot tell you. Explorer tier defaults to volume plus price impact only.

Slices: Y7 (60 min) Learning Path UI, XP, streak, daily goal, missions wiring. Y8 (30 min) generate path content for all tiers with bin/generate-content.mjs; generate audio only for Unit 1 within the remaining ElevenLabs quota (other cards are text-only, with no audio button). J5 (45 min) Lab tools.

## 15. Teaching depth, Arena and badges (v2.2)

Coach mode (Joewee, J7): a coach-mark engine that highlights real Lab UI elements, pauses the market, and advances step by step; works perfectly on mobile (marks reposition on resize and scroll; never cover the element they explain). Five guided chapters, content in public/data/coach.json: (1) Reading a candle (open, high, low, close, wick, green vs red), (2) Volume, SMA and RSI: what each shows and what it cannot tell you, (3) Your first trade and price impact, (4) Surviving a whale dump: play the same scripted dump twice, once panic-selling and once holding, then compare outcomes side by side, (5) Build your coin step by step, explaining every knob for the tier, launch, hype phase, and an NPC copycat rug that teaches the red flags. Chapters are offered automatically on the first Lab visit and stay reachable from a "Coach" button. Every chapter completion is a Learning Path event (award XP).

Soulbound badges (Joewee, J8): completing a Path unit or a Coach chapter mints a non-transferable badge as a transaction on the simulated chain (visible in the explorer as a mint tx). A badge gallery shows them. Badges have no price and cannot be traded, sold or transferred. Original SVG badge art only. A short lesson card explains NFTs, why these are soulbound, and why NFTs with price tags carry risk.

Birth-year gate (Yotha, Y9): the first screen is a birth-year picker with a cake whose candles match the age, in the current CI. Tier derives from age (8–12, 13–15, 16–19). Under 8 shows a friendly "play with a grown-up" message and Explorer mode. 20+ sees cards for parents, teachers and "real markets" (real trading only on licensed exchanges with identity verification; Market Lab never handles real money; no partner logos or claims). Labelled "self-declared". Stored in localStorage only.

Arena (Yotha, Y10): a real multiplayer market behind ARENA_ENABLED. MySQL via PDO; server-authoritative shared AMM per coin; lazy tick (each request advances state from the last tick to now under one DB lock); bots inside the tick (market maker, momentum, whale, wash-volume bot with a real-vs-wash overlay); polling every 1.5 s; live leaderboard. Entry requires tier 13+ and Money Health Score ≥ 70 or the Unit 2 checkpoint passed. Accounts: username, password and birth year only (no email or phone, documented as data minimisation for minors), plus a 3-question screening quiz. argon2id hashing, __Host- session cookie (HttpOnly, Secure, SameSite=Lax), CSRF tokens, login rate limiting, prepared statements, username blocklist, a short privacy page. Simulated money only; never real money. If Arena is not solid by 10:30 it is removed from navigation.
