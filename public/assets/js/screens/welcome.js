// Landing (BRIEF §16): the first screen is the product itself. The hero is the birth-year cake; the age sets the
// Market Lab level (8–12 Explorer, 13–15 Trader, 16–19 Builder, 20+ Builder) and then the player makes a character.
// Under 8 plays with a grown-up; 20 and over also sees cards for parents, teachers and real markets.
// The year is self-declared and stays in localStorage only.
import { h, icon, animate } from '../ui.js';
import { startDemo, takeDemoNote } from '../judge-demo.js';

const SVG = 'http://www.w3.org/2000/svg';
const MAX_CANDLES = 20;

export function tierForAge(age) {
  if (age < 13) return 'explorer';
  if (age < 16) return 'trader';
  return 'builder';
}

export function mount(root, ctx) {
  const { config, store, navigate } = ctx;
  const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.TIME_ZONE, year: 'numeric' }).format(new Date()));
  const state = store.get();
  const saved = state.birthYear;

  const select = h('select', { id: 'birth-year', class: 'year-select', autocomplete: 'bday-year' }, [
    h('option', { value: '', text: 'Choose your year' }),
    ...Array.from({ length: 98 }, (_, i) => thisYear - 3 - i).map((y) => h('option', { value: String(y), text: String(y), selected: y === saved })),
  ]);
  const cakeBox = h('div', { class: 'cake-box' });
  const ageLine = h('p', { class: 'gate__age', 'aria-live': 'polite' });
  const outcome = h('div', { class: 'gate__outcome' });
  const penny = h('img', { class: 'penny-says__img', src: 'assets/svg/penny/happy.svg', alt: '', width: 96, height: 96 });

  const view = h('div', { class: 'welcome' }, [
    h('section', { class: 'welcome__hero', 'aria-labelledby': 'welcome-title' }, [
      h('h1', { class: 'welcome__title', id: 'welcome-title', text: config.PRODUCT_NAME }),
      h('p', { class: 'welcome__tagline', text: config.TAGLINE }),
      h('div', { class: 'penny-says' }, [
        penny,
        h('p', { class: 'bubble' }, [`Hi, I’m Penny, your money companion. ${config.MANIFESTO}: let’s start with your birthday cake.`]),
      ]),
    ]),
    judgeDemo(),
    state.profile?.character && state.tier
      ? h('div', { class: 'card welcome__back' }, [
          h('p', { text: 'Welcome back! Your town is waiting.' }),
          h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => navigate('/town') }, ['Go to my town', icon('arrow-right', { size: 20 })]),
        ])
      : null,
    h('section', { class: 'card gate', 'aria-labelledby': 'gate-title' }, [
      h('h2', { class: 'gate__title', id: 'gate-title', text: 'What year were you born?' }),
      cakeBox,
      h('label', { class: 'gate__label', for: 'birth-year', text: 'Birth year' }),
      select,
      ageLine,
      outcome,
    ]),
    h('aside', { class: 'card card--quiet note', 'aria-labelledby': 'parents-title' }, [
      h('span', { class: 'note__icon' }, [icon('shield')]),
      h('h2', { class: 'note__title', id: 'parents-title', text: 'For parents' }),
      h('div', { class: 'note__body' }, [
        h('p', { text: `${config.PRODUCT_NAME} is a money companion for kids and grown-ups. Coins, markets and Town coins are simulated; the Piggy Bank only records cash you say you saved, and never touches it. There are no ads, no links to exchanges and no buy prompts.` }),
        h('p', { text: 'Guest play is the default: no sign-up, no personal data and no tracking. The birth year is self-declared, only picks the level, and stays on this device with the rest of the progress.' }),
        h('p', { text: 'An account is optional: a username, a password and a birth year, never an email for children. It saves progress across devices, opens the Arena, and gives you a private parent link to follow progress, confirm Piggy Bank entries and reset a forgotten password. Accounts for children under 13 switch on only after a parent approves them. One login cookie, no analytics.' }),
      ]),
    ]),
    h('section', { class: 'card card--quiet partners', 'aria-labelledby': 'partners-title' }, [
      h('h2', { class: 'note__title', id: 'partners-title', text: 'For partners' }),
      h('p', { text: 'We work with licensed exchanges and wallets for graduates aged 20 and over, with schools, and with sponsors. Nobody under 20 ever sees ads or sponsor banners.' }),
      config.PARTNER_EMAIL ? h('a', { class: 'partners__link', href: `mailto:${config.PARTNER_EMAIL}`, text: `Email the ${config.BRAND} team: ${config.PARTNER_EMAIL}` }) : null,
    ]),
    h('p', { class: 'welcome__research' }, [h('a', { href: '#/research', text: 'The research behind Penny' })]),
  ]);
  root.append(view);

  // Judge demo (P1.B): a labelled sample profile with a full town, one tap away. Loaded on demand (demo.js).
  function judgeDemo() {
    const button = h('button', { class: 'btn judge-demo__btn', type: 'button' }, [h('span', { class: 'judge-demo__tag', text: 'Judges' }), 'Judge demo: see a full town in one tap', icon('arrow-right', { size: 20 })]);
    const note = h('p', { class: 'judge-demo__note', 'aria-live': 'polite', text: takeDemoNote() || 'Loads a sample grown-up profile on this device. “Leave demo” clears it.' });
    button.addEventListener('click', async () => {
      const onStart = () => {
        button.disabled = true;
        note.textContent = 'Building the demo town…';
      };
      if ((await startDemo({ store, config, navigate }, { onStart })) === 'failed') {
        button.disabled = false;
        note.textContent = takeDemoNote();
      }
    });
    return h('div', { class: 'judge-demo' }, [button, note]);
  }

  function next(tier, birthYear) {
    store.set({ tier, birthYear });
    navigate('/character');
  }

  function nextButton(label, onClick) {
    return h('button', { class: 'btn btn--primary btn--lg btn--block gate__start', type: 'button', onClick }, [label, icon('arrow-right', { size: 22 })]);
  }

  function render() {
    const year = Number(select.value);
    const age = year ? thisYear - year : null;
    cakeBox.replaceChildren(cake(age));
    if (age === null) {
      ageLine.textContent = 'Pick your year and Penny lights your candles.';
      outcome.replaceChildren();
      return;
    }
    const tier = config.getTier(tierForAge(age));
    const said = age < 8 ? 'Play with a grown-up in Explorer mode.' : age < 20 ? `${tier.name} level, ages ${tier.ages}.` : 'Welcome, grown-up.';
    ageLine.replaceChildren(`You’re about ${age} `, h('span', { class: 'chip', text: 'self-declared' }), h('span', { class: 'visually-hidden', text: ` ${said}` }));

    if (age < 8) {
      outcome.replaceChildren(
        h('div', { class: 'gate__message' }, [
          h('p', { class: 'gate__lead', text: `${config.PRODUCT_NAME} is made for ages 8 and up.` }),
          h('p', { text: 'Ask a grown-up to sit with you, and you can play together in Explorer mode.' }),
        ]),
        nextButton('Play with a grown-up', () => next('explorer', year)),
      );
    } else if (age < 20) {
      outcome.replaceChildren(
        h('div', { class: 'gate__tier', dataset: { level: tier.id } }, [
          h('span', { class: 'choice-card__icon' }, [icon({ explorer: 'compass', trader: 'candles', builder: 'blocks' }[tier.id], { size: 28 })]),
          h('div', {}, [
            h('p', { class: 'gate__lead' }, [`Your Market Lab level: ${tier.name} `, h('span', { class: 'chip', text: `Ages ${tier.ages}` })]),
            h('p', { class: 'gate__blurb', text: tier.blurb }),
          ]),
        ]),
        nextButton('Next: make your character', () => next(tier.id, year)),
      );
    } else {
      outcome.replaceChildren(grownUps(year));
    }
    animate(outcome, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }]);
  }

  // 20 and over: who Penny is for, an honest word on real markets, then on to the character.
  function grownUps(year) {
    const info = (title, text) => h('li', { class: 'card card--quiet adult-card' }, [h('h3', { class: 'adult-card__title', text: title }), h('p', { text })]);
    return h('div', { class: 'gate__adults' }, [
      h('p', { class: 'gate__lead', text: `Welcome! ${config.PRODUCT_NAME} is for kids from 8 and for grown-ups too.` }),
      h('ul', { class: 'adult-cards' }, [
        info('For parents', 'Play first, then hand it over. Everything is simulated except the Piggy Bank, which only records savings you report. No ads, no tracking.'),
        info('For teachers', 'Everyone gets the same market each day, so a class can talk through the same news together. Every result explains itself.'),
        info('Real markets', 'Real trading happens only on licensed exchanges that check who you are. Penny never handles real money. Licensed partners for graduates aged 20 and over will appear here.'),
      ]),
      nextButton('Next: make your character', () => next('builder', year)),
    ]);
  }

  select.addEventListener('change', render);
  select.addEventListener('input', render);
  render();
  animate(penny, [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300 });

  return () => view.remove();
}

// The birthday cake: one candle per year of age (up to 20), with the age written on the front.
function cake(age) {
  const el = (tag, attrs = {}, kids = []) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    node.append(...kids);
    return node;
  };
  const label = age === null ? 'A birthday cake waiting for its candles' : `A birthday cake with ${Math.min(age, MAX_CANDLES)} candles for age ${age}`;
  const svg = el('svg', { class: 'cake', viewBox: '0 0 240 190', role: 'img', 'aria-label': label });
  svg.append(
    el('ellipse', { class: 'cake__plate', cx: 120, cy: 176, rx: 106, ry: 11 }),
    el('rect', { class: 'cake__base', x: 28, y: 108, width: 184, height: 64, rx: 14 }),
    el('path', { class: 'cake__icing', d: 'M28 122a14 14 0 0 1 14-14h156a14 14 0 0 1 14 14v4c-7 8-15 8-23 0s-15-8-23 0-15 8-23 0-15-8-23 0-15 8-23 0-15-8-23 0-15 8-23 0-15-8-24 0z' }),
    el('rect', { class: 'cake__top', x: 60, y: 66, width: 120, height: 46, rx: 12 }),
    el('path', { class: 'cake__icing', d: 'M60 78a12 12 0 0 1 12-12h96a12 12 0 0 1 12 12v3c-6 7-12 7-18 0s-12-7-18 0-12 7-18 0-12-7-18 0-12 7-18 0-12-7-18 0z' }),
  );
  if (age === null) {
    svg.append(el('text', { class: 'cake__age', x: 120, y: 160, 'text-anchor': 'middle' }, ['?']));
    return svg;
  }
  const n = Math.max(0, Math.min(age, MAX_CANDLES));
  const rows = n > 10 ? [Math.ceil(n / 2), Math.floor(n / 2)] : [n];
  // Back row first, so the front row is drawn over it; back candles sit between the front ones.
  [...rows.entries()].reverse().forEach(([r, count]) => {
    const y = 40 - r * 22;
    const span = Math.min(108, count * 11);
    const step = count > 1 ? span / (count - 1) : 0;
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 120 : 120 - span / 2 + step * i + (r ? step / 2 : 0);
      const g = el('g', { class: `cake__candle cake__candle--${(i + r) % 4}` });
      g.append(el('rect', { x: x - 3, y, width: 6, height: 26 + r * 22, rx: 2 }), el('path', { class: 'cake__flame', d: `M${x} ${y - 14}c4 5 5 8 0 12-5-4-4-7 0-12z` }));
      svg.append(g);
    }
  });
  svg.append(el('text', { class: 'cake__age', x: 120, y: 160, 'text-anchor': 'middle' }, [String(age)]));
  return svg;
}
