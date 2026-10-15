// Bank (BRIEF §16.1; slice J12). Borrow and repay Town coins, a Town Card with weekly statements, an
// in-game credit score that sets future rates, the Quick Cash trap, and which debt to pay first.
// Game rule, unlike real loans: total interest is capped at the amount borrowed, and a plan to
// restructure is always available. All coins are fake.
import { RULES, addDays, loanState, minimumDue, minimumPayoff, payoffPlan, quoteLoan, restructure } from '../sim/bank.js';
import { dateKeyOf } from '../sim/stall.js';
import { CREDIT, adjustCredit, balance as walletBalance, creditScore, ensureStarter, post, rateFor } from '../../../js/wallet.js';
import { announce, h, icon, number } from '../ui.js';

const coins = (n) => `${number(n, 2)} coins`;
const pct = (r) => `${number(r * 100, 1)}%`;
const uid = () => `l${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;
const band = (s) => (s >= 750 ? 'Excellent' : s >= 650 ? 'Good' : s >= 550 ? 'Fair' : 'Building');
const limitFor = (score) => Math.round(50 + ((score - CREDIT.min) / (CREDIT.max - CREDIT.min)) * 150);

export function mount(root, ctx) {
  const { store, navigate } = ctx;
  const view = h('section', { class: 'screen bank-screen' });
  root.append(view);
  ensureStarter(store);
  let amount = RULES.loanAmounts[0];
  let days = RULES.loanDays[1];

  const bankOf = () => ({ loans: [], card: null, ...store.get().bank });
  const saveBank = (bank) => store.set({ bank });

  // Late payments and card statements are settled when the Bank is opened (interest is per real day).
  function settle(today) {
    let bank = bankOf();
    let changed = false;
    const loans = bank.loans.map((l) => {
      const s = loanState(l, today);
      if (s.late && !l.lateMarked) {
        adjustCredit(store, RULES.credit.late, `Late on a loan of ${l.principal}`);
        changed = true;
        return { ...l, lateMarked: true };
      }
      return l;
    });
    let card = bank.card;
    while (card && today >= addDays(card.statementDate, 7)) {
      const unpaid = Math.max(0, card.statementBalance - card.paidSince);
      if (card.statementBalance > 0 && card.paidSince < card.minDue) adjustCredit(store, RULES.credit.late, 'Missed a Town Card minimum');
      // Game rule: card interest never adds up to more than was spent on the card.
      const add = Math.max(0, Math.min(unpaid * RULES.card.weeklyRate, (card.spent || 0) - (card.interest || 0)));
      const balance = Math.round((card.balance + add) * 100) / 100;
      const statementDate = addDays(card.statementDate, 7);
      card = { ...card, balance, interest: (card.interest || 0) + add, statementDate, statementBalance: balance, minDue: minimumDue(balance), dueDate: addDays(statementDate, RULES.card.dueDays), paidSince: 0 };
      changed = true;
    }
    if (changed) saveBank({ ...bank, loans, card });
  }

  function render() {
    const today = dateKeyOf(Date.now());
    settle(today);
    const bank = bankOf();
    const score = creditScore(store.get());
    const rate = rateFor(score, RULES.bankDailyRate);
    const active = bank.loans.filter((l) => !loanState(l, today).paid);
    view.replaceChildren(
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: 'Bank' }),
        h('h1', { class: 'screen-title', text: 'Borrowing, repaying and credit' }),
        h('p', { class: 'screen-sub', text: 'Learn what borrowing really costs, with Town coins. Nothing here is real money.' }),
        h('p', { class: 'chip', text: `${number(walletBalance(store.get()), 0)} coins in your Town wallet` }),
      ]),
      h('div', { class: 'bank' }, [
        h('div', { class: 'card bank-score' }, [
          h('h2', { class: 'lab-card__title', text: 'Your credit score' }),
          h('p', { class: 'bank-score__value' }, [h('strong', { text: String(score) }), ` · ${band(score)}`]),
          h('p', { class: 'field__hint', text: `From ${CREDIT.min} to ${CREDIT.max}. Paying back on time raises it; paying late lowers it. A better score means a lower rate: yours today is ${pct(rate)} a day.` }),
        ]),
        loansCard(active, today),
        borrowCard(rate, today),
        quickCashCard(today),
        cardCard(bank.card, score, today),
        active.length >= 2 ? payoffCard(active, today) : null,
        realLifeCard(),
      ]),
      h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => navigate('/stall') }, 'Back to the Daily Stall'),
    );
  }

  // ---- loans --------------------------------------------------------------------------------
  function loansCard(active, today) {
    const rows = active.map((l) => {
      const s = loanState(l, today);
      const repay = (amt) => {
        const pay = Math.min(amt, s.owed);
        const paid = post(store, { amount: -pay, kind: 'repay', note: l.lender === 'quickcash' ? 'Quick Cash' : 'Bank loan', ref: l.id });
        if (!paid.ok) return announce(paid.error);
        const bank = bankOf();
        const loans = bank.loans.map((x) => (x.id === l.id ? { ...x, paid: Math.round(((x.paid || 0) + pay) * 100) / 100 } : x));
        saveBank({ ...bank, loans });
        const after = loanState(loans.find((x) => x.id === l.id), today);
        if (after.paid && !s.late && !l.lateMarked) {
          adjustCredit(store, RULES.credit.onTime, 'Repaid a loan on time');
          announce('Paid off on time. Your credit score went up.');
        } else announce(`Paid ${coins(pay)}.`);
        render();
      };
      const plan = () => {
        const bank = bankOf();
        saveBank({ ...bank, loans: bank.loans.map((x) => (x.id === l.id ? restructure(x, today, 4) : x)) });
        if (!l.plan) adjustCredit(store, RULES.credit.restructure, 'Restructured a loan');
        announce('Your plan is set: interest is frozen and the rest is split into 4 weekly payments.');
        render();
      };
      return h('li', { class: `bank-loan${s.late ? ' is-late' : ''}` }, [
        h('p', { class: 'bank-loan__title', text: `${l.lender === 'quickcash' ? 'Quick Cash' : 'Bank loan'} of ${coins(l.principal)}` }),
        h('p', { text: `You owe ${coins(s.owed)} (interest so far ${coins(s.interest)}). Due ${s.due}.` }),
        s.late ? h('p', { class: 'chip chip--loss', text: 'Late: this lowered your score' }) : null,
        l.plan ? h('p', { class: 'chip chip--ok', text: `On a plan: ${coins(l.plan.weekly)} a week, interest frozen` }) : null,
        h('div', { class: 'bank-actions' }, [
          h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: () => repay(s.owed) }, `Repay all ${coins(s.owed)}`),
          s.owed > 5 ? h('button', { class: 'btn btn--sm', type: 'button', onClick: () => repay(Math.min(s.owed, l.plan ? l.plan.weekly : Math.ceil(s.owed / 2))) }, l.plan ? `Pay this week ${coins(Math.min(s.owed, l.plan.weekly))}` : 'Repay half') : null,
          !l.plan ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: plan }, 'Make a plan') : null,
        ]),
      ]);
    });
    return h('div', { class: 'card bank-loans' }, [
      h('h2', { class: 'lab-card__title', text: 'Your loans' }),
      rows.length ? h('ul', { class: 'bank-list' }, rows) : h('p', { class: 'piggy-empty', text: 'No loans. That’s a fine place to be.' }),
      h('p', { class: 'field__hint', text: 'Game rule: interest builds up each real day but never adds up to more than you borrowed. Real loans have no such cap. A plan to pay in weekly parts is always on offer.' }),
    ]);
  }

  function borrowCard(rate, today) {
    const q = quoteLoan({ principal: amount, days, dailyRate: rate });
    const pick = (list, value, set, label, fmt) => h('div', { class: 'field' }, [
      h('p', { class: 'field__label', text: label }),
      h('div', { class: 'segmented', role: 'group', 'aria-label': label }, list.map((v) => h('button', { class: 'segmented__btn', type: 'button', 'aria-pressed': String(v === value), onClick: () => { set(v); render(); } }, fmt(v)))),
    ]);
    const agree = h('button', { class: 'btn btn--primary btn--block', type: 'button' }, `Borrow ${coins(amount)} and pay back ${coins(q.total)}`);
    agree.addEventListener('click', () => {
      const loan = { id: uid(), lender: 'bank', principal: amount, dailyRate: rate, start: today, due: addDays(today, days - 1), paid: 0 };
      saveBank({ ...bankOf(), loans: [...bankOf().loans, loan] });
      post(store, { amount, kind: 'loan', note: 'Bank loan', ref: loan.id });
      announce(`Borrowed ${coins(amount)}. Pay back ${coins(q.total)} by ${loan.due}.`);
      render();
    });
    return h('div', { class: 'card bank-borrow' }, [
      h('h2', { class: 'lab-card__title', text: 'Borrow from the Bank' }),
      pick(RULES.loanAmounts, amount, (v) => (amount = v), 'How much', (v) => `${v} coins`),
      pick(RULES.loanDays, days, (v) => (days = v), 'For how long', (v) => `${v} days`),
      h('div', { class: 'bank-quote', role: 'status' }, [
        h('p', {}, ['Total to pay back: ', h('strong', { text: coins(q.total) })]),
        h('p', { class: 'field__hint', text: `${coins(q.principal)} borrowed + ${coins(q.interest)} interest (${pct(rate)} a day for ${days} days).` }),
      ]),
      h('div', { class: 'card card--quiet lesson-mini' }, [
        h('h3', { class: 'lesson-mini__title', text: 'Before you borrow' }),
        h('p', { text: 'A loan is future you paying for something now, plus interest. Ask: will this help me earn or save more than the interest costs? If it only buys something to enjoy now, saving first is cheaper.' }),
      ]),
      agree,
    ]);
  }

  function quickCashCard(today) {
    const qc = RULES.quickCash;
    const q = quoteLoan({ principal: qc.amount, days: qc.days, dailyRate: qc.dailyRate });
    const take = h('button', { class: 'btn btn--sm', type: 'button' }, 'Take Quick Cash anyway');
    take.addEventListener('click', () => {
      const loan = { id: uid(), lender: 'quickcash', principal: qc.amount, dailyRate: qc.dailyRate, start: today, due: addDays(today, qc.days - 1), paid: 0 };
      saveBank({ ...bankOf(), loans: [...bankOf().loans, loan] });
      post(store, { amount: qc.amount, kind: 'loan', note: 'Quick Cash', ref: loan.id });
      announce(`Took ${coins(qc.amount)} from Quick Cash. Pay back ${coins(q.total)} in ${qc.days} days.`);
      render();
    });
    return h('div', { class: 'card bank-quick' }, [
      h('p', { class: 'bank-quick__shout', text: `Need coins NOW? ${qc.amount} coins, no checks, no questions!` }),
      h('p', {}, ['The real cost: pay back ', h('strong', { text: coins(q.total) }), ` in ${qc.days} days. That’s ${pct(qc.dailyRate)} a day, ${number(qc.dailyRate / RULES.bankDailyRate, 0)} times the Bank’s rate.`]),
      h('div', { class: 'card card--quiet lesson-mini' }, [
        h('h3', { class: 'lesson-mini__title', text: 'The quick-cash trap' }),
        h('p', { text: 'Lenders who skip every check charge huge rates, because they expect some people to struggle. In real life, informal lenders can also pressure and threaten borrowers. If you ever need money fast, talk to a trusted adult or a licensed bank first.' }),
      ]),
      take,
    ]);
  }

  // ---- Town Card --------------------------------------------------------------------------------
  function cardCard(card, score, today) {
    if (!card) {
      const limit = limitFor(score);
      const open = h('button', { class: 'btn btn--primary', type: 'button' }, `Open a Town Card (limit ${limit} coins)`);
      open.addEventListener('click', () => {
        saveBank({ ...bankOf(), card: { limit, balance: 0, spent: 0, interest: 0, opened: today, statementDate: today, statementBalance: 0, minDue: 0, dueDate: addDays(today, RULES.card.dueDays), paidSince: 0 } });
        announce('Your Town Card is open. You can pay with it at the Daily Stall.');
        render();
      });
      return h('div', { class: 'card bank-card' }, [
        h('h2', { class: 'lab-card__title', text: 'Town Card' }),
        h('p', { text: 'A credit card lets you buy now and pay later. Pay the full statement each week and it costs nothing; pay only the minimum and interest piles up.' }),
        open,
      ]);
    }
    const pay = (amt, label) => {
      const a = Math.min(amt, card.balance);
      if (!(a > 0)) return;
      const paid = post(store, { amount: -a, kind: 'card', note: label });
      if (!paid.ok) return announce(paid.error);
      const bank = bankOf();
      saveBank({ ...bank, card: { ...bank.card, balance: Math.round((bank.card.balance - a) * 100) / 100, paidSince: (bank.card.paidSince || 0) + a } });
      announce(`Paid ${coins(a)} on your Town Card.`);
      render();
    };
    const calc = minimumPayoff(Math.max(card.balance, 0));
    const minNow = minimumDue(card.balance);
    return h('div', { class: 'card bank-card' }, [
      h('h2', { class: 'lab-card__title', text: 'Town Card' }),
      h('p', { text: `Balance ${coins(card.balance)} of a ${coins(card.limit)} limit.` }),
      h('p', { class: 'field__hint', text: `This week’s statement: ${coins(card.statementBalance)}, minimum ${coins(card.minDue)}, due ${card.dueDate}. Unpaid statement balances add ${pct(RULES.card.weeklyRate)} a week.` }),
      card.balance > 0
        ? h('div', { class: 'bank-actions' }, [
            h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: () => pay(card.balance, 'Town Card in full') }, `Pay in full ${coins(card.balance)}`),
            h('button', { class: 'btn btn--sm', type: 'button', onClick: () => pay(minNow, 'Town Card minimum') }, `Pay the minimum ${coins(minNow)}`),
          ])
        : h('p', { class: 'piggy-done' }, [icon('check', { size: 18 }), 'Nothing owed. Spend with it at the Daily Stall.']),
      card.balance > 0
        ? h('div', { class: 'card card--quiet lesson-mini' }, [
            h('h3', { class: 'lesson-mini__title', text: 'The minimum-payment calculator' }),
            h('p', { text: `Paying only the minimum on ${coins(card.balance)} would take ${calc.weeks} weeks and cost ${coins(calc.interest)} in interest on a real card. Paying in full costs nothing extra.` }),
          ])
        : null,
    ]);
  }

  function payoffCard(active, today) {
    const loans = active.map((l) => ({ id: l.id, owed: loanState(l, today).owed, dailyRate: l.dailyRate, label: l.lender === 'quickcash' ? 'Quick Cash' : `Bank loan of ${l.principal}` }));
    const budget = 10;
    const rateFirst = payoffPlan(loans, budget, 'rate');
    const smallFirst = payoffPlan(loans, budget, 'smallest');
    const name = (id) => loans.find((l) => l.id === id)?.label || id;
    return h('div', { class: 'card bank-payoff' }, [
      h('h2', { class: 'lab-card__title', text: 'Which loan to pay first?' }),
      h('p', { text: `Paying ${budget} coins a day:` }),
      h('ul', { class: 'bank-list' }, [
        h('li', { text: `Highest rate first: done in ${rateFirst.days} days, ${coins(rateFirst.interest)} interest. Starts with ${name(rateFirst.order[0])}.` }),
        h('li', { text: `Smallest first: done in ${smallFirst.days} days, ${coins(smallFirst.interest)} interest. Starts with ${name(smallFirst.order[0])}.` }),
      ]),
      h('p', { class: 'field__hint', text: 'Highest rate first usually costs less. Smallest first gives a quick win, and people who clear a whole loan early are more likely to keep going (Gal and McShane, 2012). Both beat paying a little on everything.' }),
    ]);
  }

  const realLifeCard = () => h('details', { class: 'card card--quiet bank-real' }, [
    h('summary', { text: 'Real life in Thailand (still being checked)' }),
    h('p', { text: 'Thailand sets legal limits on what banks and other lenders can charge, and on credit card minimum payments. Lending above the legal limit is against the law. These figures are on our list to check before we show numbers here.' }),
    h('p', { class: 'field__hint', text: 'Sources marked [unverified] in docs/SOURCES.md: Bank of Thailand credit card and personal loan ceilings and minimum payment rate; National Credit Bureau scoring; the maximum interest for private lending.' }),
  ]);

  render();
  return () => view.remove();
}
