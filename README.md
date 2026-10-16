# Penny: a money companion for life

Penny is a town you build by practising money: save, borrow, farm, trade and plan your future with simulated money, from age 8 to adulthood.

**Live:** https://u-hackathon-2026.cenedury.com

## 90-second judge path
1. Open the live link on a phone (or a desktop browser). Pick a character and take the 15-question **Money Check** (about a minute). You get a Money Type and a home building.
2. In the **Town**, tap **School**: one short lesson with a quiz and narration.
3. Tap **Market Lab**: buy and sell in a seeded practice market, then read the report card that explains what happened.
4. Tap **Future You**: move the saving slider and see the 1997, 2020 and 2022 shock tests.
5. Tap **Ask Penny** (bottom right) and ask anything about money.

## Buildings
- **School**: the Learning Path with lessons, missions, checkpoints, XP and a daily streak.
- **Market Lab**: a seeded practice market with charts, a coach, a coin designer, a block explorer and the Arena.
- **Arena**: a real multiplayer market for 13+ with shared AMM pools, bots and a leaderboard, all in simulated L$.
- **Piggy Bank**: goals for your own real savings, in real baht, recorded on your device only.
- **Future You**: a projection of what saving could grow to, in today's baht, with historical shock tests.
- **Farm**: a cow you earn by daily habits, and an orchard.
- **Daily Stall**: buy, hold and sell goods whose prices move and which can spoil.
- **Bank**: borrow, repay and build a credit score, with the total cost shown before you agree.
- **Stock Exchange and Gold Shop**: closed for now; each opens one real lesson card.

## AI use
- **Build time:** Claude writes the lessons, events, checks and FAQ (`bin/generate-content.mjs`); a human reviews them before they ship.
- **Runtime:** Ask Penny is a Claude chat with an FAQ fallback, so it still answers when the model is unavailable.
- **Voice:** ElevenLabs narration for lessons and checks (`bin/generate-audio.mjs`), with every line also on screen.

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
