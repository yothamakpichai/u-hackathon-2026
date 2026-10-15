// Constant-product market maker priced in L$: x · y = k.
// x = L$ reserve, y = coin reserve, price = x / y.
// The fee stays in the pool (as in Uniswap v2), so k never falls on a swap.
// A bonding curve is the same pool plus a virtual L$ reserve that nobody can withdraw.

export function createPool({ reserveL, reserveCoins, fee, virtualL = 0 }) {
  return { x: reserveL + virtualL, y: reserveCoins, fee, virtualL };
}

export const poolPrice = (p) => p.x / p.y;

// L$ that really sits in the pool (excludes the virtual part of a bonding curve).
export const realL = (p) => p.x - p.virtualL;

// L$ in → coins out.
export function quoteBuy(p, amountL) {
  const inEff = amountL * (1 - p.fee);
  return (p.y * inEff) / (p.x + inEff);
}

// Coins in → L$ out. Never pays out more real L$ than the pool holds.
export function quoteSell(p, coins) {
  const inEff = coins * (1 - p.fee);
  return Math.min((p.x * inEff) / (p.y + inEff), realL(p));
}

export function buy(p, amountL) {
  const out = quoteBuy(p, amountL);
  p.x += amountL;
  p.y -= out;
  return out;
}

export function sell(p, coins) {
  const out = quoteSell(p, coins);
  p.y += coins;
  p.x -= out;
  return out;
}

// Trade that moves the price to `target`, ignoring the fee. Used to size NPC trades.
export function tradeToPrice(p, target) {
  const k = p.x * p.y;
  if (target > p.x / p.y) return { side: 'buy', amount: (Math.sqrt(k * target) - p.x) / (1 - p.fee) };
  return { side: 'sell', amount: (Math.sqrt(k / target) - p.y) / (1 - p.fee) };
}

// Market depth: L$ it takes to push the price to `target`, ignoring the fee. Buying up pays L$ in;
// selling down takes L$ out, never more than the pool really holds (a bonding curve has a floor).
export function depthTo(p, target) {
  const x1 = Math.sqrt(p.x * p.y * target);
  return target >= p.x / p.y ? x1 - p.x : Math.min(p.x - x1, realL(p));
}

// Withdraw a share of both reserves. Price is unchanged; depth is gone.
export function removeLiquidity(p, share) {
  const L = realL(p) * share;
  const coins = p.y * share;
  p.x -= L;
  p.y -= coins;
  return { L, coins };
}

// Bonding curve → AMM pool. The real L$ becomes the pool's L$ side and the price stays
// continuous; curve coins the pool does not need are returned so the caller can burn them.
export function graduate(p) {
  const L = realL(p);
  const coins = (L * p.y) / p.x;
  const leftover = p.y - coins;
  p.x = L;
  p.y = coins;
  p.virtualL = 0;
  return leftover;
}
