# Penny: a money companion for life

Penny is a town you build by practising money: save, borrow, farm, trade and plan your future with simulated money, from age 8 to adulthood.

**Live:** https://u-hackathon-2026.cenedury.com

## 90-second judge path
Fastest: tap **Judge demo** on the landing page. One tap loads a clearly labelled demo profile (an adult with a finished Money Check, a grown cow and orchard, one School unit done, a finished market and L$ to spend) and signs in a 24-hour Arena demo account.

Or play it from the start:
1. Open the live link on a phone (or a desktop browser). Pick a character and take the 15-question **Money Check** (about a minute). You get a Money Type and a home building.
2. In the **Town**, tap **School**: one short lesson with a quiz and narration.
3. Tap **Market Lab**: buy and sell in a seeded practice market, then read the report card that explains what happened.
4. Tap **Future You**: move the saving slider and see the 1997, 2020 and 2022 shock tests.
5. Tap **Ask Penny** (bottom right) and ask anything about money.

## Buildings
- **School**: the Learning Path with lessons, quizzes, missions, checkpoints, XP and a daily streak, plus a Learning partners shelf (education only).
- **Market Lab**: a seeded practice market in Practice L$ with charts, a coach, a coin designer, a block explorer and the way into the Arena.
- **Arena**: a live multiplayer market for 13+ in L$: anyone can watch; trading needs an account. Coin launches with a red-flag meter, named bots, an AI news desk, a daily season with medals and a Central Bank panel.
- **Future You**: a projection of what saving could grow to, in today's baht, with 1997, 2020 and 2022 shock tests, and a chat with your Future You.
- **Money Town**: one street with the Piggy Bank (real baht you report, recorded on your device), Farm + Orchard, Daily Stall, Store, Bank and an Arena shortcut.
- **Research Lab**: stocks and gold, closed for now, with one real lesson card.

## AI use
- **Build time:** Claude writes the lessons, events, checks and FAQ (`bin/generate-content.mjs`); a human reviews them before they ship.
- **Runtime:** Ask Penny and the Future You chat use Claude, with an FAQ fallback so Penny still answers when the model is unavailable. The Arena news desk writes headlines from market data (no personal data), with templates as a fallback.
- **Voice:** ElevenLabs narration for lessons and checks (`bin/generate-audio.mjs`), and live voice for Penny and Future You through our own proxy (`public/api/tts.php`), always with the words on screen too.

## Research
Every "Why this works" note cites only `docs/SOURCES.md`, which you can also read in the app at `#/research`. Unchecked entries are labelled, and the numbers the team chose for its models are listed separately as assumptions, not facts.

## Safety and privacy
- Simulated money only (L$). No real money, no payments, no ads or sponsor banners.
- No gender question. Money Check answers and Piggy Bank goals stay on the device.
- Arena accounts store a username, a password hash (argon2id) and a birth year only; under-13 accounts need parent approval.
- Strict Content Security Policy: no third-party scripts, and audio only from our own domain.

## Architecture
- Front end: vanilla ES modules, no build step (`public/`).
- Back end: PHP 8.3 (`public/api/`, `src/`) and MariaDB for the Arena and accounts.
- Simulations are seeded and deterministic (`public/assets/js/sim/`), so the same seed always replays the same market.

## Run locally and test
```
php -S localhost:8000 -t public
node bin/check.mjs        # parses JS and JSON, runs unit tests, lints PHP, checks the brief's guards
php bin/migrate.php       # creates the Arena tables (needs the database settings in the private .env)
```
Secrets live outside the repo in `../u-hackathon-2026-private/.env`; `.env.example` lists the names.

## Licences
- TradingView Lightweight Charts, Apache-2.0 (`public/assets/js/vendor/lightweight-charts/`).
- Inter and Nunito fonts, SIL Open Font License (`public/assets/fonts/`).

Built during U-Hackathon 2026, see the commit history.

## Team
- Yotha Makpichai: engineering lead, product.
- Joewee Loke: game systems.
- Aphatcha Poolphol: research, user testing, communication.

## Roadmap
- Friends and leagues.
- A teacher dashboard via eduu.
- Stocks and gold, opened as full buildings.
- An identity-checked handoff to a real partner at age 20.
