// Unit checks for where the Farm's feed comes from. Run: node public/assets/js/sim/farm.test.mjs
// (cows, growth and milk are checked in piggy.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { feedFrom } from './farm.js';

const at = (iso) => Date.parse(`${iso}T05:00:00Z`); // noon in Bangkok

test('every finished Learning Path step feeds the cow, at any level', () => {
  const step = { at: at('2026-10-16'), xp: 10 };
  const feed = feedFrom({ path: { explorer: { done: { 'u1-l1': step, 'u1-l2': step } }, trader: { done: { 'u1-m1': step }, missions: { x: {} } } } });
  assert.equal(feed.lessons, 3, 'lessons, missions and checkpoints alike');
  assert.equal(feed.total, 15);
  assert.equal(feedFrom({ lesson: { trader: { done: true } }, path: { trader: { done: { 'u1-l1': step } } } }).lessons, 2, 'old #/lesson saves still count');
});

test('each Bangkok day with a finished market feeds the cow once per level', () => {
  const run = (iso) => ({ at: at(iso), metrics: { finalValue: 1000 } });
  // The Lab keeps only the latest run; the progress log remembers the earlier ones by day.
  const refs = {
    [`market:explorer:${at('2026-10-14')}`]: '2026-10-14',
    [`market:explorer:${at('2026-10-15')}`]: '2026-10-15',
    [`market:explorer:${at('2026-10-15') + 60_000}`]: '2026-10-15',
    'coach:explorer:candle': '2026-10-15',
  };
  const feed = feedFrom({ lab: { explorer: run('2026-10-16') }, progress: { refs } });
  assert.equal(feed.runs, 3, 'three days, and a replay on the same day adds nothing');
  assert.equal(feedFrom({ lab: { explorer: run('2026-10-15') }, progress: { refs } }).runs, 2, 'the latest run is not counted twice');
  assert.equal(feedFrom({ lab: { explorer: run('2026-10-16'), trader: run('2026-10-16') } }).runs, 2, 'each level counts');
  assert.equal(feedFrom({ lab: { explorer: { at: at('2026-10-16'), metrics: {} } } }).runs, 0, 'an unfinished run does not');
});

test('the days that make the streak feed the cow, and feed never goes down', () => {
  const days = { '2026-10-14': { xp: 10, actions: 1 }, '2026-10-15': { xp: 0, actions: 0 }, '2026-10-16': { xp: 5, actions: 2 } };
  const feed = feedFrom({ progress: { xp: 15, days, refs: {} } });
  assert.equal(feed.days, 2);
  assert.equal(feed.total, 4);
  // A missed day ends the streak but takes no feed away: cows never shrink.
  const later = feedFrom({ progress: { xp: 15, days: { ...days, '2026-10-20': { xp: 2, actions: 1 } }, refs: {} } });
  assert.ok(later.total > feed.total);
  assert.deepEqual(feedFrom({}), { total: 0, piggy: 0, coach: 0, lessons: 0, runs: 0, days: 0 });
});
