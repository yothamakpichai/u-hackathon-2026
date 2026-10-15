// Piggy Bank rules (BRIEF §16; slice J11). Pure, no DOM. The Piggy Bank records the user's own real
// cash by self-report and never touches it. Rewards go only to behaviour the app can see (logging,
// planning, reflecting, keeping a streak), capped per day, and never depend on the amount.
import { bangkokDate } from './prng.js';

export const REWARDS = Object.freeze({
  log: { points: 2, perDay: 3 }, // logging money in or out
  plan: { points: 3, perDay: 2 }, // setting up a goal or a challenge
  reflect: { points: 3, perDay: 1 }, // answering a reflection prompt
  streak: { points: 2, perDay: 1 }, // any action on a day that continues a streak
  capPerDay: 12,
});

export const dayKey = (now) => bangkokDate(new Date(now));

export const emptyPiggy = () => ({ goals: [], entries: [], reflections: [], challenges: {}, rewards: {} });

// Points earned on a Bangkok date: { total, counts: { log, plan, reflect, streak } }.
const dayOf = (piggy, key) => piggy.rewards?.[key] || { total: 0, counts: {} };

// Record an action and award points within the caps. Returns { piggy, points } (a new object).
export function reward(piggy, action, now) {
  const rule = REWARDS[action];
  if (!rule) return { piggy, points: 0 };
  const key = dayKey(now);
  const day = structuredClone(dayOf(piggy, key));
  let points = 0;
  const grant = (name) => {
    const r = REWARDS[name];
    const used = day.counts[name] || 0;
    if (used >= r.perDay) return;
    const room = REWARDS.capPerDay - day.total;
    const give = Math.max(0, Math.min(r.points, room));
    day.counts[name] = used + 1;
    day.total += give;
    points += give;
  };
  // The first action of a day that follows yesterday's keeps the streak going.
  if (!piggy.rewards?.[key] && streakDays(piggy, now - 86_400_000) > 0) grant('streak');
  grant(action);
  return { piggy: { ...piggy, rewards: { ...piggy.rewards, [key]: day } }, points };
}

export const totalPoints = (piggy) => Object.values(piggy.rewards || {}).reduce((s, d) => s + d.total, 0);

// Consecutive Bangkok days with any rewarded action, ending on the day of `now`.
export function streakDays(piggy, now) {
  let n = 0;
  let t = now;
  while (piggy.rewards?.[dayKey(t)]) {
    n++;
    t -= 86_400_000;
  }
  return n;
}

// ---- challenges -----------------------------------------------------------------------------

// Calendar: save the number of today's date (on the 16th, save 16).
export const calendarAmount = (now) => Number(dayKey(now).slice(8, 10));

// Birthday year: save 1 on the first day, 2 on the second, up to 365, counting from a start date the
// user picks (their birthday, or any day). Returns null outside the 365 days.
export function birthdayAmount(startKey, now) {
  const days = Math.round((Date.parse(`${dayKey(now)}T00:00:00Z`) - Date.parse(`${startKey}T00:00:00Z`)) / 86_400_000) + 1;
  return days >= 1 && days <= 365 ? days : null;
}

// 52 weeks: in week N, save N times the unit (10 baht by default).
export function week52Amount(startKey, now, unit = 10) {
  const days = Math.round((Date.parse(`${dayKey(now)}T00:00:00Z`) - Date.parse(`${startKey}T00:00:00Z`)) / 86_400_000);
  const week = Math.floor(days / 7) + 1;
  return days >= 0 && week <= 52 ? { week, amount: week * unit } : null;
}

// ---- goals and money -----------------------------------------------------------------------

export function goalProgress(piggy, goalId) {
  const goal = piggy.goals.find((g) => g.id === goalId);
  const saved = piggy.entries
    .filter((e) => e.goalId === goalId)
    .reduce((s, e) => s + (e.kind === 'in' ? e.amount : -e.amount), 0);
  const target = goal?.target || 0;
  return { saved, target, share: target > 0 ? Math.max(0, Math.min(1, saved / target)) : 0 };
}

export const balance = (piggy) => piggy.entries.reduce((s, e) => s + (e.kind === 'in' ? e.amount : -e.amount), 0);

// Adults: an emergency fund of 3 to 6 months of expenses.
export const emergencyTarget = (monthlyExpenses) => {
  const m = Math.max(0, Number(monthlyExpenses) || 0);
  return { low: 3 * m, high: 6 * m };
};
