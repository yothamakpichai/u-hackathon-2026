// Daily loop (BRIEF §14, §16): XP, a daily goal of 30 XP and a streak of consecutive Bangkok days with at least
// one action. Every building counts: call logAction(store, { kind, xp, ref }) when the player does something the
// app can see (finish a lesson, log a piggy entry, milk the cow...). Kept in store.progress, in localStorage.
// Pure apart from the store, so progress.test.mjs runs it in Node.

export const DAILY_GOAL = 30;
export const XP = { lesson: 10, mission: 20, checkpoint: 30, market: 10, check: 20, piggy: 5, town: 2 };
const TIME_ZONE = 'Asia/Bangkok';
const KEEP_DAYS = 400;

export function dayOf(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

function prevDay(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Records one action. `ref` makes it count once (a lesson finished twice earns XP once); `at` dates it.
export function logAction(store, { kind, xp = 0, ref = null, at = Date.now() }) {
  let added = false;
  store.set((s) => {
    const p = s.progress || { xp: 0, days: {}, refs: {} };
    if (ref && p.refs?.[ref]) return {};
    const day = dayOf(at);
    const d = p.days?.[day] || { xp: 0, actions: 0 };
    const days = { ...p.days, [day]: { xp: d.xp + xp, actions: d.actions + 1 } };
    const keys = Object.keys(days).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete days[old];
    added = true;
    return { progress: { xp: (p.xp || 0) + xp, days, refs: ref ? { ...p.refs, [ref]: day } : { ...p.refs } } };
  });
  return added;
}

// XP, today's progress toward the goal and the streak. A streak survives until the end of the next day.
export function progressSummary(state, now = Date.now()) {
  const p = state.progress || { xp: 0, days: {} };
  const today = dayOf(now);
  const todayXp = p.days?.[today]?.xp || 0;
  let streak = 0;
  let day = p.days?.[today]?.actions ? today : prevDay(today);
  while (p.days?.[day]?.actions) {
    streak++;
    day = prevDay(day);
  }
  return { xp: p.xp || 0, todayXp, goal: DAILY_GOAL, goalMet: todayXp >= DAILY_GOAL, streak, activeToday: Boolean(p.days?.[today]?.actions) };
}

// Actions other modules record in their own store keys count too: finished Coach chapters and finished markets.
export function syncActions(store) {
  const s = store.get();
  for (const [tier, c] of Object.entries(s.coach || {})) {
    for (const [id, done] of Object.entries(c?.done || {})) {
      if (done?.at) logAction(store, { kind: 'coach', xp: done.xp || 0, ref: `coach:${tier}:${id}`, at: done.at });
    }
  }
  for (const [tier, run] of Object.entries(s.lab || {})) {
    if (run?.at) logAction(store, { kind: 'market', xp: XP.market, ref: `market:${tier}:${run.at}`, at: run.at });
  }
  // Piggy Bank logs and reflections, and every Town wallet transaction (Farm, Stall, Bank), count once each.
  const piggy = s.piggy || {};
  for (const e of [...(piggy.entries || []), ...(piggy.reflections || [])]) {
    if (e?.at) logAction(store, { kind: 'piggy', xp: XP.piggy, ref: `piggy:${e.id || e.at}`, at: e.at });
  }
  for (const e of s.wallet?.ledger || []) {
    if (e?.at) logAction(store, { kind: 'town', xp: XP.town, ref: `wallet:${e.id || e.at}`, at: e.at });
  }
}
