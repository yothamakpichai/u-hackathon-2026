// Town wallet (BRIEF §16.1). One in-game coin balance, an append-only ledger and the credit score,
// shared by the Farm, Orchard, Stall and Bank. All coins are fake; the Lab keeps its own L$ per
// session. Pure functions over a store with get() and set(): the ledger is only ever appended to.

export const STARTER_GRANT = 50;
export const CREDIT = Object.freeze({ start: 600, min: 300, max: 850 });

const walletOf = (state) => ({ ledger: [], credit: { score: CREDIT.start, events: [] }, ...state.wallet });

export const balance = (state) => walletOf(state).ledger.reduce((s, e) => s + e.amount, 0);
export const ledger = (state) => walletOf(state).ledger.slice();
export const creditScore = (state) => walletOf(state).credit.score;

let seq = 0;
const nextId = (now) => `w${now.toString(36)}${(seq++).toString(36)}`;

// Append one entry. A spend that would take the balance below zero is refused, saying how much is short.
export function post(store, { amount, kind, note = '', ref = null }, now = Date.now()) {
  const state = store.get();
  const w = walletOf(state);
  const a = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(a) || a === 0) return { ok: false, error: 'Nothing to record.' };
  if (a < 0 && balance(state) + a < -1e-9) return { ok: false, error: `You have ${coinsText(balance(state))}, which isn’t enough.`, short: Math.round((-a - balance(state)) * 100) / 100 };
  const entry = { id: nextId(now), at: now, amount: a, kind: String(kind), note: String(note).slice(0, 120), ref };
  store.set({ wallet: { ...w, ledger: [...w.ledger, entry] } });
  return { ok: true, entry, balance: balance(store.get()) };
}

// Give every new player the same small start, once.
export function ensureStarter(store, now = Date.now()) {
  const w = walletOf(store.get());
  if (w.ledger.some((e) => e.kind === 'grant' && e.ref === 'starter')) return false;
  post(store, { amount: STARTER_GRANT, kind: 'grant', note: 'Welcome to town', ref: 'starter' }, now);
  return true;
}

// Credit score: on-time repayment raises it, late payment lowers it. Every change is kept.
export function adjustCredit(store, delta, reason, now = Date.now()) {
  const w = walletOf(store.get());
  const score = Math.max(CREDIT.min, Math.min(CREDIT.max, w.credit.score + Math.round(delta)));
  const credit = { score, events: [...w.credit.events, { at: now, delta: score - w.credit.score, reason: String(reason).slice(0, 80) }] };
  store.set({ wallet: { ...w, credit } });
  return score;
}

// Better scores borrow more cheaply: from +50% on the base rate at the bottom to −40% at the top.
export function rateFor(score, baseRate) {
  const t = (Math.max(CREDIT.min, Math.min(CREDIT.max, score)) - CREDIT.min) / (CREDIT.max - CREDIT.min);
  return baseRate * (1.5 - 0.9 * t);
}

// A coin balance for display, cut to the cent and never rounded up, so a balance shown as 5 can always pay 5.
export function coinText(n) {
  const v = Math.floor(n * 100 + 1e-6) / 100;
  return v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
}

// The same with its unit: '1 coin', '12.50 coins'.
export function coinsText(n) {
  const t = coinText(n);
  return `${t} ${t === '1' ? 'coin' : 'coins'}`;
}
