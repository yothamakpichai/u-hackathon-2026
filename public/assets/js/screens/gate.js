// Money Health Check (BRIEF §3 step 2): three narrated questions for the chosen tier.
// 2 of 3 right unlocks the Lab; otherwise a short lesson does. "Skip check (demo)" is always there.
// Writes store.check[tier] = { score, total, passed, skipped, answers: [{ id, correct }], at }
// and store.unlocked[tier] = true.
import { h, icon, getJSON, stateView, questionCard, progress, resultPanel, celebrate, animate } from '../ui.js';

const PASS_MARK = 2;
const ENTER = [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }];

export function mount(root, ctx) {
  const { tier, store, audio, navigate, config } = ctx;
  const tierInfo = config.getTier(tier);
  let alive = true;

  const skip = h('button', { class: 'skip-link', type: 'button', onClick: skipCheck }, 'Skip check (demo)');
  const top = h('div', { class: 'screen-top' }, [progress({ total: 3, current: 0, label: 'Money Health Check' }), skip]);
  const body = h('div', { class: 'screen-body' });
  const view = h('section', { class: 'screen' }, [
    top,
    h('div', { class: 'screen-head' }, [
      h('p', { class: 'screen-eyebrow', text: `${tierInfo.name} · Ages ${tierInfo.ages}` }),
      h('h1', { class: 'screen-title', text: 'Money Health Check' }),
      h('p', { class: 'screen-sub', text: 'Three quick questions. Get two right to open the lab.' }),
    ]),
    body,
  ]);
  root.append(view);

  const setProgress = (current) => top.firstChild.replaceWith(progress({ total: 3, current, label: 'Money Health Check' }));

  function unlock(record) {
    store.set((s) => ({
      check: { ...s.check, [tier]: record },
      unlocked: record.passed || record.skipped ? { ...s.unlocked, [tier]: true } : s.unlocked,
    }));
  }

  function skipCheck() {
    const previous = store.get().check?.[tier];
    if (previous?.passed) {
      navigate('/lab');
      return;
    }
    unlock({ score: 0, total: 3, passed: false, skipped: true, answers: [], at: Date.now() });
    navigate('/lab');
  }

  const openLab = () =>
    h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onClick: () => navigate('/lab') }, [
      'Open today’s market',
      icon('arrow-right', { size: 22 }),
    ]);

  function show(node, focusSelector) {
    body.replaceChildren(node);
    animate(node, ENTER);
    const target = focusSelector && node.querySelector(focusSelector);
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  function showAlreadyOpen(questions) {
    setProgress(3);
    skip.hidden = true;
    show(
      resultPanel({
        mood: 'happy',
        title: 'The lab is already open',
        text: `You already passed the check for ${tierInfo.name}. Jump back into today’s market, or take the check again.`,
        actions: [
          openLab(),
          h('button', { class: 'btn btn--block', type: 'button', onClick: () => start(questions) }, 'Take the check again'),
        ],
      }),
    );
  }

  function start(questions) {
    const answers = [];
    skip.hidden = false;

    function ask(i) {
      const q = questions[i];
      const last = i === questions.length - 1;
      setProgress(i);
      const card = questionCard({
        audio,
        audioId: `gate-${tier}-${q.id}`,
        prompt: q.prompt,
        options: q.options,
        answerIndex: q.answerIndex,
        explain: q.explain,
        nextLabel: last ? 'See my result' : 'Next question',
        onAnswer: (correct) => answers.push({ id: q.id, correct }),
        onNext: () => (last ? finish() : ask(i + 1)),
      });
      show(card, i > 0 ? '.question__prompt .narration__text' : null);
    }

    function finish() {
      const score = answers.filter((a) => a.correct).length;
      const passed = score >= PASS_MARK;
      unlock({ score, total: questions.length, passed, skipped: false, answers, at: Date.now() });
      setProgress(3);

      if (passed) {
        skip.hidden = true;
        const panel = resultPanel({
          mood: 'celebrating',
          title: 'Lab unlocked!',
          text: `You got ${score} of ${questions.length} right. Today’s market is open.`,
          actions: [openLab(), h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate('/path') }, 'Open the Learning Path')],
        });
        show(panel, '.result__title');
        celebrate(panel);
      } else {
        show(
          resultPanel({
            mood: 'thinking',
            title: 'Let’s learn this together',
            text: `You got ${score} of ${questions.length} right. A short lesson, 4 cards and 1 question, opens the lab.`,
            actions: [
              h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onClick: () => navigate('/lesson') }, [
                'Start the lesson',
                icon('arrow-right', { size: 22 }),
              ]),
            ],
          }),
          '.result__title',
        );
      }
    }

    ask(0);
  }

  async function load() {
    body.replaceChildren(stateView({ kind: 'loading', title: 'Loading your questions…' }));
    try {
      const data = await getJSON(`${config.DATA_BASE}gate.json`);
      const questions = data && data[tier];
      if (!Array.isArray(questions) || questions.length !== 3) {
        throw new Error('The questions for this level are missing. Go back and pick your level again.');
      }
      if (!alive) return;
      const state = store.get();
      if (state.unlocked?.[tier] && state.check?.[tier]?.passed) showAlreadyOpen(questions);
      else start(questions);
    } catch (err) {
      if (!alive) return;
      body.replaceChildren(
        stateView({
          kind: 'error',
          title: 'The questions didn’t load',
          body: err.message,
          actions: [
            h('button', { class: 'btn btn--primary', type: 'button', onClick: load }, 'Try again'),
            h('button', { class: 'btn', type: 'button', onClick: () => navigate('/') }, 'Back to start'),
          ],
        }),
      );
    }
  }

  load();

  return () => {
    alive = false;
    audio.stop();
    view.remove();
  };
}
