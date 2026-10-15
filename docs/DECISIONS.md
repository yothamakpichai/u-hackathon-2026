# Decisions

Choices made where the brief was silent or ambiguous (BRIEF §13). Newest last.

1. **Browser-loaded JSON lives in `public/data/`.** The document root is `public/`, so files in a repo-root `data/` can never reach the browser, and the UI must fetch gate, lessons, events, coins, agents and scenario. Static files under the root are the option with the fewest moving parts (no PHP passthrough, normal caching). Every `data/x.json` in the brief means `public/data/x.json`; fetch them as `config.DATA_BASE + 'x.json'`. `bin/check.mjs` warns about JSON left in a repo-root `data/`.
2. **Fonts.** Inter and Nunito variable woff2, latin subset, from the Fontsource npm packages `@fontsource-variable/inter@5.3.0` and `@fontsource-variable/nunito@5.3.0`, under the SIL OFL 1.1. The licence texts sit next to the files in `public/assets/fonts/`.
3. **Buttons with white text use `--primary-600` (#09855F).** White on the brand green #0DA678 is 3.1:1, which fails AA for normal text; #09855F gives 4.6:1. #0DA678 stays the brand and EDUU colour (`--primary-500`) for fills, marks and large graphics.
4. **The product name lives only in `config.js`.** `index.html` has no product name in its title or header; `app.js` fills `[data-slot="product-name"]` and each route sets `document.title`.
5. **Screen hooks.** The router lazy-loads `screens/<name>.js` and sets `<html data-route="<name>">`, so screen CSS can scope itself, for example `[data-route="lab"] .app-main { max-width: var(--lab-max); }`. `index.html` already links `assets/css/lab.css`. Every route except `#/` sends the player to `#/` until a tier is chosen.
6. **Store.** One localStorage key, `market-lab:v1`, holding one object; each feature owns one top-level key (`tier`, `muted`, then `check`, `lab`, ...). Writes are batched and flushed on `pagehide`; if storage is blocked the app runs in memory.
7. **`ctx.audio`.** `play(id)` plays `assets/audio/<id>.mp3` and resolves `true` when it finishes, `false` when muted, missing or blocked; it never throws or rejects. Also `stop()`, `isMuted()`, `setMuted(bool)`, `toggleMuted()`. The captioned player UI comes with slice Y2.
8. **Caching.** No build step means no hashed file names, so `.htaccess` sends `Cache-Control: no-cache` (revalidate, cheap 304s) for everything except fonts (one week). A push is live at once and Cloudflare never serves a stale script.
9. **`bin/check.mjs` parses JS by piping it to `node --input-type=module --check`.** Plain `node --check file.js` passes a broken ES module silently when there is no `package.json` "type".
10. **Audio stays silent until it exists.** `public/assets/audio/manifest.json` maps each clip id to the exact text it speaks. `ctx.audio.line({ id, text })` always shows the text and adds a Listen button only when the manifest has that id with the same text, so stale audio never plays under new captions. The header mute toggle appears only when the manifest is non-empty. The manifest is `{}` until Y3. Clip ids: `gate-<tier>-<questionId>`, `gate-<tier>-<questionId>-explain`, `lesson-<tier>-<card 1–4>`, `lesson-<tier>-quiz`, `lesson-<tier>-quiz-explain`, and for events `event-<eventId>-<tier>`.
11. **Unlock state.** `store.check[tier]` = `{ score, total, passed, skipped, answers: [{ id, correct }], at }`; `store.lesson[tier]` = `{ done, quizCorrect, at }`; `store.unlocked[tier] = true` after a pass, a finished lesson or a demo skip. `#/lab`, `#/create`, `#/explorer` and `#/report` redirect to `#/check` until the current tier is unlocked. Y4 reads `check` and `lesson` for the Knowledge score; a skip scores 0.
12. **Lesson micro-interactions** (`interaction.type` in `lessons.json`): `reveal {prompt, reveal}`, `choice {prompt, options[2], answerIndex, explain}`, `toggle {prompt, options: [{label, result}]}`, `slider {label, min, max, step, start, formula: divide | multiply | subtract, constant, resultLabel, unit: L$ | %, valueUnit}`. The quiz uses the gate question shape. Next is always available and turns primary once the card has been tried, so nobody gets stuck.
13. **"Skip lesson (demo)"** sits on the lesson exactly like "Skip check (demo)" sits on the check, so a judge in a hurry is never trapped in either.
14. **Shared question UI.** `ui.questionCard()` (narrated prompt, three options, feedback with icon, word and colour, Next) serves the check, the lesson quiz and the Lab's event checks.
15. **The generators are Node scripts**, `bin/generate-content.mjs` and `bin/generate-audio.mjs`, because PHP on the build machine has no CA bundle and its HTTPS calls fail. Node ships its own CA store. Both read keys from `../u-hackathon-2026-private/.env`, never print them, run locally, and their output is committed.
16. **Content pipeline.** `ANTHROPIC_MODEL_CONTENT` (`claude-sonnet-5-5`) writes each file through one tool whose `input_schema` is the file's shape. This model only accepts `tool_choice: auto`, so that tool is the only one offered and the prompt asks for it. The script then checks the schema, word limits, the real names, tickers and hype or advice phrases banned in `facts.json`, contradiction patterns (halving, unlocks, stablecoins), that each event's narration carries its idea, the slider maths at every position, and one of each interaction per lesson. It moves each correct option to a balanced position sequence. Then a second Claude call reviews the file against `facts.json` (errors must be fixed; warnings are for the human reviewer), and a third answers every question without the key, so any disagreement counts as an error. Problems go back to Claude, up to 4 attempts. A file is written only when it is clean.
17. **Event questions carry `explain`**, which the Lab already reads. `tutor_faq.json` is `{ <tier>: [{ id, question, answer, source }] }` with `source: "claude"`; entries a teammate drafts with U-Bot get `source: "u-bot"`, so the README can say exactly what U-Bot produced (BRIEF §8).
18. **Voice: ElevenLabs `eleven_v4`, premade voice "Bella – Professional, Bright, Warm" (`hpp4J3VqNfWAUOO0d1Us`).** The model docs call v4 "our state of the art speech synthesis model, delivering our highest quality audio". Bella is American English and labelled for educational narration, warm and clear for kids who are still learning English. The voice set in `.env` ("Harper") is a Professional Voice Clone from the Voice Library (category `professional`), not a premade voice, so the generator refuses it (BRIEF §9) and was run with `--voice hpp4J3VqNfWAUOO0d1Us`. The output is `mp3_44100_64`: speech alone doesn't need more than 64 kbps, and smaller clips load faster on phones. Each clip's seed comes from its id.
19. **Speech vs. caption.** The caption is always the exact content text. Only the speech sent to ElevenLabs is adjusted so it reads naturally: `L$50` becomes "50 Lab Dollars", tickers become title case ("Vault"), `x · y = k` becomes "x times y equals k" and `1:1` becomes "one to one". The manifest stores the caption, so changing a caption still silences its old clip.
20. **Audio ids and reruns.** On top of #10, the Lab (J2) asks for `event-<id>-<tier>`, `event-<id>-<tier>-question` and `event-<id>-<tier>-question-explain`. The generator skips clips whose caption is unchanged and deletes mp3s whose line is gone. Before it generates anything, it counts the characters and checks the remaining quota through the API. If the quota is short, it generates event narrations first and lists the clips it skipped.
21. **Money Health Score** (`assets/js/score.js`, no DOM, checked by `score.test.mjs`). Each part is rounded and the parts are summed, so the breakdown always adds up.
    - **Knowledge:** 30 × right ÷ asked, across the check (a skip counts as 0 of 3), the lesson quiz if taken, and the Lab's event questions.
    - **Risk management:** 12.5 × the share of ticks with no coin above half the portfolio, plus 12.5 × the share of ticks with at least 10% in L$ or PEG. Both come from the sim's own tick counters.
    - **Scam avoidance:** 20, minus 1 point for each 1% of the portfolio held in BLOOP at `rug_pull` or in the copycat at `copycat_rug`.
    - **Composure:** 15, minus 5 for each time the player sells all of a coin within 10 s of `unlock`, `whale_dump` or `depeg_scare` hitting it. Selling after a rug pull is not panic, so rug pulls are scored only under scams.
    - **Returns:** 10 × gain ÷ 50%, kept between 0 and 10.
    - **No-trade rule:** risk management and composure score 0 if the player never bought a coin. Otherwise "do nothing, then Finish now" would score 85, which no judge would believe.
    - **Bands:** 80 and up is "Excellent money health", 60 "Healthy", 40 "Getting there", below that "Needs care".
22. **"3 things you learned"** gives one line per idea behind the news the player saw, scams and shocks first, then fills up with the level's basics. These lines are short UI copy in `score.js`, written to agree with `facts.json`.
23. **Leaderboard** (`api/leaderboard.php`).
    - **Storage:** one JSON file per date and tier in `u-hackathon-2026-private/leaderboard/`, read under a shared lock and written under an exclusive one. Entries are only `{nickname, score}`, and the file name holds the date and tier.
    - **Nicknames:** the server makes them from 20 adjectives × 20 animals × 10–99, and accepts only names those lists can make, so nobody can post their own text. A device keeps its nickname in `store.nickname`, and the board keeps each nickname's best score.
    - **Rules:** dates are today or yesterday in Bangkok, and tied scores share a rank. Posting is a tap ("Add my score"), never automatic.
    - **Limits:** 60 reads a minute and 6 writes per 10 minutes per visitor. A visitor is an HMAC of the IP (Cloudflare's `CF-Connecting-IP` when present) with a random salt kept in the private folder, so no IP is stored.
24. **Report card state:** `store.report[tier] = { runAt, posted }`, so the celebration plays once per finished run and the board remembers you posted. `store.nickname` holds the server-issued nickname.
25. **Replay on the report card reloads the page at `#/lab`.** The Lab keeps its market in module state, and a reload is the one sure way to start today's market from Day 1 without touching `lab.js`.
26. **PHP layout.** `src/bootstrap.php` sets paths and an error handler that never shows stack traces; errors go to `u-hackathon-2026-private/logs/php-errors.log`. `src/config.php` has `env()` and `private_path()`, `src/http.php` the JSON helpers (errors are `{ok:false,error:{code,message}}`), and `src/ratelimit.php` the limits. `api/health.php` answers `{ok, time, storage, ai}`, never shows paths, versions or keys, and returns 503 when it can't write.
27. **Ask Penny is a sheet, not a route.** A floating "Ask Penny" button sits on every screen once a level is chosen, and opens `screens/tutor.js` as a modal dialog over the current screen. The route list (BRIEF §11) stays unchanged. The sheet fires `askpenny` events on `document` (`detail.open` true or false), so the Lab could pause its clock while it is open.
28. **Tutor answers** (`api/tutor.php`, `ANTHROPIC_MODEL_RUNTIME` = `claude-haiku-5-5`): one question at a time, `max_tokens` 300, and the system prompt cached with `cache_control` (the second call reads all 1,593 prompt tokens from cache).
    - **Temperature:** none. The brief asks for 0.3, but this model rejects `temperature` as deprecated.
    - **Thinking:** off, so all 300 tokens go to the answer. An answer cut off at the limit keeps only its complete sentences.
    - **Cache and cap:** answers are cached for 24 hours per level and normalised question. `DAILY_AI_CAP` counts real calls per Bangkok day.
    - **Privacy:** the server logs failures by status only, never questions or answers.
29. **Guardrails.** Emails, phone numbers and links are refused in the browser before sending, and again on the server. Questions naming a real coin, company or person from `facts.json` get a fixed friendly redirect without calling Claude. The system prompt handles real-money advice, price predictions, personal details and off-topic questions. An answer that contains a link, contact details or a real asset name is never shown.
30. **Silent fallback.** If the key is missing, the cap is reached, the rate limit is hit or a call fails, the server answers `{ok:true,fallback:true}` and the app answers from `data/tutor_faq.json` with no error shown. Any network or server error is handled the same way. The app picks the FAQ entry sharing the most words with the question; if none is close, Penny says she can't look it up right now and points to the suggested questions. Suggested questions always answer straight from the FAQ.
31. **Birth-year gate** (`#/`, `screens/welcome.js`).
    - **Picker:** a native `<select>` of years, the fastest picker on phones. The age is the Bangkok calendar year minus the birth year, shown as "about N" and labelled self-declared.
    - **Levels:** 8–12 Explorer, 13–15 Trader, 16–19 Builder. Under 8 plays Explorer with a "play with a grown-up" message. 20 and over sees cards for parents, teachers and real markets, then picks any level, so adult judges are never blocked.
    - **Cake:** one candle per year, up to 20 in two rows, with the age written on the cake.
    - **Storage:** `store.birthYear` sits next to `store.tier`, in localStorage only, and an earlier choice is preselected on return.
32. **Arena schema** (`bin/migrate.php`). It is idempotent, so run it any time. It only creates missing tables and adds missing columns (listed in `$columns`) inside the existing database. It never runs `CREATE DATABASE`, so a least-privilege user is enough. Seed rows (the market row and 4 coins) use `INSERT IGNORE`, so a rerun never resets a live market. Tables: `arena_users`, `arena_sessions`, `arena_market`, `arena_coins`, `arena_holdings`, `arena_trades` and `arena_candles`, all InnoDB utf8mb4.
33. **Arena market** (`src/arena.php`).
    - **Pools:** one constant-product pool per coin (VAULT, FUEL, ZOOMZ, PEG), with a 0.3% fee kept in the pool.
    - **Lazy tick:** each request locks `arena_market` (`SELECT … FOR UPDATE`) and plays every whole 1-second tick since the last one, then saves. After a quiet spell it plays at most 90 ticks and jumps to now.
    - **Bots:** they draw deterministic randomness from the market seed and the tick.
      - A market maker trades toward a fair value that wanders, plus small two-sided flow.
      - A momentum bot follows a fast against a slow average.
      - A whale makes a rare large order, mostly sells.
      - A wash bot buys and sells FUEL to itself every tick; these trades are flagged `wash`, which drives the real-vs-wash volume chart.
    - **History:** candles are 10 seconds long, and trades and candles older than 2 hours are pruned.
34. **Arena accounts and security.**
    - **Accounts:** a username (3–16 letters, numbers or _, checked against reserved words, real coin names and a ROT13 blocklist), a password (8–128 characters, argon2id, bcrypt only if PHP lacks argon2) and a birth year (13 and over, checked on the server). No email or phone.
    - **Sessions and CSRF:** a random token in the `__Host-arena` cookie (Secure, HttpOnly, SameSite=Lax, 7 days). Only its SHA-256 is stored, next to a per-session CSRF token that every change must send as `X-CSRF-Token`. Signup and login need a JSON body and a matching Origin.
    - **Rate limits:**

      | What | Limit |
      |---|---|
      | Signups per IP | 30 an hour |
      | Logins per IP | 60 per 15 minutes |
      | Logins per username | 5 per 15 minutes |
      | Reads per IP | 120 a minute |
      | Trades per IP | 30 a minute |

      The per-IP limits are loose enough for a class behind one school IP.
    - **Privacy:** failed logins take the same time whether or not the username exists. Players can delete their account, and the privacy notice is at `#/privacy`.
35. **Arena entry** is checked in the browser: Trader level or above, and a best Money Health Score of 70+ from a finished market at Trader or Builder level. The Unit 2 checkpoint route doesn't exist yet, because the Learning Path wasn't built. The server can't verify the score, since the market runs in the browser, but it does enforce 13+ from the birth year.
36. **`ARENA_ENABLED=1`** turns the Arena on, from a real environment variable or `.env`; `env()` now reads real environment variables first. When it's off, `action=status` answers `enabled:false`, every other action answers 404 `ARENA_OFF` without touching the database, the report card shows no invite, and `#/arena` says the Arena is closed.
37. **§16's `public/js/…` paths are literal.** Joewee put `avatar.js` and `wallet.js` in `public/js/`, so `buildings.js` lives there too, and screens import them as `../../../js/…`. Everything else stays in `public/assets/js/`.
38. **Daily loop** (`assets/js/progress.js`, checked by `progress.test.mjs`).
    - **How buildings count:** each building calls `logAction(store, { kind, xp, ref })` for an action the app can see; `ref` makes it count once. `store.progress` = `{ xp, days: { 'YYYY-MM-DD': { xp, actions } }, refs }`.
    - **XP:** lesson 10, mission 20, checkpoint 30, finished market 10, Money Check 20.
    - **Daily goal and streak:** the goal is 30 XP a Bangkok day. The streak counts consecutive Bangkok days with at least one action, and lasts until the end of the next day.
    - **Joewee's actions:** `syncActions()` also counts finished Coach chapters (`store.coach`) and finished markets (`store.lab[tier].at`) once each, so his modules don't have to call anything. Piggy, Farm and Future should call `logAction`.
39. **Learning Path** (`#/path`, `screens/path.js`). `path.json` holds per tier 3 units of [lesson, lesson, mission, checkpoint].
    - **Unlocking:** nodes open in order. A passed Money Health Check, or 4+ of the 5 knowledge items in the Money Check, opens the Unit 1 checkpoint directly.
    - **Checkpoints:** passing takes 4 of 5, and a miss can be retried at once with no penalty.
    - **Missions:** starting one stores `startedAt` and opens the Lab. The mission completes when a market finished after `startedAt` has `store.lab[tier].metrics` meeting every condition. Finishing a unit calls Joewee's `mintBadge(store, { kind: 'unit', ref, tier })`.
    - **Storage:** `store.path[tier]` = `{ done: { id: { at, xp } }, missions: { id: { startedAt } } }`.
    - **Entry:** for now, from the check result and the report card; Town's school opens it from Y11.
40. **Path content** comes from `bin/generate-content.mjs path_<tier>_<unit>`: one unit per call (a whole tier ran out of output tokens), with the same checks, review and blind answers as every file. Missions are not generated. They are exact metric conditions written by hand in `MISSIONS`, so they always match what the Lab measures, and every mission needs at least one coin held, so doing nothing never passes. Audio exists for Unit 1 only (`path-<tier>-<node>-…`); later units are text-only, without a Listen button.
41. **The report card reads `store.lab[tier].metrics`** (BRIEF §14), the same numbers the missions check.
    - **Risk management:** 12.5 if the biggest single coin stayed at 50% or less (scaled down to 0 at 100%), plus 12.5 if cash never fell below 10% (scaled).
    - **Composure:** 15 minus 5 per `panicSellsAfterNegativeEvents`.
    - **Knowledge and returns:** knowledge uses `quizCorrect` / `quizTotal`, and returns use `finalValue`.
    - **Older runs** without metrics keep the earlier rules (#21).
42. **Penny v3 flow.** The landing (`#/`, the birth-year cake) leads to `#/character`, `#/money-check`, `#/result` and then `#/town`, which is now home: the logo points there once a level is chosen.
    - **"Take it later"** goes straight to Town, where the check waits on a card.
    - **Market Lab access:** arriving in Town opens the Market Lab for the player's level, so the old 3-question check is no longer in the way.
    - **Old check:** the report card counts the old check only if the player actually took or skipped it.
    - **Adults:** players aged 20 and over play the Market Lab at Builder level.
43. **Money Check** (`public/data/money_check.json`, written by hand from §16 and `docs/SOURCES.md`).
    - **Scoring:** `assets/js/moneytype.js`, checked by `moneytype.test.mjs`. Knowledge is 10 points per right answer; habits are 0–3 per item, scaled to 50; the Money Health Score is their sum.
    - **Time axis:** Later means waiting a month for 120 over 100 today. Present bias means "today" there, but waiting when both rewards are months away (Meier & Sprenger 2010).
    - **Risk axis:** Bold means taking the coin flip at least once (after Holt & Laury 2002).
    - **Money Types:** Steady Turtle (Later, Careful), Patient Eagle (Later, Bold), Cosy Cat (Now, Careful) and Spark Monkey (Now, Bold). Each has original SVG art.
    - **Read-aloud:** clips `mc-<item>`, whose speech also reads the answers aloud.
    - **Storage:** `store.assessment` = `{ answers, knowledgeCorrect, knowledge, behaviour, score, time, risk, presentBias, scripts, type, at }`. Finishing it earns 20 XP.
44. **Town and `public/js/buildings.js`.**
    - **Registry:** one entry per building: `id`, `name`, `route`, `status` ('live' or 'construction'), `blurb`, `why` (citing only `SOURCES.md`), and for construction buildings one real lesson card. Any entry with a `screen` gets its route registered by `app.js` automatically.
    - **Starting status:** Piggy Bank, Future You and Farm open without errors at 360 and 1440 px, so they are live; Stock Exchange and Gold Shop are under construction.
    - **Start here:** the building recommended for the player's Money Type is marked "Start here".
    - **Arena link:** shown in the Market Lab tile only when the server has the Arena on.
45. **Product name and contact.** `PRODUCT_NAME` is "Penny", with `TAGLINE` and `MANIFESTO` from §16, all in `config.js`. The landing's "For partners" section links to `CONTACT_URL` (https://cenedury.com/ for now, to be confirmed). Nobody sees partner names, logos or ads.
46. **Research page** (`#/research`). It quotes references word for word from `SOURCES.md`, says what each one is used for, and lists [unverified] entries under "Being checked" without using them as facts. The one exception is the Gold Shop lesson card, which uses the unverified Gold Traders Association entry and says so on the card.
