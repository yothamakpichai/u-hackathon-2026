// Bank (BRIEF §16.1; slice J12). Borrow and repay Town coins, a Town Card with weekly statements, an
// in-game credit score that sets future rates, the Quick Cash trap, and which debt to pay first.
// Game rule, unlike real loans: total interest is capped at the amount borrowed, and a plan to
// restructure is always available. All coins are fake. Explorers get plainer words and costs in
// coins; Builders also get the research citation.
import { RULES, addDays, canBorrow, daysBetween, earnsOnTime, interestOn, loanState, minimumDue, minimumPayoff, payLoan, payoffPlan, quoteLoan, restructure } from '../sim/bank.js';
import { dateKeyOf } from '../sim/stall.js';
import { CREDIT, adjustCredit, balance as walletBalance, coinsText, creditEvents, creditScore, ensureStarter, ledger, post, rateFor } from '../../../js/wallet.js';
import { announce, h, icon, number } from '../ui.js';

const coins = (n) => `${number(n, 2)} coins`;
const pct = (r) => `${number(r * 100, 1)}%`;
const round = (n) => Math.round(n * 100) / 100;
const uid = () => `l${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;
const band = (s) => (s >= 750 ? 'Excellent' : s >= 650 ? 'Good' : s >= 550 ? 'Fair' : 'Building');
const limitFor = (score) => Math.round(50 + ((score - CREDIT.min) / (CREDIT.max - CREDIT.min)) * 150);
const ON_TIME = 'Repaid a loan on time'; // the credit event for the +20, which counts once a week
const daysText = (n) => `${n} day${n === 1 ? '' : 's'}`;
// Each open loan's title ('Bank loan of 20.00 coins') and name in a sentence ('the Bank loan of 20.00
// coins', 'Quick Cash'), numbered when two loans would read the same.
function loanNames(loans) {
  const base = (l) => (l.lender === 'quickcash' ? 'Quick Cash' : `Bank loan of ${coins(l.principal)}`);
  const seen = new Map();
  return new Map(loans.map((l) => {
    const b = base(l);
    seen.set(b, (seen.get(b) || 0) + 1);
    const n = loans.filter((x) => base(x) === b).length > 1 ? ` (${seen.get(b)})` : '';
    const quick = l.lender === 'quickcash';
    return [l.id, { title: quick ? `Quick Cash of ${coins(l.principal)}${n}` : `${b}${n}`, name: quick ? `Quick Cash${n}` : `the ${b}${n}` }];
  }));
}
// 'Fri 16 Oct' for a Bangkok date key.
const dayText = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function mount(root, ctx) {
  const { store, navigate, tier } = ctx;
  const young = tier === 'explorer';
  const view = h('section', { class: 'screen bank-screen' });
  root.append(view);
  ensureStarter(store);
  let amount = RULES.loanAmounts[0];
  let days = RULES.loanDays[1];
  let notice = null; // { key, text }: why an action was refused, shown in its card on the next draw

  const bankOf = () => ({ loans: [], card: null, ...store.get().bank });
  const saveBank = (bank) => store.set({ bank });
  const bill = young ? 'bill' : 'statement';
  const weekly = number(RULES.card.weeklyRate * 100, 0); // the Town Card's weekly rate, in %

  // The Bangkok date of the last on-time +20, from the credit history.
  const lastOnTime = () => {
    const e = creditEvents(store.get()).filter((x) => x.reason === ON_TIME).at(-1);
    return e ? dateKeyOf(e.at) : null;
  };
  // The Bangkok date of a loan's last repayment, from the wallet ledger.
  const lastRepaid = (id) => {
    const at = ledger(store.get()).filter((e) => e.kind === 'repay' && e.ref === id).reduce((m, e) => Math.max(m, e.at), 0);
    return at ? dateKeyOf(at) : null;
  };

  // Late payments and card statements are settled when the Bank is opened (interest is per real day).
  function settle(today) {
    let bank = bankOf();
    let changed = false;
    const loans = bank.loans.map((l0) => {
      // Saves from before loans were closed: close a loan repaid in full on the day of its last payment.
      const paidOn = !l0.closedOn && l0.paid > 0 ? lastRepaid(l0.id) : null;
      const l = paidOn && loanState(l0, paidOn).paid ? { ...l0, closedOn: paidOn } : l0;
      if (l !== l0) changed = true;
      const s = loanState(l, today);
      if (s.late && !l.lateMarked) {
        adjustCredit(store, RULES.credit.late, `Late on a loan of ${l.principal}`);
        changed = true;
        return { ...l, lateMarked: true };
      }
      return l;
    });
    let card = bank.card;
    let missed = 0; // minimums missed in the statements rolled just now, so the card can say so
    while (card && today >= addDays(card.statementDate, 7)) {
      const unpaid = Math.max(0, card.statementBalance - card.paidSince);
      if (card.statementBalance > 0 && card.paidSince < card.minDue && !card.lateMarked) {
        adjustCredit(store, RULES.credit.late, 'Missed a Town Card minimum');
        missed += 1;
      }
      // Game rule: card interest never adds up to more than was spent on the card.
      const add = round(Math.max(0, Math.min(unpaid * RULES.card.weeklyRate, (card.spent || 0) - (card.interest || 0))));
      const balance = round(card.balance + add);
      const statementDate = addDays(card.statementDate, 7);
      card = { ...card, balance, interest: (card.interest || 0) + add, added: add, statementDate, statementBalance: balance, minDue: minimumDue(balance), dueDate: addDays(statementDate, RULES.card.dueDays), paidSince: 0, lateMarked: false, missed };
      changed = true;
    }
    // The minimum is due 3 days after the statement: missing it is late on the due date, once.
    if (card && today > card.dueDate && card.statementBalance > 0 && (card.paidSince || 0) < card.minDue && !card.lateMarked) {
      adjustCredit(store, RULES.credit.late, 'Missed a Town Card minimum');
      card = { ...card, lateMarked: true };
      changed = true;
    }
    if (changed) saveBank({ ...bank, loans, card });
  }

  // focus: data-keys to put focus back on after the redraw; the first one found wins.
  function render(focus = []) {
    const today = dateKeyOf(Date.now());
    settle(today);
    const bank = bankOf();
    const score = creditScore(store.get());
    const rate = rateFor(score, RULES.bankDailyRate);
    const active = bank.loans.filter((l) => !loanState(l, today).paid);
    const names = loanNames(active);
    view.replaceChildren(
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: 'Bank' }),
        h('h1', { class: 'screen-title', text: 'Borrowing, repaying and credit', dataset: { key: 'title' } }),
        h('p', { class: 'screen-sub', text: 'Learn what borrowing really costs, with Town coins. Nothing here is real money.' }),
        h('p', { class: 'chip', text: `${coinsText(walletBalance(store.get()))} in your Town wallet` }),
      ]),
      h('div', { class: 'bank' }, [
        h('div', { class: 'bank__col' }, [
          h('div', { class: 'card bank-score' }, [
            h('h2', { class: 'lab-card__title', text: 'Your credit score' }),
            h('p', { class: 'bank-score__value' }, [h('strong', { text: String(score) }), ` · ${band(score)}`]),
            h('p', {
              class: 'field__hint',
              text: young
                ? `From ${CREDIT.min} to ${CREDIT.max}. Paying back on time raises it; paying late lowers it. A better score makes borrowing cheaper: right now, borrowing 100 coins costs ${coins(100 * rate)} a day.`
                : `From ${CREDIT.min} to ${CREDIT.max}. Paying back on time raises it; paying late lowers it. A better score means a lower rate: yours today is ${pct(rate)} a day.`,
            }),
          ]),
          loansCard(active, today, names),
          active.length >= 2 ? payoffCard(active, today, names) : null,
        ]),
        h('div', { class: 'bank__col' }, [
          borrowCard(bank, score, rate, today),
          quickCashCard(bank, rate, today),
          cardCard(bank.card, score, today),
        ]),
        realLifeCard(),
      ]),
      h('button', { class: 'btn btn--ghost', type: 'button', dataset: { key: 'back' }, onClick: () => navigate('/stall') }, 'Back to the Daily Stall'),
    );
    notice = null;
    refocus(focus);
  }

  function refocus(keys) {
    for (const k of [].concat(keys)) {
      const el = k && view.querySelector(`[data-key="${k}"]`);
      if (!el) continue;
      if (!el.matches('button, a[href], summary')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      return;
    }
  }

  // A refused action says why next to its button, and to screen readers.
  function refuse(key, text, focusKey) {
    notice = { key, text };
    announce(text);
    render([focusKey, key]);
  }
  const note = (key) => (notice && notice.key === key ? h('p', { class: 'field__error', text: notice.text }) : null);

  // ---- loans --------------------------------------------------------------------------------
  function loansCard(active, today, names) {
    const rows = active.map((l) => {
      const s = loanState(l, today);
      const quick = l.lender === 'quickcash';
      const { title, name } = names.get(l.id);
      const key = `loan:${l.id}`;
      const repay = (amt, which) => {
        const pay = round(Math.min(amt, s.owed));
        const paid = post(store, { amount: -pay, kind: 'repay', note: quick ? 'Quick Cash' : 'Bank loan', ref: l.id });
        if (!paid.ok) return refuse(key, `${paid.error} You need ${number(paid.short, 2)} more coins. Sell something at the Daily Stall${l.plan ? '' : ', or make a plan to pay in parts'}.`, `${key}:${which}`);
        const bank = bankOf();
        const loans = bank.loans.map((x) => (x.id === l.id ? payLoan(x, pay, today) : x));
        saveBank({ ...bank, loans });
        const after = loanState(loans.find((x) => x.id === l.id), today);
        const last = lastOnTime();
        if (after.paid && earnsOnTime(l, today, last)) {
          adjustCredit(store, RULES.credit.onTime, ON_TIME);
          announce('Paid off on time. Your credit score went up by 20.');
        } else if (after.paid) {
          announce(l.plan ? 'Paid off. Your plan is done.'
            : l.start >= today ? 'Paid off. A loan repaid the day you take it doesn’t change your score.'
            : earnsOnTime(l, today) ? `Paid off on time. Your score goes up for this once a week, and it already did on ${dayText(last)}.`
            : 'Paid off.');
        } else announce(`Paid ${coins(pay)}. You still owe ${coins(after.owed)}.`);
        render([`${key}:${which}`, key, 'loans']);
      };
      const plan = () => {
        const bank = bankOf();
        const next = restructure(bank.loans.find((x) => x.id === l.id) || l, today, 4);
        saveBank({ ...bank, loans: bank.loans.map((x) => (x.id === l.id ? next : x)) });
        if (!l.plan) adjustCredit(store, RULES.credit.restructure, 'Restructured a loan');
        announce(`Your plan is set: ${coins(next.plan.weekly)} a week for 4 weeks. ${next.frozenOn > today ? `Interest stops on ${dayText(next.frozenOn)}, the day the loan was due.` : 'Interest is frozen.'} Your score went down by 10.`);
        render([`${key}:week`, `${key}:all`, key]);
      };
      const half = round(s.owed / 2);
      const week = round(Math.min(s.owed, l.plan ? l.plan.weekly : 0));
      return h('li', { class: `bank-loan${s.late ? ' is-late' : ''}` }, [
        h('p', { class: 'bank-loan__title', text: title, dataset: { key } }),
        h('p', { text: `You owe ${coins(s.owed)} (interest so far ${coins(s.interest)}). Due ${dayText(s.due)}.` }),
        s.late ? h('p', { class: 'chip chip--loss', text: 'Late: this lowered your score by 40' }) : null,
        l.plan ? h('p', { class: 'chip chip--ok', text: l.frozenOn > today ? `On a plan: ${coins(l.plan.weekly)} a week. Interest stops on ${dayText(l.frozenOn)}` : `On a plan: ${coins(l.plan.weekly)} a week, interest frozen` }) : null,
        note(key),
        h('div', { class: 'bank-actions' }, [
          h('button', { class: 'btn btn--sm btn--primary', type: 'button', dataset: { key: `${key}:all` }, 'aria-label': `Repay all ${coins(s.owed)} of ${name}`, onClick: () => repay(s.owed, 'all') }, `Repay all ${coins(s.owed)}`),
          s.owed > 5 && l.plan ? h('button', { class: 'btn btn--sm', type: 'button', dataset: { key: `${key}:week` }, 'aria-label': `Pay this week ${coins(week)} on ${name}`, onClick: () => repay(week, 'week') }, `Pay this week ${coins(week)}`) : null,
          s.owed > 5 && !l.plan ? h('button', { class: 'btn btn--sm', type: 'button', dataset: { key: `${key}:half` }, 'aria-label': `Repay half (${coins(half)}) of ${name}`, onClick: () => repay(half, 'half') }, `Repay half (${coins(half)})`) : null,
          !l.plan ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', dataset: { key: `${key}:plan` }, 'aria-label': `Make a plan for ${name}`, 'aria-describedby': `plan-hint-${l.id}`, onClick: plan }, 'Make a plan') : null,
        ]),
        !l.plan ? h('p', { class: 'field__hint', id: `plan-hint-${l.id}`, text: `A plan splits what you owe into 4 weekly payments, and interest stops ${today < l.due ? 'on the due date' : 'today'}. It lowers your score by 10.` }) : null,
      ]);
    });
    return h('div', { class: 'card bank-loans' }, [
      h('h2', { class: 'lab-card__title', text: 'Your loans', dataset: { key: 'loans' } }),
      rows.length ? h('ul', { class: 'bank-list' }, rows) : h('p', { class: 'piggy-empty', text: 'No loans. That’s a fine place to be.' }),
      h('p', { class: 'field__hint', text: 'Game rule: interest builds up each real day but never adds up to more than you borrowed. Real loans have no such cap. A plan to pay in weekly parts is always on offer.' }),
      h('p', { class: 'field__hint', text: 'Your score goes up by 20 when you repay a loan on time, but not on the same day you took it. That can happen once a week.' }),
    ]);
  }

  function borrowCard(bank, score, rate, today) {
    const limit = limitFor(score);
    const check = canBorrow({ loans: bank.loans, todayKey: today, amount, limit });
    const q = quoteLoan({ principal: amount, days, dailyRate: rate });
    const pick = (list, value, set, label, fmt, kind) => h('div', { class: 'field' }, [
      h('p', { class: 'field__label', text: label }),
      h('div', { class: 'segmented', role: 'group', 'aria-label': label }, list.map((v) => h('button', {
        class: 'segmented__btn',
        type: 'button',
        'aria-pressed': String(v === value),
        dataset: { key: `pick:${kind}:${v}` },
        onClick: () => {
          set(v);
          render([`pick:${kind}:${v}`]);
          const nq = quoteLoan({ principal: amount, days, dailyRate: rate });
          const c = canBorrow({ loans: bankOf().loans, todayKey: today, amount, limit });
          announce(`Total to pay back: ${coins(nq.total)}.${c.ok ? '' : ` ${whyNot(c, limit)}`}`);
        },
      }, fmt(v)))),
    ]);
    const agree = h('button', { class: 'btn btn--primary btn--block', type: 'button', dataset: { key: 'borrow' }, 'aria-disabled': check.ok ? null : 'true', 'aria-describedby': check.ok ? null : 'borrow-why' }, `Borrow ${coins(amount)} and pay back ${coins(q.total)}`);
    agree.addEventListener('click', () => {
      const c = canBorrow({ loans: bankOf().loans, todayKey: today, amount, limit });
      if (!c.ok) return announce(whyNot(c, limit));
      const loan = { id: uid(), lender: 'bank', principal: amount, dailyRate: rate, start: today, due: addDays(today, days - 1), paid: 0 };
      saveBank({ ...bankOf(), loans: [...bankOf().loans, loan] });
      post(store, { amount, kind: 'loan', note: 'Bank loan', ref: loan.id });
      announce(`Borrowed ${coins(amount)}. Pay back ${coins(q.total)} by ${dayText(loan.due)}.`);
      render(['borrow']);
    });
    return h('div', { class: 'card bank-borrow' }, [
      h('h2', { class: 'lab-card__title', text: 'Borrow from the Bank' }),
      pick(RULES.loanAmounts, amount, (v) => (amount = v), 'How much', (v) => `${v} coins`, 'amount'),
      pick(RULES.loanDays, days, (v) => (days = v), 'For how long', (v) => `${v} days`, 'days'),
      h('div', { class: 'bank-quote' }, [
        h('p', {}, ['Total to pay back: ', h('strong', { text: coins(q.total) })]),
        h('p', { class: 'field__hint', text: `${coins(q.principal)} borrowed + ${coins(q.interest)} interest (${young ? coins(q.principal * rate) : pct(rate)} a day for ${days} days).` }),
      ]),
      h('div', { class: 'card card--quiet lesson-mini' }, [
        h('h3', { class: 'lesson-mini__title', text: 'Before you borrow' }),
        h('p', { text: 'A loan is future you paying for something now, plus interest. Ask: will this help me earn or save more than the interest costs? If it only buys something to enjoy now, saving first is cheaper.' }),
      ]),
      check.ok ? null : h('p', { class: 'field__error', id: 'borrow-why', text: whyNot(check, limit) }),
      agree,
      h('p', { class: 'field__hint', text: `The Bank checks before it lends. With your score, you can owe it up to ${coins(limit)} in all, and it won’t lend while a loan is late.` }),
    ]);
  }

  function whyNot(check, limit) {
    if (check.reason === 'late') return 'The Bank says no: one of your loans is late. Repay it or make a plan first.';
    if (!(check.owed > 0)) return `The Bank says no: with your score, it lends you up to ${coins(limit)}. Pick a smaller amount.`;
    const more = check.room >= RULES.loanAmounts[0] ? ` You can borrow up to ${coins(check.room)} more.` : ' Repay a loan first.';
    return `The Bank says no: with your score you can owe up to ${coins(limit)}, and you already owe ${coins(check.owed)}.${more}`;
  }

  function quickCashCard(bank, rate, today) {
    const qc = RULES.quickCash;
    const q = quoteLoan({ principal: qc.amount, days: qc.days, dailyRate: qc.dailyRate });
    const check = canBorrow({ loans: bank.loans, todayKey: today, lender: 'quickcash' });
    const why = 'Quick Cash says no: pay back your Quick Cash loan first.';
    const take = h('button', { class: 'btn btn--sm', type: 'button', dataset: { key: 'quick' }, 'aria-disabled': check.ok ? null : 'true', 'aria-describedby': check.ok ? null : 'quick-why' }, 'Take Quick Cash anyway');
    take.addEventListener('click', () => {
      if (!canBorrow({ loans: bankOf().loans, todayKey: today, lender: 'quickcash' }).ok) return announce(why);
      const loan = { id: uid(), lender: 'quickcash', principal: qc.amount, dailyRate: qc.dailyRate, start: today, due: addDays(today, qc.days - 1), paid: 0 };
      saveBank({ ...bankOf(), loans: [...bankOf().loans, loan] });
      post(store, { amount: qc.amount, kind: 'loan', note: 'Quick Cash', ref: loan.id });
      announce(`Took ${coins(qc.amount)} from Quick Cash. Pay back ${coins(q.total)} in ${qc.days} days.`);
      render(['quick']);
    });
    return h('div', { class: 'card bank-quick' }, [
      h('p', { class: 'bank-quick__shout', text: `Need coins NOW? ${qc.amount} coins, no checks, no questions!` }),
      h('p', {}, ['The real cost: pay back ', h('strong', { text: coins(q.total) }), ` in ${qc.days} days. That’s ${young ? coins(qc.amount * qc.dailyRate) : pct(qc.dailyRate)} a day, ${number(qc.dailyRate / rate, 0)} times ${young ? 'what the Bank charges you' : 'your Bank rate'}.`]),
      h('div', { class: 'card card--quiet lesson-mini' }, [
        h('h3', { class: 'lesson-mini__title', text: 'The quick-cash trap' }),
        h('p', { text: 'Lenders who skip every check charge huge rates, because they expect some people to struggle. If you ever need money fast, talk to a trusted adult or a licensed bank first.' }),
      ]),
      check.ok ? null : h('p', { class: 'field__error', id: 'quick-why', text: why }),
      take,
    ]);
  }

  // ---- Town Card --------------------------------------------------------------------------------
  function cardCard(card, score, today) {
    if (!card) {
      const limit = limitFor(score);
      const open = h('button', { class: 'btn btn--primary', type: 'button', dataset: { key: 'card:open' } }, `Open a Town Card (limit ${coins(limit)})`);
      open.addEventListener('click', () => {
        saveBank({ ...bankOf(), card: { limit, balance: 0, spent: 0, interest: 0, opened: today, statementDate: today, statementBalance: 0, minDue: 0, dueDate: addDays(today, RULES.card.dueDays), paidSince: 0 } });
        announce(`Your Town Card is open. You can pay with it at the Daily Stall. Your first ${bill} comes on ${dayText(addDays(today, 7))}.`);
        render(['card']);
      });
      return h('div', { class: 'card bank-card' }, [
        h('h2', { class: 'lab-card__title', text: 'Town Card', dataset: { key: 'card' } }),
        h('p', { text: young ? 'A Town Card lets you buy now and pay later. Pay the whole bill each week and it costs nothing; pay only the smallest amount and the cost grows.' : 'A credit card lets you buy now and pay later. Pay the full statement each week and it costs nothing; pay only the minimum and interest piles up.' }),
        open,
      ]);
    }
    const pay = (amt, label, which) => {
      const a = round(Math.min(amt, card.balance));
      if (!(a > 0)) return;
      const paid = post(store, { amount: -a, kind: 'card', note: label });
      if (!paid.ok) return refuse('card', `${paid.error} You need ${number(paid.short, 2)} more coins to pay ${coins(a)}.`, `card:${which}`);
      const bank = bankOf();
      const balance = round(bank.card.balance - a);
      saveBank({ ...bank, card: { ...bank.card, balance, paidSince: round((bank.card.paidSince || 0) + a) } });
      announce(balance > 0 ? `Paid ${coins(a)} on your Town Card. ${coins(balance)} still to pay.` : `Paid ${coins(a)}. Your Town Card is all paid off.`);
      render([`card:${which}`, 'card:full', 'card']);
    };
    const firstWeek = !(card.statementBalance > 0); // nothing due this week
    const minLeft = round(Math.max(0, card.minDue - (card.paidSince || 0)));
    const missedLoss = -RULES.credit.late * (card.missed || 0);
    const calc = minimumPayoff(Math.max(card.balance, 0));
    const grows = young ? `Anything left unpaid grows by ${weekly} coins for every 100 each week.` : `Unpaid statement balances add ${weekly}% a week.`;
    return h('div', { class: 'card bank-card' }, [
      h('h2', { class: 'lab-card__title', text: 'Town Card', dataset: { key: 'card' } }),
      h('p', { text: `Limit ${coins(card.limit)} · ${coins(card.balance)} used.` }),
      h('p', {
        class: 'field__hint',
        text: firstWeek
          ? `Your ${card.statementDate === card.opened ? 'first' : 'next'} ${bill} comes on ${dayText(addDays(card.statementDate, 7))}. ${grows}`
          : `This week’s ${bill}: ${coins(card.statementBalance)}, minimum ${coins(card.minDue)}, due ${dayText(card.dueDate)}.${card.paidSince > 0 ? ` You’ve paid ${coins(card.paidSince)} since.` : ''} ${grows}`,
      }),
      card.added > 0 ? h('p', { class: 'chip chip--warn', text: `We added ${coins(card.added)} (${weekly}%) to the unpaid ${bill}.` }) : null,
      card.missed > 0
        ? h('p', { class: 'chip chip--loss', text: card.missed === 1 ? `You missed last week’s minimum, so your score went down by ${missedLoss}.` : `You missed the minimum ${card.missed} weeks in a row, so your score went down by ${missedLoss}.` })
        : null,
      card.lateMarked
        ? h('p', { class: 'chip chip--loss', text: minLeft > 0 ? 'Late: minimum not paid. Your score went down by 40.' : 'Minimum paid late. Your score went down by 40.' })
        : !firstWeek && minLeft === 0 && card.balance > 0 ? h('p', { class: 'chip chip--ok', text: 'Minimum paid for this week' }) : null,
      note('card'),
      card.balance > 0
        ? h('div', { class: 'bank-actions' }, [
            h('button', { class: 'btn btn--sm btn--primary', type: 'button', dataset: { key: 'card:full' }, onClick: () => pay(card.balance, 'Town Card in full', 'full') }, `Pay in full ${coins(card.balance)}`),
            !firstWeek && minLeft > 0 ? h('button', { class: 'btn btn--sm', type: 'button', dataset: { key: 'card:min' }, onClick: () => pay(minLeft, 'Town Card minimum', 'min') }, `Pay the minimum ${coins(minLeft)}`) : null,
          ])
        : h('p', { class: 'piggy-done' }, [icon('check', { size: 18 }), 'Nothing owed. Spend with it at the Daily Stall.']),
      card.balance > 0
        ? h('div', { class: 'card card--quiet lesson-mini' }, [
            h('h3', { class: 'lesson-mini__title', text: 'The minimum-payment calculator' }),
            h('p', { text: young
              ? `Paying only the smallest amount on ${coins(card.balance)} would take ${calc.weeks} weeks and cost ${coins(calc.interest)} extra. Paying it all costs nothing extra.`
              : `Paying only the minimum on ${coins(card.balance)} would take ${calc.weeks} weeks and cost ${coins(calc.interest)} in interest at the game’s ${weekly}% a week. Paying in full costs nothing extra.` }),
            h('p', { class: 'field__hint', text: 'Game rates are much higher than real ones, so you can see interest grow in days. Real limits are under Real life in Thailand.' }),
          ])
        : null,
    ]);
  }

  function payoffCard(active, today, names) {
    const loans = active.map((l) => ({
      id: l.id,
      owed: loanState(l, today).owed,
      dailyRate: l.dailyRate,
      principal: l.principal,
      interest: interestOn(l, today),
      freezeIn: l.frozenOn ? daysBetween(today, l.frozenOn) : undefined,
      label: names.get(l.id).name,
    }));
    const budget = 10;
    const rateFirst = payoffPlan(loans, budget, 'rate');
    const smallFirst = payoffPlan(loans, budget, 'smallest');
    const name = (id) => loans.find((l) => l.id === id)?.label || id;
    const result = (p) => (p.finished ? `done in ${daysText(p.days)}, ${coins(p.interest)} more interest` : `still not done after ${daysText(p.days)}`);
    const same = rateFirst.order.join() === smallFirst.order.join();
    const sameRate = loans.every((l) => l.dailyRate === loans[0].dailyRate);
    // The dearest loan first usually costs less, but not when the game's cap has (nearly) stopped its
    // interest, or when interest still runs on a loan that is mostly repaid: say why.
    const dear = loans.find((l) => l.id === rateFirst.order[0]);
    const capped = dear && dear.interest + dear.principal * dear.dailyRate * Math.ceil(dear.owed / budget) >= dear.principal - 0.005;
    const reached = dear && dear.interest >= dear.principal - 0.005;
    const smallWins = young ? 'paying the smallest first' : 'smallest first';
    const why = same || !(rateFirst.interest > smallFirst.interest + 0.005) ? null
      : capped ? `Here ${smallWins} costs less, because ${name(dear.id)} ${reached ? 'has reached' : 'is close to'} the game’s interest cap, so its interest ${reached ? 'has stopped' : 'soon stops'} growing. Real loans have no cap.`
      : `Here ${smallWins} costs less, because in this game interest is worked out on what you first borrowed, even after you pay some back.`;
    const hint = young
      ? 'Paying the dearest loan first usually costs less. Paying the smallest first gives a quick win. Both beat paying a little on everything.'
      : `Highest rate first usually costs less. Smallest first gives a quick win, and people who clear a whole loan early are more likely to keep going${tier === 'builder' ? ' (Gal and McShane, 2012)' : ''}. Both beat paying a little on everything.`;
    return h('div', { class: 'card bank-payoff' }, [
      h('h2', { class: 'lab-card__title', text: 'Which loan to pay first?' }),
      h('p', { text: `Paying ${budget} coins a day:` }),
      h('ul', { class: 'bank-list' }, same
        ? [h('li', { text: sameRate
            ? `${young ? 'Your loans charge the same interest for each coin' : 'Your loans have the same rate'}, so start with the smallest for a quick win: ${result(rateFirst)}.`
            : `Here the smallest loan ${young ? 'is also the dearest' : 'also has the highest rate'}, so both ways start with ${name(rateFirst.order[0])}: ${result(rateFirst)}.` })]
        : [
            h('li', { text: `${young ? 'Dearest loan first' : 'Highest rate first'}: ${result(rateFirst)}. Starts with ${name(rateFirst.order[0])}.` }),
            h('li', { text: `Smallest first: ${result(smallFirst)}. Starts with ${name(smallFirst.order[0])}.` }),
          ]),
      why ? h('p', { text: why }) : null,
      rateFirst.covered ? null : h('p', { class: 'field__error', text: `At first, ${budget} coins a day wouldn’t even cover the interest. This only ends because the game caps interest; a real loan would keep growing. ${sameRate ? 'Make a plan to stop the interest growing.' : 'Repay the dearest loan first or make a plan.'}` }),
      h('p', { class: 'field__hint', text: hint }),
    ]);
  }

  const realLifeCard = () => h('details', { class: 'card card--quiet bank-real' }, [
    h('summary', { text: 'Real life in Thailand (still being checked)' }),
    h('p', { text: 'Thailand sets legal limits on what banks and other lenders can charge, and on credit card minimum payments. Lending above the legal limit is against the law. These figures are on our list to check before we show numbers here.' }),
    h('p', { class: 'field__hint' }, [
      'Still being checked, and listed under ',
      h('a', { href: '#/research', text: 'Why this works' }),
      ': Bank of Thailand credit card and personal loan ceilings and minimum payment rate; National Credit Bureau scoring; the maximum interest for private lending.',
    ]),
  ]);

  render();
  return () => view.remove();
}
