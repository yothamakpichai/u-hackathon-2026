// Orchard rules (BRIEF §16.1; slice J11). Pure, no DOM. Seeds cost coins; growth runs in real time,
// and the menu trades waiting for yield. Each planting is recorded as a revealed choice between
// "now" and "later" (time preference), which the Money Type screen can compare with the quiz.

const MIN = 60_000;
const DAY = 86_400_000;

export const SEEDS = Object.freeze({
  sprout: { label: 'Herb sprout', cost: 5, grow: 2 * MIN, harvest: 6, refruit: 0, patience: 'now', wait: '2 minutes' },
  fruit: { label: 'Fruit tree', cost: 10, grow: DAY, harvest: 20, refruit: 0, patience: 'soon', wait: '1 day' },
  big: { label: 'Big mango tree', cost: 20, grow: 7 * DAY, harvest: 60, refruit: DAY, refruitHarvest: 12, patience: 'later', wait: '7 days, then fruit every day' },
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

export function plant(orchard, index, seedId, now) {
  const plots = [...(orchard.plots || Array(PLOTS).fill(null))];
  plots[index] = { seed: seedId, plantedAt: now, harvests: 0, lastHarvestAt: null };
  const choices = [...(orchard.choices || []), { at: now, seed: seedId, patience: SEEDS[seedId].patience }];
  return { ...orchard, plots, choices };
}

export function harvest(orchard, index, now) {
  const plots = [...orchard.plots];
  const p = plots[index];
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

// Coins per day of waiting, so the menu can show what patience is worth.
export const perDay = (id) => {
  const s = SEEDS[id];
  return ((s.harvest - s.cost) / s.grow) * DAY;
};
