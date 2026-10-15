// Unit checks for the Piggy Bank and Farm rules. Run: node public/assets/js/sim/piggy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { REWARDS, birthdayAmount, calendarAmount, emergencyTarget, emptyPiggy, goalProgress, reward, streakDays, totalPoints, week52Amount } from './piggy.js';
import { COW_AT, collectMilk, cowTraits, cowsDue, feedFrom, milkReady, stageOf } from './farm.js';

const day = (iso) => Date.parse(`${iso}T05:00:00Z`); // noon in Bangkok

test('rewards follow behaviour, are capped per day, and never depend on the amount', () => {
  let p = emptyPiggy();
  let got = 0;
  for (let i = 0; i < 10; i++) {
    const r = reward(p, 'log', day('2026-10-16'));
    p = r.piggy;
    got += r.points;
  }
  assert.equal(got, REWARDS.log.points * REWARDS.log.perDay, 'logging pays only the first few times a day');
  for (const a of ['plan', 'plan', 'plan', 'reflect', 'reflect']) p = reward(p, a, day('2026-10-16')).piggy;
  assert.ok(p.rewards['2026-10-16'].total <= REWARDS.capPerDay, 'daily cap');
  assert.equal(reward(emptyPiggy(), 'buy-a-car', day('2026-10-16')).points, 0, 'unknown actions earn nothing');
  // The API has no amount at all: a 10 baht log and a 10,000 baht log earn the same.
  assert.equal(reward.length, 3);
});

test('a streak continues across consecutive Bangkok days', () => {
  let p = emptyPiggy();
  p = reward(p, 'log', day('2026-10-14')).piggy;
  p = reward(p, 'log', day('2026-10-15')).piggy;
  const r = reward(p, 'log', day('2026-10-16'));
  assert.equal(r.points, REWARDS.streak.points + REWARDS.log.points, 'streak bonus on the first action of the day');
  assert.equal(streakDays(r.piggy, day('2026-10-16')), 3);
  assert.equal(streakDays(r.piggy, day('2026-10-18')), 0, 'a missed day ends it');
  assert.equal(totalPoints(r.piggy), 2 + 4 + 4);
});

test('challenge amounts', () => {
  assert.equal(calendarAmount(day('2026-10-16')), 16);
  assert.equal(calendarAmount(Date.parse('2026-10-15T18:00:00Z')), 16, 'Bangkok date, not UTC');
  assert.equal(birthdayAmount('2026-10-16', day('2026-10-16')), 1);
  assert.equal(birthdayAmount('2026-10-16', day('2027-10-15')), 365);
  assert.equal(birthdayAmount('2026-10-16', day('2027-10-16')), null);
  assert.deepEqual(week52Amount('2026-10-16', day('2026-10-22')), { week: 1, amount: 10 });
  assert.deepEqual(week52Amount('2026-10-16', day('2026-10-23')), { week: 2, amount: 20 });
  assert.equal(week52Amount('2026-10-16', day('2027-10-16')), null);
});

test('goal progress and the emergency fund', () => {
  const p = { ...emptyPiggy(), goals: [{ id: 'g1', target: 500 }], entries: [{ goalId: 'g1', kind: 'in', amount: 300 }, { goalId: 'g1', kind: 'out', amount: 50 }, { goalId: null, kind: 'in', amount: 999 }] };
  assert.deepEqual(goalProgress(p, 'g1'), { saved: 250, target: 500, share: 0.5 });
  assert.deepEqual(emergencyTarget(20000), { low: 60000, high: 120000 });
});

test('the farm: cows are earned from actions, grow, and give milk once a day', () => {
  const state = { piggy: { rewards: { '2026-10-16': { total: 12, counts: {} } } }, coach: { trader: { done: { candle: {}, tools: {} } } }, lesson: { trader: { done: true } }, lab: { trader: { metrics: { finalValue: 1000 } } } };
  const feed = feedFrom(state);
  assert.deepEqual(feed, { total: 12 + 10 + 5 + 3, piggy: 12, coach: 2, lessons: 1, runs: 1 });
  const { cows, born } = cowsDue({ cows: [] }, feed.total, day('2026-10-16'));
  assert.equal(cows.length, 1, `one cow at ${feed.total} feed (thresholds ${COW_AT})`);
  assert.equal(born.length, 1);
  assert.equal(cowsDue({ cows }, feed.total, day('2026-10-16')).born.length, 0, 'never born twice');
  assert.equal(stageOf(cows[0], 5).id, 'calf');
  assert.equal(stageOf(cows[0], 40).id, 'adult');
  assert.equal(milkReady(cows[0], {}, 10, day('2026-10-16')), false, 'calves give no milk');
  const r = collectMilk({ coins: 0 }, cows, 40, day('2026-10-16'));
  assert.equal(r.litres, cows[0].milk);
  assert.equal(r.farm.coins, cows[0].milk * 5);
  assert.equal(collectMilk(r.farm, cows, 40, day('2026-10-16')).litres, 0, 'once a day');
  assert.equal(collectMilk(r.farm, cows, 40, day('2026-10-17')).litres, cows[0].milk, 'again tomorrow');
  assert.deepEqual(cowTraits('x'), cowTraits('x'), 'traits are seeded');
  assert.notDeepEqual(cowTraits('x'), cowTraits('y'));
});
