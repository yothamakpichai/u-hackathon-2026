// Daily Stall rules (BRIEF §16.1; slice J12). Pure, no DOM. Each Bangkok date brings a seeded line-up
// of goods (the same for everyone), prices move every 10 minutes through the day, and some goods
// spoil after a few days: holding has a cost. The stall buys back below its selling price.
import { ECONOMY } from '../config.js';
import { hashString, mulberry32 } from './prng.js';

export const GOODS = Object.freeze({
  mango: { label: 'Mangoes', unit: 'basket', base: 12, vol: 0.06, spoilDays: 2 },
  fish: { label: 'Fresh fish', unit: 'tray', base: 18, vol: 0.08, spoilDays: 1 },
  flowers: { label: 'Jasmine garlands', unit: 'bundle', base: 6, vol: 0.07, spoilDays: 1 },
  coconut: { label: 'Coconuts', unit: 'crate', base: 9, vol: 0.04, spoilDays: 5 },
  rice: { label: 'Rice', unit: 'sack', base: 25, vol: 0.02, spoilDays: null },
  pots: { label: 'Clay pots', unit: 'pot', base: 15, vol: 0.03, spoilDays: null },
  kites: { label: 'Kites', unit: 'kite', base: 8, vol: 0.05, spoilDays: null },
});
export const SPREAD = ECONOMY.storeSpread; // the stall buys back at 10% under its selling price (BRIEF §17)
export const STEP_MINUTES = 10;
const STEPS = (24 * 60) / STEP_MINUTES;
const BKK = 7 * 3600 * 1000;

export const dateKeyOf = (now) => new Date(now + BKK).toISOString().slice(0, 10);
export const minuteOf = (now) => {
  const d = new Date(now + BKK);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// Four goods on sale today, picked by the date alone.
export function dayGoods(dateKey) {
  const r = mulberry32(hashString(`stall:${dateKey}`));
  const ids = Object.keys(GOODS);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, 4);
}

// Today's price path for one good: an opening price, then a seeded walk every 10 minutes.
const pathCache = new Map();
function pathOf(good, dateKey) {
  const key = `${good}:${dateKey}`;
  if (pathCache.has(key)) return pathCache.get(key);
  const g = GOODS[good];
  const r = mulberry32(hashString(`stall:${dateKey}:${good}`));
  const open = g.base * (0.75 + 0.5 * r());
  const path = [open];
  const sigma = g.vol / Math.sqrt(STEPS / 6);
  for (let i = 1; i <= STEPS; i++) {
    const z = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
    // A gentle pull back toward the open keeps prices from wandering off in a day.
    const drift = 0.02 * Math.log(open / path[i - 1]);
    path.push(path[i - 1] * Math.exp(drift + sigma * z));
  }
  if (pathCache.size > 200) pathCache.clear();
  pathCache.set(key, path);
  return path;
}

// What the stall sells at (you buy at this price), at a minute of the Bangkok day.
export function priceAt(good, dateKey, minute) {
  const path = pathOf(good, dateKey);
  const step = Math.max(0, Math.min(STEPS, Math.floor(minute / STEP_MINUTES)));
  return Math.round(path[step] * 100) / 100;
}
export const sellPrice = (good, dateKey, minute) => Math.round(priceAt(good, dateKey, minute) * (1 - SPREAD) * 100) / 100;

// The day's prices so far, for a small chart.
export const dayPath = (good, dateKey, minute) => pathOf(good, dateKey).slice(0, Math.floor(minute / STEP_MINUTES) + 1).map((p) => Math.round(p * 100) / 100);

// A holding spoils `spoilDays` after the day it was bought (never for goods without a limit).
export function spoilState(holding, todayKey) {
  const days = GOODS[holding.good].spoilDays;
  if (days == null) return { spoiled: false, daysLeft: null };
  const left = days - daysBetween(holding.boughtDate, todayKey);
  return { spoiled: left <= 0, daysLeft: Math.max(0, left) };
}
