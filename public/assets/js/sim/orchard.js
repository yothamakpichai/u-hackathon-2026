// Orchard rules (BRIEF §16.1; slice J11). Pure, no DOM. Seeds cost L$; growth runs in real time,
// and the menu trades waiting for yield. Each planting is recorded as a revealed choice between
// "now" and "later" (time preference), which the Money Type screen can compare with the quiz.
// Per day of waiting the patient choice pays most: a herb sprout grows once a day in each plot
// (+1), a fruit tree replanted daily makes +10 a day, and a big mango tree +80 in its first week,
// then +15 every day.
import { dayKey } from './piggy.js';

const MIN = 60_000;
const DAY = 86_400_000;

export const SEEDS = Object.freeze({
  sprout: { label: 'Herb sprout', cost: 5, grow: 2 * MIN, harvest: 6, refruit: 0, daily: true, patience: 'now', wait: '2 minutes' },
  fruit: { label: 'Fruit tree', cost: 10, grow: DAY, harvest: 20, refruit: 0, patience: 'soon', wait: '1 day' },
  big: { label: 'Big mango tree', cost: 20, grow: 7 * DAY, harvest: 100, refruit: DAY, refruitHarvest: 15, patience: 'later', wait: '7 days' },
});
export const PLOTS = 4;
export const STAGES = ['seed', 'sprout', 'growing', 'ready'];

// Where a planted plot is now: its stage, when the next harvest is ready, and its value.
export function plotState(plot, now) {
  const seed = SEEDS[plot.seed];
  const age = now - plot.plantedAt;
  if (age < seed.grow) {
    const f = age / seed.grow;
    return { stage: f < 0.25 ? 'seed' : f < 0.6 ? 'sprout' : 'growing', share: f, readyAt: plot.plantedAt + seed.grow, harvest: seed.harvest };
  }
  // Big trees keep fruiting once grown: one more harvest each `refruit` after the last one.
  if (plot.harvests > 0) {
    if (!seed.refruit) return { stage: 'done', share: 1, readyAt: null, harvest: 0 };
    const nextAt = plot.lastHarvestAt + seed.refruit;
    return now >= nextAt
      ? { stage: 'ready', share: 1, readyAt: nextAt, harvest: seed.refruitHarvest }
      : { stage: 'grown', share: (now - plot.lastHarvestAt) / seed.refruit, readyAt: nextAt, harvest: seed.refruitHarvest };
  }
  return { stage: 'ready', share: 1, readyAt: plot.plantedAt + seed.grow, harvest: seed.harvest };
}

// Whether a seed can go in a plot now. A herb sprout grows once a day in each plot, so quick sprouts
// can't be replanted all day for L$.
export function canPlant(orchard, index, seedId, now) {
  if (orchard.plots?.[index]) return { ok: false, error: 'Something is already growing in this plot.' };
  if (SEEDS[seedId].daily && orchard.sproutDay?.[index] === dayKey(now)) {
    return { ok: false, error: `You can grow one ${SEEDS[seedId].label.toLowerCase()} a day in each plot. Plant another tomorrow.` };
  }
  return { ok: true };
}

// Plants a seed, if canPlant() allows it; otherwise the orchard stays as it was.
export function plant(orchard, index, seedId, now) {
  if (!canPlant(orchard, index, seedId, now).ok) return orchard;
  const plots = [...(orchard.plots || Array(PLOTS).fill(null))];
  plots[index] = { seed: seedId, plantedAt: now, harvests: 0, lastHarvestAt: null };
  const choices = [...(orchard.choices || []), { at: now, seed: seedId, patience: SEEDS[seedId].patience }];
  const sproutDay = SEEDS[seedId].daily ? { ...orchard.sproutDay, [index]: dayKey(now) } : orchard.sproutDay;
  return { ...orchard, plots, choices, ...(sproutDay ? { sproutDay } : {}) };
}

export function harvest(orchard, index, now) {
  const plots = [...orchard.plots];
  const p = plots[index];
  if (!p) return { orchard, coins: 0 };
  const s = plotState(p, now);
  if (s.stage !== 'ready') return { orchard, coins: 0 };
  const seed = SEEDS[p.seed];
  // One-off plants leave the plot empty for replanting; big trees stay and fruit again.
  plots[index] = seed.refruit ? { ...p, harvests: p.harvests + 1, lastHarvestAt: now } : null;
  return { orchard: { ...orchard, plots }, coins: s.harvest };
}

// Revealed time preference from what was actually planted.
export function revealedPreference(choices = []) {
  if (!choices.length) return null;
  const later = choices.filter((c) => c.patience === 'later').length;
  const now = choices.filter((c) => c.patience === 'now').length;
  const laterShare = later / choices.length;
  const nowShare = now / choices.length;
  return { count: choices.length, laterShare, nowShare, lean: laterShare > nowShare ? 'Later' : nowShare > laterShare ? 'Now' : 'Mixed' };
}

// L$ per day of waiting, so the menu can show what patience is worth. A once-a-day seed pays at most
// one harvest a day.
export const perDay = (id) => {
  const s = SEEDS[id];
  return s.daily ? s.harvest - s.cost : ((s.harvest - s.cost) / s.grow) * DAY;
};
