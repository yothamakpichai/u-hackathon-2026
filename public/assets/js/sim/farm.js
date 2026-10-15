// Farm rules (BRIEF §16; slice J11). Pure, no DOM. A cow is earned, never bought: it is born and
// grows from real actions (lessons, Coach chapters, finished Lab runs and Piggy Bank actions) and
// gives milk once a day, sold for farm coins. A productive asset pays you; a meme coin does not.
import { hashString, mulberry32 } from './prng.js';
import { dayKey, totalPoints } from './piggy.js';

export const COW_AT = [5, 60, 150]; // feed needed for the 1st, 2nd and 3rd cow
export const STAGES = [
  { id: 'calf', label: 'Calf', from: 0 },
  { id: 'young', label: 'Young cow', from: 15 },
  { id: 'adult', label: 'Grown cow', from: 35 },
];
export const MILK_PRICE = 5; // farm coins per litre

// Feed comes only from things the app can see the player do.
export function feedFrom(state) {
  const piggy = totalPoints(state.piggy || {});
  const coach = Object.values(state.coach || {}).reduce((n, t) => n + Object.keys(t?.done || {}).length, 0);
  const lessons = Object.values(state.lesson || {}).filter((l) => l?.done).length;
  const runs = Object.values(state.lab || {}).filter((r) => r && typeof r === 'object' && 'finalValue' in (r.metrics || {})).length;
  return { total: piggy + 5 * coach + 5 * lessons + 3 * runs, piggy, coach, lessons, runs };
}

const NAMES_A = ['Ma', 'Bu', 'Lo', 'Pi', 'Su', 'Da', 'Mi', 'No', 'Ki', 'Ro'];
const NAMES_B = ['li', 'ndi', 'mo', 'sa', 'tu', 'rin', 'ko', 'la', 'bee', 'pa'];
const COATS = ['cream', 'brown', 'black', 'honey', 'grey'];
const PATTERNS = ['plain', 'spots', 'patches', 'belt'];
const BELLS = ['gold', 'silver', 'red', 'blue'];

// Seeded, so a cow's look and yield never change. About 1 in 10 cows has a rare star mark.
export function cowTraits(seed) {
  const r = mulberry32(hashString(`cow:${seed}`));
  const pick = (list) => list[Math.floor(r() * list.length)];
  const name = pick(NAMES_A) + pick(NAMES_B);
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    coat: pick(COATS),
    pattern: pick(PATTERNS),
    bell: pick(BELLS),
    horns: r() < 0.5,
    star: r() < 0.1,
    milk: 2 + Math.floor(r() * 3), // litres a day when grown
  };
}

// Cows due by now, given total feed. Each new cow records the feed it was born at.
export function cowsDue(farm, feed, now) {
  const cows = [...(farm.cows || [])];
  const born = [];
  while (cows.length < COW_AT.length && feed >= COW_AT[cows.length]) {
    const n = cows.length;
    const id = `cow-${n + 1}-${dayKey(now)}`;
    const cow = { id, born: now, bornAtFeed: COW_AT[n], ...cowTraits(`${id}:${farm.seed ?? 0}`) };
    cows.push(cow);
    born.push(cow);
  }
  return { cows, born };
}

export function stageOf(cow, feed) {
  const grown = feed - cow.bornAtFeed;
  return [...STAGES].reverse().find((s) => grown >= s.from) || STAGES[0];
}

// Milk can be collected once per Bangkok day from each grown cow.
export function milkReady(cow, farm, feed, now) {
  return stageOf(cow, feed).id === 'adult' && farm.milked?.[cow.id] !== dayKey(now);
}

export function collectMilk(farm, cows, feed, now) {
  const ready = cows.filter((c) => milkReady(c, farm, feed, now));
  const litres = ready.reduce((s, c) => s + c.milk, 0);
  const milked = { ...farm.milked };
  for (const c of ready) milked[c.id] = dayKey(now);
  return { farm: { ...farm, milked, coins: (farm.coins || 0) + litres * MILK_PRICE, milkLog: [...(farm.milkLog || []), { at: now, litres }] }, litres, coins: litres * MILK_PRICE };
}
