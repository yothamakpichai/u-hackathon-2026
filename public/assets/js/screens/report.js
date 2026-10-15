// Report card (BRIEF §3 step 6, §6): the Money Health Score with a reason for every part, "3 things you
// learned", today's leaderboard for this tier, and a replay. Built on the run the Lab saves in store.lab[tier].
import { h, icon, penny, stateView, delta, money, animate, celebrate, announce } from '../ui.js';
import { scoreRun, learned } from '../score.js';
import { arenaEnabled, arenaScore } from './arena.js';

const ENTER = [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }];
const API = 'api/leaderboard.php';

export function mount(root, ctx) {
  const { tier, store, navigate, config } = ctx;
  const tierInfo = config.getTier(tier);
  const state = store.get();
  const run = state.lab?.[tier];
  let alive = true;

  const view = h('section', { class: 'screen report' });
  root.append(view);

  if (!run) {
    view.append(
      head('Your report card', `${tierInfo.name} · Ages ${tierInfo.ages}`),
      stateView({
        kind: 'empty',
        heading: 'h2',
        title: 'No report card yet',
        body: 'Finish today’s market, or tap Finish now in the lab, and your Money Health Score shows up here.',
        actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('/lab') }, 'Open today’s market')],
      }),
    );
    return () => view.remove();
  }

  const score = scoreRun({ run, check: state.check?.[tier], lesson: state.lesson?.[tier], tier });
  const today = bangkokDate(config.TIME_ZONE);
  const isToday = run.date === today;
  const change = run.startValue > 0 ? (run.value / run.startValue - 1) * 100 : 0;

  const ring = h('div', { class: 'score-ring', role: 'img', 'aria-label': `Money Health Score ${score.total} out of 100` }, [
    h('span', { class: 'score-ring__num', 'aria-hidden': 'true', text: String(score.total) }),
    h('span', { class: 'score-ring__max', 'aria-hidden': 'true', text: '/ 100' }),
  ]);
  ring.style.setProperty('--p', String(score.total));

  const hero = h('div', { class: 'card report-hero' }, [
    penny(score.band.mood, { size: 96, className: 'report-hero__penny' }),
    ring,
    h('p', { class: 'report-hero__band', text: score.band.label }),
    h('p', { class: 'report-hero__note', text: 'Your Money Health Score rewards wise choices, not just profit.' }),
    h('p', { class: 'report-hero__money' }, [`Finished with ${money(run.value)} `, delta(change)]),
  ]);

  const parts = h('section', { class: 'card report-parts', 'aria-labelledby': 'report-parts-title' }, [
    h('h2', { class: 'report-section__title', id: 'report-parts-title', text: 'How your score adds up' }),
    h(
      'ol',
      { class: 'parts' },
      score.parts.map((p) => {
        const bar = h('span', { class: 'meter__fill' });
        bar.style.setProperty('--w', `${(p.points / p.max) * 100}%`);
        return h('li', { class: 'part' }, [
          h('div', { class: 'part__top' }, [
            h('span', { class: 'part__name', text: p.label }),
            h('span', { class: 'part__points', text: `${p.points} / ${p.max}` }),
          ]),
          h('span', { class: 'meter', 'aria-hidden': 'true' }, [bar]),
          h('p', { class: 'part__why', text: p.reason }),
        ]);
      }),
    ),
  ]);

  const lessons = h('section', { class: 'card report-learned', 'aria-labelledby': 'report-learned-title' }, [
    h('h2', { class: 'report-section__title', id: 'report-learned-title', text: '3 things you learned' }),
    h(
      'ol',
      { class: 'learned' },
      learned({ run, tier }).map((line, i) => h('li', { class: 'learned__item' }, [h('span', { class: 'learned__num', 'aria-hidden': 'true', text: String(i + 1) }), h('span', { text: line })])),
    ),
  ]);

  const boardBody = h('div', { class: 'board__body', 'aria-live': 'polite' });
  const boardMe = h('div', { class: 'board__me' });
  const board = h('section', { class: 'card board', 'aria-labelledby': 'board-title' }, [
    h('h2', { class: 'report-section__title', id: 'board-title', text: isToday ? 'Today’s leaderboard' : `Leaderboard for ${formatDate(run.date)}` }),
    h('p', { class: 'board__note', text: `${tierInfo.name} level. Ranked by Money Health Score, not by profit.` }),
    boardBody,
    boardMe,
    h('p', { class: 'board__privacy', text: 'Only a random nickname, your level, score and date are shared. No names, no accounts.' }),
  ]);

  // The Arena invite appears only when the server has the Arena switched on (BRIEF §15).
  const arenaSlot = h('div', { class: 'report-arena' });
  if (tierInfo.rank >= 1) {
    arenaEnabled().then((on) => {
      if (!on || !alive) return;
      const best = arenaScore(store.get());
      const open = best !== null && best >= 70;
      arenaSlot.replaceChildren(
        h('section', { class: 'card arena-invite', 'aria-labelledby': 'arena-invite-title' }, [
          h('h2', { class: 'report-section__title', id: 'arena-invite-title', text: 'The Arena' }),
          h('p', { text: open ? 'You qualify! Trade in one live market with real players and bots. Simulated L$ only.' : `Score 70 or more at Trader or Builder level to unlock a live market with real players. Your best so far: ${best ?? 'no finished market yet'}.` }),
          open ? h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => navigate('/arena') }, 'Enter the Arena') : null,
        ]),
      );
    });
  }

  const actions = h('div', { class: 'report-actions' }, [
    h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onClick: replay }, 'Replay today’s market'),
    h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate('/path') }, 'Learning Path and missions'),
    h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate('/town') }, 'Back to my town'),
  ]);

  view.append(
    head('Your report card', `${tierInfo.name} · ${isToday ? 'Today’s market' : formatDate(run.date)}${run.finishedEarly ? ' · Finished early' : ''}`),
    hero,
    parts,
    lessons,
    board,
    arenaSlot,
    actions,
  );
  [hero, parts, lessons, board].forEach((el, i) => animate(el, ENTER, { delay: 60 * i }));
  view.querySelector('.screen-title')?.focus({ preventScroll: true });
  announce(`Money Health Score ${score.total} out of 100. ${score.band.label}.`);

  // Celebrate once per finished run, not on every visit.
  const seen = state.report?.[tier];
  if (seen?.runAt !== run.at) {
    store.set((s) => ({ report: { ...s.report, [tier]: { ...s.report?.[tier], runAt: run.at, posted: false } } }));
    if (score.total >= 40) celebrate(hero);
  }

  // A page reload is the one sure way to start the Lab's market from Day 1 (docs/DECISIONS-sim.md).
  function replay() {
    history.replaceState(null, '', '#/lab');
    location.reload();
  }

  // ---------------------------------------------------------------- leaderboard

  async function call(init, query) {
    let res;
    try {
      res = await fetch(`${API}${query ? `?${new URLSearchParams(query)}` : ''}`, init);
    } catch {
      throw new Error('Could not reach the leaderboard. Check your connection and try again.');
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) throw new Error(body?.error?.message || `The leaderboard didn’t answer (error ${res.status}). Try again in a moment.`);
    return body;
  }

  function renderBoard(data) {
    const nickname = store.get().nickname;
    if (!data.top.length) {
      boardBody.replaceChildren(stateView({ kind: 'empty', heading: 'h3', title: 'No scores yet', body: isToday ? 'Add yours and be the first on today’s board.' : 'Nobody posted a score that day.' }));
    } else {
      const nodes = [
        h(
          'ol',
          { class: 'board__list' },
          data.top.map((row) =>
            h('li', { class: `board__row${row.nickname === nickname ? ' is-me' : ''}` }, [
              h('span', { class: 'board__rank', text: String(row.rank) }),
              h('span', { class: 'board__name', text: row.nickname }),
              row.nickname === nickname ? h('span', { class: 'board__you', text: 'You' }) : null,
              h('span', { class: 'board__score', text: String(row.score) }),
            ]),
          ),
        ),
        data.total > data.top.length ? h('p', { class: 'board__more', text: `${data.total} players on this board. Showing the top ${data.top.length}.` }) : null,
      ];
      boardBody.replaceChildren(...nodes.filter(Boolean)); // replaceChildren would print a null as text
    }
    renderMe(data);
  }

  function renderMe(data) {
    const posted = store.get().report?.[tier]?.posted;
    if (data?.me && posted) {
      boardMe.replaceChildren(h('p', { class: 'board__status' }, [icon('check', { size: 20 }), `You’re on the board as ${data.me.nickname}, rank ${data.me.rank} of ${data.total}.`]));
    } else if (isToday) {
      boardMe.replaceChildren(
        h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: post }, `Add my score of ${score.total}`),
      );
    } else {
      boardMe.replaceChildren(h('p', { class: 'board__status', text: 'Scores can be added on the day of the market. Play today’s market to join today’s board.' }));
    }
  }

  async function loadBoard() {
    boardBody.replaceChildren(stateView({ kind: 'loading', heading: 'h3', title: 'Loading the leaderboard…' }));
    boardMe.replaceChildren();
    try {
      const nickname = store.get().nickname;
      const data = await call({}, { tier, date: run.date, ...(nickname && { nickname }) });
      if (alive) renderBoard(data);
    } catch (err) {
      if (!alive) return;
      boardBody.replaceChildren(
        stateView({
          kind: 'error',
          heading: 'h3',
          title: 'The leaderboard didn’t load',
          body: `${err.message} Your score is still saved on this device.`,
          actions: [h('button', { class: 'btn', type: 'button', onClick: loadBoard }, 'Try again')],
        }),
      );
    }
  }

  async function post(e) {
    const button = e.currentTarget;
    button.disabled = true;
    button.textContent = 'Adding your score…';
    try {
      const nickname = store.get().nickname;
      const data = await call(
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier, date: run.date, score: score.total, ...(nickname && { nickname }) }) },
        null,
      );
      store.set((s) => ({ nickname: data.me?.nickname || s.nickname, report: { ...s.report, [tier]: { ...s.report?.[tier], runAt: run.at, posted: true } } }));
      if (!alive) return;
      renderBoard(data);
      announce(`Added. You are rank ${data.me?.rank} of ${data.total}.`);
    } catch (err) {
      if (!alive) return;
      boardMe.replaceChildren(
        h('p', { class: 'board__status board__status--error', role: 'alert', text: err.message }),
        h('button', { class: 'btn btn--block', type: 'button', onClick: post }, 'Try again'),
      );
    }
  }

  loadBoard();

  return () => {
    alive = false;
    view.remove();
  };
}

function head(title, eyebrow) {
  return h('div', { class: 'screen-head' }, [
    h('p', { class: 'screen-eyebrow', text: eyebrow }),
    h('h1', { class: 'screen-title', tabindex: '-1', text: title }),
  ]);
}

// YYYY-MM-DD for "now" in Bangkok, the same day the Lab's seed uses.
function bangkokDate(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}
