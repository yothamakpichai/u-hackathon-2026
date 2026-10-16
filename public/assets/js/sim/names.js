// Name and ticker rules for player-made coins (BRIEF §10). Shared by the engine and the Create screen.
// Pure: no DOM. Each check returns null when fine, or { code, message } with a friendly reason.

// Real tickers and brands: a player coin must never look like a real asset or our own coin.
const BLOCKED_TICKERS = new Set([
  'BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'SHIB', 'PEPE', 'AVAX', 'TON', 'ADA', 'TRX', 'LINK',
  'DOT', 'MATIC', 'LTC', 'BCH', 'XLM', 'UTOPIA', 'EDUU',
]);
const BLOCKED_BRANDS = [
  'bitcoin', 'ethereum', 'ether', 'tether', 'binance', 'solana', 'ripple', 'dogecoin', 'doge', 'shiba', 'shib', 'pepe',
  'avalanche', 'toncoin', 'tron', 'cardano', 'chainlink', 'polkadot', 'polygon', 'litecoin', 'stellar', 'utopia', 'eduu',
  'cenedury',
];
// Made-up coin words: a name that spells one inside a word, or from the start of a word, is a real coin too
// (Bitcoins, Mega Bit Coin). One that only ends a word, as in Rabbit Coin or Elite Coin, is fine.
const BRAND_STEMS = ['bitcoin', 'ethereum', 'litecoin', 'dogecoin', 'solana', 'binance', 'cardano', 'chainlink', 'polkadot', 'toncoin'];
// Words that only dress a name up as a coin, so "Doge Army" and "BNB Coin" still read as the real one.
const FILLER = new Set(['coin', 'coins', 'token', 'tokens', 'cash', 'army', 'inu']);
// Tickers that are everyday words too: fine in a name ("Golden Link"), blocked as a coin ("Link Coin").
const EVERYDAY = new Set(['ada', 'dot', 'link', 'sol', 'ton']);

// A small profanity list, stored ROT13 so the words don't sit in the source as plain text.
const rot13 = (s) => s.replace(/[a-z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 97 + 13) % 26) + 97));
const PROFANITY = [
  'shpx', 'fuvg', 'cvff', 'phag', 'pbpx', 'qvpx', 'ovgpu', 'onfgneq', 'fyhg', 'juber', 'jnax', 'gjng', 'cevpx', 'nefr',
  'nff', 'penc', 'gvgf', 'obbof', 'chffl', 'snt', 'avttre', 'ergneq', 'qvyqb', 'pyvg', 'phz', 'encr',
].map(rot13);
// Everyday words that start with a blocked word, so a cockatoo or a fire retardant isn't called rude.
const ALLOW = new Set([
  'arsenal', 'arsenic', 'cockatiel', 'cockatiels', 'cockatoo', 'cockatoos', 'cockerel', 'cockerels', 'cockle', 'cockles',
  'cockpit', 'cockpits', 'cockroach', 'cockroaches', 'cocktail', 'cocktails', 'cocky', 'dickens', 'prickle', 'prickles',
  'prickly', 'pussycat', 'pussycats', 'retardant',
]);

const words = (s) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean);

// A blocked word matches a whole word, or (4+ letters) the start of one, so "grape" and "class" stay fine.
function rude(text) {
  return words(text).some((t) => !ALLOW.has(t) && PROFANITY.some((w) => t === w || (w.length >= 4 && t.startsWith(w))));
}

// A name reads as a real coin when a word, or the whole name without its filler words, is a real ticker or brand.
function realCoin(name) {
  const all = words(name);
  const core = all.filter((w) => !FILLER.has(w));
  const joined = core.join('');
  const real = (w) => BLOCKED_BRANDS.includes(w) || (BLOCKED_TICKERS.has(w.toUpperCase()) && !EVERYDAY.has(w));
  // The name from each word on, run together: "Mega Bit Coin" gives "megabitcoin", "bitcoin" and "coin".
  const tails = all.map((_, i) => all.slice(i).join(''));
  const stem = (b) => all.some((w) => w.includes(b)) || tails.some((t) => t.startsWith(b));
  return core.some(real) || real(joined) || (core.length < all.length && EVERYDAY.has(joined)) || BRAND_STEMS.some(stem);
}

export function checkName(name) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z ]{3,16}$/.test(n)) return { code: 'BAD_NAME', message: 'Use 3 to 16 letters or spaces for the name.' };
  if (rude(n)) return { code: 'BLOCKED_NAME', message: 'Let’s keep it friendly. Try a different name.' };
  if (realCoin(n)) return { code: 'BLOCKED_NAME', message: 'That name belongs to a real coin or brand. Make up your own.' };
  return null;
}

export function checkTicker(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3,5}$/.test(t)) return { code: 'BAD_TICKER', message: 'Use 3 to 5 letters (A to Z) for the ticker.' };
  if (BLOCKED_TICKERS.has(t)) return { code: 'BLOCKED_TICKER', message: `${t} is a real coin’s ticker. Make up your own.` };
  if (rude(t)) return { code: 'BLOCKED_TICKER', message: 'Let’s keep it friendly. Try different letters.' };
  return null;
}
