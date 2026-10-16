// App-wide constants. Screens receive this module as ctx.config.
// Renaming the product is this one line: index.html carries no product name.
export const PRODUCT_NAME = 'Penny';
export const TAGLINE = 'Money companion for life';
export const MANIFESTO = 'Raising the generation nobody can fool';
// Where partners (licensed exchanges and wallets for 20+ graduates, schools, sponsors) can email the team. The landing
// shows the mailto: link only once this is set.
export const PARTNER_EMAIL = '';

export const BRAND = 'Cenedury';
export const OFFICIAL_COIN = 'EDUU';
export const QUOTE = 'L$';
export const START_CASH = 1000;
export const TIME_ZONE = 'Asia/Bangkok';

// Browser-loaded JSON lives in public/data/ (docs/DECISIONS.md #1). Paths are relative to index.html.
export const DATA_BASE = 'data/';
export const AUDIO_BASE = 'assets/audio/';

// The one localStorage key (no cookies, no other storage).
export const STORAGE_KEY = 'market-lab:v1';

// Age tiers (BRIEF §2). rank orders them: an event marked "13+" shows when rank >= 1.
export const TIERS = Object.freeze([
  {
    id: 'explorer',
    rank: 0,
    name: 'Explorer',
    ages: '8–12',
    blurb: 'Earn, save and spend. See why making more of something makes each one worth less.',
    meta: '3 coins',
  },
  {
    id: 'trader',
    rank: 1,
    name: 'Trader',
    ages: '13–15',
    blurb: 'Supply, demand and risk. Watch how hype and token unlocks move prices.',
    meta: '6 coins',
  },
  {
    id: 'builder',
    rank: 2,
    name: 'Builder',
    ages: '16+',
    blurb: 'Design your own coin. Learn the warning signs of a rug pull.',
    meta: '7 coins',
  },
]);

export function getTier(id) {
  return TIERS.find((t) => t.id === id) || null;
}

// Coin colour ids; each maps to the CSS custom property --pal-<id> in tokens.css.
export const COIN_COLORS = Object.freeze([
  'mint', 'teal', 'cyan', 'sky', 'blue', 'indigo',
  'violet', 'magenta', 'pink', 'coral', 'orange', 'gold',
]);

// The L$ economy (BRIEF §17). One currency name, L$. The Town wallet (public/js/wallet.js) and the Arena (server)
// read these; the Arena's copy lives in src/arena.php and must match. Lab sessions keep separate Practice L$, and the
// Piggy Bank stays in real baht.
export const ECONOMY = Object.freeze({
  start: 1000, // L$ every new Town wallet starts with
  dailyLogin: { base: 50, perStreakDay: 10, max: 100 }, // 50 L$, +10 per streak day, never more than 100
  dailyFaucetCap: 300, // L$ a day across all Town sources together
  storeSpread: 0.1, // the Store buys back 10% below its selling price
  pennyPro: { price: 150, days: 7 }, // Penny Pro: 150 L$ per 7 days (headlines 30 s earlier)
  arena: {
    listingFee: 500, // L$ to launch a coin, burned
    tradeFee: 0.003, // 0.3% of every Arena trade, burned
    stipend: 100, // L$ a day, scaled down linearly to 0 ...
    stipendFullBelow: 2000, // ... as Arena L$ per active player rises from 2,000
    stipendZeroAt: 5000, // ... to 5,000
    transferDailyCap: 200, // Town → Arena, L$ per account per Bangkok day
  },
});
