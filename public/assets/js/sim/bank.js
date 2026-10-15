// Bank rules (BRIEF §16.1; slice J12). Pure, no DOM. Loans with simple interest per real day, the
// total cost shown before agreeing, a credit score that moves with repayment, a Town Card with weekly
// statements, and the Quick Cash trap. Game rule, unlike real loans: total interest is capped at the
// amount borrowed, and a restructuring plan is always available, so there is no punishment spiral.

export const RULES = Object.freeze({
  bankDailyRate: 0.01, // before the credit-score adjustment
  quickCash: { dailyRate: 0.15, days: 3, amount: 30 },
  loanAmounts: [20, 50, 100],
  loanDays: [3, 7, 14],
  credit: { onTime: 20, late: -40, restructure: -10 },
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

// Interest so far: simple, per real day, frozen once restructured, never above the principal.
export function interestOn(loan, todayKey) {
  const until = loan.frozenOn && loan.frozenOn < todayKey ? loan.frozenOn : todayKey;
  const days = Math.max(1, daysBetween(loan.start, until) + 1);
  return round(Math.min(loan.principal, loan.principal * loan.dailyRate * days));
}

export function loanState(loan, todayKey) {
  const interest = interestOn(loan, todayKey);
  const owed = round(Math.max(0, loan.principal + interest - (loan.paid || 0)));
  const due = loan.plan ? loan.plan.due : loan.due;
  return { interest, owed, due, late: owed > 0 && todayKey > due, paid: owed <= 0 };
}

// Restructuring: freeze the interest today and spread what is owed over equal weekly payments.
export function restructure(loan, todayKey, weeks = 4) {
  const { owed } = loanState(loan, todayKey);
  return { ...loan, frozenOn: todayKey, plan: { weeks, weekly: round(owed / weeks), due: addDays(todayKey, weeks * 7), from: todayKey } };
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

// Pay `budget` a day: everyone's minimum is the daily interest, the rest goes to one loan at a time,
// ordered smallest balance first or highest rate first. Uncapped, to show the real trade-off.
export function payoffPlan(loans, budget, order) {
  let ls = loans.map((l) => ({ id: l.id, owed: l.owed, rate: l.dailyRate }));
  ls.sort(order === 'smallest' ? (a, b) => a.owed - b.owed : (a, b) => b.rate - a.rate);
  let interest = 0;
  let days = 0;
  const firstCleared = [];
  while (ls.some((l) => l.owed > 0.005) && days < 3650) {
    days++;
    for (const l of ls) {
      if (l.owed <= 0) continue;
      const add = l.owed * l.rate;
      l.owed += add;
      interest += add;
    }
    let left = budget;
    for (const l of ls) {
      if (left <= 0) break;
      const pay = Math.min(l.owed, left);
      l.owed -= pay;
      left -= pay;
      if (l.owed <= 0.005 && !firstCleared.includes(l.id)) firstCleared.push(l.id);
    }
  }
  return { days, interest: round(interest), order: firstCleared };
}

const round = (n) => Math.round(n * 100) / 100;
