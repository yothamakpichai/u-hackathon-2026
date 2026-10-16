// Future You (BRIEF §16; slice J10). How today's saving could grow, in today's baht: a seeded Monte
// Carlo with a P10/P50/P90 fan, three input depths, inflation, weak-baht and historical-shock
// scenarios, and your avatar at the goal age (Hershfield et al. 2011). Projection, not prediction.
import { dataUri } from '../../../js/avatar.js';
import { project } from '../sim/future.js';
import { dayOf, logAction } from '../progress.js';
import { animate, getJSON, h, icon, number, reducedMotion, stateView } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_CHARACTER = { skin: 'tone3', hairStyle: 'short', hairColor: 'darkbrown', outfit: 'tee', glasses: 'none' };
// A no-break space keeps "THB" and its amount on one line.
const thb = (n) => `THB ${number(Math.round(n), 0)}`;
const DEPTHS = ['quick', 'standard', 'pro'];
const PRESETS = ['careful', 'balanced', 'bold'];
const MIX = ['cash', 'bonds', 'thaiStocks', 'globalStocks'];
const MIX_WORDS = { cash: 'cash', bonds: 'bonds', thaiStocks: 'Thai stocks', globalStocks: 'global stocks' };
// Checked in this order: the goal must come after the age, and a shock must start before the goal.
const NUMBER_KEYS = ['age', 'goalAge', 'shockInYears', 'monthlySaving', 'startBalance', 'spending'];
// Changing the plan is an action the app can see. It counts once a Bangkok day toward the streak and daily goal.
const FUTURE_XP = 5;

let dataPromise = null;

export function mount(root, ctx) {
  const { store, config } = ctx;
  let alive = true;
  let timer = 0;
  let stop = () => {};
  const view = h('section', { class: 'screen future-screen' });
  root.append(view);
  const title = h('h1', { class: 'screen-title', text: 'Meet your future self' });
  const head = h('div', { class: 'screen-head' }, [
    h('p', { class: 'screen-eyebrow', text: 'Future You' }),
    title,
    h('p', { class: 'screen-sub', text: 'See how saving a little each month could add up, in today’s baht, so you can compare it with prices now.' }),
    h('p', { class: 'future-label' }, [icon('alert', { size: 18 }), 'Projection, not prediction. Nobody knows the future; this shows a range of what could happen.']),
  ]);
  // The header stays mounted while the part below it changes, so the heading keeps its focus.
  const body = h('div', { class: 'future-body' });
  view.append(head, body);

  function focusTitle() {
    title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  }

  function load(retry = false) {
    body.replaceChildren(stateView({ kind: 'loading', title: 'Getting the numbers ready…' }));
    dataPromise ??= getJSON(`${config.DATA_BASE}future_th.json`).catch((err) => {
      dataPromise = null;
      throw err;
    });
    dataPromise
      .then((data) => alive && start(data))
      .catch((err) => {
        if (!alive) return;
        console.error(err);
        const again = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => { focusTitle(); load(true); } }, 'Try again');
        body.replaceChildren(stateView({
          kind: 'error',
          title: 'Future You didn’t load',
          body: 'Penny couldn’t get the numbers for Future You. Check your connection and try again.',
          actions: [again],
        }));
        if (retry) again.focus({ preventScroll: true });
      });
  }

  function start(data) {
    const I = data.inputs;
    const L = data.lifeExpectancy;
    const s = store.get();
    const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric' }).format(new Date()));
    const savedAge = s.birthYear ? thisYear - Number(s.birthYear) : null;
    const prior = s.future || {};
    // The age follows the birth year, unless the player typed an age for this plan under the same birth year.
    const typedAge = prior.ageEdited && Number(prior.birthYear) === Number(s.birthYear) ? prior.age : null;
    const mix = { ...(PRESETS.includes(prior.mixName) ? data.mixes[prior.mixName] : prior.mix || data.mixes.balanced) };
    for (const k of MIX) mix[k] = Math.max(0, Number(mix[k]) || 0);
    const plan = {
      depth: DEPTHS.includes(prior.depth) ? prior.depth : 'quick',
      age: clamp(typedAge ?? savedAge ?? prior.age ?? 25, I.minAge, I.maxAge - 1),
      ageEdited: typedAge != null,
      goalAge: prior.goalAge ?? 60,
      monthlySaving: prior.monthlySaving ?? 1000,
      startBalance: prior.startBalance ?? 0,
      mixName: presetFor(mix) ?? 'custom',
      mix,
      inflation: prior.inflation ?? 'target',
      fx: prior.fx ?? 'base',
      shock: prior.shock ?? '',
      // Set when a shock is first picked: five years before the goal, when the pot is big (shockStart).
      shockInYears: prior.shockInYears ?? null,
      life: prior.life ?? 'average',
      planTo90: prior.planTo90 ?? false,
      spending: prior.spending ?? 0,
    };
    if (!(plan.goalAge > plan.age)) plan.goalAge = Math.max(60, plan.age + 1);
    if (plan.shock && plan.shockInYears == null) plan.shockInYears = shockStart();
    for (const key of NUMBER_KEYS) if (plan[key] != null) plan[key] = fit(key, plan[key]);
    const character = s.profile?.character || s.character || DEFAULT_CHARACTER;
    const projector = makeProjector(data);
    stop = projector.stop;

    // Each number field's limits. Ages and years are whole numbers; any amount of baht is fine.
    function limits(key) {
      if (key === 'age') return { min: I.minAge, max: I.maxAge - 1, whole: true };
      if (key === 'goalAge') return { min: plan.age + 1, max: I.maxAge, whole: true };
      if (key === 'shockInYears') return { min: 0, max: Math.max(0, plan.goalAge - plan.age - 1), whole: true };
      if (key === 'startBalance') return { min: 0, max: I.maxStartBalance, whole: false };
      return { min: 0, max: I.maxMonthlySaving, whole: false };
    }

    function fit(key, v) {
      const { min, max, whole } = limits(key);
      const n = Number(v);
      if (!Number.isFinite(n)) return min;
      return Math.min(max, Math.max(min, whole ? Math.round(n) : n));
    }

    function shockStart() {
      return Math.max(0, plan.goalAge - plan.age - 5);
    }

    function presetFor(m) {
      return PRESETS.find((name) => MIX.every((k) => Math.round((m[k] || 0) * 100) === Math.round(data.mixes[name][k] * 100))) ?? null;
    }

    function save() {
      store.set({ future: { ...plan, mix: { ...plan.mix }, birthYear: store.get().birthYear ?? null } });
    }

    // ---- inputs ------------------------------------------------------------------------------
    const depthBtns = DEPTHS.map((d) =>
      h('button', { class: 'segmented__btn', type: 'button', onClick: () => { plan.depth = d; renderForm(); recompute(); } }, d === 'quick' ? 'Quick' : d === 'standard' ? 'Standard' : 'Pro'),
    );
    const form = h('div', { class: 'future-form' });
    let fields = {};
    let choices = {};
    let sliders = null;
    let mixNote = null;
    let lifeWrap = null;

    function numberField(key, label, hint) {
      const id = `future-${key}`;
      const { min, max, whole } = limits(key);
      const input = h('input', {
        id, class: 'field__input', type: 'number', inputmode: 'numeric', min, max, step: whole ? 1 : 'any', value: String(plan[key] ?? ''),
        'aria-describedby': hint ? `${id}-hint ${id}-error` : `${id}-error`,
      });
      const error = h('p', { class: 'field__error', id: `${id}-error`, hidden: true });
      input.addEventListener('input', () => {
        if (key === 'age') plan.ageEdited = true;
        // Still typing (an empty box, or the 6 of 65): keep the last number and say nothing yet.
        if (input.value === '' || early(key, Number(input.value))) {
          hush(key);
          return;
        }
        checkAll();
        syncVisibility();
        recompute();
      });
      // Leaving the field, or Enter, puts back the number the result uses if the box is empty, and fits
      // a number left out of range (blur too: change doesn't fire when the box ends as it last was).
      const commit = () => {
        if (input.value === '') input.value = String(plan[key]);
        const before = String(NUMBER_KEYS.map((k) => plan[k]));
        checkAll();
        if (String(NUMBER_KEYS.map((k) => plan[k])) === before) return;
        syncVisibility();
        recompute();
      };
      input.addEventListener('change', commit);
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
      });
      const wrap = h('div', { class: 'field' }, [
        h('label', { class: 'field__label', for: id, text: label }),
        hint ? h('p', { class: 'field__hint', id: `${id}-hint`, text: hint }) : null,
        input,
        error,
      ]);
      fields[key] = { input, error, wrap };
      return wrap;
    }

    // Out of range: say the limit and which number the result uses, so the result never hides a change.
    function check(key) {
      const f = fields[key];
      if (!f) return;
      const lim = limits(key);
      f.input.min = String(lim.min);
      f.input.max = String(lim.max);
      let message = '';
      if (!f.wrap.hidden && f.input.validity.badInput) message = 'Type a number.';
      else if (!f.wrap.hidden && f.input.value !== '') {
        const v = Number(f.input.value);
        plan[key] = fit(key, v);
        if (plan[key] !== v) message = `${rule(key, v, lim)} The result uses ${usedText(key, plan[key])}.`;
      }
      f.error.textContent = message;
      f.error.hidden = !message;
      if (message) f.input.setAttribute('aria-invalid', 'true');
      else f.input.removeAttribute('aria-invalid');
    }

    // Below the minimum, but more digits could still bring it into range.
    function early(key, v) {
      const { min, max } = limits(key);
      return v >= 0 && v < min && v * 10 <= max;
    }

    function hush(key) {
      const f = fields[key];
      f.error.textContent = '';
      f.error.hidden = true;
      f.input.removeAttribute('aria-invalid');
    }

    function rule(key, v, { min, max, whole }) {
      if (whole && v >= min && v <= max) return 'Use a whole number.';
      if (key === 'age') return `Pick an age from ${min} to ${max}.`;
      if (key === 'goalAge') return v < min ? `Pick an age after ${plan.age}.` : `Pick an age up to ${max}.`;
      if (key === 'shockInYears') return `Pick 0 to ${max} years, so it starts before your goal age.`;
      if (v < min) return 'Pick 0 or more.';
      return key === 'startBalance' ? `Up to ${thb(max)}.` : `Up to ${thb(max)} a month.`;
    }

    function usedText(key, v) {
      if (key === 'shockInYears') return v === 1 ? '1 year' : `${v} years`;
      return key === 'age' || key === 'goalAge' ? String(v) : thb(v);
    }

    function checkAll() {
      for (const key of NUMBER_KEYS) check(key);
    }

    function choice(key, label, options, hint, cls = '') {
      const hintId = `future-${key}-hint`;
      const hintEl = hint ? h('p', { class: 'field__hint', id: hintId }) : null;
      const btns = options.map(([value, text]) => h('button', { class: 'segmented__btn', type: 'button', onClick: () => pick(key, value) }, text));
      choices[key] = { btns, values: options.map(([v]) => v), hintEl, hint };
      syncChoice(key);
      return h('div', { class: 'field' }, [
        h('p', { class: 'field__label', text: label }),
        h('div', { class: `segmented ${cls}`.trim(), role: 'group', 'aria-label': label, 'aria-describedby': hintEl ? hintId : null }, btns),
        hintEl,
      ]);
    }

    function syncChoice(key) {
      const c = choices[key];
      if (!c) return;
      c.btns.forEach((b, i) => b.setAttribute('aria-pressed', String(c.values[i] === plan[key])));
      if (c.hintEl) c.hintEl.textContent = c.hint();
    }

    function pick(key, value) {
      plan[key] = value;
      if (key === 'mixName') plan.mix = { ...data.mixes[value] };
      if (key === 'shock' && value && plan.shockInYears == null) {
        plan.shockInYears = shockStart();
        if (fields.shockInYears) fields.shockInYears.input.value = String(plan.shockInYears);
      }
      if (key === 'mixName') syncMix();
      else syncChoice(key);
      syncVisibility();
      checkAll();
      recompute();
    }

    // Whole-number shares that add up to exactly 100 (the largest remainders get the leftover points).
    function sharesText() {
      const total = MIX.reduce((t, k) => t + (plan.mix[k] || 0), 0);
      const raw = MIX.map((k) => (total > 0 ? ((plan.mix[k] || 0) / total) * 100 : k === 'cash' ? 100 : 0));
      const pct = raw.map(Math.floor);
      let left = 100 - pct.reduce((a, b) => a + b, 0);
      for (const i of [0, 1, 2, 3].sort((a, b) => (raw[b] - pct[b]) - (raw[a] - pct[a]))) if (left-- > 0) pct[i]++;
      return MIX.map((k, i) => `${MIX_WORDS[k]} ${pct[i]}%`).join(', ');
    }

    function mixHint() {
      const presets = 'Careful: mostly cash and bonds, so smaller ups and downs. Balanced: about half in stocks. Bold: mostly stocks, so bigger ups and downs.';
      if (plan.mixName !== 'custom') return presets;
      return plan.depth === 'pro' ? `You’re using your own mix below. ${presets}` : `You’re using your own mix from Pro: ${sharesText()}. Pick one here to switch.`;
    }

    function shockHint() {
      const shock = data.shocks[plan.shock];
      return shock ? `${shock.label}: ${shock.hint}` : 'Pick a year to see what a year like it could do to your plan.';
    }

    function mixSliders() {
      sliders = {};
      const rows = MIX.map((k) => {
        const id = `future-mix-${k}`;
        const out = h('output', { class: 'range__value', for: id });
        const input = h('input', { id, class: 'range', type: 'range', min: 0, max: 100, step: 5, value: '0' });
        input.addEventListener('input', () => {
          plan.mix[k] = Number(input.value) / 100;
          plan.mixName = presetFor(plan.mix) ?? 'custom';
          syncMix();
          recompute();
        });
        sliders[k] = { input, out };
        return h('div', { class: 'split__row' }, [h('label', { class: 'split__label', for: id, text: data.assets[k].label }), input, out]);
      });
      mixNote = h('p', { class: 'field__hint', id: 'future-mix-note' });
      return h('fieldset', { class: 'pick', 'aria-describedby': 'future-mix-note' }, [h('legend', { class: 'field__label', text: 'Your mix' }), ...rows, mixNote]);
    }

    // The preset buttons, the sliders and their fill always show the mix that is projected.
    function syncMix() {
      syncChoice('mixName');
      if (!sliders) return;
      const pct = Object.fromEntries(MIX.map((k) => [k, Math.round((plan.mix[k] || 0) * 100)]));
      for (const k of MIX) {
        const { input, out } = sliders[k];
        input.value = String(pct[k]);
        input.style.setProperty('--fill', `${pct[k]}%`);
        out.textContent = `${pct[k]}%`;
      }
      const total = MIX.reduce((t, k) => t + pct[k], 0);
      mixNote.textContent = total === 100 ? 'Adds up to 100%.'
        : total === 0 ? 'Everything is at 0%, so Penny counts it all as cash.'
          : `Adds up to ${total}%, so Penny scales it to 100%: ${sharesText()}.`;
    }

    function lifeChoice() {
      const select = h('select', { id: 'future-life', class: 'field__input', 'aria-describedby': 'future-life-hint' }, [
        ['average', `Average: about ${Math.round(L.average.value)} years`],
        ['female', `Female: about ${Math.round(L.female.value)} years`],
        ['male', `Male: about ${Math.round(L.male.value)} years`],
      ].map(([v, t]) => h('option', { value: v, text: t, selected: plan.life === v })));
      select.addEventListener('change', () => { plan.life = select.value; recompute(); });
      const toggleInput = h('input', { id: 'future-plan90', type: 'checkbox', class: 'toggle__input' });
      toggleInput.checked = plan.planTo90;
      toggleInput.addEventListener('change', () => { plan.planTo90 = toggleInput.checked; recompute(); });
      lifeWrap = h('div', { class: 'field' }, [
        h('label', { class: 'field__label', for: 'future-life', text: 'Life expectancy at birth in Thailand' }),
        h('p', { class: 'field__hint', id: 'future-life-hint', text: 'Thai Population Gazette 2025. Many people live longer than the average, so plans often go further.' }),
        select,
        h('label', { class: 'toggle', for: 'future-plan90' }, [
          toggleInput,
          h('span', { class: 'toggle__track', 'aria-hidden': 'true' }),
          h('span', { class: 'toggle__text' }, [h('span', { class: 'toggle__label', text: `Plan to ${L.planTo.value}` })]),
        ]),
      ]);
      return lifeWrap;
    }

    // Show a control only when it can change the result.
    function syncVisibility() {
      if (fields.shockInYears) fields.shockInYears.wrap.hidden = !plan.shock;
      if (lifeWrap) lifeWrap.hidden = !(plan.spending > 0);
    }

    function renderForm() {
      depthBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(DEPTHS[i] === plan.depth)));
      fields = {};
      choices = {};
      sliders = null;
      lifeWrap = null;
      const parts = [
        numberField('age', 'Your age now'),
        numberField('monthlySaving', 'Saving each month (THB)', 'Pocket money counts too.'),
        numberField('goalAge', 'Age you want to use it'),
      ];
      if (plan.depth !== 'quick') {
        parts.push(
          numberField('startBalance', 'Saved already (THB)'),
          choice('mixName', 'Where the money goes', [['careful', 'Careful'], ['balanced', 'Balanced'], ['bold', 'Bold']], mixHint),
          choice('inflation', 'How fast prices rise', [['low', 'Low 1%'], ['target', 'Target 2%'], ['high', 'High 4%']], () => 'Target 2% is what Thailand’s central bank aims for. When prices rise faster, each baht buys less later.'),
        );
      }
      if (plan.depth === 'pro') {
        parts.push(
          mixSliders(),
          choice('fx', 'The baht and US-dollar assets', [['base', 'Steady'], ['weakBaht', 'Weak baht']], () => 'Weak baht: the baht loses 2% a year against the US dollar, so savings in US dollars are worth more in baht.'),
          // Each year is named with its label from the data ('1997 Asian financial crisis'), two to a row.
          choice('shock', 'What if a year like this happened?', [['', 'None'], ...Object.keys(data.shocks).filter((y) => data.shocks[y]?.label).map((y) => [y, data.shocks[y].label])], shockHint, 'future-shocks'),
          numberField('shockInYears', 'Starting how many years from now'),
          numberField('spending', 'Spend each month after your goal age (THB)', 'Leave at 0 to only grow your savings, or add an amount to see how long it lasts.'),
          lifeChoice(),
        );
      }
      form.replaceChildren(...parts);
      syncVisibility();
      checkAll();
      syncMix();
    }

    // ---- outputs -----------------------------------------------------------------------------
    const avatars = h('div', { class: 'future-faces' });
    const summary = h('div', { class: 'future-summary', 'aria-live': 'polite', tabindex: '-1' });
    const chartBox = h('div', { class: 'future-chart' });
    const table = h('details', { class: 'future-table' });
    const out = h('div', { class: 'card future-out' }, [
      h('p', { class: 'future-label' }, [icon('alert', { size: 18 }), data.label]),
      avatars, summary, chartBox, table,
    ]);
    // On phones the result sits below a long form: this bar stays in view at the top and jumps to it.
    const peek = h('button', { class: 'btn btn--primary future-peek', type: 'button', onClick: () => {
      out.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      summary.focus({ preventScroll: true });
    } }, 'See the result');
    const why = h('details', { class: 'card card--quiet future-why' }, [
      h('summary', { text: 'ⓘ Why this works' }),
      h('p', { text: 'In experiments, people who saw an aged picture of themselves chose to put more money aside for later (Hershfield and others, 2011). Showing amounts in today’s baht makes them easy to compare with prices now.' }),
      h('p', { class: 'field__hint' }, ['Returns, volatility and exchange-rate numbers are Penny team assumptions, not sourced facts, and a few historical numbers are still being checked. ', h('a', { href: '#/research', text: 'See the research and sources' }), '.']),
    ]);

    function lifeUntil() {
      if (plan.planTo90) return L.planTo.value;
      return Math.round(L[plan.life]?.value ?? L.average.value);
    }

    function recompute() {
      clearTimeout(timer);
      save();
      summary.replaceChildren(h('p', { class: 'future-working', text: 'Working it out…' }));
      timer = setTimeout(run, 250);
      logAction(store, { kind: 'future', xp: FUTURE_XP, ref: `future:${dayOf()}` });
    }

    let runId = 0;
    function run() {
      if (!alive) return;
      const id = ++runId;
      const { age, goalAge } = plan;
      const pro = plan.depth === 'pro';
      const standard = plan.depth !== 'quick';
      const spending = pro && plan.spending > 0 ? { fromAge: goalAge, monthly: plan.spending } : null;
      const life = lifeUntil();
      const input = {
        age,
        goalAge,
        untilAge: spending ? Math.max(goalAge, life) : goalAge,
        monthlySaving: plan.monthlySaving,
        startBalance: standard ? plan.startBalance : 0,
        mix: standard ? { ...plan.mix } : data.mixes.balanced,
        inflation: standard ? plan.inflation : 'target',
        fx: pro ? plan.fx : 'base',
        shock: pro && plan.shock ? plan.shock : null,
        shockInYears: plan.shockInYears ?? 1,
        spending,
      };
      // With a shock, the same plan without it, on the same market paths, shows what the shock did.
      const plans = [input];
      if (input.shock) plans.push({ ...input, shock: null, untilAge: goalAge, spending: null });
      projector.run(plans).then((results) => {
        if (!alive || id !== runId || !results) return;
        const [r, calm] = results;
        renderAvatars(age, goalAge);
        const empty = !(r.goal.p90 >= 1);
        renderSummary(r, { spending, life, calm, empty });
        renderChart(empty ? null : r, goalAge);
        table.hidden = empty;
        if (!empty) renderTable(r);
      }).catch((err) => {
        console.error(err);
        if (alive && id === runId) summary.replaceChildren(h('p', { class: 'future-empty', text: 'Penny couldn’t work this one out. Try changing a number.' }));
      });
    }

    function renderAvatars(age, goalAge) {
      const face = (a, label) => h('figure', { class: 'future-face' }, [
        h('img', { src: dataUri(character, a), alt: '', width: 120, height: 120 }),
        h('figcaption', { text: label }),
      ]);
      avatars.replaceChildren(face(age, `You now, ${age}`), h('span', { class: 'future-arrow', 'aria-hidden': 'true' }, [icon('arrow-right', { size: 28 })]), face(goalAge, `You at ${goalAge}`));
    }

    function note(kind, iconName, text) {
      return h('p', { class: `future-lasts ${kind}` }, [icon(iconName, { size: 18 }), text]);
    }

    function renderSummary(r, { spending, life, calm, empty }) {
      if (empty) {
        summary.replaceChildren(h('p', { class: 'future-empty', text: 'Add an amount you could save each month to see how it grows.' }));
        peek.textContent = 'See the result';
        peek.removeAttribute('aria-label');
        return;
      }
      const g = r.goal;
      const parts = [
        h('p', { class: 'future-big' }, [`At ${r.goalAge}, about `, h('strong', { text: about(g.p50) })]),
        h('p', { text: `That’s the middle of ${r.paths} projections, in today’s baht. In 8 of 10 it lands between ${about(g.p10)} and ${about(g.p90)}.` }),
        h('p', { class: 'field__hint', text: `You would put in ${thb(r.contributed)} of today’s baht along the way.` }),
      ];
      if (calm) {
        const change = Math.round(((g.p50 - calm.goal.p50) / calm.goal.p50) * 100);
        const when = plan.shockInYears === 0 ? 'starting now' : `starting in ${usedText('shockInYears', plan.shockInYears)}`;
        const how = Math.abs(change) < 1 ? 'about the same as' : `${Math.abs(change)}% ${change > 0 ? 'higher' : 'lower'} than`;
        // A hard year can still lift a plan: global stocks are priced in US dollars and rose in baht
        // in 1997 and 2020. Say so, and how to see the same year without them. Not as the only reason:
        // prices dipped in 2020 too, so a Careful plan still comes out a little higher with none.
        const shock = data.shocks[plan.shock];
        const lift = change >= 1 && plan.mix.globalStocks > 0 && (1 + shock.globalStocks) * (1 + shock.fx) > 1
          ? ' Part of your plan is in global stocks, and they rose in baht that year. Set Global stocks to 0% to see the year without them.'
          : '';
        parts.push(h('p', { class: 'future-shock', text: `With a year like ${plan.shock} ${when}, the middle projection is ${how} with no shock. ${shock.hint}${lift}` }));
      }
      if (spending && r.untilAge <= r.goalAge) {
        const next = life < L.planTo.value && r.goalAge < L.planTo.value ? `Turn on Plan to ${L.planTo.value} to test them.` : 'Pick an earlier goal age to test them.';
        parts.push(note('is-risk', 'alert', `Your goal age is already at or past ${life}, so there are no spending years to test. ${next}`));
      } else if (spending) {
        const tenths = Math.round(r.lastsShare * 10);
        parts.push(note(tenths >= 8 ? 'is-good' : 'is-risk', tenths >= 8 ? 'check' : 'alert',
          `Spending ${thb(spending.monthly)} a month from ${r.goalAge}, the money lasts to ${r.untilAge} in ${tenths} of 10 projections.`));
      }
      // Penny talks the plan through (BRIEF §17): the projection's inputs and outputs, and the voice picked for future you.
      const context = {
        inputs: plan,
        outputs: { goalAge: r.goalAge, paths: r.paths, contributed: r.contributed, goal: r.goal, untilAge: r.untilAge, lastsShare: r.lastsShare },
        futureVoice: store.get().profile?.futureVoice || 'neutral',
      };
      parts.push(h('button', { class: 'btn btn--block', type: 'button', onClick: () => window.dispatchEvent(new CustomEvent('penny:open', { detail: { mode: 'future', context } })) }, 'Ask Penny about this plan'));
      summary.replaceChildren(...parts);
      peek.textContent = `At ${r.goalAge}, about ${about(g.p50)}`;
      peek.setAttribute('aria-label', `See the result: at ${r.goalAge}, about ${about(g.p50)}`);
      animate(summary, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 200 });
    }

    // Drawn at the box's real width, so 12 px text stays 12 px on a phone. Redrawn when the width changes.
    let drawn = null;
    function renderChart(r, goalAge) {
      drawn = r ? { r, goalAge, width: chartBox.clientWidth } : null;
      if (!r) {
        chartBox.replaceChildren();
        return;
      }
      const W = Math.max(240, Math.round(chartBox.clientWidth) || 640);
      // One height everywhere, low enough for the whole result to fit beside the inputs on a laptop.
      const H = 220;
      const padL = 46;
      const padR = 12;
      const padT = 26;
      const padB = 28;
      const ys = r.years;
      const max = niceMax(Math.max(...ys.map((p) => p.p90)));
      const x = (age) => padL + ((age - ys[0].age) / Math.max(1, ys.at(-1).age - ys[0].age)) * (W - padL - padR);
      const y = (v) => padT + (1 - v / max) * (H - padB - padT);
      const svg = document.createElementNS(SVG_NS, 'svg');
      const add = (tag, attrs, text) => {
        const node = document.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
        if (text != null) node.textContent = text;
        svg.append(node);
        return node;
      };
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('class', 'fan');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `Fan chart in today’s baht from age ${ys[0].age} to ${ys.at(-1).age}. Middle projection at ${goalAge}: about ${about(r.goal.p50)}.`);
      add('text', { x: padL - 8, y: 12, 'text-anchor': 'end', class: 'fan__axis' }, 'THB');
      for (let i = 0; i <= 4; i++) {
        const v = (max * i) / 4;
        add('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: 'fan__grid' });
        add('text', { x: padL - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'fan__axis' }, shortThb(v));
      }
      // Age labels about every 40 px, and never one crowding the last age.
      const step = Math.max(1, Math.ceil((ys.length - 1) / Math.max(2, Math.floor((W - padL - padR) / 40))));
      const lastX = x(ys.at(-1).age);
      add('text', { x: padL - 8, y: H - 8, 'text-anchor': 'end', class: 'fan__axis' }, 'Age');
      ys.forEach((p, i) => {
        const last = i === ys.length - 1;
        if (last || (i % step === 0 && lastX - x(p.age) >= 30)) add('text', { x: x(p.age), y: H - 8, 'text-anchor': last ? 'end' : i === 0 ? 'start' : 'middle', class: 'fan__axis' }, String(p.age));
      });
      const band = ys.map((p) => `${x(p.age)},${y(p.p90)}`).join(' ') + ' ' + ys.slice().reverse().map((p) => `${x(p.age)},${y(p.p10)}`).join(' ');
      add('polygon', { points: band, class: 'fan__band' });
      add('polyline', { points: ys.map((p) => `${x(p.age)},${y(p.p50)}`).join(' '), class: 'fan__mid' });
      add('line', { x1: x(goalAge), x2: x(goalAge), y1: padT, y2: H - padB, class: 'fan__goal' });
      // The note sits above the plot: centred on the goal line, or ending or starting at it near an edge.
      const gx = x(goalAge);
      add('text', { x: gx, y: 14, 'text-anchor': gx > W - padR - 40 ? 'end' : gx < padL + 40 ? 'start' : 'middle', class: 'fan__note' }, `Goal: ${goalAge}`);
      chartBox.replaceChildren(svg, h('p', { class: 'future-legend' }, [
        h('span', { class: 'legend-key future-key--band', 'aria-hidden': 'true' }), '8 in 10 projections',
        h('span', { class: 'legend-key future-key--mid', 'aria-hidden': 'true' }), 'Middle projection',
      ]));
    }

    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      // Next frame, so the redraw never loops inside the observer.
      requestAnimationFrame(() => {
        if (alive && drawn && Math.abs(chartBox.clientWidth - drawn.width) >= 1) renderChart(drawn.r, drawn.goalAge);
      });
    }) : null;
    resize?.observe(chartBox);
    stop = () => {
      projector.stop();
      resize?.disconnect();
    };

    function renderTable(r) {
      const rows = r.years.filter((p, i) => i % 5 === 0 || i === r.years.length - 1);
      table.replaceChildren(
        h('summary', { text: 'See the numbers' }),
        h('div', { class: 'future-numbers-wrap' }, [
          h('table', { class: 'future-numbers' }, [
            h('caption', { text: 'In today’s baht (THB), rounded' }),
            h('thead', {}, [h('tr', {}, ['Age', 'Low (P10)', 'Middle (P50)', 'High (P90)'].map((t) => h('th', { scope: 'col', text: t })))]),
            h('tbody', {}, rows.map((p) => h('tr', {}, [h('th', { scope: 'row', text: String(p.age) }), ...[p.p10, p.p50, p.p90].map((v) => h('td', { text: roundBaht(v) }))]))),
          ]),
        ]),
      );
    }

    body.replaceChildren(
      h('div', { class: 'future' }, [
        h('div', { class: 'card future-inputs' }, [
          peek,
          h('div', { class: 'segmented future-depth', role: 'group', 'aria-label': 'How much detail', 'aria-describedby': 'future-depth-hint' }, depthBtns),
          h('p', { class: 'field__hint', id: 'future-depth-hint', text: 'Quick asks 3 things. Standard adds savings so far, where the money goes and prices. Pro adds your own mix, the baht, past shocks and spending.' }),
          form,
        ]),
        out,
        why,
      ]),
    );
    renderForm();
    save();
    run();
  }

  load();
  return () => {
    alive = false;
    clearTimeout(timer);
    stop();
    view.remove();
  };
}

// The projection runs in a module worker when it can, so typing stays smooth on a slow phone.
// One batch at a time: a newer batch replaces one still waiting (that one resolves to null).
// Results are cached by their inputs; without a worker, or if it fails, it runs here instead.
function makeProjector(data) {
  const cache = new Map();
  let worker = null;
  let busy = null;
  let queued = null;
  let nextId = 0;
  const local = (plans) => plans.map((plan) => project(data, plan));
  // An error here still settles the job, so run() hears about it.
  const runHere = (job) => {
    try {
      job.resolve(local(job.plans));
    } catch (err) {
      job.reject(err);
    }
  };
  const fail = () => {
    worker?.terminate();
    worker = null;
    for (const job of [busy, queued]) if (job) runHere(job);
    busy = null;
    queued = null;
  };
  const send = (job) => {
    const id = ++nextId;
    busy = { ...job, id };
    worker.postMessage({ id, data, plans: job.plans });
    // A worker that never answers is treated as broken.
    setTimeout(() => busy?.id === id && fail(), 8000);
  };
  try {
    worker = new Worker(new URL('../sim/future.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: msg }) => {
      if (busy?.id !== msg.id) return;
      const job = busy;
      busy = null;
      job.resolve(msg.results);
      if (queued) {
        const next = queued;
        queued = null;
        send(next);
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      fail();
    };
  } catch {
    worker = null;
  }
  return {
    run(plans) {
      const keys = plans.map((plan) => JSON.stringify(plan));
      if (keys.every((k) => cache.has(k))) return Promise.resolve(keys.map((k) => cache.get(k)));
      const keep = (results) => {
        results?.forEach((r, i) => {
          if (cache.size >= 40) cache.delete(cache.keys().next().value);
          cache.set(keys[i], r);
        });
        return results;
      };
      return new Promise((resolve, reject) => {
        const job = { plans, resolve, reject };
        if (!worker) runHere(job);
        else if (!busy) send(job);
        else {
          queued?.resolve(null);
          queued = job;
        }
      }).then(keep);
    },
    stop() {
      worker?.terminate();
      worker = null;
      busy = null;
      queued = null;
    },
  };
}

function clamp(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

// Rounded to two significant figures, so a projection never reads like an exact forecast:
// 608,331 is 610,000, 1,220,834 is 1.2 million and 1,104,000,000 is 1.1 billion.
function roundBaht(n) {
  const v = Math.max(0, Math.round(n));
  if (v < 100) return number(v, 0);
  const p = 10 ** (Math.floor(Math.log10(v)) - 1);
  const r = Math.round(v / p) * p;
  if (r < 1e6) return number(r, 0);
  const [unit, word] = r < 1e9 ? [1e6, 'million'] : [1e9, 'billion'];
  const m = r / unit;
  return `${number(m, m < 10 ? 1 : 0).replace(/\.0$/, '')} ${word}`;
}

const about = (n) => `THB ${roundBaht(n)}`;

// A round top for the axis, at least 1,000, so the five tick labels never repeat.
function niceMax(v) {
  const raw = Math.max(v, 1000) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].find((s) => s * p >= raw) * p * 4;
}

function shortThb(v) {
  const t = (n) => number(n, 1).replace(/\.0$/, '');
  if (v >= 1e9) return `${t(v / 1e9)}B`;
  if (v >= 1e6) return `${t(v / 1e6)}M`;
  if (v >= 1e3) return `${t(v / 1e3)}k`;
  return number(v, 0);
}
