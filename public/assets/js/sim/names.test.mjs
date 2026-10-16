// Unit checks for the coin name and ticker rules (BRIEF §10). Run: node public/assets/js/sim/names.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkName, checkTicker } from './names.js';

test('names that read as a real coin are blocked', () => {
  const real = [
    'Doge', 'BTC', 'Eth', 'Usdt Coin', 'XRP', 'Shib Army', 'BNB Coin', 'Sol Coin', 'Link Token', 'Bitcoins', 'Bitcoinz',
    'Ethereums', 'Litecoins', 'Bit Coin Cash', 'Mega Bit Coin', 'Doge Coin', 'Pe Pe', 'Tether', 'Superbitcoin', 'Lite Coin',
    'Ton Coin', 'Polka Dot',
  ];
  for (const n of real) assert.equal(checkName(n)?.code, 'BLOCKED_NAME', n);
});

test('a coin word that only ends a word is fine (Rabbit Coin is not Bitcoin)', () => {
  const fine = ['Rabbit Coin', 'Hobbit Coin', 'Orbit Coin', 'Habit Coin', 'Button Coin', 'Cotton Coin', 'Boston Coin', 'Elite Coin', 'Polite Coin', 'Satellite Coin'];
  for (const n of fine) assert.equal(checkName(n), null, n);
});

test('everyday words that match a ticker are fine on their own', () => {
  for (const n of ['Ada', 'Sol', 'Golden Link', 'Sun Link Coin', 'Ethan', 'Doggo', 'Pepper', 'Electron', 'Bitty Coin']) {
    assert.equal(checkName(n), null, n);
  }
});

test('ordinary words that start like a rude word stay fine', () => {
  for (const n of ['Race Car', 'Space Race', 'Racer', 'Cockatoo', 'Cockpit', 'Cockroaches', 'Prickly Pear', 'Arsenal', 'Dickens', 'Pussycats', 'Retardant']) {
    assert.equal(checkName(n), null, n);
  }
  for (const t of ['RACE', 'RACER', 'COCKY']) assert.equal(checkTicker(t), null, t);
});

test('rude words are still blocked', () => {
  for (const n of ['Rape', 'Rapey', 'Crap Coin']) assert.equal(checkName(n)?.code, 'BLOCKED_NAME', n);
  assert.equal(checkTicker('RAPE')?.code, 'BLOCKED_TICKER');
});
