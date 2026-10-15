// Unit checks for the blockchain layer. Run: node public/assets/js/sim/chain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCK_TICKS, GENESIS, firstBroken, formBlocks, gasFor, hashBlock, linkChain, sha256Hex } from './chain.js';
import { createSession } from './session.js';
import { dailySeed } from './prng.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../../data/${f}`, import.meta.url), 'utf8'));
const CONFIG = { coinsConfig: load('coins.json'), agentsConfig: load('agents.json'), scenario: load('scenario.json') };

test('SHA-256 is the real thing', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('every swap becomes a transaction, and blocks form every 5 seconds', () => {
  const s = createSession({ seed: dailySeed(new Date('2026-10-16T05:00:00Z')), tier: 'builder', ...structuredClone(CONFIG) });
  s.swap('VAULT', 'buy', 100);
  for (let i = 0; i < 175; i++) s.tick();
  const txs = s.getTransactions();
  assert.ok(txs.length > 100);
  assert.deepEqual(Object.keys(txs[0]).sort(), ['L', 'coin', 'coins', 'side', 't', 'who']);
  assert.ok(txs.some((x) => x.who === 'player' && x.coin === 'VAULT' && x.side === 'buy' && x.L === 100));
  assert.ok(txs.some((x) => x.who === 'wash' && x.coin === 'FUEL'), 'wash trades are labelled');
  assert.equal(s.getTransactions(txs.length - 3).length, 3, 'read from an index');
  const blocks = formBlocks(txs, s.getState().t);
  assert.equal(blocks.length, Math.floor(175 / BLOCK_TICKS), 'only complete blocks');
  assert.equal(blocks.reduce((n, b) => n + b.txs.length, 0), txs.filter((x) => x.t < blocks.length * BLOCK_TICKS).length);
  assert.ok(gasFor(0) < gasFor(800) && gasFor(10_000) === 0.04);
});

test('changing an old transaction breaks its block and every later link', async () => {
  const s = createSession({ seed: 7, tier: 'trader', ...structuredClone(CONFIG) });
  for (let i = 0; i < 4 * BLOCK_TICKS; i++) s.tick();
  const blocks = await linkChain(formBlocks(s.getTransactions(), s.getState().t));
  assert.equal(blocks[0].prevHash, GENESIS);
  for (let i = 1; i < blocks.length; i++) assert.equal(blocks[i].prevHash, blocks[i - 1].hash);
  assert.ok(blocks.every((b) => /^[0-9a-f]{64}$/.test(b.hash)));
  assert.equal(await firstBroken(blocks), -1, 'an untouched chain checks out');
  assert.equal(await hashBlock(blocks[2], blocks[2].prevHash), blocks[2].hash, 'same data, same hash');

  blocks[1].txs[0] = { ...blocks[1].txs[0], L: blocks[1].txs[0].L * 1000 };
  assert.equal(await firstBroken(blocks), 1, 'the tampered block no longer matches its hash');
  const rehashed = await hashBlock(blocks[1], blocks[1].prevHash);
  assert.notEqual(rehashed, blocks[1].hash);
  assert.notEqual(rehashed, blocks[2].prevHash, 'so the next block no longer points at it');
});

test('a soulbound badge mint is a transaction in its block', async () => {
  const s = createSession({ seed: 11, tier: 'explorer', ...structuredClone(CONFIG) });
  for (let i = 0; i < 20; i++) s.tick();
  s.recordMint('coach:candle');
  for (let i = 0; i < BLOCK_TICKS; i++) s.tick();
  const mint = s.getTransactions().find((x) => x.who === 'mint');
  assert.deepEqual(mint, { t: 20, coin: 'BADGE', side: 'mint', coins: 1, L: 0, who: 'mint', badge: 'coach:candle' });
  const blocks = await linkChain(formBlocks(s.getTransactions(), s.getState().t));
  assert.ok(blocks[0].txs.includes(blocks[0].txs.find((x) => x.who === 'mint')), 'sealed in the first block');
  assert.equal(await firstBroken(blocks), -1);
});
