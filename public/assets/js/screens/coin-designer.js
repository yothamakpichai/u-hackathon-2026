// The coin designer behind #/create (BRIEF §3 step 5, §2 knobs; slice J3). create.js is its light shell (J13).
// Name, ticker, icon, colour and supply for everyone; Trader adds the allocation split and launch hype; Builder
// adds the pool lock and vesting.
// The coin launches on a bonding curve in today's market, and the Lab explains what happens next.
// The player's coin is always honest: its risk comes from the design, never from cheating.
import { GLYPHS, blockedReason, coinBadge, currentMarket, designNotes, notesList } from './coinkit.js';
import { attachCoach } from './coach.js';
import { checkName, checkTicker } from '../sim/names.js';
import { animate, announce, celebrate, h, icon, money, price, resultPanel, stateView } from '../ui.js';

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
  // create.js checks this before loading the designer; check again in case the market moved on meanwhile.
  const stop = blockedReason(market);
  if (stop) return blocked(stop.title, stop.body);

  const uc = market.data.scenario.userCoin;
  const canSplit = tier !== 'explorer';
  const isBuilder = tier === 'builder';
  // The draft lives on the market, so a quick trip back to the market keeps it. Launching clears it.
  market.draft ??= {
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
  const design = market.draft;

  // ---- fields ------------------------------------------------------------------------------
  // Each field checks itself when the child leaves it, and again while its error shows. Launch checks both.
  function textField({ id, label, hint, maxLength, upper, value, onInput, problem }) {
    const input = h('input', {
      id,
      class: 'field__input',
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      autocapitalize: upper ? 'characters' : null,
      autocorrect: upper ? 'off' : null,
      maxlength: maxLength,
      'aria-describedby': `${id}-hint ${id}-error`,
    });
    input.value = value;
    const error = h('p', { class: 'field__error', id: `${id}-error`, hidden: true });
    const field = { input, error };
    const check = () => setError(field, problem());
    input.addEventListener('input', () => {
      if (upper) {
        // Capitals only, with the caret kept just after the typed letter.
        const raw = input.value;
        const clean = raw.toUpperCase().replace(/[^A-Z]/g, '');
        if (clean !== raw) {
          const caret = raw.slice(0, input.selectionStart ?? raw.length).toUpperCase().replace(/[^A-Z]/g, '').length;
          input.value = clean;
          input.setSelectionRange(caret, caret);
        }
      }
      onInput(input.value);
      if (!error.hidden) check();
      renderPreview(input);
    });
    input.addEventListener('blur', () => input.value && check());
    field.el = h('div', { class: 'field' }, [
      h('label', { class: 'field__label', for: id, text: label }),
      h('p', { class: 'field__hint', id: `${id}-hint`, text: hint }),
      input,
      error,
    ]);
    return field;
  }

  // Every coin in the market takes its ticker, even the ones this level can't see (the engine checks them all).
  const roster = new Set(market.data.coinsConfig.coins.map((c) => c.id));
  function checkCoinTicker(ticker) {
    const t = ticker.toUpperCase();
    const problem = checkTicker(t);
    if (problem) return problem;
    if (market.session.getState().coins[t]) return { code: 'TICKER_TAKEN', message: `${t} is already in this market. Pick another ticker.` };
    if (roster.has(t)) return { code: 'TICKER_TAKEN', message: `${t} is taken. Pick another ticker.` };
    return null;
  }

  const nameField = textField({
    id: 'coin-name',
    label: 'Coin name',
    hint: '3 to 16 letters or spaces',
    maxLength: 16,
    value: design.name,
    onInput: (v) => (design.name = v),
    problem: () => checkName(design.name),
  });
  const tickerField = textField({
    id: 'coin-ticker',
    label: 'Ticker',
    hint: tier === 'explorer' ? 'A short code for your coin: 3 to 5 letters, like MOON' : '3 to 5 letters, like MOON',
    maxLength: 5,
    upper: true,
    value: design.ticker,
    onInput: (v) => (design.ticker = v),
    problem: () => checkCoinTicker(design.ticker),
  });

  function setError(field, problem) {
    field.error.hidden = !problem;
    field.error.textContent = problem ? problem.message : '';
    if (problem) field.input.setAttribute('aria-invalid', 'true');
    else field.input.removeAttribute('aria-invalid');
  }

  function validate(focus) {
    const nameProblem = checkName(design.name);
    const tickerProblem = checkCoinTicker(design.ticker);
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
        renderPreview(input);
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
  const splitError = h('p', { class: 'field__error', id: 'create-split-error', role: 'alert', hidden: true });
  const sliders = [];
  function slider(id, label, value, max, out, onChange) {
    const input = h('input', { id, type: 'range', min: 0, max, step: 5, value, class: 'range split__range' });
    sliders.push({ input, max });
    input.addEventListener('input', () => {
      onChange(Number(input.value));
      renderPreview(input);
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
      renderPreview(input);
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
  // The heading comes first, so heading navigation lands on the coin's name and price.
  const preview = h('aside', { class: 'card create-preview', 'aria-labelledby': 'create-preview-title' }, [
    h('h2', { class: 'create-preview__title', id: 'create-preview-title', text: 'How buyers will see it' }),
    h('div', { class: 'create-preview__head' }, [previewBadge, h('div', {}, [previewName, previewPrice])]),
    previewNotes,
  ]);

  function allocation() {
    if (!canSplit) return { ...(uc.explorerAllocation || uc.defaultAllocation) };
    return { you: design.you, team: design.team, public: 100 - design.you - design.team };
  }

  let lastLook = null;
  let lastSupply = null;
  let lastInsiders = null;
  // from: the control that changed. Any edit clears a launch error; if that error held focus (Safari doesn't
  // focus a tapped radio or switch), focus moves to the control instead of dropping to the page.
  function renderPreview(from) {
    if (!formError.hidden && document.activeElement === formError) from?.focus({ preventScroll: true });
    formError.hidden = true;
    const alloc = allocation();
    const ticker = design.ticker || 'COIN';
    previewBadge.replaceChildren(coinBadge(design, config.COIN_COLORS));
    const look = `${design.iconId}:${design.colorId}`;
    if (lastLook && look !== lastLook) animate(previewBadge.firstChild, [{ transform: 'scale(0.8)' }, { transform: 'scale(1.08)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 240 });
    lastLook = look;
    previewName.textContent = `${design.name.trim() || 'Your coin'} (${ticker})`;
    // Too little for buyers: the design can't launch, so it has no starting price yet.
    const short = alloc.public < uc.minPublic;
    const price0 = short ? null : uc.virtualL / ((design.supply * alloc.public) / 100);
    previewPrice.textContent = short ? `No starting price yet: buyers need at least ${uc.minPublic}%` : `Starts at ${price(price0)} each`;
    if (lastSupply != null && design.supply !== lastSupply) announce(previewPrice.textContent);
    lastSupply = design.supply;
    const bigInsiders = (alloc.you + alloc.team) / 100 > uc.trust.fairInsiderShare;
    const notes = designNotes({ supply: design.supply, price0, allocation: alloc, hype: design.hype, lpLocked: design.lpLocked, vesting: design.vesting, bigInsiders }, tier);
    previewNotes.replaceChildren(notesList(notes));
    if (canSplit) {
      youOut.textContent = `${design.you}%`;
      teamOut.textContent = `${design.team}%`;
      publicOut.textContent = `Buyers get ${alloc.public}%`;
      for (const s of sliders) {
        s.input.style.setProperty('--fill', `${(Number(s.input.value) / s.max) * 100}%`);
        s.input.setAttribute('aria-valuetext', `${s.input.value}%. Buyers get ${alloc.public}%`);
      }
      splitBar.children[0].style.flexGrow = String(alloc.you);
      splitBar.children[1].style.flexGrow = String(alloc.team);
      splitBar.children[2].style.flexGrow = String(Math.max(0, alloc.public));
      // Say it when the split flips buyers between trusting and worrying.
      const insiders = notes.find((n) => n.id === 'insiders');
      if (insiders && lastInsiders && insiders.tone !== lastInsiders) announce(insiders.text);
      if (insiders) lastInsiders = insiders.tone;
      splitError.hidden = !short;
      splitError.textContent = short ? `Leave at least ${uc.minPublic}% for buyers, or nobody can buy your coin.` : '';
      launchBtn.disabled = short;
      if (short) launchBtn.setAttribute('aria-describedby', 'create-split-error');
      else launchBtn.removeAttribute('aria-describedby');
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
      // Name and ticker problems show at their field; anything else shows above the button.
      const field = /TICKER/.test(err.code) ? tickerField : /NAME/.test(err.code) ? nameField : null;
      if (field) {
        setError(field, err);
        field.input.focus();
        return;
      }
      formError.textContent = err.message || 'Your coin didn’t launch. Check the form and try again.';
      formError.hidden = false;
      formError.focus?.();
      return;
    }
    market.draft = null;
    market.selected = id;
    market.justLaunched = id; // the Lab celebrates once when it first shows the coin
    const coin = market.session.getState().coins[id];
    const pool = money(uc.graduateAtL, 0);
    const panel = resultPanel({
      mood: 'celebrating',
      title: `${coin.ticker} is live!`,
      // Explorer gets plain words; the bonding curve is Trader and Builder depth (BRIEF §2).
      text: tier === 'explorer'
        ? `It starts at ${price(coin.price)} a coin. Its price rises a little with every buyer. Once buyers put in ${pool}, it gets its own trading pool. Head back to the market to watch how buyers react.`
        : `It starts on a bonding curve at ${price(coin.price)} a coin. Once buyers put in ${pool}, it moves to a real pool. Head back to the market to watch how buyers react.`,
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
    nameReady: () => !checkName(design.name) && !checkCoinTicker(design.ticker),
    drillConfig: () => ({ ...structuredClone({ coinsConfig: market.data.coinsConfig, agentsConfig: market.data.agentsConfig, scenario: market.data.scenario }), seed: market.seed, tier }),
  });
  animate(form, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]);

  return () => {
    detachCoach();
    done();
  };
}
