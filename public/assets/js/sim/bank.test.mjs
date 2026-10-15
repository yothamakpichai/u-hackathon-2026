// Unit checks for the Daily Stall and the Bank. Run: node public/assets/js/sim/bank.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOODS, SPREAD, dateKeyOf, dayGoods, dayPath, minuteOf, priceAt, sellPrice, spoilState } from './stall.js';
import { RULES, addDays, interestOn, loanState, minimumDue, minimumPayoff, payoffPlan, quoteLoan, restructure } from './bank.js';

test('the stall is the same for everyone on a date, and prices move during the day', () => {
  assert.deepEqual(dayGoods('2026-10-16'), dayGoods('2026-10-16'));
  assert.equal(dayGoods('2026-10-16').length, 4);
  assert.notDeepEqual([...Array(7)].map((_, i) => dayGoods(addDays('2026-10-16', i)).join()).filter((v, i, a) => a.indexOf(v) === i).length, 1);
  const g = dayGoods('2026-10-16')[0];
  const prices = [0, 300, 600, 900, 1200].map((m) => priceAt(g, '2026-10-16', m));
  assert.ok(new Set(prices).size > 1, `prices move: ${prices}`);
  assert.equal(priceAt(g, '2026-10-16', 600), priceAt(g, '2026-10-16', 600), 'deterministic');
  assert.ok(Math.abs(sellPrice(g, '2026-10-16', 600) - priceAt(g, '2026-10-16', 600) * (1 - SPREAD)) < 0.011, 'the stall buys back lower');
  assert.equal(dayPath(g, '2026-10-16', 125).length, 13);
  assert.equal(dateKeyOf(Date.parse('2026-10-15T17:30:00Z')), '2026-10-16', 'Bangkok date');
  assert.equal(minuteOf(Date.parse('2026-10-15T17:30:00Z')), 30);
});

test('spoilage is a holding cost', () => {
  assert.equal(GOODS.fish.spoilDays, 1);
  assert.deepEqual(spoilState({ good: 'fish', boughtDate: '2026-10-16' }, '2026-10-16'), { spoiled: false, daysLeft: 1 });
  assert.deepEqual(spoilState({ good: 'fish', boughtDate: '2026-10-16' }, '2026-10-17'), { spoiled: true, daysLeft: 0 });
  assert.deepEqual(spoilState({ good: 'rice', boughtDate: '2026-01-01' }, '2026-10-17'), { spoiled: false, daysLeft: null });
});

test('a loan shows its total cost up front and interest never exceeds the principal', () => {
  const q = quoteLoan({ principal: 50, days: 7, dailyRate: 0.01 });
  assert.deepEqual(q, { principal: 50, days: 7, dailyRate: 0.01, interest: 3.5, total: 53.5, capped: false });
  const loan = { id: 'a', principal: 50, dailyRate: 0.01, start: '2026-10-16', due: '2026-10-22', paid: 0 };
  assert.equal(interestOn(loan, '2026-10-16'), 0.5, 'the first day counts');
  assert.equal(loanState(loan, '2026-10-22').owed, 53.5);
  assert.equal(loanState(loan, '2026-10-23').late, true);
  assert.equal(interestOn(loan, '2036-01-01'), 50, 'game rule: capped at the principal');
  const shark = quoteLoan({ principal: 30, days: 30, dailyRate: RULES.quickCash.dailyRate });
  assert.equal(shark.interest, 30);
  assert.equal(shark.capped, true);
});

test('restructuring freezes interest and spreads the rest weekly', () => {
  const loan = { id: 'a', principal: 100, dailyRate: 0.02, start: '2026-10-01', due: '2026-10-08', paid: 0 };
  const r = restructure(loan, '2026-10-10', 4);
  const owed = loanState(loan, '2026-10-10').owed;
  assert.equal(loanState(r, '2026-11-30').owed, owed, 'no more interest after the plan starts');
  assert.equal(r.plan.weekly, Math.round((owed / 4) * 100) / 100);
  assert.equal(loanState(r, '2026-10-20').late, false, 'on the plan, not late');
});

test('the minimum payment takes far longer and costs more than paying in full', () => {
  const real = minimumPayoff(100);
  const game = minimumPayoff(100, { cap: true });
  assert.ok(real.weeks > 20 && real.interest > 40, `${real.weeks} weeks, ${real.interest} interest`);
  assert.ok(game.interest <= 100);
  assert.equal(minimumDue(100), 10);
  assert.equal(minimumDue(20), 5);
  assert.equal(minimumDue(3), 3);
});

test('highest rate first costs less interest; smallest first clears a loan sooner', () => {
  const loans = [{ id: 'small', owed: 20, dailyRate: 0.01 }, { id: 'big', owed: 100, dailyRate: 0.05 }];
  const avalanche = payoffPlan(loans, 10, 'rate');
  const snowball = payoffPlan(loans, 10, 'smallest');
  assert.ok(avalanche.interest < snowball.interest, `${avalanche.interest} < ${snowball.interest}`);
  assert.equal(snowball.order[0], 'small', 'a quick win first');
});
