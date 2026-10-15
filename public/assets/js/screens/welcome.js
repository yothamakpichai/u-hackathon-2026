// Welcome and birth-year gate (BRIEF §3 step 1, §15 Y9). The player picks their birth year, a cake shows the
// candles for that age, and the level follows from it: 8–12 Explorer, 13–15 Trader, 16–19 Builder. Under 8 plays
// Explorer with a grown-up; 20 and over sees cards for parents, teachers and real markets and can try any level.
// The year is self-declared and stays in localStorage only.
import { h, icon, animate } from '../ui.js';

const TIER_ICONS = { explorer: 'compass', trader: 'candles', builder: 'blocks' };
const SVG = 'http://www.w3.org/2000/svg';
const MAX_CANDLES = 20;

export function tierForAge(age) {
  if (age < 13) return 'explorer';
  if (age < 16) return 'trader';
  if (age < 20) return 'builder';
  return null; // 20+: the visitor chooses
}

export function mount(root, ctx) {
  const { config, store, navigate } = ctx;
  const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.TIME_ZONE, year: 'numeric' }).format(new Date()));
  const saved = store.get().birthYear;

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
      h('div', { class: 'penny-says' }, [
        penny,
        h('p', { class: 'bubble' }, ['Hi, I’m Penny! Let’s learn how money and markets really work, so nobody can fool you. First, when were you born?']),
      ]),
    ]),
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
        h('p', {
          text: `${config.PRODUCT_NAME} is a practice market. Every coin, price and trader is simulated: no real money, no real crypto and no link to any exchange. Children learn to spot hype and scams; only the computer traders ever try them.`,
        }),
        h('p', { text: 'No sign-up, no personal data, no cookies and no ads. The birth year is self-declared, only picks the level, and stays on this device with the rest of the progress. A score added to the leaderboard shares only a random nickname, the level, the score and the date.' }),
      ]),
    ]),
  ]);
  root.append(view);

  const start = (tierId, birthYear) => {
    store.set({ tier: tierId, birthYear });
    navigate('/check');
  };

  function render() {
    const year = Number(select.value);
    const age = year ? thisYear - year : null;
    cakeBox.replaceChildren(cake(age));
    if (age === null) {
      ageLine.textContent = 'Your level follows from your age. Pick a year to see it.';
      outcome.replaceChildren();
      return;
    }
    ageLine.replaceChildren(`You’re about ${age} `, h('span', { class: 'chip', text: 'self-declared' }));

    if (age < 8) {
      outcome.replaceChildren(
        h('div', { class: 'gate__message' }, [
          h('p', { class: 'gate__lead', text: 'Market Lab is made for ages 8 and up.' }),
          h('p', { text: 'Ask a grown-up to sit with you, and you can play together in Explorer mode.' }),
        ]),
        startButton('Play Explorer with a grown-up', () => start('explorer', year)),
      );
    } else if (age < 20) {
      const tier = config.getTier(tierForAge(age));
      outcome.replaceChildren(
        h('div', { class: 'gate__tier', dataset: { level: tier.id } }, [
          h('span', { class: 'choice-card__icon' }, [icon(TIER_ICONS[tier.id], { size: 28 })]),
          h('div', {}, [
            h('p', { class: 'gate__lead' }, [`You’ll play as a ${tier.name} `, h('span', { class: 'chip', text: `Ages ${tier.ages}` })]),
            h('p', { class: 'gate__blurb', text: tier.blurb }),
          ]),
        ]),
        startButton(`Start as ${tier.name}`, () => start(tier.id, year)),
      );
    } else {
      outcome.replaceChildren(grownUps(year));
    }
    animate(outcome, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }]);
  }

  function startButton(label, onClick) {
    return h('button', { class: 'btn btn--primary btn--lg btn--block gate__start', type: 'button', onClick }, [label, icon('arrow-right', { size: 22 })]);
  }

  // 20 and over: who the lab is for, an honest word on real markets, and every level to try.
  function grownUps(year) {
    const info = (title, text) => h('li', { class: 'card card--quiet adult-card' }, [h('h3', { class: 'adult-card__title', text: title }), h('p', { text })]);
    return h('div', { class: 'gate__adults' }, [
      h('p', { class: 'gate__lead', text: 'Welcome, grown-up! Market Lab is built for learners aged 8 to 19.' }),
      h('ul', { class: 'adult-cards' }, [
        info('For parents', 'A safe practice market: simulated coins and prices, no sign-up, no ads, and nothing leaves this device unless your child adds a score to the leaderboard.'),
        info('For teachers', 'Everyone gets the same market each day, so a class can talk through the same news together. Every run ends with a Money Health Score that explains itself.'),
        info('Real markets', 'Real trading happens only on licensed exchanges that verify who you are. Market Lab never handles real money and is not linked to any exchange.'),
      ]),
      h('h3', { class: 'gate__try', text: 'Try the lab yourself' }),
      h(
        'ul',
        { class: 'choice-list' },
        config.TIERS.map((tier) =>
          h('li', {}, [
            h('button', { class: 'choice-card', type: 'button', dataset: { tier: tier.id }, onClick: () => start(tier.id, year) }, [
              h('span', { class: 'choice-card__icon' }, [icon(TIER_ICONS[tier.id], { size: 28 })]),
              h('span', { class: 'choice-card__body' }, [
                h('span', { class: 'choice-card__head' }, [h('span', { class: 'choice-card__title', text: tier.name }), h('span', { class: 'chip', text: `Ages ${tier.ages}` })]),
                h('span', { class: 'choice-card__text', text: tier.blurb }),
              ]),
              icon('chevron-right', { className: 'choice-card__chevron' }),
            ]),
          ]),
        ),
      ),
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
      g.append(
        el('rect', { x: x - 3, y, width: 6, height: 26 + r * 22, rx: 2 }),
        el('path', { class: 'cake__flame', d: `M${x} ${y - 14}c4 5 5 8 0 12-5-4-4-7 0-12z` }),
      );
      svg.append(g);
    }
  });
  svg.append(el('text', { class: 'cake__age', x: 120, y: 160, 'text-anchor': 'middle' }, [String(age)]));
  return svg;
}
