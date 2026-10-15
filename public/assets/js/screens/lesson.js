// Lesson (BRIEF §3 step 2, after a missed check): 4 cards, each with a micro-interaction,
// then a 1-question quiz, then the Lab unlocks with a celebration.
// Writes store.lesson[tier] = { done, quizCorrect, at } and store.unlocked[tier] = true.
// Interaction types used by data/lessons.json: reveal, choice, toggle, slider.
import { h, icon, getJSON, stateView, questionCard, progress, penny, resultPanel, celebrate, animate, money, number } from '../ui.js';

const ENTER = [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }];
let uid = 0;

export function mount(root, ctx) {
  const { tier, store, audio, navigate, config } = ctx;
  let alive = true;
  let total = 5;

  const skip = h('button', { class: 'skip-link', type: 'button', onClick: () => finish(null) }, 'Skip lesson (demo)');
  const top = h('div', { class: 'screen-top' }, [progress({ total, current: 0, label: 'Lesson' }), skip]);
  const title = h('h1', { class: 'screen-title', text: 'Lesson' });
  const body = h('div', { class: 'screen-body' });
  const view = h('section', { class: 'screen' }, [
    top,
    h('div', { class: 'screen-head' }, [h('p', { class: 'screen-eyebrow', text: 'Lesson · about 1 minute' }), title]),
    body,
  ]);
  root.append(view);

  const setProgress = (current) => top.firstChild.replaceWith(progress({ total, current, label: 'Lesson' }));

  function show(node, focusSelector) {
    body.replaceChildren(node);
    animate(node, ENTER);
    const target = focusSelector && node.querySelector(focusSelector);
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  // quizCorrect is null when the lesson was skipped.
  function finish(quizCorrect) {
    store.set((s) => ({
      lesson: { ...s.lesson, [tier]: { done: quizCorrect !== null, quizCorrect, at: Date.now() } },
      unlocked: { ...s.unlocked, [tier]: true },
    }));
    if (quizCorrect === null) {
      navigate('/lab');
      return;
    }
    setProgress(total);
    skip.hidden = true;
    const panel = resultPanel({
      mood: 'celebrating',
      title: 'Lab unlocked!',
      text: quizCorrect
        ? 'You finished the lesson and got the quiz right. Today’s market is open.'
        : 'You finished the lesson. Keep that answer in mind: today’s market is open.',
      actions: [
        h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onClick: () => navigate('/lab') }, [
          'Open today’s market',
          icon('arrow-right', { size: 22 }),
        ]),
      ],
    });
    show(panel, '.result__title');
    celebrate(panel);
  }

  function run(lesson) {
    total = lesson.cards.length + 1;
    title.textContent = lesson.title;

    function card(i) {
      const c = lesson.cards[i];
      const last = i === lesson.cards.length - 1;
      setProgress(i);
      const node = lessonCard({ card: c, index: i, audio, audioId: `lesson-${tier}-${i + 1}`, nextLabel: last ? 'Quiz time' : 'Next', onNext: () => (last ? quiz() : card(i + 1)) });
      show(node, i > 0 ? '.lesson-card__title' : null);
    }

    function quiz() {
      const q = lesson.quiz;
      setProgress(lesson.cards.length);
      let correct = false;
      show(
        questionCard({
          audio,
          audioId: `lesson-${tier}-${q.id || 'quiz'}`,
          prompt: q.prompt,
          options: q.options,
          answerIndex: q.answerIndex,
          explain: q.explain,
          nextLabel: 'Open the lab',
          onAnswer: (ok) => {
            correct = ok;
          },
          onNext: () => finish(correct),
        }),
        '.question__prompt .narration__text',
      );
    }

    card(0);
  }

  async function load() {
    body.replaceChildren(stateView({ kind: 'loading', title: 'Loading your lesson…' }));
    try {
      const data = await getJSON(`${config.DATA_BASE}lessons.json`);
      const lesson = data && data[tier];
      if (!lesson || !Array.isArray(lesson.cards) || lesson.cards.length !== 4 || !lesson.quiz) {
        throw new Error('The lesson for this level is missing. Go back and pick your level again.');
      }
      if (alive) run(lesson);
    } catch (err) {
      if (!alive) return;
      body.replaceChildren(
        stateView({
          kind: 'error',
          title: 'The lesson didn’t load',
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

// One lesson card: title, Penny's narrated body, the micro-interaction and Next. Shared with the Learning Path.
// The Next button is always available; it turns primary once the card's interaction is done.
export function lessonCard({ card, index, audio, audioId, nextLabel, onNext }) {
  const next = h('button', { class: 'btn btn--block', type: 'button', onClick: onNext }, [nextLabel, icon('arrow-right', { size: 20 })]);
  const done = () => next.classList.add('btn--primary');
  return h('article', { class: 'card lesson-card' }, [
    h('h2', { class: 'lesson-card__title', text: card.title }),
    h('div', { class: 'penny-says lesson-card__say' }, [
      penny(index % 2 ? 'thinking' : 'happy', { size: 56 }),
      h('div', { class: 'bubble bubble--body' }, [audio.line({ id: audioId, text: card.body, autoplay: true })]),
    ]),
    interaction(card.interaction, done),
    next,
  ]);
}

// Micro-interactions. Each calls done() the first time the learner tries it.
function interaction(spec, done) {
  const kinds = { reveal, choice, toggle, slider };
  const build = spec && kinds[spec.type];
  return build ? build(spec, done) : h('div');
}

function reveal(spec, done) {
  const text = h('p', { class: 'reveal__text', text: spec.reveal, hidden: true, tabindex: '-1' });
  const button = h('button', { class: 'reveal__button', type: 'button', 'aria-expanded': 'false' }, [
    icon('unlock', { size: 22 }),
    spec.prompt,
  ]);
  button.addEventListener('click', () => {
    button.hidden = true;
    text.hidden = false;
    animate(text, [{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }]);
    text.focus({ preventScroll: true });
    done();
  });
  return h('div', { class: 'interaction' }, [button, text]);
}

function choice(spec, done) {
  const out = h('p', { class: 'mini-feedback', role: 'status' });
  const buttons = spec.options.map((label, i) =>
    h('button', { class: 'chip-option', type: 'button', 'aria-pressed': 'false', onClick: () => pick(i) }, label),
  );
  function pick(i) {
    const correct = i === spec.answerIndex;
    buttons.forEach((b, j) => {
      b.setAttribute('aria-pressed', String(j === i));
      b.classList.toggle('is-correct', correct && j === i);
      b.classList.toggle('is-wrong', !correct && j === i);
    });
    out.className = `mini-feedback ${correct ? 'is-correct' : 'is-wrong'}`;
    out.replaceChildren(icon(correct ? 'check' : 'close', { size: 18 }), h('span', { text: `${correct ? 'Yes!' : 'Not quite. Try the other one.'} ${correct ? spec.explain : ''}`.trim() }));
    done();
  }
  return h('div', { class: 'interaction' }, [
    h('p', { class: 'interaction__prompt', text: spec.prompt }),
    h('div', { class: 'chip-options' }, buttons),
    out,
  ]);
}

function toggle(spec, done) {
  const out = h('p', { class: 'toggle__result', role: 'status', text: 'Tap one to see what happens.' });
  const buttons = spec.options.map((option, i) =>
    h('button', { class: 'segmented__btn', type: 'button', 'aria-pressed': 'false', onClick: () => select(i) }, option.label),
  );
  function select(i) {
    buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
    out.classList.add('is-set');
    out.textContent = spec.options[i].result;
    done();
  }
  return h('div', { class: 'interaction' }, [
    h('p', { class: 'interaction__prompt', text: spec.prompt }),
    h('div', { class: 'segmented', role: 'group', 'aria-label': spec.prompt }, buttons),
    out,
  ]);
}

function slider(spec, done) {
  const id = `range-${++uid}`;
  const { min, max, step, start, formula, constant, unit = '', valueUnit = '' } = spec;
  const input = h('input', { class: 'range', type: 'range', id, min, max, step, value: start });
  const valueOut = h('output', { class: 'range__value', for: id });
  const resultValue = h('span', { class: 'slider__value' });
  const compute = (x) => (formula === 'divide' ? constant / (x || 1) : formula === 'multiply' ? x * constant : constant - x);
  const format = (n) => (unit === 'L$' ? money(n) : unit === '%' ? `${number(n, 0)}%` : number(n, Number.isInteger(n) ? 0 : 2));
  let touched = false;

  function update() {
    const x = Number(input.value);
    valueOut.textContent = `${x}${valueUnit}`;
    resultValue.textContent = format(compute(x));
    input.style.setProperty('--fill', `${((x - min) / (max - min)) * 100}%`);
  }
  input.addEventListener('input', () => {
    update();
    if (!touched) {
      touched = true;
      done();
    }
  });
  update();

  return h('div', { class: 'interaction' }, [
    h('label', { class: 'slider__top', for: id }, [h('span', { text: spec.label }), valueOut]),
    input,
    h('p', { class: 'slider__result', 'aria-live': 'polite' }, [h('span', { text: spec.resultLabel }), resultValue]),
  ]);
}
