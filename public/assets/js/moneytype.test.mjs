// Money Check scoring checks (BRIEF §16): the score and the four Money Types. Run by bin/check.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreMoneyCheck } from './moneytype.js';

const data = JSON.parse(readFileSync(new URL('../../data/money_check.json', import.meta.url), 'utf8'));
const items = data.items;
assert.equal(items.length, 15);
assert.deepEqual(
  Object.entries(items.reduce((n, i) => ({ ...n, [i.kind]: (n[i.kind] || 0) + 1 }), {})).sort(),
  [['behaviour', 4], ['knowledge', 5], ['risk', 2], ['script', 2], ['time', 2]],
);
assert.deepEqual(Object.keys(data.types).sort(), ['cat', 'eagle', 'monkey', 'turtle']);

const all = (pick) => Object.fromEntries(items.map((i) => [i.id, pick(i)]));

// Every knowledge item right, "Always" for every habit, later and careful: 100 and a Steady Turtle.
{
  const r = scoreMoneyCheck(items, all((i) => (i.kind === 'knowledge' ? i.answerIndex : i.kind === 'behaviour' ? 3 : i.kind === 'time' ? i.later : 0)));
  assert.equal(r.score, 100);
  assert.equal(r.type, 'turtle');
  assert.equal(r.presentBias, false);
}

// Nothing right, "Never" for every habit, now and bold, agreeing with both money beliefs: 0 and a Spark Monkey.
{
  const r = scoreMoneyCheck(items, all((i) => (i.kind === 'knowledge' ? (i.answerIndex + 1) % 3 : i.kind === 'behaviour' ? 0 : i.kind === 'risk' ? i.bold : i.kind === 'script' ? 2 : 0)));
  assert.equal(r.score, 0);
  assert.equal(r.type, 'monkey');
  assert.deepEqual([r.scripts.worship, r.scripts.status], [true, true]);
}

// Present bias: "today" now, but happy to wait when both rewards are months away.
{
  const answers = all((i) => (i.kind === 'behaviour' ? 2 : 0));
  answers['t-far'] = items.find((i) => i.id === 't-far').later;
  const r = scoreMoneyCheck(items, answers);
  assert.equal(r.time, 'now');
  assert.equal(r.presentBias, true);
  assert.equal(r.behaviour, 33);
}

console.log('moneytype: ok');
