// Piggy Bank (BRIEF §16; slice J11). Goals, a self-reported log of the user's own real cash, three
// savings challenges and reflection prompts. Penny never touches the money. Points ("feed") go only to
// what the app can see (logging, planning, reflecting, streaks), are capped per day, and feed the cow
// on the Farm. No leaderboards and no comparison with anyone else.
import { GLYPHS, coinBadge } from './coinkit.js';
import { CHALLENGE_DAYS, REWARDS, balance, birthdayAmount, calendarAmount, challengeDay, dayKey, emergencyTarget, emptyPiggy, goalProgress, reward, runEntries, streakDays, week52Amount } from '../sim/piggy.js';
import { XP, logAction } from '../progress.js';
import { animate, announce, h, icon, number } from '../ui.js';

const DAY = 86_400_000;
const thb = (n) => `THB ${number(Math.round(n), 0)}`;
// '2026-10-16' -> '16 Oct'. The keys are Bangkok dates already, so they are formatted as UTC.
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortDate = (key) => {
  const t = Date.parse(`${key}T00:00:00Z`);
  return Number.isNaN(t) ? String(key) : DATE.format(t);
};
// A timestamp -> '14:05', Bangkok time like the date keys.
const clock = (at) => new Date(at + 7 * 3600_000).toISOString().slice(11, 16);
const PROMPTS = [
  'What did you buy this week that you’re glad about?',
  'What’s one thing you chose not to buy, and why?',
  'What are you saving for, and how will it feel to reach it?',
  'Did anything make you want to spend on the spot this week?',
  'What’s one small way to save a little more next week?',
  'Who taught you something about money? What was it?',
  'If you had THB 100 more each week, what would you do with it?',
];
const GOAL_ICONS = [14, 21, 11, 16, 18, 0]; // drop, steps, star, sun, heart, hexagon
const CHALLENGES = { calendar: 'Calendar', birthday: 'Birthday year', week52: '52 weeks' };
// What each kind of action is called once its feed for the day is used up.
const DOING = { log: 'writing money down', plan: 'planning', reflect: 'answering today’s question' };
const uid = () => `p${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;
const insertAt = (list, i, item) => [...list.slice(0, i), item, ...list.slice(i)];
// Visible text plus a hidden name, so buttons that look alike still have different names.
const named = (text, name) => [text, h('span', { class: 'visually-hidden', text: ` (${name})` })];

export function mount(root, ctx) {
  const { store, navigate, config } = ctx;
  const view = h('section', { class: 'screen piggy-screen' });
  root.append(view);
  const get = () => ({ ...emptyPiggy(), ...store.get().piggy });
  const save = (piggy) => store.set({ piggy });
  const age = store.get().birthYear ? new Date().getFullYear() - Number(store.get().birthYear) : null;
  // Choices stay as picked across redraws: the log card's, the new goal's symbol, and start dates not
  // sent yet. A result line or an Undo shows once, in the card that was used, on the next redraw.
  let logKind = 'in';
  let logGoal = '';
  let goalIcon = GOAL_ICONS[0];
  const startDrafts = {};
  let pending = { notice: null, undo: null };

  // Award feed for an action and say what happened, without ever mentioning the amount.
  function act(piggy, action, done) {
    const now = Date.now();
    const r = reward(piggy, action, now);
    save(r.piggy);
    const note = `${done} ${feedNote(r, action, now)}`;
    announce(note);
    return { note, points: r.points };
  }

  function feedNote(r, action, now) {
    if (r.points > 0) return `+${r.points} feed for your cow.`;
    const day = r.piggy.rewards[dayKey(now)];
    if (day.total >= REWARDS.capPerDay) return `Your cow has all ${REWARDS.capPerDay} feed for today. Come back tomorrow.`;
    const left = Object.keys(DOING).filter((a) => a !== action && (day.counts[a] || 0) < REWARDS[a].perDay).map((a) => DOING[a]);
    return `You’ve had all of today’s feed for ${DOING[action]}.${left.length ? ` You can still earn feed by ${left.join(' or ')}.` : ''}`;
  }

  // Planning counts in the Town's daily loop too. XP only while planning still earns feed today.
  const logPlan = (ref, points) => logAction(store, { kind: 'piggy', xp: points > 0 ? XP.piggy : 0, ref });
  const notify = (card, text) => { pending.notice = { card, text }; };
  // Removing something offers an Undo until the next redraw.
  function remember(card, text, restore, focus) {
    pending.undo = { card, text, restore, focus };
    announce(text);
    render('undo');
  }

  // Redraw everything. Typed values survive, except in `clear` (the form that was just sent), and
  // focus goes to the [data-focus] element named by `focus`.
  function render(focus, clear = []) {
    const typed = [...view.querySelectorAll('input[id]:not([type="date"]), textarea[id]')].filter((el) => !clear.includes(el.id)).map((el) => [el.id, el.value]);
    const adding = view.querySelector('.piggy-add')?.open && !clear.includes('goal-name');
    const once = pending;
    pending = { notice: null, undo: null };
    const piggy = get();
    const now = Date.now();
    const today = piggy.rewards[dayKey(now)]?.total || 0;
    // A streak lasts until the end of the next day, as in the Town.
    const doneToday = Boolean(piggy.rewards[dayKey(now)]);
    const streak = streakDays(piggy, now) || streakDays(piggy, now - DAY);
    view.replaceChildren(
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: 'Piggy Bank' }),
        h('h1', { class: 'screen-title', text: 'Your real savings' }),
        h('p', { class: 'screen-sub', text: 'Write down the real money you put in or take out. Penny never touches it: your money stays with you, and Penny helps you plan.' }),
      ]),
      h('div', { class: 'piggy-stats' }, [
        stat('Saved so far', statAmount(Math.max(0, balance(piggy))), 'Your own record'),
        stat('Feed today', `${today} of ${REWARDS.capPerDay}`, 'For logging, planning and thinking'),
        stat('Streak', `${streak} ${streak === 1 ? 'day' : 'days'}`, doneToday ? 'Keep it going tomorrow' : streak ? 'Log something today to keep it going' : 'Log something today to start'),
      ]),
      h('div', { class: 'piggy' }, [goalsCard(piggy, once), logCard(piggy, once), challengesCard(piggy, once), reflectCard(piggy, once), age >= 20 ? emergencyCard(piggy) : null, historyCard(piggy, once)]),
      h('div', { class: 'card card--quiet piggy-farm' }, [
        h('p', { text: 'Every log, plan and answer feeds your cow on the Farm. Feed comes from what you do, never from how much you save.' }),
        h('button', { class: 'btn', type: 'button', onClick: () => navigate('/farm') }, ['Visit the Farm', icon('arrow-right', { size: 20 })]),
      ]),
      why(),
    );
    for (const [id, value] of typed) {
      const el = view.querySelector(`#${id}`);
      if (el && !el.value) el.value = value;
    }
    if (adding) view.querySelector('.piggy-add').open = true;
    const msg = view.querySelector('.piggy-notice');
    if (msg) animate(msg, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    if (focus) view.querySelector(`[data-focus="${focus}"]`)?.focus({ preventScroll: true });
  }

  const stat = (label, value, hint) => h('div', { class: 'card piggy-stat' }, [h('p', { class: 'piggy-stat__label', text: label }), h('p', { class: 'piggy-stat__value' }, value), h('p', { class: 'field__hint', text: hint })]);
  // 'THB 1,234,567': the number moves to a line of its own as a whole, and one too long even for that
  // wraps only after a comma, never inside a group of digits.
  const statAmount = (n) => {
    const groups = number(Math.round(n), 0).split(',');
    return ['THB ', h('span', { class: 'piggy-stat__num' }, groups.flatMap((g, i) => (i < groups.length - 1 ? [`${g},`, h('wbr')] : [g])))];
  };
  const noticeIn = (once, card) => (once.notice?.card === card ? h('p', { class: 'trade__done piggy-notice', text: once.notice.text }) : null);
  function undoIn(once, card) {
    const u = once.undo;
    if (u?.card !== card) return null;
    return h('p', { class: 'piggy-undo' }, [
      h('span', { text: u.text }),
      h('button', { class: 'btn btn--sm', type: 'button', 'data-focus': 'undo', onClick: () => { save(u.restore(get())); announce('Put back.'); render(u.focus); } }, 'Undo'),
    ]);
  }

  // ---- goals ---------------------------------------------------------------------------------
  function goalsCard(piggy, once) {
    const open = piggy.goals.filter((g) => !g.done);
    const reached = piggy.goals.filter((g) => g.done);
    const reach = (g) => {
      save({ ...get(), goals: get().goals.map((x) => (x.id === g.id ? { ...x, done: Date.now() } : x)) });
      announce(`Well done! ${g.name} is on your Reached list.`);
      render(`goal:${g.id}`);
    };
    const remove = (g) => {
      const goals = get().goals;
      const at = goals.findIndex((x) => x.id === g.id);
      save({ ...get(), goals: goals.filter((x) => x.id !== g.id) });
      remember('goals', `Goal removed: ${g.name}.`, (p) => ({ ...p, goals: insertAt(p.goals, at, g) }), `goal:${g.id}`);
    };
    const list = open.length
      ? h('ul', { class: 'piggy-goals' }, open.map((g) => {
          const p = goalProgress(piggy, g.id);
          const bar = h('span', { class: 'piggy-bar__fill' });
          bar.style.width = `${Math.round(p.share * 100)}%`;
          return h('li', { class: 'piggy-goal', tabindex: '-1', 'data-focus': `goal:${g.id}` }, [
            coinBadge({ iconId: g.icon, colorId: 0 }, config.COIN_COLORS),
            h('div', { class: 'piggy-goal__body' }, [
              h('p', { class: 'piggy-goal__name', text: g.name }),
              h('div', { class: 'piggy-bar', role: 'progressbar', 'aria-label': `${g.name} progress`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p.share * 100) }, [bar]),
              h('p', { class: 'field__hint', text: `${thb(Math.max(0, p.saved))} of ${thb(p.target)}${p.share >= 1 ? ' · Reached!' : ''}` }),
              h('div', { class: 'piggy-goal__actions' }, [
                p.share >= 1 ? h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: () => reach(g) }, named('I got it!', g.name)) : null,
                h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: () => remove(g) }, named('Remove', g.name)),
              ]),
            ]),
          ]);
        }))
      : h('p', { class: 'piggy-empty', text: reached.length ? 'What would you like to save for next?' : 'No goals yet. A goal with a name and a symbol makes saving easier to stick with.' });
    const name = h('input', { id: 'goal-name', class: 'field__input', type: 'text', maxlength: 30, autocomplete: 'off' });
    const target = h('input', { id: 'goal-target', class: 'field__input', type: 'number', min: 1, step: 1, inputmode: 'numeric' });
    const icons = GOAL_ICONS.map((id) => {
      const b = h('button', { class: 'piggy-icon', type: 'button', 'aria-pressed': String(id === goalIcon), title: GLYPHS[id][0] }, [
        coinBadge({ iconId: id, colorId: 0 }, config.COIN_COLORS),
        h('span', { class: 'visually-hidden', text: GLYPHS[id][0] }),
      ]);
      b.addEventListener('click', () => {
        goalIcon = id;
        for (const x of icons) x.setAttribute('aria-pressed', String(x === b));
      });
      return b;
    });
    const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const add = (e) => {
      e.preventDefault();
      const n = name.value.trim().slice(0, 30);
      const t = Number(target.value);
      if (!n) return showErr(err, 'Give your goal a name, like “New bike”.');
      if (!Number.isInteger(t) || t < 1) return showErr(err, 'Set a whole amount, like 500.');
      const id = uid();
      const r = act({ ...get(), goals: [...get().goals, { id, name: n, target: t, icon: goalIcon, at: Date.now() }] }, 'plan', `Goal added: ${n}.`);
      logPlan(`piggy-plan:goal:${id}`, r.points);
      notify('goals', r.note);
      goalIcon = GOAL_ICONS[0];
      render(`goal:${id}`, ['goal-name', 'goal-target']);
    };
    return h('div', { class: 'card piggy-card' }, [
      h('h2', { class: 'lab-card__title', text: 'Goals' }),
      undoIn(once, 'goals'),
      list,
      reached.length
        ? h('div', { class: 'piggy-reached' }, [
            h('h3', { class: 'piggy-reached__title', text: 'Reached' }),
            h('ul', { class: 'piggy-goals' }, reached.map((g) => h('li', { class: 'piggy-done', tabindex: '-1', 'data-focus': `goal:${g.id}` }, [icon('check', { size: 18 }), h('span', { class: 'piggy-goal__name', text: g.name })]))),
          ])
        : null,
      noticeIn(once, 'goals'),
      h('details', { class: 'piggy-add' }, [
        h('summary', { text: 'Add a goal' }),
        h('form', { class: 'piggy-form', novalidate: true, onSubmit: add }, [
          h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'goal-name', text: 'What are you saving for?' }), name]),
          h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'goal-target', text: 'How much does it cost? (THB)' }), target]),
          h('p', { class: 'field__label', id: 'goal-icon-label', text: 'Pick a symbol' }),
          h('div', { class: 'piggy-icons', role: 'group', 'aria-labelledby': 'goal-icon-label' }, icons),
          err,
          h('button', { class: 'btn btn--primary', type: 'submit' }, 'Add goal'),
        ]),
      ]),
    ]);
  }

  // ---- log ------------------------------------------------------------------------------------
  function logCard(piggy, once) {
    const goals = piggy.goals.filter((g) => !g.done);
    if (!goals.some((g) => g.id === logGoal)) logGoal = '';
    const kinds = [['in', 'I saved'], ['out', 'I took out']].map(([k, t]) => {
      const b = h('button', { class: 'segmented__btn', type: 'button', 'aria-pressed': String(k === logKind) }, t);
      b.addEventListener('click', () => {
        logKind = k;
        for (const x of kinds) x.setAttribute('aria-pressed', String(x === b));
      });
      return b;
    });
    const amount = h('input', { id: 'log-amount', class: 'field__input', type: 'number', min: 1, step: 1, inputmode: 'numeric', 'data-focus': 'log-amount' });
    const goal = h('select', { id: 'log-goal', class: 'field__input' }, [h('option', { value: '', text: 'No goal' }), ...goals.map((g) => h('option', { value: g.id, text: g.name }))]);
    goal.value = logGoal;
    goal.addEventListener('change', () => { logGoal = goal.value; });
    const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const add = (e) => {
      e.preventDefault();
      const back = document.activeElement === amount ? 'log-amount' : 'log';
      const a = Number(amount.value);
      if (!Number.isInteger(a) || a < 1) return showErr(err, 'Enter a whole amount, like 20.');
      const p = get();
      const goalId = goal.value || null;
      // Money taken out has to come out of savings that were written down: never below zero.
      if (logKind === 'out') {
        const all = Math.max(0, balance(p));
        const forGoal = goalId ? Math.max(0, goalProgress(p, goalId).saved) : all;
        const left = Math.floor(Math.min(all, forGoal));
        const where = goalId && forGoal <= all ? ' for this goal' : '';
        if (a > left) return showErr(err, left > 0 ? `You can take out up to ${thb(left)}: that’s what you’ve written down${where}.` : `There’s nothing written down${where} to take out yet.`);
      }
      err.hidden = true;
      const entry = { id: uid(), kind: logKind, amount: a, goalId, at: Date.now(), date: dayKey(Date.now()) };
      notify('log', act({ ...p, entries: [...p.entries, entry] }, 'log', 'Written down.').note);
      render(back, ['log-amount']);
    };
    return h('div', { class: 'card piggy-card piggy-log' }, [
      h('h2', { class: 'lab-card__title', text: 'Write down real money' }),
      h('form', { class: 'piggy-form', novalidate: true, onSubmit: add }, [
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Saved or took out' }, kinds),
        h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'log-amount', text: 'How much (THB)' }), amount]),
        h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'log-goal', text: 'For which goal?' }), goal]),
        err,
        h('button', { class: 'btn btn--primary btn--block', type: 'submit', 'data-focus': 'log' }, 'Write it down'),
      ]),
      noticeIn(once, 'log'),
    ]);
  }

  // ---- challenges ----------------------------------------------------------------------------
  function challengesCard(piggy, once) {
    const now = Date.now();
    const today = dayKey(now);
    const ch = piggy.challenges || {};
    // A dated challenge counts only what was saved in its current run, so one started again begins fresh.
    const entriesOf = (id) => (ch[id] ? runEntries(piggy, id) : piggy.entries.filter((e) => e.challenge === id));
    const doneToday = (id) => entriesOf(id).some((e) => e.date === today);
    const doneWeek = (id, week) => entriesOf(id).some((e) => e.week === week);

    function log(id, amount, extra = {}) {
      const p = get();
      const entry = { id: uid(), kind: 'in', amount, goalId: null, at: Date.now(), date: dayKey(Date.now()), challenge: id, ...extra };
      notify(`ch:${id}`, act({ ...p, entries: [...p.entries, entry] }, 'log', 'Written down.').note);
      render(`ch:${id}`);
    }
    // Start a challenge from its date field, or move a start that is still to come. Only a start
    // earns feed and XP.
    function setStart(id, input, err, isNew) {
      const start = input.value;
      if (!start || start < input.min || start > input.max) return showErr(err, 'Pick a start date within a year of today.');
      const p = { ...get(), challenges: { ...get().challenges, [id]: { start } } };
      delete startDrafts[id];
      if (isNew) {
        const r = act(p, 'plan', challengeDay(start, now) < 0 ? `${CHALLENGES[id]} starts on ${shortDate(start)}.` : `${CHALLENGES[id]} started.`);
        logPlan(`piggy-plan:${id}:${start}`, r.points);
        notify(`ch:${id}`, r.note);
      } else {
        save(p);
        announce(`New start date: ${shortDate(start)}.`);
      }
      render(`ch:${id}`);
    }
    function stop(id) {
      const p = get();
      const was = p.challenges[id];
      const rest = { ...p.challenges };
      delete rest[id];
      delete startDrafts[id];
      save({ ...p, challenges: rest });
      remember(`ch:${id}`, `${CHALLENGES[id]} stopped. What you saved stays written down.`, (q) => ({ ...q, challenges: { ...q.challenges, [id]: was } }), `ch:${id}`);
    }
    // Dates from a year back (so a birthday that has passed still fits) to a year ahead. A date picked
    // but not sent yet stays when another card redraws the screen.
    const startForm = (id, value, label, isNew) => {
      const input = h('input', { id: `start-${id}`, class: 'field__input', type: 'date', value: startDrafts[id] ?? value, min: dayKey(now - (CHALLENGE_DAYS[id] - 1) * DAY), max: dayKey(now + 365 * DAY) });
      input.addEventListener('input', () => { startDrafts[id] = input.value; });
      const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
      return h('form', { class: 'piggy-form', novalidate: true, onSubmit: (e) => { e.preventDefault(); setStart(id, input, err, isNew); } }, [
        h('label', { class: 'field__label', for: `start-${id}` }, named('Start date', CHALLENGES[id])),
        input,
        err,
        h('button', { class: 'btn btn--sm', type: 'submit' }, named(label, CHALLENGES[id])),
      ]);
    };
    // The line focus goes to after an action on that challenge.
    const status = (id, children, cls = '') => h('p', { class: cls, tabindex: '-1', 'data-focus': `ch:${id}` }, children);
    const done = (id, text) => status(id, [icon('check', { size: 18 }), text], 'piggy-done');
    const saveBtn = (id, amount, extra) => h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: () => log(id, amount, extra) }, named(`I saved ${thb(amount)}`, CHALLENGES[id]));

    const cal = calendarAmount(now);
    const items = [
      h('li', { class: 'piggy-challenge' }, [
        h('p', { class: 'piggy-challenge__title', text: 'Calendar' }),
        h('p', { text: `Save today’s date number. Today: ${thb(cal)}.` }),
        doneToday('calendar') ? done('calendar', 'Done for today') : saveBtn('calendar', cal),
        noticeIn(once, 'ch:calendar'),
      ]),
    ];
    for (const [id, rule] of [
      ['birthday', 'Save THB 1 on day 1, THB 2 on day 2, up to THB 365. Start on your birthday or today.'],
      ['week52', 'Save THB 10 in week 1, THB 20 in week 2, up to THB 520 in week 52.'],
    ]) {
      const state = ch[id];
      const d = state ? challengeDay(state.start, now) : NaN;
      const stopBtn = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: () => stop(id) }, named('Stop this challenge', CHALLENGES[id]));
      let body;
      if (!state) {
        body = [startForm(id, today, 'Start this challenge', true)];
      } else if (Number.isNaN(d) || d >= CHALLENGE_DAYS[id]) {
        // Over (or a date that can't be read): offer a fresh start.
        const over = Number.isNaN(d) ? 'Pick a new start date.' : id === 'birthday' ? 'The 365 days are over. Start again?' : 'The 52 weeks are over. Start again?';
        body = [status(id, over, 'field__hint'), startForm(id, today, 'Start again', true)];
      } else if (d < 0) {
        body = [status(id, `Starts on ${shortDate(state.start)}: ${-d} ${d === -1 ? 'day' : 'days'} to go.`), startForm(id, state.start, 'Change date', false), stopBtn];
      } else if (id === 'birthday') {
        const n = birthdayAmount(state.start, now);
        body = doneToday(id) ? [done(id, `Day ${n} done`), stopBtn] : [status(id, `Day ${n}: save ${thb(n)}.`), saveBtn(id, n, { run: state.start }), stopBtn];
      } else {
        const w = week52Amount(state.start, now);
        body = doneWeek(id, w.week) ? [done(id, `Week ${w.week} done`), stopBtn] : [status(id, `Week ${w.week}: save ${thb(w.amount)}.`), saveBtn(id, w.amount, { week: w.week, run: state.start }), stopBtn];
      }
      items.push(h('li', { class: 'piggy-challenge' }, [h('p', { class: 'piggy-challenge__title', text: CHALLENGES[id] }), h('p', { class: 'field__hint', text: rule }), ...body, undoIn(once, `ch:${id}`), noticeIn(once, `ch:${id}`)]));
    }
    return h('div', { class: 'card piggy-card' }, [h('h2', { class: 'lab-card__title', text: 'Challenges' }), h('ul', { class: 'piggy-challenges' }, items)]);
  }

  // ---- reflection -----------------------------------------------------------------------------
  function reflectCard(piggy, once) {
    const today = dayKey(Date.now());
    const prompt = PROMPTS[Number(today.replaceAll('-', '')) % PROMPTS.length];
    const answered = piggy.reflections.find((r) => r.date === today);
    if (answered) {
      return h('div', { class: 'card piggy-card' }, [
        h('h2', { class: 'lab-card__title', text: 'Think about it' }),
        h('p', { class: 'piggy-prompt', text: prompt }),
        h('p', { class: 'piggy-answer', text: answered.answer }),
        h('p', { class: 'piggy-done', tabindex: '-1', 'data-focus': 'reflect' }, [icon('check', { size: 18 }), 'Thanks for thinking about it. New question tomorrow.']),
        noticeIn(once, 'reflect'),
      ]);
    }
    const box = h('textarea', { id: 'reflect-answer', class: 'field__input piggy-textarea', rows: 3, maxlength: 280 });
    const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const btn = h('button', { class: 'btn btn--primary', type: 'button' }, 'Save my answer');
    btn.addEventListener('click', () => {
      const answer = box.value.trim();
      if (answer.length < 3) return showErr(err, 'Write a few words first.');
      const p = get();
      notify('reflect', act({ ...p, reflections: [...p.reflections, { date: today, at: Date.now(), prompt, answer: answer.slice(0, 280) }] }, 'reflect', 'Answer saved.').note);
      render('reflect');
    });
    return h('div', { class: 'card piggy-card' }, [
      h('h2', { class: 'lab-card__title', text: 'Think about it' }),
      h('label', { class: 'piggy-prompt', for: 'reflect-answer', text: prompt }),
      box,
      h('p', { class: 'field__hint', text: 'Your answer is kept with your progress: on this device, and in your account if you sign in. Parents don’t see it.' }),
      err,
      btn,
    ]);
  }

  // ---- adults: an emergency fund -------------------------------------------------------------
  function emergencyCard(piggy) {
    const input = h('input', { id: 'monthly-expenses', class: 'field__input', type: 'number', min: 0, step: 500, value: String(piggy.monthlyExpenses || '') });
    const out = h('p', { class: 'piggy-emergency', 'aria-live': 'polite' });
    const show = () => {
      const t = emergencyTarget(input.value);
      out.textContent = t.low > 0
        ? `Aim for ${thb(t.low)} to ${thb(t.high)}. A common rule of thumb is 3 to 6 months of expenses. You’ve written down ${thb(Math.max(0, balance(get())))} so far.`
        : 'Enter what you spend in a month to see your target.';
    };
    // Saved as it is typed, so a reload or a closed tab keeps it.
    input.addEventListener('input', () => {
      show();
      save({ ...get(), monthlyExpenses: Number(input.value) || 0 });
    });
    show();
    return h('div', { class: 'card piggy-card' }, [
      h('h2', { class: 'lab-card__title', text: 'Emergency fund' }),
      h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'monthly-expenses', text: 'What you spend in a month (THB)' }), input]),
      out,
    ]);
  }

  function historyCard(piggy, once) {
    const goalName = Object.fromEntries(piggy.goals.map((g) => [g.id, g.name]));
    const rows = piggy.entries.slice(-8).reverse().map((e) => {
      const what = `${e.kind === 'in' ? 'Saved' : 'Took out'} ${thb(e.amount)}${e.challenge ? ` · ${CHALLENGES[e.challenge] || 'Challenge'}` : ''}${goalName[e.goalId] ? ` · for ${goalName[e.goalId]}` : ''}`;
      return { e, what, name: `${what}, ${shortDate(e.date)}${Number.isFinite(e.at) ? `, ${clock(e.at)}` : ''}` };
    });
    // Rows that would still sound the same get their place in the list too.
    const nameOf = (row, i) => (rows.filter((r) => r.name === row.name).length > 1 ? `${row.name}, row ${i + 1}` : row.name);
    // A mistake can be taken out of the record. Feed already earned stays: it never depended on the amount.
    // A saving that money taken out came from stays until that is removed, so savings never go below zero.
    const remove = (e, what, err) => {
      const p = get();
      const at = p.entries.findIndex((x) => x.id === e.id);
      if (at < 0) return;
      const next = { ...p, entries: p.entries.filter((x) => x.id !== e.id) };
      if (e.kind === 'in' && (balance(next) < 0 || (e.goalId && goalProgress(next, e.goalId).saved < 0))) {
        return showErr(err, 'Remove what you took out first, so your savings don’t go below THB 0.');
      }
      save(next);
      remember('history', `Removed: ${what}.`, (q) => ({ ...q, entries: insertAt(q.entries, at, e) }), `entry:${e.id}`);
    };
    return h('div', { class: 'card piggy-card' }, [
      h('h2', { class: 'lab-card__title', text: 'Recent' }),
      undoIn(once, 'history'),
      rows.length
        ? h('ul', { class: 'piggy-history' }, rows.map((row, i) => {
            const { e, what } = row;
            const err = e.verified || !e.id ? null : h('p', { class: 'field__error', role: 'alert', hidden: true });
            return h('li', { class: 'piggy-entry' }, [
              h('span', { class: `piggy-entry__kind ${e.kind === 'in' ? 'is-gain' : 'is-loss'}`, 'aria-hidden': 'true', text: e.kind === 'in' ? '↑' : '↓' }),
              h('span', { text: what }),
              h('time', { class: 'field__hint', datetime: e.date, text: shortDate(e.date) }),
              e.verified
                ? h('span', { class: 'chip chip--ok' }, [icon('check', { size: 14 }), 'Verified by a parent'])
                : e.id ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'data-focus': `entry:${e.id}`, onClick: () => remove(e, what, err) }, named('Remove', nameOf(row, i))) : null,
              err,
            ]);
          }))
        : h('p', { class: 'piggy-empty', text: 'Nothing written down yet.' }),
    ]);
  }

  const why = () => h('details', { class: 'card card--quiet future-why' }, [
    h('summary', { text: 'ⓘ Why this works' }),
    h('p', { text: 'Giving savings a named goal makes people more likely to keep them (Soman and Cheema, 2011), and people try harder as they see themselves getting close (Kivetz and others, 2006). Fresh starts like a birthday or a new week help people begin (Dai and others, 2014). Small daily habits stick best when they start young (Whitebread and Bingham, 2013).' }),
    h('p', { class: 'piggy-research' }, [h('a', { href: '#/research', text: 'See the research behind Penny' })]),
  ]);

  render();
  return () => view.remove();
}

function showErr(el, message) {
  el.textContent = message;
  el.hidden = false;
}
