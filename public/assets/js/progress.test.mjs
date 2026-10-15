// Daily loop checks (BRIEF §14, §16): XP, the daily goal and the streak. Run by bin/check.mjs.
import assert from 'node:assert/strict';
import { dayOf, logAction, progressSummary } from './progress.js';

const store = () => {
  let state = {};
  return { get: () => state, set: (p) => (state = { ...state, ...(typeof p === 'function' ? p(state) : p) }) };
};
const DAY = 86400000;
const now = Date.parse('2026-10-16T05:00:00Z'); // 12:00 in Bangkok

// Two actions today: XP adds up, the goal is met at 30, a repeated ref counts once.
{
  const s = store();
  logAction(s, { kind: 'lesson', xp: 10, ref: 'a', at: now });
  logAction(s, { kind: 'lesson', xp: 10, ref: 'a', at: now });
  logAction(s, { kind: 'checkpoint', xp: 30, ref: 'b', at: now });
  const p = progressSummary(s.get(), now);
  assert.equal(p.xp, 40);
  assert.equal(p.todayXp, 40);
  assert.equal(p.goalMet, true);
  assert.equal(p.streak, 1);
  assert.equal(dayOf(now), '2026-10-16');
}

// Three days in a row make a streak of 3; it still shows the next morning, and a missed day resets it.
{
  const s = store();
  for (const d of [3, 2, 1]) logAction(s, { kind: 'piggy', xp: 5, at: now - d * DAY });
  assert.equal(progressSummary(s.get(), now).streak, 3);
  assert.equal(progressSummary(s.get(), now).activeToday, false);
  assert.equal(progressSummary(s.get(), now + DAY).streak, 0);
}

console.log('progress: ok');
