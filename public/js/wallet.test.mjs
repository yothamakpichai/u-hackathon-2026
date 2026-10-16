// Unit checks for the Town wallet's shared contract (BRIEF §17). Run: node public/js/wallet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY } from '../assets/js/config.js';
import { CURRENCY, STARTER_GRANT, adjustCredit, balance, claimDaily, earnedToday, ensureStarter, getBalance, ledger, moneyText, post } from './wallet.js';

// The same shape as state.js: get, a shallow-merging set that notifies, subscribe and replace.
function fakeStore(initial = {}) {
  let state = { ...initial };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));
  return {
    get: () => state,
    set(patch) { state = { ...state, ...patch }; emit(); return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    replace(next) { state = { ...next }; emit(); },
  };
}

// Collects every 'wallet:change' the wallet fires, on a stand-in window.
function listen() {
  const seen = [];
  globalThis.window = new EventTarget();
  window.addEventListener('wallet:change', (e) => seen.push(e.detail));
  return seen;
}

// Noon in Bangkok (UTC+7) on a date.
const noon = (date) => Date.parse(`${date}T05:00:00Z`);

test('one currency name, L$', () => {
  assert.equal(CURRENCY, 'L$');
  assert.equal(moneyText(5), 'L$5');
  assert.equal(moneyText(12.5), 'L$12.50');
  assert.equal(moneyText(1250), 'L$1,250');
  assert.equal(moneyText(9.999), 'L$9.99', 'cut to the cent, never rounded up');
  assert.equal(moneyText(-5), '−L$5');
  assert.equal(moneyText(-0.001), 'L$0', 'no minus sign on a zero');
});

test('getBalance(store) reads the balance to the cent', () => {
  const store = fakeStore();
  assert.equal(getBalance(store), 0);
  ensureStarter(store, 1);
  assert.equal(getBalance(store), STARTER_GRANT);
  post(store, { amount: -0.1, kind: 'seed' }, 2);
  post(store, { amount: -0.2, kind: 'seed' }, 3);
  assert.equal(getBalance(store), STARTER_GRANT - 0.3, 'no floating-point dust');
  assert.equal(getBalance({ get: () => ({}) }), 0, 'a store without subscribe still reads');
});

test("every change to the balance fires 'wallet:change' with { balance }", () => {
  const seen = listen();
  const store = fakeStore();
  ensureStarter(store, 1);
  assert.deepEqual(seen, [{ balance: STARTER_GRANT }], 'the first post starts the watch and reports itself');
  post(store, { amount: -12.5, kind: 'stall-buy', note: 'Mango' }, 2);
  assert.deepEqual(seen.at(-1), { balance: STARTER_GRANT - 12.5 });
  assert.equal(seen.length, 2);
});

test('nothing fires when the balance does not change', () => {
  const seen = listen();
  const store = fakeStore();
  getBalance(store);
  adjustCredit(store, 20, 'On time', 1);
  store.set({ muted: true });
  assert.equal(post(store, { amount: -5, kind: 'seed' }, 2).ok, false, 'a refused spend changes nothing');
  assert.deepEqual(seen, []);
});

test('progress swapped in from an account fires too', () => {
  const seen = listen();
  const store = fakeStore();
  getBalance(store);
  store.replace({ wallet: { ledger: [{ id: 'a', at: 1, amount: 80, kind: 'grant', note: '', ref: 'starter' }] } });
  assert.deepEqual(seen, [{ balance: 80 }]);
  store.replace({});
  assert.deepEqual(seen.at(-1), { balance: 0 });
});

test('a refused spend says what is short, in L$', () => {
  const store = fakeStore();
  ensureStarter(store, 1);
  const r = post(store, { amount: -(STARTER_GRANT + 60), kind: 'stall-buy' }, 2);
  assert.equal(r.ok, false);
  assert.equal(r.error, `You have ${moneyText(STARTER_GRANT)}, which isn’t enough.`);
  assert.equal(r.short, 60);
});

test('every Town wallet starts with ECONOMY.start, and an older, smaller start is topped up once', () => {
  assert.equal(STARTER_GRANT, ECONOMY.start);
  const fresh = fakeStore();
  assert.equal(ensureStarter(fresh, 1), true);
  assert.equal(ensureStarter(fresh, 2), false);
  assert.equal(balance(fresh.get()), ECONOMY.start);

  const old = fakeStore({ wallet: { ledger: [{ id: 'g', at: 1, amount: 50, kind: 'grant', note: 'Welcome to town', ref: 'starter' }, { id: 's', at: 2, amount: -20, kind: 'seed', note: '', ref: null }] } });
  assert.equal(ensureStarter(old, 3), true);
  assert.equal(ensureStarter(old, 4), false);
  assert.equal(balance(old.get()), ECONOMY.start - 20, 'what was spent stays spent');
  assert.equal(ledger(old.get()).at(-1).ref, 'starter-top-up');
});

test('the daily login pays 50, then 10 more for each day in a row, up to 100', () => {
  const store = fakeStore();
  const pay = (date) => claimDaily(store, noon(date));
  assert.deepEqual(pay('2026-10-10'), { amount: 50, streak: 1 });
  assert.equal(pay('2026-10-10'), null, 'once a Bangkok day');
  assert.deepEqual(pay('2026-10-11'), { amount: 60, streak: 2 });
  for (const d of ['12', '13', '14']) pay(`2026-10-${d}`);
  assert.deepEqual(pay('2026-10-15'), { amount: 100, streak: 6 });
  assert.deepEqual(pay('2026-10-16'), { amount: 100, streak: 7 }, 'never more than 100');
  assert.deepEqual(pay('2026-10-18'), { amount: 50, streak: 1 }, 'a missed day starts again at 50');
  // 23:30 and 00:30 in Bangkok are different days, though the same UTC date.
  const late = fakeStore();
  assert.equal(claimDaily(late, Date.parse('2026-10-19T16:30:00Z')).streak, 1);
  assert.equal(claimDaily(late, Date.parse('2026-10-19T17:30:00Z')).streak, 2);
});

test('town sources pay at most ECONOMY.dailyFaucetCap a Bangkok day; spending and the start are not capped', () => {
  const store = fakeStore();
  const t = noon('2026-10-16');
  ensureStarter(store, t);
  claimDaily(store, t);
  assert.equal(earnedToday(store.get(), t), 50, 'the start is not a town source; the daily login is');
  assert.equal(post(store, { amount: 200, kind: 'milk' }, t + 1).ok, true);
  const r = post(store, { amount: 100, kind: 'harvest' }, t + 2);
  assert.equal(r.ok, true);
  assert.equal(r.capped, true);
  assert.equal(r.cut, 50);
  assert.equal(r.entry.amount, 50, 'paid up to the cap');
  assert.equal(earnedToday(store.get(), t + 3), ECONOMY.dailyFaucetCap);
  const none = post(store, { amount: 5, kind: 'milk' }, t + 4);
  assert.equal(none.ok, false);
  assert.equal(none.capped, true);
  assert.match(none.error, /at most L\$300 a day/);
  assert.equal(post(store, { amount: 40, kind: 'stall-sell' }, t + 5).ok, true, 'selling goods back is not capped');
  assert.equal(post(store, { amount: 100, kind: 'loan' }, t + 6).ok, true, 'a loan is not capped');
  assert.equal(claimDaily(store, noon('2026-10-17')).amount, 60, 'a new day, a new cap');
  assert.equal(post(store, { amount: 5, kind: 'milk' }, noon('2026-10-17') + 1).ok, true);
});
