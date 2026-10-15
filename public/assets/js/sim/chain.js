// The blockchain layer (BRIEF §7): honest simulation, real cryptography. No DOM.
// Every swap is a transaction; every 5 s of market time (50 ticks) they form a block whose hash is
// SHA-256(prevHash + height + timestamp + txs), computed with Web Crypto (browsers and Node 20+).

export const BLOCK_TICKS = 50;
export const GENESIS = '0'.repeat(64);
const SIM_SECONDS_PER_TICK = 1080; // 80 ticks = 1 sim day

// One line per transaction, fixed precision, so the same trade always hashes the same way.
export const serializeTx = (tx) => `${tx.t}|${tx.coin}|${tx.side}|${tx.coins.toFixed(6)}|${tx.L.toFixed(2)}|${tx.who}`;

// Gas (the network fee) is shown per transaction for learning; this lab doesn't charge it.
// Busy blocks cost more, as on real chains: L$0.01 base, up to 4x when a block is full.
export const gasFor = (txCount) => 0.01 * Math.min(4, 1 + txCount / 400);

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Group transactions into complete blocks up to tick `now` (the block still forming is left out).
export function formBlocks(txs, now) {
  const blocks = [];
  const complete = Math.floor(now / BLOCK_TICKS);
  for (let height = 0; height < complete; height++) {
    blocks.push({ height, from: height * BLOCK_TICKS, to: (height + 1) * BLOCK_TICKS, timestamp: (height + 1) * BLOCK_TICKS * SIM_SECONDS_PER_TICK, txs: [] });
  }
  for (const tx of txs) {
    const b = blocks[Math.floor(tx.t / BLOCK_TICKS)];
    if (b) b.txs.push(tx);
  }
  return blocks;
}

export const hashBlock = (b, prevHash) => sha256Hex(`${prevHash}${b.height}${b.timestamp}${b.txs.map(serializeTx).join('\n')}`);

// Link the blocks: each stores the previous block's hash and its own.
export async function linkChain(blocks) {
  let prev = GENESIS;
  for (const b of blocks) {
    b.prevHash = prev;
    b.hash = await hashBlock(b, prev);
    prev = b.hash;
  }
  return blocks;
}

// Re-check every block against its stored hash and link. Returns the height of the first block that
// no longer matches, or -1 when the whole chain is intact.
export async function firstBroken(blocks) {
  let prev = GENESIS;
  for (const b of blocks) {
    if (b.prevHash !== prev || (await hashBlock(b, b.prevHash)) !== b.hash) return b.height;
    prev = b.hash;
  }
  return -1;
}
