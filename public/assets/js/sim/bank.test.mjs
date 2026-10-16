// Unit checks for the Daily Stall and the Bank. Run: node public/assets/js/sim/bank.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOODS, SPREAD, dateKeyOf, dayGoods, dayPath, minuteOf, priceAt, sellPrice, spoilState } from './stall.js';
import { RULES, addDays, canBorrow, earnsOnTime, interestOn, loanState, minimumDue, minimumPayoff, payLoan, payoffPlan, quoteLoan, restructure } from './bank.js';
import { coinText, moneyText, post } from '../../../js/wallet.js';

test('a refused spend shows the balance cut to the cent and says how much is short', () => {
  let state = {};
  const store = { get: () => state, set: (patch) => (state = { ...state, ...patch }) };
  post(store, { amount: 46.13, kind: 'grant' });
  const r = post(store, { amount: -233.82, kind: 'stall-buy' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'You have L$46.13, which isn’t enough.');
  assert.equal(r.short, 187.69);
  assert.equal(coinText(9.999), '9.99', 'never rounded up');
  assert.equal(moneyText(1), 'L$1');
  assert.equal(moneyText(12.5), 'L$12.50');
});

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

test('a loan repaid in full stays repaid: no interest comes back the next day', () => {
  const loan = { id: 'a', principal: 20, dailyRate: 0.01, start: '2026-10-14', due: '2026-10-20', paid: 0 };
  const half = payLoan(loan, 10, '2026-10-15');
  assert.equal(half.closedOn, undefined, 'a part payment leaves it open');
  const done = payLoan(half, loanState(half, '2026-10-16').owed, '2026-10-16');
  assert.equal(done.closedOn, '2026-10-16');
  for (const day of ['2026-10-17', '2026-10-21', '2026-12-01']) {
    const s = loanState(done, day);
    assert.ok(s.paid && !s.late && s.owed === 0, `${day}: owed ${s.owed}`);
  }
  // A plan paid off before its freeze date stops at the day it was paid.
  const planned = restructure(loan, '2026-10-14', 4);
  const cleared = payLoan(planned, loanState(planned, '2026-10-15').owed, '2026-10-15');
  assert.equal(loanState(cleared, '2026-10-30').owed, 0);
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

// The payoff card's input, built from stored loans the way the Bank screen builds it.
const asPayoff = (l, today) => ({ id: l.id, owed: loanState(l, today).owed, dailyRate: l.dailyRate, principal: l.principal, interest: interestOn(l, today), freezeIn: l.frozenOn ? Math.round((Date.parse(l.frozenOn) - Date.parse(today)) / 86_400_000) : undefined });

test('the payoff comparison follows the game rule and always ends with finite numbers', () => {
  const today = '2026-10-16';
  const qc = (id) => ({ id, lender: 'quickcash', principal: 30, dailyRate: 0.15, start: today, due: addDays(today, 2), paid: 0 });
  const two = [qc('a'), qc('b')].map((l) => asPayoff(l, today));
  for (const order of ['rate', 'smallest']) {
    const p = payoffPlan(two, 10, order);
    assert.ok(p.finished && Number.isFinite(p.interest) && p.days < 30, `${order}: ${p.days} days, ${p.interest}`);
    assert.ok(p.interest <= 60 - 9, 'never more interest than the cap leaves');
  }
  // A late Quick Cash at its cap plus a small Bank loan.
  const late = { id: 'qc', lender: 'quickcash', principal: 30, dailyRate: 0.15, start: addDays(today, -10), due: addDays(today, -8), paid: 0 };
  const b20 = { id: 'b20', lender: 'bank', principal: 20, dailyRate: 0.01, start: today, due: addDays(today, 6), paid: 0 };
  const mixed = [late, b20].map((l) => asPayoff(l, today));
  const small = payoffPlan(mixed, 10, 'smallest');
  const rate = payoffPlan(mixed, 10, 'rate');
  assert.ok(small.finished && rate.finished && small.days < 15 && rate.days < 15, `${small.days} / ${rate.days} days`);
  assert.ok(rate.interest <= 20, 'the capped Quick Cash adds nothing; the Bank loan at most its principal');
  // Eight loans of 100 at 1.5% a day: 12 coins of interest a day is more than the budget.
  const many = [...Array(8)].map((_, i) => asPayoff({ id: `m${i}`, lender: 'bank', principal: 100, dailyRate: 0.015, start: today, due: addDays(today, 13), paid: 0 }, today));
  const slow = payoffPlan(many, 10, 'rate');
  assert.equal(slow.covered, false, 'the budget does not cover the interest');
  assert.ok(slow.finished && Number.isFinite(slow.interest) && slow.interest <= 800, `${slow.days} days, ${slow.interest}`);
  // A loan on a plan adds no interest after its freeze date.
  const planned = restructure({ ...b20, start: addDays(today, -20), due: addDays(today, -14) }, today, 4);
  const frozen = payoffPlan([asPayoff(planned, today)], 1, 'rate');
  assert.equal(frozen.interest, 0);
});

test('a plan never costs less than the loan’s own terms', () => {
  const loan = { id: 'a', principal: 100, dailyRate: 0.01, start: '2026-10-16', due: '2026-10-29', paid: 0 };
  const quote = quoteLoan({ principal: 100, days: 14, dailyRate: 0.01 });
  const early = restructure(loan, '2026-10-16', 4);
  assert.equal(loanState(early, '2026-11-30').owed, quote.total, 'a day-one plan still owes the quoted total');
  assert.equal(early.plan.weekly, Math.round((quote.total / 4) * 100) / 100);
});

test('the score grows only from loans really carried and repaid on time', () => {
  const loan = { id: 'a', principal: 20, dailyRate: 0.01, start: '2026-10-16', due: '2026-10-18', paid: 0 };
  assert.equal(earnsOnTime(loan, '2026-10-16'), false, 'borrow and repay the same day: no +20');
  assert.equal(earnsOnTime(loan, '2026-10-17'), true);
  assert.equal(earnsOnTime(restructure(loan, '2026-10-16'), '2026-10-17'), false, 'no +20 after a plan');
  assert.equal(earnsOnTime({ ...loan, lateMarked: true }, '2026-10-17'), false);
  // Once a week at most, so six small loans held overnight earn one +20, not six.
  assert.equal(earnsOnTime(loan, '2026-10-17', '2026-10-17'), false, 'already earned today');
  assert.equal(earnsOnTime(loan, '2026-10-17', '2026-10-11'), false, 'six days ago');
  assert.equal(earnsOnTime(loan, '2026-10-17', '2026-10-10'), true, 'a week ago');
});

test('on equal rates both payoff orders start with the smallest loan', () => {
  const loans = [{ id: 'big', owed: 50.5, dailyRate: 0.01, principal: 50 }, { id: 'small', owed: 20.2, dailyRate: 0.01, principal: 20 }];
  assert.deepEqual(payoffPlan(loans, 10, 'rate').order, payoffPlan(loans, 10, 'smallest').order);
  assert.equal(payoffPlan(loans, 10, 'rate').order[0], 'small');
});

test('the Bank checks before it lends; Quick Cash lends one loan at a time', () => {
  const today = '2026-10-16';
  const bank = (id, principal, extra = {}) => ({ id, lender: 'bank', principal, dailyRate: 0.01, start: today, due: addDays(today, 6), paid: 0, ...extra });
  assert.equal(canBorrow({ loans: [], todayKey: today, amount: 100, limit: 132 }).ok, true);
  const full = canBorrow({ loans: [bank('a', 100)], todayKey: today, amount: 50, limit: 132 });
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'limit');
  assert.equal(full.owed, 101);
  assert.equal(full.room, 31);
  assert.equal(canBorrow({ loans: [bank('a', 100)], todayKey: today, amount: 20, limit: 132 }).ok, true);
  assert.equal(canBorrow({ loans: [bank('a', 20, { start: addDays(today, -9), due: addDays(today, -3) })], todayKey: today, amount: 20, limit: 200 }).reason, 'late');
  const qc = { id: 'q', lender: 'quickcash', principal: 30, dailyRate: 0.15, start: today, due: addDays(today, 2), paid: 0 };
  assert.equal(canBorrow({ loans: [qc], todayKey: today, lender: 'quickcash' }).reason, 'quickcash-open');
  assert.equal(canBorrow({ loans: [{ ...qc, paid: 34.5 }], todayKey: today, lender: 'quickcash' }).ok, true);
  assert.equal(canBorrow({ loans: [bank('a', 100)], todayKey: today, amount: 20, limit: 300 }).ok, true);
});
