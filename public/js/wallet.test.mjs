// Unit checks for the Town wallet's shared contract. Run: node public/js/wallet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENCY, STARTER_GRANT, adjustCredit, ensureStarter, getBalance, moneyText, post } from './wallet.js';

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
  post(store, { amount: -0.1, kind: 'buy' }, 2);
  post(store, { amount: -0.2, kind: 'buy' }, 3);
  assert.equal(getBalance(store), 49.7, 'no floating-point dust');
  assert.equal(getBalance({ get: () => ({}) }), 0, 'a store without subscribe still reads');
});

test("every change to the balance fires 'wallet:change' with { balance }", () => {
  const seen = listen();
  const store = fakeStore();
  ensureStarter(store, 1);
  assert.deepEqual(seen, [{ balance: 50 }], 'the first post starts the watch and reports itself');
  post(store, { amount: -12.5, kind: 'buy', note: 'Mango' }, 2);
  assert.deepEqual(seen.at(-1), { balance: 37.5 });
  assert.equal(seen.length, 2);
});

test('nothing fires when the balance does not change', () => {
  const seen = listen();
  const store = fakeStore();
  getBalance(store);
  adjustCredit(store, 20, 'On time', 1);
  store.set({ muted: true });
  assert.equal(post(store, { amount: -5, kind: 'buy' }, 2).ok, false, 'a refused spend changes nothing');
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
  const r = post(store, { amount: -60, kind: 'buy' }, 2);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'You have L$50, which isn’t enough.');
  assert.equal(r.short, 10);
});
