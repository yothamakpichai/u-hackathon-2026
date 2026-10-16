// Town wallet (BRIEF §16.1, shared money contract). The player's L$ on this device: one balance, an append-only
// ledger and the credit score, shared by the Farm, Orchard, Stall and Bank. All L$ are fake.
// Contract with the Arena (Yotha): getBalance(store) reads the balance, and every change to it fires the window event
// 'wallet:change' with detail { balance }. The Arena's L$ live on the server: a Town→Arena transfer goes through
// api/arena.php (action=transfer, at most 200 L$ an account a Bangkok day), and the Town wallet is debited, with
// post(), only after the server accepts. The Lab keeps separate Practice L$ per session; the Piggy Bank counts real
// THB, never L$. Pure functions over a store with get() and set(): the ledger is only ever appended to.

export const CURRENCY = 'L$';
export const STARTER_GRANT = 50;
export const CREDIT = Object.freeze({ start: 600, min: 300, max: 850 });

const walletOf = (state) => ({ ledger: [], credit: { score: CREDIT.start, events: [] }, ...state.wallet });
const cents = (n) => Math.round(n * 100) / 100;

export const balance = (state) => walletOf(state).ledger.reduce((s, e) => s + e.amount, 0);
export const ledger = (state) => walletOf(state).ledger.slice();
export const creditScore = (state) => walletOf(state).credit.score;
export const creditEvents = (state) => walletOf(state).credit.events.slice();

// The balance in L$, to the cent. Reading it also starts the 'wallet:change' watch for this store.
export function getBalance(store) {
  watch(store);
  return cents(balance(store.get()));
}

// Any change to the balance, whatever caused it (a spend, a grant, progress loaded from an account, a reset), fires
// 'wallet:change' on window with { balance }. One watch per store; stores without subscribe() (unit tests) get none.
const watched = new WeakMap();
function watch(store) {
  if (watched.has(store) || typeof store?.subscribe !== 'function') return;
  watched.set(store, cents(balance(store.get())));
  store.subscribe((state) => {
    const next = cents(balance(state));
    if (next === watched.get(store)) return;
    watched.set(store, next);
    if (typeof window === 'object' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('wallet:change', { detail: { balance: next } }));
    }
  });
}

let seq = 0;
const nextId = (now) => `w${now.toString(36)}${(seq++).toString(36)}`;

// Append one entry. A spend that would take the balance below zero is refused, saying how much is short.
export function post(store, { amount, kind, note = '', ref = null }, now = Date.now()) {
  watch(store);
  const state = store.get();
  const w = walletOf(state);
  const a = cents(Number(amount));
  if (!Number.isFinite(a) || a === 0) return { ok: false, error: 'Nothing to record.' };
  if (a < 0 && balance(state) + a < -1e-9) return { ok: false, error: `You have ${moneyText(balance(state))}, which isn’t enough.`, short: cents(-a - balance(state)) };
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

// An amount for display, without its unit, cut to the cent and never rounded up, so a balance shown as 5 can always pay 5.
export function coinText(n) {
  const v = Math.floor(n * 100 + 1e-6) / 100;
  return v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
}

// The same with its unit: 'L$5', 'L$12.50', 'L$1,250'. A negative amount reads '−L$5'.
export function moneyText(n) {
  const t = coinText(Math.abs(n));
  return n < 0 && t !== '0' ? `−${CURRENCY}${t}` : `${CURRENCY}${t}`;
}
