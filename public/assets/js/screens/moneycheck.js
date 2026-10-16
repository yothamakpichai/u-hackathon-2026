// Money Check (BRIEF §16). 15 items, the same for everyone, at a 9-year-old reading level, each read aloud on
// request. "Take it later" skips it and leaves it waiting in Town. Answers and the result stay on this device in
// store.assessment. Inspired by peer-reviewed research. Not a clinical or licensed assessment.
// Each question gets its own history entry (#/money-check?q=3), so the browser or phone Back button steps back one
// question, and the answers so far live in store.mcDraft, so Back, a reload or leaving never loses them.
import { h, icon, getJSON, stateView, progress, penny, animate } from '../ui.js';
import { scoreMoneyCheck } from '../moneytype.js';
import { logAction, XP } from '../progress.js';

const ENTER = [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }];
const LETTERS = ['A', 'B', 'C', 'D'];
const TAP_GUARD_MS = 350; // a double tap on an answer must not also answer the next question, unseen

let cached = null; // the 15 items, kept across remounts (each Back remounts this screen)

export function mount(root, ctx) {
  const { store, audio, navigate, config } = ctx;
  let alive = true;
  let items = [];
  const draft = store.get().mcDraft;
  const answers = { ...(draft?.answers || {}) };
  const askedFor = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('q')) || 0;

  const view = h('section', { class: 'screen money-check' });
  root.append(view);

  const later = () => {
    store.set((s) => ({ assessmentLater: Date.now(), unlocked: { ...s.unlocked, [s.tier]: true } }));
    navigate('/town');
  };
  const laterLink = () => h('button', { class: 'skip-link', type: 'button', onClick: later }, 'Take it later');

  function show(...nodes) {
    view.replaceChildren(...nodes.filter(Boolean)); // a null would print as text
    animate(view, ENTER);
    const target = view.querySelector('.narration__text, h1');
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  function intro() {
    const done = Object.keys(answers).length;
    const resume = done > 0 && done < items.length ? Math.min(done, items.length - 1) : 0;
    show(
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: 'Step 3 of 3' }),
        h('h1', { class: 'screen-title', text: 'Money Check' }),
        h('p', { class: 'screen-sub', text: '15 quick questions, about 3 minutes. Most have no right answer: just answer as you really are.' }),
      ]),
      h('div', { class: 'penny-says' }, [
        penny('happy', { size: 72 }),
        h('p', { class: 'bubble', text: 'You’ll get your Money Health Score and your Money Type, plus the building in town to start with. Tap the speaker to hear any question and its answers.' }),
      ]),
      h('p', { class: 'research-label' }, [icon('shield', { size: 18 }), 'Inspired by peer-reviewed research. Not a clinical or licensed assessment.']),
      resume
        ? h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onClick: () => ask(resume) }, [`Carry on from question ${resume + 1}`, icon('arrow-right', { size: 22 })])
        : h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onClick: () => ask(0) }, ['Start the Money Check', icon('arrow-right', { size: 22 })]),
      resume ? h('button', { class: 'btn btn--block', type: 'button', onClick: restart }, 'Start again') : null,
      h('button', { class: 'btn btn--block', type: 'button', onClick: later }, 'Take it later'),
    );
  }

  function restart() {
    for (const k of Object.keys(answers)) delete answers[k];
    store.set({ mcDraft: null });
    ask(0);
  }

  // mode 'push' adds a history entry for this question (below: the question in the entry under it, -1 for none);
  // 'none' shows the question the address already names.
  function ask(i, mode = 'push', below = -1) {
    const item = items[i];
    if (mode === 'push') history.pushState({ mc: i, below }, '', `#/money-check?q=${i + 1}`);
    const shownAt = performance.now();
    // Previous steps back through history when the entry under this one is the previous question, like Back does.
    const previous = () => {
      if (history.state?.mc === i && history.state.below === i - 1) return history.back();
      history.replaceState({ mc: i - 1, below: -1 }, '', `#/money-check?q=${i}`);
      ask(i - 1, 'none');
    };
    const back = i > 0 ? h('button', { class: 'icon-btn', type: 'button', onClick: previous, title: 'Previous question' }, [icon('arrow-right', { className: 'is-flipped' }), h('span', { class: 'visually-hidden', text: 'Previous question' })]) : null;
    show(
      h('div', { class: 'screen-top' }, [back, progress({ total: items.length, current: i, label: 'Money Check' }), laterLink()]),
      h('p', { class: 'screen-eyebrow', text: `Question ${i + 1} of ${items.length}` }),
      h('div', { class: 'penny-says question__header' }, [
        penny('thinking', { size: 64 }),
        h('div', { class: 'bubble question__bubble' }, [audio.line({ id: `mc-${item.id}`, text: item.prompt, tag: 'h1', className: 'question__prompt' })]),
      ]),
      h(
        'div',
        { class: 'options mc-options', role: 'group', 'aria-label': 'Answers' },
        item.options.map((text, j) =>
          h('button', { class: `option${answers[item.id] === j ? ' is-chosen' : ''}`, type: 'button', 'aria-pressed': String(answers[item.id] === j), onClick: () => performance.now() - shownAt >= TAP_GUARD_MS && choose(i, j) }, [
            h('span', { class: 'option__key', 'aria-hidden': 'true', text: LETTERS[j] }),
            h('span', { class: 'option__text', text }),
          ]),
        ),
      ),
    );
  }

  function choose(i, j) {
    answers[items[i].id] = j;
    store.set({ mcDraft: { answers: { ...answers }, at: Date.now() } });
    audio.stop();
    if (i + 1 < items.length) ask(i + 1, 'push', i);
    else finish();
  }

  function finish() {
    const result = scoreMoneyCheck(items, answers);
    store.set((s) => ({ assessment: { ...result, answers: { ...answers }, at: Date.now() }, assessmentLater: null, mcDraft: null, unlocked: { ...s.unlocked, [s.tier]: true } }));
    logAction(store, { kind: 'check', xp: XP.check, ref: 'money-check' });
    navigate('/result');
  }

  // Back, forward and reload land here with ?q=N: show that question if this player has a draft in progress.
  function begin() {
    if (askedFor >= 1 && askedFor <= items.length && draft) ask(askedFor - 1, 'none');
    else intro();
  }

  async function load() {
    if (cached) {
      items = cached;
      return begin();
    }
    view.replaceChildren(stateView({ kind: 'loading', heading: 'h1', title: 'Loading the Money Check…' }));
    try {
      const data = await getJSON(`${config.DATA_BASE}money_check.json`);
      items = data?.items || [];
      if (items.length !== 15) throw new Error('The Money Check questions are missing. You can take it later from your town.');
      cached = items;
      if (alive) begin();
    } catch (err) {
      if (!alive) return;
      view.replaceChildren(
        stateView({
          kind: 'error',
          heading: 'h1',
          title: 'The Money Check didn’t load',
          body: err.message,
          actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: load }, 'Try again'), h('button', { class: 'btn', type: 'button', onClick: later }, 'Go to my town')],
        }),
      );
      const title = view.querySelector('h1');
      title?.setAttribute('tabindex', '-1');
      title?.focus({ preventScroll: true });
    }
  }

  load();

  return () => {
    alive = false;
    audio.stop();
    view.remove();
  };
}
