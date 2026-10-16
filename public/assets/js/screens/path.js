// Learning Path (BRIEF §14, §16). Per level, 3 units of 4 nodes in order: two lessons, a mission in the market and a
// 5-question checkpoint. XP 10 / 20 / 30, a daily goal of 30 XP and a streak shared with every building
// (progress.js). Nodes unlock in order; a passed Money Health Check or a strong Money Check opens the Unit 1
// checkpoint straight away. No hearts and no penalties: a missed checkpoint can be tried again at once.
// Store: path[tier] = { done: { nodeId: { at, xp, score? } }, missions: { nodeId: { startedAt } } }.
import { h, icon, getJSON, stateView, questionCard, progress, resultPanel, celebrate, animate, announce } from '../ui.js';
import { lessonCard } from './lesson.js';
import { logAction, progressSummary, syncActions, XP } from '../progress.js';

const PASS = 4; // checkpoint questions right out of 5
const KIND = { lesson: 'Lesson', mission: 'Mission', checkpoint: 'Checkpoint' };
const NODE_ICON = { lesson: 'book', mission: 'target', checkpoint: 'trophy' };
const ENTER = [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }];
let cached = null; // { data, coach }: Back remounts this screen, so the path isn't fetched again

// The same answer order for everyone, but a different one for each question (the content puts many answers in the
// same slot): a small seeded shuffle of the options, with the answer index moved along.
function shuffled(q, seed) {
  let x = 2166136261;
  for (const ch of seed) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909);
    return ((x ^= x >>> 16) >>> 0) / 4294967296;
  };
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((i) => q.options[i]), answerIndex: order.indexOf(q.answerIndex) };
}

// Does a run's metrics object meet every condition of a mission? Paths like 'coinLaunched.lpLocked' reach inside.
export function missionPassed(check, metrics) {
  const get = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), metrics);
  return check.every(({ metric, op, value }) => {
    const v = get(metric);
    if (op === '>') return v > value;
    if (op === '>=') return v >= value;
    if (op === '<=') return v <= value;
    if (op === '<') return v < value;
    if (op === '==') return v === value;
    return false;
  });
}

// Learning partners shelf (BRIEF §16 "Partners"): schools and learning organisations only, never investing. No ads,
// no sponsor banners, no names or logos: one empty card and a mailto: button (cenedury.com until PARTNER_EMAIL is set).
function partnersShelf(email) {
  const hint = 'path-partners-hint';
  return h('section', { class: 'card path-partners', 'aria-labelledby': 'path-partners-title' }, [
    h('p', { class: 'screen-eyebrow', text: 'School' }),
    h('h2', { class: 'path-unit__title', id: 'path-partners-title', text: 'Learning partners' }),
    h('p', { class: 'path-unit__intro', text: 'Schools and learning organisations that teach money skills. Education only: no investing, no ads.' }),
    h('ul', { class: 'path-partners__shelf' }, [
      h('li', { class: 'path-partners__slot' }, [icon('book', { size: 28 }), h('span', { text: 'Your school or learning organisation could be here' })]),
    ]),
    email
      ? h('a', { class: 'btn btn--block', href: `mailto:${email}?subject=${encodeURIComponent('Learning partner')}` }, 'Become a learning partner')
      : h('a', { class: 'btn btn--block', href: 'https://cenedury.com', target: '_blank', rel: 'noopener', 'aria-describedby': hint }, 'Become a learning partner'),
    email ? null : h('p', { class: 'path-partners__hint', id: hint, text: 'Opens cenedury.com, where you can reach the team.' }),
  ]);
}

export function mount(root, ctx) {
  const { tier, store, audio, navigate, config } = ctx;
  const tierInfo = config.getTier(tier);
  let alive = true;
  let units = [];
  let chapters = []; // Coach chapters (coach.json), shown with this level's progress from store.coach[tier].done
  let coachXp = 0;

  const view = h('section', { class: 'screen path' });
  root.append(view);

  const mine = () => store.get().path?.[tier] || {};
  const nodes = () => units.flatMap((u) => u.nodes.map((n) => ({ ...n, unit: u.id })));
  const isDone = (id) => Boolean(mine().done?.[id]);
  const placed = () => {
    const s = store.get();
    return Boolean(s.check?.[tier]?.passed) || (s.assessment?.knowledgeCorrect ?? 0) >= 4;
  };
  const isOpen = (list, i) => i === 0 || isDone(list[i].id) || isDone(list[i - 1].id) || (list[i].type === 'checkpoint' && list[i].unit === '1' && placed());

  function show(...children) {
    view.replaceChildren(...children.filter(Boolean)); // a null would print as text
    animate(view, ENTER);
    view.querySelector('h1, h2')?.setAttribute('tabindex', '-1');
    view.querySelector('h1, h2')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }

  function complete(node, extra = {}) {
    if (isDone(node.id)) return false;
    const xp = XP[node.type];
    store.set((s) => ({ path: { ...s.path, [tier]: { ...s.path?.[tier], done: { ...s.path?.[tier]?.done, [node.id]: { at: Date.now(), xp, ...extra } } } } }));
    logAction(store, { kind: node.type, xp, ref: `path:${tier}:${node.id}` });
    const unit = units.find((u) => u.id === node.unit);
    if (unit && unit.nodes.every((n) => isDone(n.id))) {
      import('./badges.js').then((m) => m.mintBadge?.(store, { kind: 'unit', ref: unit.id, tier })).catch(() => {});
    }
    return true;
  }

  // Missions finish on their own: when a market closes after the mission started and its metrics meet the goal.
  function checkMissions() {
    const run = store.get().lab?.[tier];
    const finished = [];
    for (const n of nodes()) {
      if (n.type !== 'mission' || isDone(n.id)) continue;
      const started = mine().missions?.[n.id]?.startedAt;
      if (started && run?.metrics && run.at > started && missionPassed(n.check, run.metrics)) {
        complete(n);
        finished.push(n);
      }
    }
    return finished;
  }

  // ---------------------------------------------------------------- the map

  function map(finished = []) {
    const s = progressSummary(store.get());
    const list = nodes();
    const goal = h('span', { class: 'meter path-goal__meter', 'aria-hidden': 'true' }, [h('span', { class: 'meter__fill' })]);
    goal.firstChild.style.setProperty('--w', `${Math.min(100, (s.todayXp / s.goal) * 100)}%`);
    const stats = h('div', { class: 'path-stats' }, [
      h('div', { class: 'path-stat' }, [icon('flame', { size: 24, className: s.streak ? 'is-lit' : '' }), h('span', {}, [h('strong', { text: `${s.streak}-day streak` }), h('span', { text: s.activeToday ? 'Done for today' : 'Do one thing today' })])]),
      h('div', { class: 'path-stat' }, [icon('star', { size: 24 }), h('span', {}, [h('strong', { text: `${s.xp} XP` }), h('span', { text: 'from every building' })])]),
      h('div', { class: 'path-stat path-goal' }, [h('span', {}, [h('strong', { text: `Daily goal ${Math.min(s.todayXp, s.goal)} / ${s.goal} XP` }), goal])]),
    ]);
    const unitCards = units.map((u) =>
      h('section', { class: 'card path-unit', 'aria-labelledby': `unit-${u.id}` }, [
        h('p', { class: 'screen-eyebrow', text: `Unit ${u.id}` }),
        h('h2', { class: 'path-unit__title', id: `unit-${u.id}`, text: u.title }),
        h('p', { class: 'path-unit__intro', text: u.intro }),
        h(
          'ol',
          { class: 'path-steps' },
          u.nodes.map((n) => {
            const i = list.findIndex((x) => x.id === n.id);
            const done = isDone(n.id);
            const open = isOpen(list, i);
            return h('li', { class: 'path-step' }, [
              h('button', { class: `path-node path-node--${n.type}${done ? ' is-done' : open ? ' is-current' : ' is-locked'}`, type: 'button', disabled: !open, onClick: () => openNode(list[i]) }, [
                h('span', { class: 'path-node__icon', 'aria-hidden': 'true' }, [icon(done ? 'check' : open ? NODE_ICON[n.type] : 'lock', { size: 24 })]),
                h('span', { class: 'path-node__text' }, [
                  h('span', { class: 'path-node__kind', text: `${KIND[n.type]} · ${XP[n.type]} XP` }),
                  h('span', { class: 'path-node__title', text: n.title }),
                  h('span', { class: 'path-node__state', text: done ? 'Done' : open ? (n.type === 'mission' && mine().missions?.[n.id] ? 'In progress' : 'Start') : 'Opens after the step before' }),
                ]),
              ]),
            ]);
          }),
        ),
      ]),
    );
    show(
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: `${tierInfo.name} · Learning Path` }),
        h('h1', { class: 'screen-title', text: 'Your Learning Path' }),
        h('p', { class: 'screen-sub', text: 'Short lessons, a mission in the market and a checkpoint in every unit.' }),
      ]),
      finished.length ? missionBanner(finished) : null,
      stats,
      ...unitCards,
      coachCard(),
      partnersShelf(config.PARTNER_EMAIL),
    );
  }

  // Coach chapters count on the path too (BRIEF §15): each finished chapter is listed with its XP.
  function coachCard() {
    if (!chapters.length) return null;
    const done = store.get().coach?.[tier]?.done || {};
    const count = chapters.filter((c) => done[c.id]).length;
    return h('section', { class: 'card path-unit path-coach', 'aria-labelledby': 'path-coach-title' }, [
      h('p', { class: 'screen-eyebrow', text: 'Coach in the Market Lab' }),
      h('h2', { class: 'path-unit__title', id: 'path-coach-title', text: `Coach chapters: ${count} of ${chapters.length}` }),
      h('p', { class: 'path-unit__intro', text: 'Penny walks you through the real Lab, one step at a time. Each chapter counts here and earns XP.' }),
      h(
        'ol',
        { class: 'path-steps' },
        chapters.map((c) =>
          h('li', { class: 'path-step' }, [
            h('span', { class: `path-node path-node--coach${done[c.id] ? ' is-done' : ''}` }, [
              h('span', { class: 'path-node__icon', 'aria-hidden': 'true' }, [icon(done[c.id] ? 'check' : 'book', { size: 24 })]),
              h('span', { class: 'path-node__text' }, [
                h('span', { class: 'path-node__kind', text: `Coach chapter · ${done[c.id]?.xp ?? coachXp} XP` }),
                h('span', { class: 'path-node__title', text: c.title }),
                h('span', { class: 'path-node__state', text: done[c.id] ? 'Done' : 'In the Market Lab' }),
              ]),
            ]),
          ]),
        ),
      ),
      count < chapters.length ? h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate('/lab?coach=1') }, 'Open the Coach in the Market Lab') : null,
    ]);
  }

  function missionBanner(finished) {
    const banner = h('div', { class: 'card path-banner', role: 'status' }, [
      icon('trophy', { size: 28 }),
      h('p', { text: `Mission complete: ${finished.map((n) => n.title).join(', ')}! +${finished.length * XP.mission} XP.` }),
    ]);
    requestAnimationFrame(() => celebrate(banner));
    return banner;
  }

  function openNode(n) {
    history.pushState({ pathNode: n.id }, '', `#/path?step=${n.id}`);
    if (n.type === 'lesson') lesson(n);
    else if (n.type === 'mission') mission(n);
    else checkpoint(n);
  }

  // Back to the map: through history when a step added an entry (Back then works the same), otherwise directly.
  const toMap = () => (history.state?.pathNode ? history.back() : map());
  const backToMap = (label = 'Back to your path') => h('button', { class: 'btn btn--block', type: 'button', onClick: toMap }, label);

  function top(n, total, current) {
    return h('div', { class: 'screen-top' }, [
      h('h1', { class: 'visually-hidden', text: n.title }),
      h('button', { class: 'icon-btn', type: 'button', onClick: toMap, title: 'Back to your path' }, [icon('close'), h('span', { class: 'visually-hidden', text: 'Back to your path' })]),
      progress({ total, current, label: n.title }),
    ]);
  }

  function done(n, text, extras = []) {
    const first = complete(n);
    const panel = resultPanel({
      mood: 'celebrating',
      title: first ? `+${XP[n.type]} XP` : 'Done again!',
      text,
      actions: [...extras, h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: toMap }, ['Back to your path', icon('arrow-right', { size: 20 })])],
    });
    show(h('h1', { class: 'visually-hidden', text: n.title }), panel);
    if (first) celebrate(panel);
    announce(`${n.title} done.`);
  }

  // ---------------------------------------------------------------- nodes

  function lesson(n) {
    const l = n.lesson;
    const total = l.cards.length + 1;
    const card = (i) => {
      const last = i === l.cards.length - 1;
      show(
        top(n, total, i),
        lessonCard({ card: l.cards[i], index: i, audio, audioId: `path-${tier}-${n.id}-${i + 1}`, nextLabel: last ? 'Quiz time' : 'Next', onNext: () => (last ? quiz() : card(i + 1)) }),
      );
    };
    const quiz = () => {
      show(
        top(n, total, l.cards.length),
        questionCard({
          audio,
          audioId: `path-${tier}-${n.id}-quiz`,
          prompt: l.quiz.prompt,
          ...shuffled(l.quiz, `${tier}:${n.id}:quiz`),
          explain: l.quiz.explain,
          nextLabel: 'Finish the lesson',
          onNext: () =>
            done(n, `You finished “${l.title}”.`, n.explore ? [h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate('/explorer') }, 'Open the block explorer')] : []),
        }),
      );
    };
    card(0);
  }

  function mission(n) {
    const run = store.get().lab?.[tier];
    const started = mine().missions?.[n.id]?.startedAt;
    const finished = mine().done?.[n.id];
    if (finished) {
      show(
        h('div', { class: 'screen-head' }, [
          h('p', { class: 'screen-eyebrow', text: `Mission · ${XP.mission} XP` }),
          h('h1', { class: 'screen-title', text: n.title }),
        ]),
        h('div', { class: 'card path-mission' }, [
          h('p', { class: 'path-mission__goal', text: n.goal }),
          h('p', { class: 'path-banner__text', text: `Mission complete on ${new Date(finished.at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}: +${finished.xp ?? XP.mission} XP.` }),
          h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate('/lab') }, 'Play today’s market'),
          backToMap(),
        ]),
      );
      return;
    }
    const last = run?.metrics && started && run.at > started && !missionPassed(n.check, run.metrics);
    show(
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: `Mission · ${XP.mission} XP` }),
        h('h1', { class: 'screen-title', text: n.title }),
      ]),
      h('div', { class: 'card path-mission' }, [
        h('p', { class: 'path-mission__goal', text: n.goal }),
        last ? h('p', { class: 'path-mission__last', text: 'Your last market didn’t meet the goal yet. Read the report card for the numbers, then try again.' }) : null,
        h('p', { class: 'path-mission__how', text: 'The mission finishes by itself when a market you play after starting it meets the goal. Come back here to collect your XP.' }),
        h('button', {
          class: 'btn btn--primary btn--lg btn--block',
          type: 'button',
          onClick: () => {
            store.set((s) => ({ path: { ...s.path, [tier]: { ...s.path?.[tier], missions: { ...s.path?.[tier]?.missions, [n.id]: { startedAt: Date.now() } } } } }));
            navigate('/lab');
          },
        }, [started ? 'Try the mission again' : 'Start the mission', icon('arrow-right', { size: 22 })]),
        backToMap(),
      ]),
    );
  }

  function checkpoint(n) {
    const qs = n.questions;
    let right = 0;
    const ask = (i) => {
      const q = qs[i];
      const last = i === qs.length - 1;
      show(
        top(n, qs.length, i),
        questionCard({
          audio,
          audioId: `path-${tier}-${n.id}-q${i + 1}`,
          prompt: q.prompt,
          ...shuffled(q, `${tier}:${n.id}:${i}`),
          explain: q.explain,
          nextLabel: last ? 'See my result' : 'Next question',
          onAnswer: (ok) => {
            if (ok) right++;
          },
          onNext: () => (last ? result() : ask(i + 1)),
        }),
      );
    };
    const result = () => {
      if (right >= PASS) {
        done(n, `You got ${right} of ${qs.length} right. ${n.unit === '3' ? 'That’s the whole path for this level!' : 'The next unit is open.'}`);
        return;
      }
      show(
        h('h1', { class: 'visually-hidden', text: n.title }),
        resultPanel({
          mood: 'thinking',
          title: `${right} of ${qs.length}: nearly there`,
          text: `You need ${PASS} of ${qs.length}. Look back over this unit’s lessons if you like, then try again. There’s no penalty.`,
          actions: [h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => checkpoint(n) }, 'Try again'), backToMap()],
        }),
      );
    };
    ask(0);
  }

  async function load() {
    if (!cached) view.replaceChildren(stateView({ kind: 'loading', heading: 'h1', title: 'Loading your Learning Path…' }));
    try {
      cached ??= await Promise.all([getJSON(`${config.DATA_BASE}path.json`), getJSON(`${config.DATA_BASE}coach.json`).catch(() => null)]).then(([data, coach]) => ({ data, coach }));
      const { data, coach } = cached;
      units = data?.[tier]?.units || [];
      chapters = (coach?.chapters || []).filter((c) => !c.tiers || c.tiers.includes(tier)).map((c) => ({ id: c.id, title: c.title }));
      coachXp = coach?.xp ?? 0;
      if (units.length !== 3) throw new Error('The path for this level is missing. Try another level or come back soon.');
      if (!alive) return;
      syncActions(store);
      map(checkMissions());
    } catch (err) {
      if (!alive) return;
      view.replaceChildren(
        stateView({
          kind: 'error',
          heading: 'h1',
          title: 'The Learning Path didn’t load',
          body: err.message,
          actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: load }, 'Try again'), h('button', { class: 'btn', type: 'button', onClick: () => navigate('/') }, 'Back to start')],
        }),
      );
      view.querySelector('h1')?.focus({ preventScroll: true });
    }
  }

  load();

  return () => {
    alive = false;
    audio.stop();
    view.remove();
  };
}
