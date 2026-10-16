# QA pass (Yotha), Friday 16 October 2026

The whole app at 360 px and 1440 px, for every level: Explorer (age 10), Trader (14), Builder (17) and a grown-up (41, playing at Builder level).

## How it was tested

- **Scripted sweep.** A headless Chrome script onboarded each of the 4 profiles through the real UI (cake → character → all 15 Money Check answers → result) at both widths. It then opened every route: Town and both construction sheets, School, Market Lab (with the coach open, then closed), Create, Explorer, report, Arena, Piggy Bank, Future You, Farm, Stall, Bank, research, account, parent, privacy, result, Money Check, character, the legacy check and lesson routes, and an unknown route. That is 32 checks per run and 256 in all. Each check looks for exactly one h1, horizontal overflow, elements past the screen edge, tap targets under 44 px, unnamed controls, duplicate ids, the Ask Penny button covering a control (at rest and at every scroll position), clipped text, stray `null`/`undefined`/`NaN` text, console errors, exceptions and failed requests. A full-page screenshot of every check was reviewed.
- **Testers by area.** Six testers played their area in real headless Chrome at both widths and every level, each on its own local server: accounts and Arena, onboarding and Town, School with the report card and Ask Penny, Market Lab, Piggy Bank with Future You, and Farm with Stall and Bank. Every finding in Joewee's files was then re-run by a second, independent tester whose job was to refute it, and only confirmed findings are listed for Joewee. Findings in Yotha's files were reproduced while fixing them.
- **Core path** (cake → character → Money Check or "Take it later" → result → Town → Market Lab → report), run at 360 px and 1440 px before every push, and on the live site after the first deploy.
- **Re-sweep after the fixes** (Explorer 360, grown-up 1440): no console errors, overflow, h1 problems or stray text on any of Yotha's screens. What remains is in the list for Joewee.

## Live server: one command to run

The live site had accounts and the Arena switched on, but its database was older than the code. The columns from Y14.2 (`approved_at`) and Y14.4 (`arena_ok`) were missing, so log-in, sign-up and parent links answered with a 500 error. Since `1c6d75c`, a database older than the code switches accounts and the Arena off cleanly: guest play carries on, the Arena shows as closed and its Town link disappears. To switch both back on, run the idempotent migration once:

```
cd /var/www/vhosts/cenedury.com/u-hackathon-2026 && /opt/plesk/php/8.3/bin/php bin/migrate.php
```

**Arena verdict.** The accounts-and-Arena tester found the Arena solid enough to stay in navigation once the leaderboard was filtered, which is fixed in `1805eee`. Trading, the 1.5 s polling, coin switching, the wash-volume overlay, the trade feed, the offline "Reconnecting…" state, leaving and returning, and the server-side age gates all passed. A teen account in a browser that stores 1985 still meets the score gate. If the migration can't be run by 10:30, the Arena simply stays closed, with no code change needed.

## Fixed in Yotha's files

| Id | Severity | Finding | Fix |
| --- | --- | --- | --- |
| live | Blocker | Accounts on with a stale database: log-in, sign-up and parent links gave 500 errors | `1c6d75c` |
| AA-3 | Blocker | The Arena leaderboard ranked every account, including under-13 children and people who never entered; real traders fell off it | `1805eee`: approved 13+ accounts that have traded, plus your own place |
| AA-1 | Blocker | Logging in to a second account on a shared device saved the first account's progress over it, silently | `60ea6e2`: progress belongs to the account that saved it; otherwise the player is asked |
| AA-2 | Blocker | Reloading instead of answering "Which progress should we keep?" replaced the device's progress | `60ea6e2`: the choice waits across reloads; each copy is summarised |
| OT-01 | Major | Browser Back or reload in the Money Check threw away every answer | `30d3b6f`: a history entry per question and a saved draft |
| OT-02 | Major | A double tap answered the next question unseen | `30d3b6f`: taps in the first 350 ms are ignored |
| SRP-2 | Major | At 360 px the Ask Penny button was hidden at the top of most screens (full-width cards fill its corner) | `634eb6a`: under 1024 px it lives in the sticky header (DECISIONS 56) |
| SRP-1 | Major | Penny's answer was mostly hidden below the chat log | `d244007` |
| SRP-3 | Major | A finished mission still said "didn't meet the goal yet" | `d4ac019` |
| AA-4 | Major | The Arena's coin buttons lost keyboard focus every 1.5 s | `1805eee` |
| — | Major | The text "null" under the Learning Path subtitle and in the parent-link card | `0391c06`, `60ea6e2` |
| AA-5 | Minor | After being logged out elsewhere, autosave failed silently | `60ea6e2`: autosave stops; the account screen opens on Log in with a note |
| AA-6 | Minor | Focus fell to the page after parent-link actions | `60ea6e2` |
| AA-7 | Minor | An under-13 guest at #/arena was sent to make an account they couldn't use | `1805eee` |
| AA-8 | Minor | Logging in to a waiting under-13 account broke the link a parent already had | `60ea6e2`: earlier links keep working |
| AA-11 | Minor | The report card told grown-ups they needed Score 70 for the Arena | `60ea6e2` |
| AA-12 | Minor | Each Arena trade was announced twice | `1805eee` |
| AA-9, AA-10 | Polish | Leaderboard names broke mid-word; Inter drew the x in "T360x2" as × | `1805eee` |
| OT-03 | Minor | The Town dropped the Money Health card if money_check.json failed | `288fe09` |
| OT-04, SRP-11 | Minor | Error headings didn't take focus | `30d3b6f`, `288fe09`, `d4ac019` (state titles are focusable) |
| OT-05 | Minor | The level after the birth year wasn't announced | `288fe09` |
| OT-07 | Minor | "Being checked" on #/research left out 4 [unverified] sources | `288fe09` |
| OT-13 | Polish | Unknown routes went to the landing for players with a level | `288fe09`: to the Town |
| OT-14 | Polish | The page title and description still described the old crypto-only product | `288fe09` |
| OT-10, OT-11, OT-12, SRP-13 | Polish | Sheet close button mid-header; invisible meter track; cropped skyline on desktop | `288fe09`, `82d8415`, `634eb6a` |
| SRP-5, SRP-9 | Minor | Path steps had no h1; Back inside a lesson left the path | `d4ac019` |
| SRP-6 | Minor | Closing Penny left focus on the page | `d244007` |
| SRP-7 | Minor | Report cards older than yesterday showed a server error for the board | `d244007` |
| SRP-10 | Minor | Every checkpoint had the same answer positions | `d4ac019`: seeded shuffle per question |
| SRP-12 | Polish | "−0.0%" next to "0.0%" on the report card | `d244007` |
| ML-10 | Minor | Disabled buttons looked enabled | `4041dc6` |
| PF-05 (part) | Major | The privacy page didn't say reflection answers are saved to an account | privacy.js |
| ML-17d | Polish | Straight apostrophe in the copycat headline | `4041dc6` |
| sweep | Minor | No h1 on full-screen states; small links in Town, landing, Arena and account; parent link without its code called the server; privacy tab title; Town header at 360 px; invisible bank pillars; Arena link shown under 13; focus ring on screen titles; sign-up radio buttons shrinking | `0391c06`, `7491d5b` |

Not changed, on purpose:

- **OT-06** (read-aloud skips the answers): the Money Check clips already read "A: … B: …" after each question (`bin/generate-audio.mjs`). The intro now says so (`b6753b6`).
- **OT-08** ("Licensed partners … will appear here" on the 20+ card): §16 asks for exactly this sentence.
- **OT-09** (no partner contact yet): `PARTNER_EMAIL` in `config.js` is waiting for the address.
- **SRP-8** ("Open the Coach" lands in the Lab without the Coach after the offer was dismissed): the Path now links to `#/lab?coach=1`. lab.js needs to read it (Joewee, below).

## Left for Joewee

"Confirmed" means a second tester re-ran it and could not refute it. "Code" means I confirmed the cause in the source because the second tester for Farm, Stall and Bank failed on a network error. "Reported" means one tester saw it and nobody re-ran it. Ids match the tester logs.

**Fix first (judges will see these):**

| Id | Severity | Screen | Finding | Where to look |
| --- | --- | --- | --- | --- |
| FSB-01 | Blocker (code) | Bank | Two Quick Cash loans make "Which loan to pay first?" print an interest figure hundreds of digits long, and the Bank page becomes about 2,600–3,300 px wide | `sim/bank.js` `payoffPlan`: uncapped daily compounding at 15% for 3,650 days when the budget can't cover the interest. Cap it or say "never paid off at this budget" |
| FSB-02 | Major (confirmed by the sweep) | Stall, Cow Fair | The word "null" shows on the Stall for everyone without a loan, in the Cow Fair intro before the first fair, and in some fair results | `stall.js:44`, `farm.js:221` and `farm.js:338`: `cond ? … : null` passed straight to `replaceChildren` (filter out empty parts) |
| ML-1 | Major (confirmed) | Lab, Coach chapter 5 | Leave chapter 5 with Back, then open and close the Coach menu: the market stays frozen, with no sign of it | `coach.js` `closeMenu()` resumes only `if (!active)` |
| ML-2 | Major (confirmed) | Lab, Coach chapter 5 step 9 | "Watch your coin's card" while the coach keeps the market paused, so nothing moves | `coach.js` `showStep()` always pauses |
| ML-3 | Major (confirmed) | Lab, 1024–1279 px | The chart price is drawn over the coin name and the supply chip | `lab.css` `.lab-chart__head` |
| PF-01 | Major (confirmed) | Piggy Bank, 360 | A 30-character goal name makes the page 418 px wide; cards and buttons are cut off | `lab.css` `.piggy-screen`/`.piggy` grids need `minmax(0, 1fr)` |
| PF-02 | Major (confirmed) | Piggy challenges | A future start date for Birthday year or 52 weeks says the challenge is over, and nothing restarts it | `piggy.js` |
| PF-03 | Major (confirmed) | Future You, Pro | The mix presets don't move the sliders, so the projection uses a mix the player can't see | `future.js` |
| PF-04 | Major (confirmed) | Future You, Pro | The shock buttons show only 1997/2020/2022, without the labels from future_th.json, and 1997 makes every plan go up | `future.js` |
| FSB-03 | Major (code) | Farm | Learning Path lessons never feed the cow: `feedFrom()` counts only the old intro lesson (`state.lesson`), not `state.path[tier].done` | `sim/farm.js:16` |
| FSB-04 | Major (code) | Stall | Prices never refresh while focus is inside the screen, and the router focuses its h1 on arrival | `stall.js:143` |
| FSB-05 | Major (code) | Stall, Bank | A refused buy or repayment is only announced to screen readers; sighted players see nothing happen | `stall.js:79,83`, `bank.js:92` |
| SRP-4 | Major (code) | Lab → report and missions | Coins bought while paused (or with the Coach open) and then "Finish now" are missing from the run metrics, so the report says 0% in coins and "Keep a cushion" fails | `sim/session.js`: call `trackRisk()` in `finish()` and after each trade |
| ML-5 | Minor (confirmed) | Create a coin | Real tickers and brands (TSLA, AAPL, "Bitcoinz") and hateful or sexual names ("Nazi Coin", KKK, "Porn") pass the filter | `sim/names.js` |
| PF-05 | Major (confirmed, shared) | Piggy reflections | "Your answer stays on this device" is false with an account: autosave uploads the answers. The privacy page now says so (Yotha); the hint in `piggy.js` needs the same change | `piggy.js` |

**Then:**

| Id | Severity | Screen | Finding |
| --- | --- | --- | --- |
| ML-6 | Minor (confirmed) | Coach | Marks don't re-reveal on resize; the docked card covers the explained element after scrolling at 360 |
| ML-7 | Polish (confirmed) | Coach ch. 3 and 5 | The card hides the thing the step points at (quick-amount buttons, launch preview) |
| ML-8 | Minor (confirmed) | Coach | No focus trap or `aria-modal`; focus is not returned on close |
| ML-9, PF-07 | Minor (confirmed) | Lab, Explorer, Future You | The h1 isn't focused on arrival (the view is rebuilt after the router focuses it) |
| ML-11 | Minor (confirmed) | Coach drills | Chart labels overprint ("Whale sells"/"You sold") or are clipped ("MOX appears") |
| ML-12, PF-13 | Minor (confirmed) | Create, Future You Pro | Slider fill stays at 50%: set `--fill` like lesson.js does |
| ML-13 | Minor (confirmed) | Coach | Replaying a chapter claims a new badge and +20 XP again |
| ML-14 | Minor (confirmed) | Coach ch. 1 | "Reading a candle" runs over an empty chart at tick 0 |
| ML-15 | Minor (confirmed) | Badge gallery | "in today's chain" after a reload, when the chain has no mint for it |
| ML-16 | Minor (confirmed) | Lab chart | Up and down candles differ by colour only (make up-candles hollow) |
| ML-17 | Polish (confirmed) | Lab, Create | "L$1000.00" without a separator; "Try a smaller amount" with 0 coins; "9,000 L$" (17d, the apostrophe in events.json, fixed by Yotha) |
| ML-18, ML-19, ML-20 | Polish (confirmed) | Lab | Axis label cut to "ay 1", negative price axis after the rug; a 210 px gap in the desktop grid; tiny prices run past the card at 360 |
| — | Minor (sweep) | Lab | The trade amount field is 42 px tall (brief: 44 px) |
| — | Minor (shared) | Lab | Path's "Open the Coach in the Market Lab" now goes to `#/lab?coach=1`; lab.js should open the Coach menu when it sees it (SRP-8) |
| PF-06, PF-09 | Minor (confirmed) | Future You, Piggy | Invalid numbers are clamped silently; decimals round to 0 (target 0, THB 0 entries that still earn seeds); no upper cap |
| PF-08, PF-20 | Minor (confirmed) | Future You, 360 | Fan-chart labels render about 6 px tall; the alert icon shrinks to 8 px; "THB" wraps away from the number |
| PF-10, PF-11 | Minor (confirmed) | Piggy | "You've earned all your seeds" at 9 of 12; the saved/spent toggle resets after each entry; "Saved so far" goes negative |
| PF-12, FSB-07 | Minor (confirmed / reported) | Piggy, Farm, Stall, Bank | Focus drops to the page after every action (the whole view is rebuilt) |
| PF-14 | Minor (confirmed) | Future You Pro | "Plan to 90" and the life-expectancy choice do nothing while spending is 0 |
| PF-15 | Minor (confirmed) | Future You | Kids see the same face twice: avatar.js has no stage under 25 |
| PF-17 | Minor (code) | Piggy | Goals and entries can't be edited or deleted |
| PF-18 | Minor (measured in Node) | Future You | The 500-path simulation runs on the main thread: about 0.3–0.6 s per change on a desktop, more on phones |
| PF-19, PF-21 | Polish (confirmed) | Future You, Piggy | Results scroll out of view next to the Pro inputs; the "Why this works" cards point players to docs/SOURCES.md (#/research exists) |
| FSB-06 | Minor (reported) | Farm | A new cow's certificate stays on "Minting…" until something else re-renders |
| FSB-08 | Minor (reported) | Cow Fair | Changes show an arrow without a sign, and "↑ 0%" (use ui.js `delta()`) |
| FSB-09 | Minor (reported) | Cow Fair, Bank | "(not yet checked)" and "still being checked" placeholder copy shown to players |
| FSB-10 | Minor (reported) | Stall, Bank, Farm | Wallet chips round to whole coins while prices and errors use cents |
| FSB-11, FSB-14 | Minor (reported) | Bank | The credit score can be farmed with borrow-and-repay; the rate shows "1.0% a day" at both 600 and 620 |
| FSB-12, FSB-13 | Minor (reported) | Bank, Stall | The statement says 0.00 owed above "Pay the minimum 5.00"; the borrowing warning ignores Town Card debt |
| FSB-15 | Polish (reported) | Bank, Farm | Stretched wallet chip; split empty-state buttons at 1440; a lone details card |

Not a bug: **ML-4** (a reload restarts today's market) is the documented behaviour in DECISIONS-sim.md. **PF-16** (the "No real money" badge on the Piggy page) stays: the badge text is fixed by §0 of the brief.

## Not covered

- Real screen readers: live regions and focus were checked through the DOM and the focused element.
- Widths other than 360, 1024–1279 (Lab only) and 1440.
- Session expiry after 30 days, rate-limit messages, real QR scanning and the clipboard.
