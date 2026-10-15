// Piggy Bank (BRIEF §16; slice J11). Goals, a self-reported log of the user's own real cash, three
// savings challenges and reflection prompts. Penny never touches the money. Points go only to what
// the app can see (logging, planning, reflecting, streaks), are capped per day, and feed the cow on
// the Farm. No leaderboards and no comparison with anyone else.
import { GLYPHS, coinBadge } from './lab.js';
import { REWARDS, balance, birthdayAmount, calendarAmount, dayKey, emergencyTarget, emptyPiggy, goalProgress, reward, streakDays, week52Amount } from '../sim/piggy.js';
import { animate, announce, h, icon, number } from '../ui.js';

const thb = (n) => `THB ${number(Math.round(n), 0)}`;
const PROMPTS = [
  'What did you buy this week that you’re glad about?',
  'What’s one thing you chose not to buy, and why?',
  'What are you saving for, and how will it feel to reach it?',
  'Did anything make you want to spend on the spot this week?',
  'What’s one small way to save a little more next week?',
  'Who taught you something about money? What was it?',
  'If you had 100 baht more each week, what would you do with it?',
];
const GOAL_ICONS = [14, 21, 11, 16, 18, 0]; // drop, steps, star, sun, heart, hexagon
const uid = () => `p${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;

export function mount(root, ctx) {
  const { store, navigate, config } = ctx;
  const view = h('section', { class: 'screen piggy-screen' });
  root.append(view);
  const get = () => ({ ...emptyPiggy(), ...store.get().piggy });
  const save = (piggy) => store.set({ piggy });
  const age = store.get().birthYear ? new Date().getFullYear() - Number(store.get().birthYear) : null;

  // Award points for an action and say what happened, without ever mentioning the amount.
  function act(piggy, action) {
    const r = reward(piggy, action, Date.now());
    save(r.piggy);
    const note = r.points > 0 ? `+${r.points} seeds for your cow.` : 'Saved. You’ve earned all your seeds for today; come back tomorrow.';
    announce(note);
    return note;
  }

  function render() {
    const piggy = get();
    const now = Date.now();
    const today = piggy.rewards[dayKey(now)]?.total || 0;
    const streak = streakDays(piggy, now);
    view.replaceChildren(
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: 'Piggy Bank' }),
        h('h1', { class: 'screen-title', text: 'Your real savings' }),
        h('p', { class: 'screen-sub', text: 'Write down the real money you save or spend. Penny never touches it: your money stays with you, and Penny helps you plan.' }),
      ]),
      h('div', { class: 'piggy-stats' }, [
        stat('Saved so far', thb(balance(piggy)), 'Your own record'),
        stat('Seeds today', `${today} of ${REWARDS.capPerDay}`, 'For logging, planning and thinking'),
        stat('Streak', `${streak} ${streak === 1 ? 'day' : 'days'}`, streak ? 'Keep it going tomorrow' : 'Log something today to start'),
      ]),
      h('div', { class: 'piggy' }, [goalsCard(piggy), logCard(piggy), challengesCard(piggy), reflectCard(piggy), age >= 20 ? emergencyCard(piggy) : null, historyCard(piggy)]),
      h('div', { class: 'card card--quiet piggy-farm' }, [
        h('p', { text: 'Every log, plan and answer feeds your cow on the Farm. Seeds come from what you do, never from how much you save.' }),
        h('button', { class: 'btn', type: 'button', onClick: () => navigate('/farm') }, ['Visit the Farm', icon('arrow-right', { size: 20 })]),
      ]),
      why(),
    );
  }

  const stat = (label, value, hint) => h('div', { class: 'card piggy-stat' }, [h('p', { class: 'piggy-stat__label', text: label }), h('p', { class: 'piggy-stat__value', text: value }), h('p', { class: 'field__hint', text: hint })]);

  // ---- goals ---------------------------------------------------------------------------------
  function goalsCard(piggy) {
    const list = piggy.goals.length
      ? h('ul', { class: 'piggy-goals' }, piggy.goals.map((g) => {
          const p = goalProgress(piggy, g.id);
          const bar = h('span', { class: 'piggy-bar__fill' });
          bar.style.width = `${Math.round(p.share * 100)}%`;
          return h('li', { class: 'piggy-goal' }, [
            coinBadge({ iconId: g.icon, colorId: 0 }, config.COIN_COLORS),
            h('div', { class: 'piggy-goal__body' }, [
              h('p', { class: 'piggy-goal__name', text: g.name }),
              h('div', { class: 'piggy-bar', role: 'progressbar', 'aria-label': `${g.name} progress`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p.share * 100) }, [bar]),
              h('p', { class: 'field__hint', text: `${thb(p.saved)} of ${thb(p.target)}${p.share >= 1 ? ' · Reached!' : ''}` }),
            ]),
          ]);
        }))
      : h('p', { class: 'piggy-empty', text: 'No goals yet. A goal with a name and a picture makes saving easier to stick with.' });
    const name = h('input', { id: 'goal-name', class: 'field__input', type: 'text', maxlength: 30, autocomplete: 'off' });
    const target = h('input', { id: 'goal-target', class: 'field__input', type: 'number', min: 1, step: 10, inputmode: 'numeric' });
    let iconChoice = GOAL_ICONS[0];
    const icons = GOAL_ICONS.map((id) => {
      const b = h('button', { class: 'piggy-icon', type: 'button', 'aria-pressed': String(id === iconChoice), title: GLYPHS[id][0] }, [
        coinBadge({ iconId: id, colorId: 0 }, config.COIN_COLORS),
        h('span', { class: 'visually-hidden', text: GLYPHS[id][0] }),
      ]);
      b.addEventListener('click', () => {
        iconChoice = id;
        for (const x of icons) x.setAttribute('aria-pressed', String(x === b));
      });
      return b;
    });
    const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const add = h('button', { class: 'btn btn--primary', type: 'button' }, 'Add goal');
    add.addEventListener('click', () => {
      const n = name.value.trim();
      const t = Number(target.value);
      if (!n) return showErr(err, 'Give your goal a name, like “New bike”.');
      if (!(t > 0)) return showErr(err, 'Set a target bigger than zero.');
      const piggy2 = { ...get(), goals: [...get().goals, { id: uid(), name: n.slice(0, 30), target: Math.round(t), icon: iconChoice, at: Date.now() }] };
      act(piggy2, 'plan');
      render();
    });
    return h('div', { class: 'card piggy-card' }, [
      h('h2', { class: 'lab-card__title', text: 'Goals' }),
      list,
      h('details', { class: 'piggy-add' }, [
        h('summary', { text: 'Add a goal' }),
        h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'goal-name', text: 'What are you saving for?' }), name]),
        h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'goal-target', text: 'Target (THB)' }), target]),
        h('div', { class: 'piggy-icons', role: 'group', 'aria-label': 'Goal picture' }, icons),
        err,
        add,
      ]),
    ]);
  }

  // ---- log ------------------------------------------------------------------------------------
  function logCard(piggy) {
    let kind = 'in';
    const kinds = [['in', 'I saved'], ['out', 'I spent']].map(([k, t]) => {
      const b = h('button', { class: 'segmented__btn', type: 'button', 'aria-pressed': String(k === kind) }, t);
      b.addEventListener('click', () => {
        kind = k;
        for (const x of kinds) x.setAttribute('aria-pressed', String(x === b));
      });
      return b;
    });
    const amount = h('input', { id: 'log-amount', class: 'field__input', type: 'number', min: 1, step: 1, inputmode: 'numeric' });
    const goal = h('select', { id: 'log-goal', class: 'field__input' }, [h('option', { value: '', text: 'No goal' }), ...piggy.goals.map((g) => h('option', { value: g.id, text: g.name }))]);
    const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const done = h('p', { class: 'trade__done', role: 'status', hidden: true });
    const add = h('button', { class: 'btn btn--primary btn--block', type: 'button' }, 'Write it down');
    add.addEventListener('click', () => {
      const a = Number(amount.value);
      if (!(a > 0) || !Number.isFinite(a)) return showErr(err, 'Enter an amount bigger than zero.');
      err.hidden = true;
      const entry = { id: uid(), kind, amount: Math.round(a * 100) / 100, goalId: goal.value || null, at: Date.now(), date: dayKey(Date.now()) };
      const note = act({ ...get(), entries: [...get().entries, entry] }, 'log');
      render();
      const msg = view.querySelector('.piggy-log .trade__done');
      if (msg) {
        msg.textContent = `Written down. ${note}`;
        msg.hidden = false;
        animate(msg, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      }
    });
    return h('div', { class: 'card piggy-card piggy-log' }, [
      h('h2', { class: 'lab-card__title', text: 'Write down real money' }),
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Saved or spent' }, kinds),
      h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'log-amount', text: 'How much (THB)' }), amount]),
      h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'log-goal', text: 'For which goal?' }), goal]),
      err,
      add,
      done,
    ]);
  }

  // ---- challenges ----------------------------------------------------------------------------
  function challengesCard(piggy) {
    const now = Date.now();
    const today = dayKey(now);
    const ch = piggy.challenges || {};
    const doneToday = (id) => piggy.entries.some((e) => e.challenge === id && e.date === today);
    const doneWeek = (id, week) => piggy.entries.some((e) => e.challenge === id && e.week === week);

    function log(id, amount, extra = {}) {
      const entry = { id: uid(), kind: 'in', amount, goalId: null, at: Date.now(), date: dayKey(Date.now()), challenge: id, ...extra };
      act({ ...get(), entries: [...get().entries, entry] }, 'log');
      render();
    }
    function startChallenge(id) {
      const start = view.querySelector(`#start-${id}`)?.value || today;
      act({ ...get(), challenges: { ...get().challenges, [id]: { start } } }, 'plan');
      render();
    }

    const cal = calendarAmount(now);
    const items = [
      h('li', { class: 'piggy-challenge' }, [
        h('p', { class: 'piggy-challenge__title', text: 'Calendar' }),
        h('p', { text: `Save today’s date number. Today: ${thb(cal)}.` }),
        doneToday('calendar')
          ? h('p', { class: 'piggy-done' }, [icon('check', { size: 18 }), 'Done for today'])
          : h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: () => log('calendar', cal) }, `I saved ${thb(cal)}`),
      ]),
    ];
    for (const [id, title, rule] of [
      ['birthday', 'Birthday year', 'Save 1 baht on day 1, 2 on day 2, up to 365. Start on your birthday or today.'],
      ['week52', '52 weeks', 'Save 10 baht in week 1, 20 in week 2, up to 520 in week 52.'],
    ]) {
      const state = ch[id];
      let body;
      if (!state) {
        body = [
          h('label', { class: 'field__label', for: `start-${id}`, text: 'Start date' }),
          h('input', { id: `start-${id}`, class: 'field__input', type: 'date', value: today }),
          h('button', { class: 'btn btn--sm', type: 'button', onClick: () => startChallenge(id) }, 'Start this challenge'),
        ];
      } else if (id === 'birthday') {
        const n = birthdayAmount(state.start, now);
        body = n == null
          ? [h('p', { class: 'field__hint', text: 'Outside the 365 days. Start again any time.' })]
          : doneToday(id)
            ? [h('p', { class: 'piggy-done' }, [icon('check', { size: 18 }), `Day ${n} done`])]
            : [h('p', { text: `Day ${n}: save ${thb(n)}.` }), h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: () => log(id, n) }, `I saved ${thb(n)}`)];
      } else {
        const w = week52Amount(state.start, now);
        body = !w
          ? [h('p', { class: 'field__hint', text: 'The 52 weeks are over. Start again any time.' })]
          : doneWeek(id, w.week)
            ? [h('p', { class: 'piggy-done' }, [icon('check', { size: 18 }), `Week ${w.week} done`])]
            : [h('p', { text: `Week ${w.week}: save ${thb(w.amount)}.` }), h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: () => log(id, w.amount, { week: w.week }) }, `I saved ${thb(w.amount)}`)];
      }
      items.push(h('li', { class: 'piggy-challenge' }, [h('p', { class: 'piggy-challenge__title', text: title }), h('p', { class: 'field__hint', text: rule }), ...body]));
    }
    return h('div', { class: 'card piggy-card' }, [h('h2', { class: 'lab-card__title', text: 'Challenges' }), h('ul', { class: 'piggy-challenges' }, items)]);
  }

  // ---- reflection -----------------------------------------------------------------------------
  function reflectCard(piggy) {
    const today = dayKey(Date.now());
    const prompt = PROMPTS[Number(today.replaceAll('-', '')) % PROMPTS.length];
    const answered = piggy.reflections.find((r) => r.date === today);
    if (answered) {
      return h('div', { class: 'card piggy-card' }, [
        h('h2', { class: 'lab-card__title', text: 'Think about it' }),
        h('p', { class: 'piggy-prompt', text: prompt }),
        h('p', { class: 'piggy-answer', text: answered.answer }),
        h('p', { class: 'piggy-done' }, [icon('check', { size: 18 }), 'Thanks for thinking about it. New question tomorrow.']),
      ]);
    }
    const box = h('textarea', { id: 'reflect-answer', class: 'field__input piggy-textarea', rows: 3, maxlength: 280 });
    const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const btn = h('button', { class: 'btn btn--primary', type: 'button' }, 'Save my answer');
    btn.addEventListener('click', () => {
      const answer = box.value.trim();
      if (answer.length < 3) return showErr(err, 'Write a few words first.');
      act({ ...get(), reflections: [...get().reflections, { date: today, at: Date.now(), prompt, answer: answer.slice(0, 280) }] }, 'reflect');
      render();
    });
    return h('div', { class: 'card piggy-card' }, [
      h('h2', { class: 'lab-card__title', text: 'Think about it' }),
      h('label', { class: 'piggy-prompt', for: 'reflect-answer', text: prompt }),
      box,
      h('p', { class: 'field__hint', text: 'Your answer stays on this device.' }),
      err,
      btn,
    ]);
  }

  // ---- adults: an emergency fund -------------------------------------------------------------
  function emergencyCard(piggy) {
    const input = h('input', { id: 'monthly-expenses', class: 'field__input', type: 'number', min: 0, step: 500, value: String(piggy.monthlyExpenses || '') });
    const out = h('p', { class: 'piggy-emergency' });
    const show = () => {
      const t = emergencyTarget(input.value);
      out.textContent = t.low > 0
        ? `Aim for ${thb(t.low)} to ${thb(t.high)}: 3 to 6 months of expenses. You’ve written down ${thb(balance(get()))} so far.`
        : 'Enter what you spend in a month to see your target.';
    };
    input.addEventListener('input', show);
    input.addEventListener('change', () => save({ ...get(), monthlyExpenses: Number(input.value) || 0 }));
    show();
    return h('div', { class: 'card piggy-card' }, [
      h('h2', { class: 'lab-card__title', text: 'Emergency fund' }),
      h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'monthly-expenses', text: 'What you spend in a month (THB)' }), input]),
      out,
    ]);
  }

  function historyCard(piggy) {
    const recent = piggy.entries.slice(-8).reverse();
    return h('div', { class: 'card piggy-card' }, [
      h('h2', { class: 'lab-card__title', text: 'Recent' }),
      recent.length
        ? h('ul', { class: 'piggy-history' }, recent.map((e) => h('li', { class: 'piggy-entry' }, [
            h('span', { class: `piggy-entry__kind ${e.kind === 'in' ? 'is-gain' : 'is-loss'}`, 'aria-hidden': 'true', text: e.kind === 'in' ? '↑' : '↓' }),
            h('span', { text: `${e.kind === 'in' ? 'Saved' : 'Spent'} ${thb(e.amount)}${e.challenge ? ' (challenge)' : ''}` }),
            h('span', { class: 'field__hint', text: e.date }),
            e.verified ? h('span', { class: 'chip chip--ok' }, [icon('check', { size: 14 }), 'Verified by a parent']) : null,
          ])))
        : h('p', { class: 'piggy-empty', text: 'Nothing written down yet.' }),
    ]);
  }

  const why = () => h('details', { class: 'card card--quiet future-why' }, [
    h('summary', { text: 'ⓘ Why this works' }),
    h('p', { text: 'Giving savings a named goal makes people more likely to keep them (Soman and Cheema, 2011), and people try harder as they see themselves getting close (Kivetz and others, 2006). Fresh starts like a birthday or a new week help people begin (Dai and others, 2014). Small daily habits stick best when they start young (Whitebread and Bingham, 2013).' }),
    h('p', { class: 'field__hint', text: 'Sources: docs/SOURCES.md.' }),
  ]);

  render();
  return () => view.remove();
}

function showErr(el, message) {
  el.textContent = message;
  el.hidden = false;
}
