// Future You (BRIEF §16; slice J10). How today's saving could grow, in today's baht: a seeded Monte
// Carlo with a P10/P50/P90 fan, three input depths, inflation, weak-baht and historical-shock
// scenarios, and your avatar at the goal age (Hershfield et al. 2011). Projection, not prediction.
import { dataUri } from '../../../js/avatar.js';
import { project } from '../sim/future.js';
import { dayOf, logAction } from '../progress.js';
import { animate, getJSON, h, icon, number, stateView } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_CHARACTER = { skin: 'tone3', hairStyle: 'short', hairColor: 'darkbrown', outfit: 'tee', glasses: 'none' };
const thb = (n) => `THB ${number(Math.round(n), 0)}`;
const DEPTHS = ['quick', 'standard', 'pro'];
// Changing the plan is an action the app can see. It counts once a Bangkok day toward the streak and daily goal.
const FUTURE_XP = 5;

let dataPromise = null;

export function mount(root, ctx) {
  const { store, config } = ctx;
  let alive = true;
  let timer = 0;
  const view = h('section', { class: 'screen future-screen' });
  root.append(view);
  const head = h('div', { class: 'screen-head' }, [
    h('p', { class: 'screen-eyebrow', text: 'Future You' }),
    h('h1', { class: 'screen-title', text: 'Meet your future self' }),
    h('p', { class: 'screen-sub', text: 'See how saving a little each month could add up, in today’s baht, so you can compare it with prices now.' }),
    h('p', { class: 'future-label' }, [icon('alert', { size: 18 }), 'Projection, not prediction. Nobody knows the future; this shows a range of what could happen.']),
  ]);

  function load() {
    view.replaceChildren(head, stateView({ kind: 'loading', title: 'Getting the numbers ready…' }));
    dataPromise ??= getJSON(`${config.DATA_BASE}future_th.json`).catch((err) => {
      dataPromise = null;
      throw err;
    });
    dataPromise
      .then((data) => alive && start(data))
      .catch((err) => {
        if (!alive) return;
        view.replaceChildren(head, stateView({
          kind: 'error',
          title: 'Future You didn’t load',
          body: err.message,
          actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: load }, 'Try again')],
        }));
      });
  }

  function start(data) {
    const s = store.get();
    const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric' }).format(new Date()));
    const savedAge = s.birthYear ? thisYear - Number(s.birthYear) : null;
    const prior = s.future || {};
    const plan = {
      depth: DEPTHS.includes(prior.depth) ? prior.depth : 'quick',
      age: clamp(prior.age ?? savedAge ?? 25, data.inputs.minAge, data.inputs.maxAge - 1),
      goalAge: prior.goalAge ?? 60,
      monthlySaving: prior.monthlySaving ?? 1000,
      startBalance: prior.startBalance ?? 0,
      mixName: prior.mixName ?? 'balanced',
      mix: prior.mix ?? { ...data.mixes.balanced },
      inflation: prior.inflation ?? 'target',
      fx: prior.fx ?? 'base',
      shock: prior.shock ?? '',
      shockInYears: prior.shockInYears ?? 1,
      life: prior.life ?? 'average',
      planTo90: prior.planTo90 ?? false,
      spending: prior.spending ?? 0,
    };
    plan.goalAge = clamp(plan.goalAge, plan.age + 1, data.inputs.maxAge);
    const character = s.profile?.character || s.character || DEFAULT_CHARACTER;

    // ---- inputs ------------------------------------------------------------------------------
    const depthBtns = DEPTHS.map((d) =>
      h('button', { class: 'segmented__btn', type: 'button', onClick: () => { plan.depth = d; renderForm(); recompute(); } }, d === 'quick' ? 'Quick' : d === 'standard' ? 'Standard' : 'Pro'),
    );
    const form = h('div', { class: 'future-form' });

    function numberField(key, label, hint, { min = 0, max, step = 1 } = {}) {
      const id = `future-${key}`;
      const input = h('input', { id, class: 'field__input', type: 'number', inputmode: 'numeric', min, max, step, value: String(plan[key]) });
      input.addEventListener('input', () => {
        const v = Number(input.value);
        if (input.value !== '' && Number.isFinite(v)) {
          plan[key] = v;
          recompute();
        }
      });
      return h('div', { class: 'field' }, [h('label', { class: 'field__label', for: id, text: label }), hint ? h('p', { class: 'field__hint', text: hint }) : null, input]);
    }

    function choice(key, label, options) {
      const btns = options.map(([value, text]) =>
        h('button', { class: 'segmented__btn', type: 'button', 'aria-pressed': String(plan[key] === value), onClick: () => {
          plan[key] = value;
          if (key === 'mixName') plan.mix = { ...data.mixes[value] };
          for (const b of btns) b.setAttribute('aria-pressed', String(b === btnFor(value)));
          recompute();
        } }, text),
      );
      const btnFor = (value) => btns[options.findIndex(([v]) => v === value)];
      return h('div', { class: 'field' }, [h('p', { class: 'field__label', text: label }), h('div', { class: 'segmented', role: 'group', 'aria-label': label }, btns)]);
    }

    function mixSliders() {
      const labels = { cash: data.assets.cash.label, bonds: data.assets.bonds.label, thaiStocks: data.assets.thaiStocks.label, globalStocks: data.assets.globalStocks.label };
      const outs = {};
      const rows = Object.keys(labels).map((k) => {
        const id = `future-mix-${k}`;
        const out = h('output', { class: 'range__value', for: id, text: `${Math.round(plan.mix[k] * 100)}%` });
        outs[k] = out;
        const input = h('input', { id, class: 'range', type: 'range', min: 0, max: 100, step: 5, value: String(Math.round(plan.mix[k] * 100)) });
        input.addEventListener('input', () => {
          plan.mix[k] = Number(input.value) / 100;
          plan.mixName = 'custom';
          out.textContent = `${input.value}%`;
          recompute();
        });
        return h('div', { class: 'split__row' }, [h('label', { class: 'split__label', for: id, text: labels[k] }), input, out]);
      });
      return h('fieldset', { class: 'pick' }, [h('legend', { class: 'field__label', text: 'Your mix (shares are scaled to add up to 100%)' }), ...rows]);
    }

    function lifeChoice() {
      const L = data.lifeExpectancy;
      const select = h('select', { id: 'future-life', class: 'field__input' }, [
        ['average', `Average: ${L.average.value.toFixed(1)} years`],
        ['female', `Female: ${L.female.value.toFixed(1)} years`],
        ['male', `Male: ${L.male.value.toFixed(1)} years`],
      ].map(([v, t]) => h('option', { value: v, text: t, selected: plan.life === v })));
      select.addEventListener('change', () => { plan.life = select.value; recompute(); });
      const toggleInput = h('input', { id: 'future-plan90', type: 'checkbox', class: 'toggle__input' });
      toggleInput.checked = plan.planTo90;
      toggleInput.addEventListener('change', () => { plan.planTo90 = toggleInput.checked; recompute(); });
      return h('div', { class: 'field' }, [
        h('label', { class: 'field__label', for: 'future-life', text: 'Life expectancy at birth in Thailand' }),
        h('p', { class: 'field__hint', text: 'Thai Population Gazette 2025. Half of people live longer than the average, so plans often go further.' }),
        select,
        h('label', { class: 'toggle', for: 'future-plan90' }, [
          toggleInput,
          h('span', { class: 'toggle__track', 'aria-hidden': 'true' }),
          h('span', { class: 'toggle__text' }, [h('span', { class: 'toggle__label', text: `Plan to ${L.planTo.value}` })]),
        ]),
      ]);
    }

    function renderForm() {
      depthBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(DEPTHS[i] === plan.depth)));
      const parts = [
        numberField('age', 'Your age now', null, { min: data.inputs.minAge, max: data.inputs.maxAge - 1 }),
        numberField('monthlySaving', 'Saving each month (THB)', 'Pocket money counts too.', { min: 0, max: data.inputs.maxMonthlySaving, step: 100 }),
        numberField('goalAge', 'Age you want to use it', null, { min: data.inputs.minAge + 1, max: data.inputs.maxAge }),
      ];
      if (plan.depth !== 'quick') {
        parts.push(
          numberField('startBalance', 'Saved already (THB)', null, { min: 0, max: data.inputs.maxStartBalance, step: 1000 }),
          choice('mixName', 'Where the money goes', [['careful', 'Careful'], ['balanced', 'Balanced'], ['bold', 'Bold']]),
          choice('inflation', 'How fast prices rise', [['low', 'Low 1%'], ['target', 'Target 2%'], ['high', 'High 4%']]),
        );
      }
      if (plan.depth === 'pro') {
        parts.push(
          mixSliders(),
          choice('fx', 'The baht and US-dollar assets', [['base', 'Steady'], ['weakBaht', 'Weak baht']]),
          choice('shock', 'What if a year like this happened?', [['', 'None'], ['1997', '1997'], ['2020', '2020'], ['2022', '2022']]),
          numberField('shockInYears', 'Starting how many years from now', null, { min: 0, max: 60 }),
          lifeChoice(),
          numberField('spending', 'Spend each month after your goal age (THB)', 'Leave at 0 to only grow your savings.', { min: 0, max: data.inputs.maxMonthlySaving, step: 1000 }),
        );
      }
      form.replaceChildren(...parts);
    }

    // ---- outputs -----------------------------------------------------------------------------
    const avatars = h('div', { class: 'future-faces' });
    const summary = h('div', { class: 'future-summary', 'aria-live': 'polite' });
    const chartBox = h('div', { class: 'future-chart' });
    const table = h('details', { class: 'future-table' });
    const why = h('details', { class: 'card card--quiet future-why' }, [
      h('summary', { text: 'ⓘ Why this works' }),
      h('p', { text: 'Seeing a picture of your older self makes people save more for later: in experiments, people shown an aged photo of themselves put more money aside (Hershfield and others, 2011). Showing amounts in today’s baht makes them easy to compare with prices now.' }),
      h('p', { class: 'field__hint', text: 'Sources: docs/SOURCES.md. Some numbers here are still being checked; they are marked in the data file.' }),
    ]);

    function lifeUntil() {
      if (plan.planTo90) return data.lifeExpectancy.planTo.value;
      return Math.ceil(data.lifeExpectancy[plan.life]?.value ?? data.lifeExpectancy.average.value);
    }

    function recompute() {
      clearTimeout(timer);
      summary.replaceChildren(h('p', { class: 'future-working', text: 'Working it out…' }));
      timer = setTimeout(run, 250);
      logAction(store, { kind: 'future', xp: FUTURE_XP, ref: `future:${dayOf()}` });
    }

    function run() {
      if (!alive) return;
      const age = clamp(plan.age, data.inputs.minAge, data.inputs.maxAge - 1);
      const goalAge = clamp(plan.goalAge, age + 1, data.inputs.maxAge);
      const pro = plan.depth === 'pro';
      const standard = plan.depth !== 'quick';
      const spending = pro && plan.spending > 0 ? { fromAge: goalAge, monthly: plan.spending } : null;
      const until = spending ? Math.max(goalAge, lifeUntil()) : goalAge;
      const r = project(data, {
        age,
        goalAge,
        untilAge: until,
        monthlySaving: plan.monthlySaving,
        startBalance: standard ? plan.startBalance : 0,
        mix: standard ? plan.mix : data.mixes.balanced,
        inflation: standard ? plan.inflation : 'target',
        fx: pro ? plan.fx : 'base',
        shock: pro && plan.shock ? plan.shock : null,
        shockInYears: plan.shockInYears,
        spending,
      });
      store.set({ future: { ...plan } });
      renderAvatars(age, goalAge);
      renderSummary(r, spending);
      renderChart(r, goalAge);
      renderTable(r);
    }

    function renderAvatars(age, goalAge) {
      const face = (a, label) => h('figure', { class: 'future-face' }, [
        h('img', { src: dataUri(character, a), alt: '', width: 120, height: 120 }),
        h('figcaption', { text: label }),
      ]);
      avatars.replaceChildren(face(age, `You now, ${age}`), h('span', { class: 'future-arrow', 'aria-hidden': 'true' }, [icon('arrow-right', { size: 28 })]), face(goalAge, `You at ${goalAge}`));
    }

    function renderSummary(r, spending) {
      const g = r.goal;
      const parts = [
        h('p', { class: 'future-big' }, [`At ${r.goalAge}, about `, h('strong', { text: thb(g.p50) })]),
        h('p', { text: `That’s the middle of ${r.paths} projections, in today’s baht. In 8 of 10 it lands between ${thb(g.p10)} and ${thb(g.p90)}.` }),
        h('p', { class: 'field__hint', text: `You would put in ${thb(r.contributed)} of today’s baht along the way.` }),
      ];
      if (spending) {
        const tenths = Math.round(r.lastsShare * 10);
        parts.push(h('p', { class: `future-lasts ${tenths >= 8 ? 'is-good' : 'is-risk'}` }, [
          icon(tenths >= 8 ? 'check' : 'alert', { size: 18 }),
          `Spending ${thb(spending.monthly)} a month from ${r.goalAge}, the money lasts to ${r.untilAge} in ${tenths} of 10 projections.`,
        ]));
      }
      summary.replaceChildren(...parts);
      animate(summary, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 200 });
    }

    function renderChart(r, goalAge) {
      const W = 640;
      const H = 260;
      const padL = 70;
      const padB = 28;
      const ys = r.years;
      const max = Math.max(1, ...ys.map((y) => y.p90));
      const x = (age) => padL + ((age - ys[0].age) / Math.max(1, ys.at(-1).age - ys[0].age)) * (W - padL - 12);
      const y = (v) => 10 + (1 - v / max) * (H - padB - 10);
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
      svg.setAttribute('aria-label', `Fan chart from age ${ys[0].age} to ${ys.at(-1).age}. Middle path at ${goalAge}: ${thb(r.goal.p50)}.`);
      for (let i = 0; i <= 4; i++) {
        const v = (max * i) / 4;
        add('line', { x1: padL, x2: W - 8, y1: y(v), y2: y(v), class: 'fan__grid' });
        add('text', { x: padL - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'fan__axis' }, shortThb(v));
      }
      const step = Math.max(1, Math.ceil(ys.length / 7));
      ys.forEach((p, i) => {
        if (i % step === 0 || i === ys.length - 1) add('text', { x: x(p.age), y: H - 8, 'text-anchor': 'middle', class: 'fan__axis' }, String(p.age));
      });
      const band = ys.map((p) => `${x(p.age)},${y(p.p90)}`).join(' ') + ' ' + ys.slice().reverse().map((p) => `${x(p.age)},${y(p.p10)}`).join(' ');
      add('polygon', { points: band, class: 'fan__band' });
      add('polyline', { points: ys.map((p) => `${x(p.age)},${y(p.p50)}`).join(' '), class: 'fan__mid' });
      add('line', { x1: x(goalAge), x2: x(goalAge), y1: 10, y2: H - padB, class: 'fan__goal' });
      add('text', { x: Math.min(x(goalAge) + 6, W - 60), y: 22, class: 'fan__note' }, `Goal: ${goalAge}`);
      chartBox.replaceChildren(svg, h('p', { class: 'future-legend' }, [
        h('span', { class: 'legend-key future-key--band', 'aria-hidden': 'true' }), '8 in 10 projections',
        h('span', { class: 'legend-key future-key--mid', 'aria-hidden': 'true' }), 'Middle projection',
      ]));
    }

    function renderTable(r) {
      const rows = r.years.filter((p, i) => i % 5 === 0 || i === r.years.length - 1);
      table.replaceChildren(
        h('summary', { text: 'See the numbers' }),
        h('table', { class: 'future-numbers' }, [
          h('thead', {}, [h('tr', {}, ['Age', 'Low (P10)', 'Middle (P50)', 'High (P90)'].map((t) => h('th', { scope: 'col', text: t })))]),
          h('tbody', {}, rows.map((p) => h('tr', {}, [h('th', { scope: 'row', text: String(p.age) }), ...[p.p10, p.p50, p.p90].map((v) => h('td', { text: thb(v) }))]))),
        ]),
      );
    }

    view.replaceChildren(
      head,
      h('div', { class: 'future' }, [
        h('div', { class: 'card future-inputs' }, [
          h('div', { class: 'segmented future-depth', role: 'group', 'aria-label': 'How much detail' }, depthBtns),
          form,
        ]),
        h('div', { class: 'card future-out' }, [avatars, summary, chartBox, table]),
        why,
      ]),
    );
    renderForm();
    run();
  }

  load();
  return () => {
    alive = false;
    clearTimeout(timer);
    view.remove();
  };
}

function clamp(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function shortThb(v) {
  if (v >= 1e6) return `${number(v / 1e6, 1)}M`;
  if (v >= 1e3) return `${number(v / 1e3, 0)}k`;
  return number(v, 0);
}
