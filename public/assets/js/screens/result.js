// Money Check result (BRIEF §16): the Money Health Score (knowledge 50 + behaviour 50) and the Money Type (time ×
// risk) with strengths, blind spots, the scam that targets that type, a money-script note and where to start.
// Every claim cites docs/SOURCES.md. The Lab's practice score (BRIEF §6) is separate and stays on the report card.
import { h, icon, getJSON, stateView, penny, celebrate, animate } from '../ui.js';
import { building } from '../../../js/buildings.js';
import { revealedPreference } from '../sim/orchard.js';

// Orchard plantings (BRIEF §16.1) reveal time preference by what people actually do. With enough of them, the
// result says when they lean the other way from the quiz, while the quiz result stays as it is.
const MIN_CHOICES = 3;

const SVG = 'http://www.w3.org/2000/svg';

// Original, simple animal faces for the four Money Types.
export function animalArt(type, size = 96) {
  const el = (tag, attrs) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const svg = el('svg', { class: `animal animal--${type}`, viewBox: '0 0 96 96', width: size, height: size, 'aria-hidden': 'true' });
  const eyes = [el('circle', { class: 'animal__eye', cx: 38, cy: 46, r: 4 }), el('circle', { class: 'animal__eye', cx: 58, cy: 46, r: 4 })];
  const parts = {
    turtle: [
      el('ellipse', { class: 'animal__shell', cx: 48, cy: 66, rx: 36, ry: 22 }),
      el('path', { class: 'animal__line', d: 'M24 66h48M36 50l-6 30M60 50l6 30' }),
      el('circle', { class: 'animal__skin', cx: 48, cy: 40, r: 20 }),
      ...eyes,
      el('path', { class: 'animal__line', d: 'M42 54q6 4 12 0' }),
    ],
    eagle: [
      el('circle', { class: 'animal__body', cx: 48, cy: 52, r: 30 }),
      el('path', { class: 'animal__cap', d: 'M20 46a28 28 0 0 1 56 0z' }),
      ...eyes,
      el('path', { class: 'animal__beak', d: 'M40 56h16l-8 14z' }),
    ],
    cat: [
      el('path', { class: 'animal__body', d: 'M22 30l12 10h28l12-10v34a26 22 0 0 1-52 0z' }),
      ...eyes,
      el('path', { class: 'animal__nose', d: 'M45 56h6l-3 4z' }),
      el('path', { class: 'animal__line', d: 'M30 58h-12M30 63l-11 3M66 58h12M66 63l11 3' }),
    ],
    monkey: [
      el('circle', { class: 'animal__body', cx: 22, cy: 48, r: 11 }),
      el('circle', { class: 'animal__body', cx: 74, cy: 48, r: 11 }),
      el('circle', { class: 'animal__body', cx: 48, cy: 48, r: 28 }),
      el('ellipse', { class: 'animal__muzzle', cx: 48, cy: 58, rx: 17, ry: 13 }),
      ...eyes,
      el('path', { class: 'animal__line', d: 'M41 62q7 5 14 0' }),
    ],
  };
  svg.append(...(parts[type] || parts.turtle));
  return svg;
}

export function mount(root, ctx) {
  const { store, navigate, config } = ctx;
  let alive = true;
  const view = h('section', { class: 'screen result-screen' });
  root.append(view);
  const a = store.get().assessment;

  if (!a) {
    view.append(
      stateView({
        kind: 'empty',
        heading: 'h1',
        title: 'Take the Money Check first',
        body: 'It takes about 3 minutes and tells you your Money Health Score and your Money Type.',
        actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('/money-check') }, 'Start the Money Check'), h('button', { class: 'btn', type: 'button', onClick: () => navigate('/town') }, 'Go to my town')],
      }),
    );
    return () => view.remove();
  }

  async function load() {
    let data;
    try {
      data = await getJSON(`${config.DATA_BASE}money_check.json`);
    } catch (err) {
      if (alive) view.replaceChildren(stateView({ kind: 'error', heading: 'h1', title: 'Your result didn’t load', body: err.message, actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: load }, 'Try again')] }));
      return;
    }
    if (!alive) return;
    const type = data.types[a.type];
    const start = building(type.building);
    const list = (title, items) => h('div', { class: 'result-list' }, [h('h3', { class: 'result-list__title', text: title }), h('ul', {}, items.map((t) => h('li', { text: t })))]);

    const ring = h('div', { class: 'score-ring', role: 'img', 'aria-label': `Money Health Score ${a.score} out of 100` }, [
      h('span', { class: 'score-ring__num', 'aria-hidden': 'true', text: String(a.score) }),
      h('span', { class: 'score-ring__max', 'aria-hidden': 'true', text: '/ 100' }),
    ]);
    ring.style.setProperty('--p', String(a.score));
    const part = (label, points, why) => {
      const bar = h('span', { class: 'meter__fill' });
      bar.style.setProperty('--w', `${(points / 50) * 100}%`);
      return h('li', { class: 'part' }, [h('div', { class: 'part__top' }, [h('span', { class: 'part__name', text: label }), h('span', { class: 'part__points', text: `${points} / 50` })]), h('span', { class: 'meter', 'aria-hidden': 'true' }, [bar]), h('p', { class: 'part__why', text: why })]);
    };

    const notes = [];
    if (a.scripts.worship) notes.push('You agreed that more money would fix all your problems. Klontz and colleagues call beliefs like this money scripts; this one is “money worship” (Klontz et al., 2011). Money helps, but it can’t fix everything.');
    if (a.scripts.status) notes.push('You agreed that expensive things show a person is important. That is the “money status” script (Klontz et al., 2011), and it can push people to spend to impress others.');
    if (!notes.length) notes.push('You didn’t agree with either money belief. Beliefs about money, called money scripts, are linked with how people spend and save (Klontz & Britt, 2012).');
    if (a.presentBias) notes.push('You picked today in the first choice but were happy to wait in the second. A wait feels longer when it starts today; economists call this present bias (Meier & Sprenger, 2010).');
    const pref = revealedPreference(store.get().orchard?.choices || []);
    const quizSaid = a.time === 'later' ? 'Later' : 'Now';
    const revealed = pref && pref.count >= MIN_CHOICES && pref.lean !== 'Mixed' && pref.lean !== quizSaid
      ? h('p', { class: 'result-revealed' }, [icon('target', { size: 20 }), `Your choices look more ${pref.lean} than your quiz said: in the Orchard you planted ${pref.count} times and waited for the big tree ${Math.round(pref.laterShare * 100)}% of the time. Both are you; what you do counts too.`])
      : null;

    const hero = h('div', { class: 'card result-hero' }, [
      animalArt(a.type, 104),
      h('p', { class: 'screen-eyebrow', text: 'Your Money Type' }),
      h('h1', { class: 'result-hero__name', tabindex: '-1', text: type.name }),
      h('p', { class: 'result-hero__line', text: type.line }),
      h('div', { class: 'result-hero__axes' }, [h('span', { class: 'chip', text: a.time === 'later' ? 'Later' : 'Now' }), h('span', { class: 'chip', text: a.risk === 'bold' ? 'Bold' : 'Careful' })]),
      revealed,
    ]);

    view.replaceChildren(
      hero,
      h('section', { class: 'card result-score' }, [
        h('h2', { class: 'report-section__title', text: 'Your Money Health Score' }),
        h('div', { class: 'result-score__top' }, [ring, penny(a.score >= 60 ? 'celebrating' : 'happy', { size: 72 })]),
        h('ol', { class: 'parts' }, [
          part('Knowledge', a.knowledge, `${a.knowledgeCorrect} of ${a.knowledgeTotal} money questions right: interest, inflation, spreading risk, time and scams.`),
          part('Habits', a.behaviour, 'How often you save, plan, compare prices and track spending.'),
        ]),
        h('p', { class: 'part__why', text: 'This is your real-life score. The Market Lab gives a separate practice score for each market you play.' }),
      ]),
      h('section', { class: 'card result-type' }, [
        list('Your strengths', type.strengths),
        list('Watch out for', type.blindSpots),
        h('div', { class: 'result-scam' }, [h('h3', { class: 'result-list__title' }, [icon('alert', { size: 20 }), 'The scam that targets you']), h('p', { text: type.scam })]),
        h('div', { class: 'result-notes' }, [h('h3', { class: 'result-list__title', text: 'About your money beliefs' }), ...notes.map((t) => h('p', { text: t }))]),
      ]),
      h('details', { class: 'card result-answers' }, [
        h('summary', { text: 'See the answers to the knowledge questions' }),
        h(
          'ol',
          {},
          data.items
            .filter((i) => i.kind === 'knowledge')
            .map((i) => h('li', {}, [h('p', { class: 'result-answers__q', text: i.prompt }), h('p', {}, [h('strong', { text: `${a.answers[i.id] === i.answerIndex ? 'You got it: ' : 'Answer: '}${i.options[i.answerIndex]}. ` }), i.explain])])),
        ),
      ]),
      h('p', { class: 'research-label' }, [icon('shield', { size: 18 }), 'Inspired by peer-reviewed research. Not a clinical or licensed assessment.']),
      h('p', { class: 'part__why', text: 'One now-or-later choice says little about who you will become (Watts, Duncan & Quan, 2018). Habits can change, and your town is a place to practise them.' }),
      h('div', { class: 'report-actions' }, [
        start ? h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onClick: () => navigate('/town') }, [`Go to my town: start at the ${start.name}`, icon('arrow-right', { size: 22 })]) : null,
        h('button', { class: 'btn btn--block', type: 'button', onClick: () => import('./tutor.js').then((m) => m.openTutor({ store, config }, { mode: 'explain_result' })) }, 'Ask Penny about my result'),
        h('a', { class: 'btn btn--block', href: '#/research' }, 'The research behind the Money Check'),
      ]),
    );
    animate(hero, [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }]);
    hero.querySelector('h1')?.focus({ preventScroll: true });
    if (store.get().resultSeenAt !== a.at) {
      store.set({ resultSeenAt: a.at });
      celebrate(hero);
    }
  }

  load();
  return () => {
    alive = false;
    view.remove();
  };
}
