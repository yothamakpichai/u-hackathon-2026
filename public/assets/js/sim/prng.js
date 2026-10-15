// Seeded randomness for the sim. Nothing inside the sim may call Math.random().

// FNV-1a, 32-bit.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: tiny and fast. Returns a function that yields floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Calendar date in Asia/Bangkok (UTC+7, no daylight saving) as YYYY-MM-DD.
export function bangkokDate(date = new Date()) {
  return new Date(date.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// Today's market: everyone on the same Bangkok date gets the same seed.
export function dailySeed(date = new Date()) {
  return hashString('market-lab:' + bangkokDate(date));
}
