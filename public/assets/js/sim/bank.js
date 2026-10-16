// Bank rules (BRIEF §16.1; slice J12). Pure, no DOM. Loans with simple interest per real day, the
// total cost shown before agreeing, a credit score that moves with repayment, a Town Card with weekly
// statements, and the Quick Cash trap. Game rule, unlike real loans: total interest is capped at the
// amount borrowed, and a restructuring plan is always available, so there is no punishment spiral.

export const RULES = Object.freeze({
  bankDailyRate: 0.01, // before the credit-score adjustment
  quickCash: { dailyRate: 0.15, days: 3, amount: 30 },
  loanAmounts: [20, 50, 100],
  loanDays: [3, 7, 14],
  credit: { onTime: 20, onTimeEvery: 7, late: -40, restructure: -10 },
  card: { weeklyRate: 0.05, minShare: 0.1, minFloor: 5, dueDays: 3 },
});

const DAY = 86_400_000;
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
export const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// Before agreeing: the whole cost if repaid on the due date (capped by the game rule).
export function quoteLoan({ principal, days, dailyRate }) {
  const raw = principal * dailyRate * days;
  const interest = Math.min(principal, raw);
  return { principal, days, dailyRate, interest: round(interest), total: round(principal + interest), capped: raw > principal };
}

// Interest so far: simple, per real day, frozen once restructured or repaid, never above the principal.
export function interestOn(loan, todayKey) {
  const stop = [loan.frozenOn, loan.closedOn].filter(Boolean).sort()[0];
  const until = stop && stop < todayKey ? stop : todayKey;
  const days = Math.max(1, daysBetween(loan.start, until) + 1);
  return round(Math.min(loan.principal, loan.principal * loan.dailyRate * days));
}

export function loanState(loan, todayKey) {
  const interest = interestOn(loan, todayKey);
  const owed = round(Math.max(0, loan.principal + interest - (loan.paid || 0)));
  const due = loan.plan ? loan.plan.due : loan.due;
  return { interest, owed, due, late: owed > 0 && todayKey > due, paid: owed <= 0 };
}

// A repayment. A loan repaid in full is closed that day, so no more interest builds up on it later.
export function payLoan(loan, amount, todayKey) {
  const next = { ...loan, paid: round((loan.paid || 0) + amount) };
  return loanState(next, todayKey).paid ? { ...next, closedOn: todayKey } : next;
}

// Restructuring: freeze the interest and spread what is owed over equal weekly payments. A plan made
// before the due date still counts the interest up to the due date, so it never costs less than the
// loan's own terms; it only stops the interest growing after that.
export function restructure(loan, todayKey, weeks = 4) {
  const frozenOn = todayKey < loan.due ? loan.due : todayKey;
  const { owed } = loanState(loan, frozenOn);
  return { ...loan, frozenOn, plan: { weeks, weekly: round(owed / weeks), due: addDays(todayKey, weeks * 7), from: todayKey } };
}

// The +20 for repaying on time goes only to a loan repaid on a later Bangkok day than it was taken,
// never late or on a plan, and at most once a week (`lastOn`: the date of the last one), so borrowing
// and repaying at once, or many small loans, can't farm the score.
export const earnsOnTime = (loan, todayKey, lastOn = null) => loan.start < todayKey && !loan.plan && !loan.lateMarked && !loanState(loan, todayKey).late
  && !(lastOn && daysBetween(lastOn, todayKey) < RULES.credit.onTimeEvery);

// The Bank checks before it lends; Quick Cash checks nothing but lends one loan at a time.
// `limit` is the most the player may owe across all loans (set by the credit score).
export function canBorrow({ loans, todayKey, amount, lender = 'bank', limit }) {
  const open = loans.filter((l) => !loanState(l, todayKey).paid);
  if (lender === 'quickcash') {
    return open.some((l) => l.lender === 'quickcash') ? { ok: false, reason: 'quickcash-open' } : { ok: true };
  }
  if (open.some((l) => loanState(l, todayKey).late)) return { ok: false, reason: 'late' };
  const owed = round(open.reduce((s, l) => s + loanState(l, todayKey).owed, 0));
  const room = round(Math.max(0, limit - owed));
  return amount > room + 1e-9 ? { ok: false, reason: 'limit', owed, room } : { ok: true, owed, room };
}

// ---- Town Card -----------------------------------------------------------------------------

// How long paying only the minimum takes, and what it costs. `cap` applies the game rule;
// without it you see how a real card would behave.
export function minimumPayoff(balance, { weeklyRate = RULES.card.weeklyRate, minShare = RULES.card.minShare, minFloor = RULES.card.minFloor, cap = false } = {}) {
  let b = balance;
  let interest = 0;
  let weeks = 0;
  while (b > 0.005 && weeks < 1040) {
    let add = b * weeklyRate;
    if (cap) add = Math.max(0, Math.min(add, balance - interest));
    interest += add;
    b += add;
    b -= Math.min(b, Math.max(minFloor, b * minShare));
    weeks++;
  }
  return { weeks, interest: round(interest), total: round(balance + interest) };
}

export const minimumDue = (balance) => round(Math.min(balance, Math.max(RULES.card.minFloor, balance * RULES.card.minShare)));

// ---- several loans: which to pay first --------------------------------------------------------

// Pay `budget` a day, starting today, all of it to one loan at a time, ordered smallest balance first
// or highest rate first (the smaller one first on equal rates). Interest follows the loans' own game
// rule: simple, per day, never above the principal, and none after a plan's freeze date. Each loan:
// { id, owed, dailyRate, principal, interest (so far), freezeIn (days until its interest stops, if on
// a plan) }. `covered` is false when the budget can't even pay the next day's interest, so only the
// game's cap lets the plan finish.
export function payoffPlan(loans, budget, order) {
  const ls = loans.map((l) => ({ id: l.id, owed: l.owed, rate: l.dailyRate, principal: l.principal ?? l.owed, interest: l.interest || 0, freezeIn: l.freezeIn ?? Infinity }));
  ls.sort(order === 'smallest' ? (a, b) => a.owed - b.owed : (a, b) => b.rate - a.rate || a.owed - b.owed);
  const nextInterest = (l, day) => (l.owed <= 0.005 || day > l.freezeIn ? 0 : Math.max(0, Math.min(l.principal * l.rate, l.principal - l.interest)));
  const covered = ls.reduce((s, l) => s + nextInterest(l, 1), 0) < budget;
  let interest = 0;
  let days = 0;
  const cleared = [];
  while (days < 3650) {
    let left = budget;
    for (const l of ls) {
      if (left <= 0) break;
      if (l.owed <= 0.005) continue;
      const pay = Math.min(l.owed, left);
      l.owed -= pay;
      left -= pay;
      if (l.owed <= 0.005) cleared.push(l.id);
    }
    days++;
    if (ls.every((l) => l.owed <= 0.005)) break;
    for (const l of ls) {
      const add = nextInterest(l, days);
      l.owed += add;
      l.interest += add;
      interest += add;
    }
  }
  return { days, interest: round(interest), order: cleared, finished: ls.every((l) => l.owed <= 0.005), covered };
}

const round = (n) => Math.round(n * 100) / 100;
