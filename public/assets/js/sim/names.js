// Name and ticker rules for player-made coins (BRIEF §10). Shared by the engine and the Create screen.
// Pure: no DOM. Each check returns null when fine, or { code, message } with a friendly reason.

// Real tickers and brands: a player coin must never look like a real asset or our own coin.
const BLOCKED_TICKERS = new Set([
  'BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'SHIB', 'PEPE', 'AVAX', 'TON', 'ADA', 'TRX', 'LINK',
  'DOT', 'MATIC', 'LTC', 'BCH', 'XLM', 'UTOPIA', 'EDUU',
]);
const BLOCKED_BRANDS = [
  'bitcoin', 'ethereum', 'ether', 'tether', 'binance', 'solana', 'ripple', 'dogecoin', 'shiba', 'pepe', 'avalanche',
  'toncoin', 'tron', 'cardano', 'chainlink', 'polkadot', 'polygon', 'litecoin', 'stellar', 'utopia', 'eduu', 'cenedury',
];

// A small profanity list, stored ROT13 so the words don't sit in the source as plain text.
const rot13 = (s) => s.replace(/[a-z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 97 + 13) % 26) + 97));
const PROFANITY = [
  'shpx', 'fuvg', 'cvff', 'phag', 'pbpx', 'qvpx', 'ovgpu', 'onfgneq', 'fyhg', 'juber', 'jnax', 'gjng', 'cevpx', 'nefr',
  'nff', 'penc', 'gvgf', 'obbof', 'chffl', 'snt', 'avttre', 'ergneq', 'qvyqb', 'pyvg', 'phz', 'enpr',
].map(rot13);

const words = (s) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
const squash = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

// A blocked word matches a whole word, or (4+ letters) the start of one, so "grape" and "class" stay fine.
function rude(text) {
  return words(text).some((t) => PROFANITY.some((w) => t === w || (w.length >= 4 && t.startsWith(w))));
}

export function checkName(name) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z ]{3,16}$/.test(n)) return { code: 'BAD_NAME', message: 'Use 3 to 16 letters or spaces for the name.' };
  if (rude(n)) return { code: 'BLOCKED_NAME', message: 'Let’s keep it friendly. Try a different name.' };
  if (BLOCKED_BRANDS.some((b) => words(n).includes(b) || squash(n) === b)) {
    return { code: 'BLOCKED_NAME', message: 'That name belongs to a real coin or brand. Make up your own.' };
  }
  return null;
}

export function checkTicker(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3,5}$/.test(t)) return { code: 'BAD_TICKER', message: 'Use 3 to 5 letters (A to Z) for the ticker.' };
  if (BLOCKED_TICKERS.has(t)) return { code: 'BLOCKED_TICKER', message: `${t} is a real coin’s ticker. Make up your own.` };
  if (rude(t)) return { code: 'BLOCKED_TICKER', message: 'Let’s keep it friendly. Try different letters.' };
  return null;
}
