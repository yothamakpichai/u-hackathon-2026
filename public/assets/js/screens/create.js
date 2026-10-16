// Create a coin (BRIEF §3 step 5, §2 knobs; slice J3). Name, ticker, icon, colour and supply for
// everyone; Trader adds the allocation split and launch hype; Builder adds the pool lock and vesting.
// The coin launches on a bonding curve in today's market, and the Lab explains what happens next.
// The player's coin is always honest: its risk comes from the design, never from cheating.
import { GLYPHS, coinBadge, currentMarket, designNotes, notesList } from './lab.js';
import { attachCoach } from './coach.js';
import { checkName, checkTicker } from '../sim/names.js';
import { animate, celebrate, h, icon, number, price, resultPanel, stateView } from '../ui.js';

const SUPPLIES = [
  { value: 1_000, label: '1 thousand' },
  { value: 1_000_000, label: '1 million' },
  { value: 1_000_000_000, label: '1 billion' },
];
const HYPES = [
  { value: 0.2, label: 'Quiet' },
  { value: 0.5, label: 'Some buzz' },
  { value: 0.9, label: 'Loud' },
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function mount(root, ctx) {
  const { tier, navigate, config } = ctx;
  const tierInfo = config.getTier(tier);
  const market = currentMarket(tier);
  const view = h('section', { class: 'screen create-screen' });
  root.append(view);
  const head = h('div', { class: 'screen-head' }, [
    h('p', { class: 'screen-eyebrow', text: `${tierInfo.name} · Ages ${tierInfo.ages}` }),
    h('h1', { class: 'screen-title', text: 'Create a coin' }),
  ]);
  const toMarket = (label = 'Back to the market') =>
    h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('/lab') }, [label, icon('arrow-right', { size: 20 })]);
  const done = () => view.remove();

  function blocked(title, body) {
    view.replaceChildren(head, stateView({ kind: 'empty', title, body, actions: [toMarket(market ? 'Back to the market' : 'Open today’s market')] }));
    return done;
  }
  if (!market) return blocked('Open today’s market first', 'Coins launch into today’s market. Open it, wait for Penny’s first news, then come back here.');
  if (market.closed) return blocked('Today’s market has closed', 'Coins can only launch while the market is open. Replay today’s market to try again.');
  const existing = Object.values(market.session.getState().coins).find((c) => c.user);
  if (existing) return blocked(`You already launched ${existing.ticker}`, 'One coin per market. Go back and see how buyers are reacting to it.');
  if (!market.news.length) return blocked('Not open yet', 'Create a coin opens after Penny’s first market news. Keep watching the market, then come back.');

  const uc = market.data.scenario.userCoin;
  const canSplit = tier !== 'explorer';
  const isBuilder = tier === 'builder';
  const design = {
    name: '',
    ticker: '',
    iconId: 7,
    colorId: 4,
    supply: SUPPLIES[1].value,
    you: uc.defaultAllocation.you,
    team: uc.defaultAllocation.team,
    hype: HYPES[1].value,
    lpLocked: true,
    vesting: true,
  };

  // ---- fields ------------------------------------------------------------------------------
  function textField({ id, label, hint, maxLength, upper, onInput }) {
    const input = h('input', {
      id,
      class: 'field__input',
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      maxlength: maxLength,
      'aria-describedby': `${id}-hint ${id}-error`,
    });
    const error = h('p', { class: 'field__error', id: `${id}-error`, hidden: true });
    input.addEventListener('input', () => {
      if (upper) input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '');
      onInput(input.value);
      if (!error.hidden) validate(false);
      renderPreview();
    });
    input.addEventListener('blur', () => input.value && validate(false));
    const el = h('div', { class: 'field' }, [
      h('label', { class: 'field__label', for: id, text: label }),
      h('p', { class: 'field__hint', id: `${id}-hint`, text: hint }),
      input,
      error,
    ]);
    return { el, input, error };
  }

  const nameField = textField({
    id: 'coin-name', label: 'Coin name', hint: '3 to 16 letters or spaces', maxLength: 16, onInput: (v) => (design.name = v),
  });
  const tickerField = textField({
    id: 'coin-ticker', label: 'Ticker', hint: '3 to 5 letters, like MOON', maxLength: 5, upper: true, onInput: (v) => (design.ticker = v),
  });

  function setError(field, problem) {
    field.error.hidden = !problem;
    field.error.textContent = problem ? problem.message : '';
    if (problem) field.input.setAttribute('aria-invalid', 'true');
    else field.input.removeAttribute('aria-invalid');
  }

  function validate(focus) {
    const nameProblem = checkName(design.name);
    let tickerProblem = checkTicker(design.ticker);
    if (!tickerProblem && market.session.getState().coins[design.ticker.toUpperCase()]) {
      tickerProblem = { message: `${design.ticker.toUpperCase()} is already in this market. Pick another ticker.` };
    }
    setError(nameField, nameProblem);
    setError(tickerField, tickerProblem);
    if (focus) (nameProblem ? nameField : tickerProblem ? tickerField : null)?.input.focus();
    return !nameProblem && !tickerProblem;
  }

  // Radio groups: native inputs (keyboard and screen readers for free), drawn as tiles.
  function radios({ name, legend, options, value, onChange, className = '' }) {
    const group = h('fieldset', { class: `pick ${className}`.trim() }, [h('legend', { class: 'field__label', text: legend })]);
    const grid = h('div', { class: 'pick__grid' });
    for (const opt of options) {
      const input = h('input', { type: 'radio', name, value: String(opt.value), class: 'pick__input' });
      input.checked = opt.value === value;
      input.addEventListener('change', () => {
        onChange(opt.value);
        renderPreview();
      });
      grid.append(h('label', { class: 'pick__option' }, [input, opt.face, h('span', { class: opt.showLabel ? 'pick__label' : 'visually-hidden', text: opt.label })]));
    }
    group.append(grid);
    return group;
  }

  const colorPick = radios({
    name: 'coin-color',
    legend: 'Colour',
    className: 'pick--colors',
    value: design.colorId,
    onChange: (v) => {
      design.colorId = v;
      for (const badgeEl of iconPick.querySelectorAll('.coin-badge')) {
        badgeEl.className = `coin-badge coin--${config.COIN_COLORS[v]}`;
      }
    },
    options: config.COIN_COLORS.map((c, i) => ({ value: i, label: cap(c), face: h('span', { class: `swatch coin--${c}`, 'aria-hidden': 'true' }) })),
  });
  const iconPick = radios({
    name: 'coin-icon',
    legend: 'Icon',
    className: 'pick--icons',
    value: design.iconId,
    onChange: (v) => (design.iconId = v),
    options: GLYPHS.map(([label], i) => ({ value: i, label, face: coinBadge({ iconId: i, colorId: design.colorId }, config.COIN_COLORS) })),
  });
  const supplyPick = radios({
    name: 'coin-supply',
    legend: 'How many coins?',
    className: 'pick--chips',
    value: design.supply,
    onChange: (v) => (design.supply = v),
    options: SUPPLIES.map((s) => ({ value: s.value, label: s.label, showLabel: true, face: null })),
  });

  // Trader and Builder: who gets the coins, and how loud the launch is.
  const youOut = h('output', { class: 'range__value', for: 'alloc-you' });
  const teamOut = h('output', { class: 'range__value', for: 'alloc-team' });
  const publicOut = h('p', { class: 'split__public' });
  const splitBar = h('div', { class: 'split__bar', 'aria-hidden': 'true' }, [
    h('span', { class: 'split__you' }),
    h('span', { class: 'split__team' }),
    h('span', { class: 'split__public-bar' }),
  ]);
  const splitError = h('p', { class: 'field__error', role: 'alert', hidden: true });
  function slider(id, label, value, max, out, onChange) {
    const input = h('input', { id, type: 'range', min: 0, max, step: 5, value, class: 'range split__range' });
    input.addEventListener('input', () => {
      onChange(Number(input.value));
      renderPreview();
    });
    return h('div', { class: 'split__row' }, [h('label', { class: 'split__label', for: id, text: label }), input, out]);
  }
  const splitSection = canSplit
    ? h('fieldset', { class: 'pick split', 'data-coach': 'split' }, [
        h('legend', { class: 'field__label', text: 'Who gets the coins?' }),
        slider('alloc-you', 'You keep', design.you, 60, youOut, (v) => (design.you = v)),
        slider('alloc-team', 'Your team', design.team, 40, teamOut, (v) => (design.team = v)),
        splitBar,
        publicOut,
        splitError,
      ])
    : null;
  const hypePick = canSplit
    ? radios({
        name: 'coin-hype',
        legend: 'Launch hype',
        className: 'pick--chips',
        value: design.hype,
        onChange: (v) => (design.hype = v),
        options: HYPES.map((x) => ({ value: x.value, label: x.label, showLabel: true, face: null })),
      })
    : null;

  // Builder: the safety switches.
  function toggle(id, label, hint, key) {
    const input = h('input', { id, type: 'checkbox', class: 'toggle__input' });
    input.checked = design[key];
    input.addEventListener('change', () => {
      design[key] = input.checked;
      renderPreview();
    });
    return h('label', { class: 'toggle', for: id }, [
      input,
      h('span', { class: 'toggle__track', 'aria-hidden': 'true' }),
      h('span', { class: 'toggle__text' }, [h('span', { class: 'toggle__label', text: label }), h('span', { class: 'toggle__hint', text: hint })]),
    ]);
  }
  const safety = isBuilder
    ? h('fieldset', { class: 'pick', 'data-coach': 'safety' }, [
        h('legend', { class: 'visually-hidden', text: 'Launch safety' }),
        toggle('lp-lock', 'Lock the pool', 'Nobody, not even you, can pull its money out.', 'lpLocked'),
        toggle('vesting', 'Vest my coins', 'Your own coins unlock slowly over time.', 'vesting'),
      ])
    : null;

  // ---- preview -----------------------------------------------------------------------------
  const previewBadge = h('span', { class: 'create-preview__badge' });
  const previewName = h('p', { class: 'create-preview__name' });
  const previewPrice = h('p', { class: 'create-preview__price' });
  const previewNotes = h('div', { class: 'create-preview__notes' });
  const formError = h('p', { class: 'field__error create__error', role: 'alert', hidden: true });
  const launchBtn = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit', form: 'create-form', 'data-coach': 'launch' });
  const preview = h('aside', { class: 'card create-preview', 'aria-label': 'Preview' }, [
    h('div', { class: 'create-preview__head' }, [previewBadge, h('div', {}, [previewName, previewPrice])]),
    h('h2', { class: 'create-preview__title', text: 'How buyers will see it' }),
    previewNotes,
  ]);

  function allocation() {
    if (!canSplit) return { ...(uc.explorerAllocation || uc.defaultAllocation) };
    return { you: design.you, team: design.team, public: 100 - design.you - design.team };
  }

  let lastLook = null;
  function renderPreview() {
    const alloc = allocation();
    const ticker = design.ticker || 'COIN';
    previewBadge.replaceChildren(coinBadge(design, config.COIN_COLORS));
    const look = `${design.iconId}:${design.colorId}`;
    if (lastLook && look !== lastLook) animate(previewBadge.firstChild, [{ transform: 'scale(0.8)' }, { transform: 'scale(1.08)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 240 });
    lastLook = look;
    previewName.textContent = `${design.name.trim() || 'Your coin'} (${ticker})`;
    const price0 = alloc.public > 0 ? uc.virtualL / ((design.supply * alloc.public) / 100) : 0;
    previewPrice.textContent = `Starts at ${price(price0)} each`;
    const bigInsiders = (alloc.you + alloc.team) / 100 > uc.trust.fairInsiderShare;
    previewNotes.replaceChildren(
      notesList(designNotes({ supply: design.supply, price0, allocation: alloc, hype: design.hype, lpLocked: design.lpLocked, vesting: design.vesting, bigInsiders }, tier)),
    );
    if (canSplit) {
      youOut.textContent = `${design.you}%`;
      teamOut.textContent = `${design.team}%`;
      publicOut.textContent = `Buyers get ${alloc.public}%`;
      splitBar.children[0].style.flexGrow = String(alloc.you);
      splitBar.children[1].style.flexGrow = String(alloc.team);
      splitBar.children[2].style.flexGrow = String(Math.max(0, alloc.public));
      const short = alloc.public < uc.minPublic;
      splitError.hidden = !short;
      splitError.textContent = short ? `Leave at least ${uc.minPublic}% for buyers, or nobody can buy your coin.` : '';
      launchBtn.disabled = short;
    }
    launchBtn.replaceChildren(`Launch ${design.ticker || 'my coin'}`, icon('arrow-right', { size: 22 }));
  }

  // ---- launch ------------------------------------------------------------------------------
  function launch(event) {
    event.preventDefault();
    formError.hidden = true;
    if (!validate(true)) return;
    let id;
    try {
      id = market.session.createCoin({
        name: design.name,
        ticker: design.ticker,
        iconId: design.iconId,
        colorId: design.colorId,
        supply: design.supply,
        allocation: canSplit ? allocation() : undefined,
        hype: canSplit ? design.hype : undefined,
        lpLocked: isBuilder ? design.lpLocked : undefined,
        vesting: isBuilder ? design.vesting : undefined,
      });
    } catch (err) {
      formError.textContent = err.message || 'Your coin didn’t launch. Check the form and try again.';
      formError.hidden = false;
      formError.focus?.();
      return;
    }
    market.selected = id;
    market.justLaunched = id; // the Lab celebrates once when it first shows the coin
    const coin = market.session.getState().coins[id];
    const panel = resultPanel({
      mood: 'celebrating',
      title: `${coin.ticker} is live!`,
      text: `It starts on a bonding curve at ${price(coin.price)} a coin. Once buyers put in ${number(uc.graduateAtL, 0)} L$, it moves to a real pool. Head back to the market to watch how buyers react.`,
      actions: [toMarket('Watch it in the market')],
    });
    view.replaceChildren(head, panel);
    panel.querySelector('.result__title')?.setAttribute('tabindex', '-1');
    panel.querySelector('.result__title')?.focus();
    celebrate(panel);
  }

  const form = h('form', { id: 'create-form', class: 'create-form', novalidate: true, onSubmit: launch }, [
    h('div', { class: 'card create-section', 'data-coach': 'name' }, [h('h2', { class: 'create-section__title', text: 'Name it' }), nameField.el, tickerField.el]),
    h('div', { class: 'card create-section', 'data-coach': 'look' }, [h('h2', { class: 'create-section__title', text: 'Pick a look' }), colorPick, iconPick]),
    h('div', { class: 'card create-section', 'data-coach': 'supply' }, [
      h('h2', { class: 'create-section__title', text: 'Supply' }),
      supplyPick,
      h('p', { class: 'field__hint', text: 'More coins means each one starts cheaper. Watch the starting price in the preview.' }),
    ]),
    canSplit ? h('div', { class: 'card create-section' }, [h('h2', { class: 'create-section__title', text: 'Split and launch' }), splitSection, hypePick]) : null,
    safety ? h('div', { class: 'card create-section' }, [h('h2', { class: 'create-section__title', text: 'Launch safety' }), safety]) : null,
  ]);

  // Review, then launch: the preview always sits right above the Launch button.
  view.replaceChildren(
    head,
    h('p', { class: 'screen-sub', text: 'Your coin launches into today’s market. How it does depends on your design, never on tricks.' }),
    h('div', { class: 'create' }, [form, h('div', { class: 'create-side' }, [preview, formError, launchBtn])]),
    h('button', { class: 'btn btn--ghost create__back', type: 'button', onClick: () => navigate('/lab') }, 'Back to the market without launching'),
  );
  formError.setAttribute('tabindex', '-1');
  if (hypePick) hypePick.dataset.coach = 'hype';
  renderPreview();
  // Coach chapter 5 continues here (BRIEF §15).
  const detachCoach = attachCoach({
    route: '/create',
    tier,
    store: ctx.store,
    navigate,
    dataBase: config.DATA_BASE,
    hasNews: () => market.news.length > 0,
    hasCoin: () => Object.values(market.session.getState().coins).some((c) => c.user),
    drillConfig: () => ({ ...structuredClone({ coinsConfig: market.data.coinsConfig, agentsConfig: market.data.agentsConfig, scenario: market.data.scenario }), seed: market.seed, tier }),
  });
  animate(form, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]);

  return () => {
    detachCoach();
    done();
  };
}
