// Welcome (BRIEF §3 step 1): Penny, one sentence, three tier choices and the "For parents" card.
import { h, icon, animate } from '../ui.js';

const TIER_ICONS = { explorer: 'compass', trader: 'candles', builder: 'blocks' };

export function mount(root, ctx) {
  const { config, store, navigate } = ctx;

  const choose = (tierId) => {
    store.set({ tier: tierId });
    navigate('/check');
  };

  const cards = config.TIERS.map((tier) =>
    h('li', {}, [
      h('button', { class: 'choice-card', type: 'button', dataset: { tier: tier.id }, onClick: () => choose(tier.id) }, [
        h('span', { class: 'choice-card__icon' }, [icon(TIER_ICONS[tier.id], { size: 28 })]),
        h('span', { class: 'choice-card__body' }, [
          h('span', { class: 'choice-card__head' }, [
            h('span', { class: 'choice-card__title', text: tier.name }),
            h('span', { class: 'chip', text: `Ages ${tier.ages}` }),
          ]),
          h('span', { class: 'choice-card__text', text: tier.blurb }),
          h('span', { class: 'choice-card__meta', text: tier.meta }),
        ]),
        icon('chevron-right', { className: 'choice-card__chevron' }),
      ]),
    ]),
  );

  const penny = h('img', {
    class: 'penny-says__img',
    src: 'assets/svg/penny/happy.svg',
    alt: '',
    width: 112,
    height: 112,
  });

  const view = h('div', { class: 'welcome' }, [
    h('section', { class: 'welcome__hero', 'aria-labelledby': 'welcome-title' }, [
      h('h1', { class: 'welcome__title', id: 'welcome-title', text: config.PRODUCT_NAME }),
      h('div', { class: 'penny-says' }, [
        penny,
        h('p', { class: 'bubble' }, [
          'Hi, I’m Penny! Let’s learn how money and markets really work, so nobody can fool you.',
        ]),
      ]),
    ]),
    h('section', { class: 'welcome__levels', 'aria-labelledby': 'levels-title' }, [
      h('h2', { class: 'welcome__levels-title', id: 'levels-title', text: 'Choose your level' }),
      h('ul', { class: 'choice-list' }, cards),
    ]),
    h('aside', { class: 'card card--quiet note', 'aria-labelledby': 'parents-title' }, [
      h('span', { class: 'note__icon' }, [icon('shield')]),
      h('h2', { class: 'note__title', id: 'parents-title', text: 'For parents' }),
      h('div', { class: 'note__body' }, [
        h('p', {
          text: `${config.PRODUCT_NAME} is a practice market. Every coin, price and trader is simulated: no real money, no real crypto and no link to any exchange. Children learn to spot hype and scams; only the computer traders ever try them.`,
        }),
        h('p', { text: 'No sign-up, no personal data, no cookies and no ads. Progress stays on this device. A score added to the leaderboard shares only a random nickname, the level, the score and the date.' }),
        h('p', {
          class: 'note__small',
          text: 'On our roadmap, not in this app: a path to real markets, only once a learner reaches legal adulthood (20 in Thailand).',
        }),
      ]),
    ]),
  ]);

  root.append(view);

  animate(penny, [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300 });
  view.querySelectorAll('.choice-list > li').forEach((li, i) => {
    animate(li, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { delay: 80 + i * 60 });
  });

  return () => view.remove();
}
