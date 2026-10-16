// Penny companion (BRIEF §9, §16 Y5): a chat sheet over any screen. Suggested questions answer at once from
// data/tutor_faq.json. Typed questions, and the review / explain buttons, go to api/tutor.php in one of four modes:
// ask, review_run (the last market's metrics), explain_result (the Money Check) and explain_future (Future You,
// numbers only), plus future (BRIEF §17: Penny speaks as the player's Future You from the projection numbers).
// Any screen opens it with the 'penny:open' event (app.js). Every Penny bubble has a Listen button (penny-voice.js).
// When the server has no key, hits its daily cap or fails, Penny answers from the FAQ or from the
// same numbers instead, with no error shown. Personal details are refused here, before anything is sent.
import { h, icon, penny, getJSON, animate, announce } from '../ui.js';
import { scoreRun } from '../score.js';
import { speak, stopVoice, ensurePennyStyles } from '../penny-voice.js';

ensurePennyStyles();

const MAX_CHARS = 300;
const API = 'api/tutor.php';
const CONTACT = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // email
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|th|app|xyz|me|gg|ly)\b/i, // link
  /(?:\+\d{1,3}[\s-]?\d|(?<!\d)0\d)[\d\s-]{7,13}\d/, // phone
];
const STOP = new Set('a an and are as at be but by can could do does for from get got has have how i if in into is it its just me my not of on or our so than that the their them then there these they this to too us was we were what when where which who why will with would you your'.split(' '));
const TYPE_NAMES = { turtle: 'Steady Turtle', eagle: 'Patient Eagle', cat: 'Cosy Cat', monkey: 'Spark Monkey' };
const baht = (n) => `${Math.round(n).toLocaleString('en-US')} baht`;

let dialog = null;
const TIMEOUT_MS = 15000;
const HISTORY_TURNS = 6;

// One try: { done, reply }. done is false only when another try could help (a timeout, a network error, a 5xx).
async function callOnce(body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) return { done: true, reply: typeof json.answer === 'string' ? json : null };
    return { done: res.status < 500, reply: null };
  } catch {
    return { done: false, reply: null };
  } finally {
    clearTimeout(timer);
  }
}

// One call to the companion, with a 15 s timeout and one retry. Resolves to { answer, voice, tts } or null when
// Penny should fall back. Sends the screen it was asked on and the last 6 turns, never anything personal.
export async function askPenny({ mode = 'ask', tier, question, data, context, history = [] }) {
  const body = {
    mode,
    tier,
    question,
    data,
    context,
    screen: { route: location.hash.slice(0, 40), title: document.title.slice(0, 60) },
    history: history.slice(-HISTORY_TURNS),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { done, reply } = await callOnce(body);
    if (done) return reply;
  }
  return null;
}

// Future You without the server: honest about it, and only the numbers that were passed in.
function futureFallback(d) {
  if (!(d?.p50 >= 0)) return 'I can’t chat right now. Make a Future You plan first, then come back and talk to me.';
  return `I can’t chat right now; here is what your numbers say: in the middle of many simulated paths, you could have about ${baht(d.p50)} by age ${d.goalAge}, in today’s baht. One path in ten ends below ${baht(d.p10)} and one in ten above ${baht(d.p90)}. It’s a projection, not a prediction.`;
}

const FUTURE_CHIPS = ['What does my middle number mean?', 'What would you tell me about saving?', 'What if I save a little more each month?'];

// What each mode sends: numbers and fixed words only, never anything personal.
async function modeData(mode, store, config) {
  const s = store.get();
  if (mode === 'review_run') {
    const run = s.lab?.[s.tier];
    if (!run?.metrics) return null;
    const score = scoreRun({ run, check: s.check?.[s.tier], lesson: s.lesson?.[s.tier], tier: s.tier }).total;
    return { ...run.metrics, startValue: run.startValue, score, events: (run.events || []).map((e) => e.id) };
  }
  if (mode === 'explain_result') {
    const a = s.assessment;
    if (!a) return null;
    return { score: a.score, knowledge: a.knowledge, behaviour: a.behaviour, knowledgeCorrect: a.knowledgeCorrect, type: a.type, time: a.time, risk: a.risk, presentBias: a.presentBias, worship: a.scripts?.worship, status: a.scripts?.status };
  }
  if (mode === 'explain_future') {
    const plan = s.future;
    if (!plan) return null;
    try {
      const [{ project }, data] = await Promise.all([import('../sim/future.js'), getJSON(`${config.DATA_BASE}future_th.json`)]);
      const standard = plan.depth !== 'quick';
      const pro = plan.depth === 'pro';
      const r = project(data, {
        age: plan.age,
        goalAge: plan.goalAge,
        monthlySaving: plan.monthlySaving,
        startBalance: standard ? plan.startBalance : 0,
        mix: standard ? plan.mix : data.mixes.balanced,
        inflation: standard ? plan.inflation : 'target',
        fx: pro ? plan.fx : 'base',
        shock: pro && plan.shock ? plan.shock : null,
        shockInYears: plan.shockInYears,
      });
      return { age: plan.age, goalAge: plan.goalAge, monthlySaving: plan.monthlySaving, startBalance: standard ? plan.startBalance : 0, inflation: standard ? plan.inflation : 'target', fx: pro ? plan.fx : 'base', shock: pro && plan.shock ? plan.shock : undefined, p10: r.goal.p10, p50: r.goal.p50, p90: r.goal.p90 };
    } catch {
      return null;
    }
  }
  return null;
}

// Without the server, Penny still explains, from the same numbers.
function localAnswer(mode, d) {
  if (mode === 'review_run') {
    const tips = [];
    if (d.maxSingleExposurePct > 50) tips.push(`one coin reached ${Math.round(d.maxSingleExposurePct)}% of your money, so next time try keeping every coin at half or less`);
    if (d.minCashPct < 10) tips.push(`your cash dropped to ${Math.round(d.minCashPct)}%, so keep at least 10% as a cushion`);
    if (d.panicSellsAfterNegativeEvents) tips.push('you sold a whole coin right after bad news, so next time ask why the price moved first');
    const good = d.maxSingleExposurePct <= 50 ? 'You kept your money spread out.' : d.quizCorrect ? `You answered ${d.quizCorrect} of my questions right.` : 'You finished a whole market, which is how practice works.';
    return `${good} ${tips.length ? `One thing to try: ${tips[0]}.` : 'Next time, see if you can do it again while the news gets bumpy.'} Your practice score was ${d.score} out of 100.`;
  }
  if (mode === 'explain_result') {
    const habit = d.behaviour < 25 ? 'Try one habit this week: put a little aside every time you get money.' : 'Keep your habits going, and try comparing prices before your next buy.';
    return `Your Money Health Score is ${d.score}: ${d.knowledge} of 50 for knowledge and ${d.behaviour} of 50 for habits. As a ${TYPE_NAMES[d.type] || 'money learner'}, you lean ${d.time === 'later' ? 'towards waiting' : 'towards now'} and ${d.risk === 'bold' ? 'are fine with risk' : 'play it safe'}. ${habit} This isn’t a clinical test, just a starting point.`;
  }
  if (mode === 'explain_future') {
    return `In the middle of many simulated paths, you could have about ${baht(d.p50)} by age ${d.goalAge}, in today’s baht. One path in ten ends below ${baht(d.p10)} and one in ten above ${baht(d.p90)}. It’s a projection, not a prediction. Saving a little more, or starting earlier, moves the whole range up.`;
  }
  return null;
}

const QUICK = {
  review_run: 'Review my last market',
  explain_result: 'Explain my Money Check result',
  explain_future: 'Explain my Future You plan',
};

export async function openTutor({ store, config }, { mode, context } = {}) {
  const tier = store.get().tier || 'explorer';
  const opener = document.activeElement;
  const future = mode === 'future';
  let ctxData = context && typeof context === 'object' && !Array.isArray(context) ? context : null;
  const futureVoice = ['female', 'male', 'neutral'].includes(ctxData?.futureVoice) ? ctxData.futureVoice : ['female', 'male', 'neutral'].includes(store.get().profile?.futureVoice) ? store.get().profile.futureVoice : 'neutral';
  const localVoice = future ? futureVoice : 'penny';
  const turns = [];
  stopVoice();
  dialog?.remove();

  const log = h('div', { class: 'tutor__log', 'aria-live': 'polite' });
  const chips = h('div', { class: 'tutor__chips', role: 'group', 'aria-label': future ? 'Things to ask Future You' : 'Things Penny can help with' });
  const input = h('textarea', { id: 'tutor-input', class: 'tutor__input', rows: 2, maxlength: MAX_CHARS, placeholder: future ? 'Ask your Future You…' : 'Type your question…', autocomplete: 'off' });
  const send = h('button', { class: 'btn btn--primary', type: 'submit' }, ['Ask', icon('arrow-right', { size: 20 })]);
  const form = h('form', { class: 'tutor__form', onSubmit: ask }, [
    h('label', { class: 'visually-hidden', for: 'tutor-input', text: future ? 'Your question for Future You' : 'Your question for Penny' }),
    input,
    h('div', { class: 'tutor__row' }, [h('p', { class: 'tutor__privacy', text: 'Never share your name, school, address, email, phone number or links.' }), send]),
  ]);
  const close = h('button', { class: 'icon-btn tutor__close', type: 'button', onClick: () => dialog.close() }, [icon('close'), h('span', { class: 'visually-hidden', text: 'Close' })]);

  const title = future ? `Talk to Future You${ctxData?.goalAge ? `, at ${ctxData.goalAge}` : ''}` : 'Ask Penny';
  const sub = future ? 'An AI role-play from your projection. Not a prediction.' : 'Your money companion';
  dialog = h('dialog', { class: `tutor${future ? ' tutor--future' : ''}`, 'aria-labelledby': 'tutor-title' }, [
    h('div', { class: 'tutor__head' }, [
      penny('happy', { size: 44 }),
      h('div', { class: 'tutor__titles' }, [h('h2', { class: 'tutor__title', id: 'tutor-title', text: title }), h('p', { class: 'tutor__sub', text: sub })]),
      close,
    ]),
    log,
    chips,
    form,
  ]);
  dialog.addEventListener('close', () => {
    stopVoice();
    document.dispatchEvent(new CustomEvent('askpenny', { detail: { open: false } }));
    dialog.remove();
    // The floating button is hidden while Penny is open and comes back a frame later, so focus waits a moment.
    setTimeout(() => {
      const usable = (el) => el?.isConnected && el.getClientRects().length && !el.closest('[aria-hidden="true"], [hidden]');
      const target = [opener, document.querySelector('.ask-head'), document.querySelector('.ask-fab')].find(usable);
      target?.focus({ preventScroll: true });
    }, 80);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  document.body.append(dialog);
  dialog.showModal();
  document.dispatchEvent(new CustomEvent('askpenny', { detail: { open: true } }));

  if (future) {
    chips.replaceChildren(...FUTURE_CHIPS.map((q) => h('button', { class: 'tutor__chip', type: 'button', onClick: () => askText(q) }, q)));
    await reply(async () => {
      // Opened without numbers (from another screen): use the saved Future You plan, if there is one.
      if (!(ctxData?.p50 >= 0)) {
        const saved = await modeData('explain_future', store, config);
        ctxData = saved ? { ...saved, futureVoice } : null;
      }
      const r = ctxData ? await askPenny({ mode: 'future', tier, context: ctxData }) : null;
      return r || { answer: futureFallback(ctxData) };
    }, { keep: false });
    input.focus();
    return;
  }

  say('penny', 'Hi! I’m Penny. Ask me about money, saving or the town, or tap one of the buttons below. I never give advice about real investments.');

  let faq = [];
  try {
    const data = await getJSON(`${config.DATA_BASE}tutor_faq.json`);
    faq = Array.isArray(data?.[tier]) ? data[tier] : [];
  } catch {
    faq = [];
  }
  const s = store.get();
  const available = Object.keys(QUICK).filter((m) => (m === 'review_run' ? s.lab?.[s.tier]?.metrics : m === 'explain_result' ? s.assessment : s.future));
  chips.replaceChildren(
    ...available.map((m) => h('button', { class: 'tutor__chip tutor__chip--mode', type: 'button', onClick: () => explain(m) }, QUICK[m])),
    ...faq.map((item) => h('button', { class: 'tutor__chip', type: 'button', onClick: () => askFaq(item) }, item.question)),
  );
  if (mode && QUICK[mode]) explain(mode, ctxData);
  else input.focus();

  // A Penny bubble gets a Listen / Stop button. FAQ answers and server answers (with their token) use the
  // ElevenLabs voice; anything else is read by the browser.
  function say(who, text, voice) {
    const body = h('span', { class: 'tutor-msg__text', text });
    const msg = h('div', { class: `tutor-msg tutor-msg--${who}` }, [body]);
    if (who === 'penny') voiced(msg, text, voice);
    log.append(msg);
    animate(msg, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }]);
    reveal(msg);
    return msg;
  }

  function voiced(msg, text, { voice = localVoice, token = '' } = {}) {
    msg.querySelector('.tutor-msg__play')?.remove();
    const label = h('span', { class: 'visually-hidden', text: 'Listen' });
    const glyph = h('span', { class: 'tutor-msg__glyph', 'aria-hidden': 'true', text: '▶' });
    const button = h('button', { class: 'tutor-msg__play', type: 'button', title: 'Listen' }, [glyph, label]);
    let playing = false;
    const show = (on) => {
      playing = on;
      glyph.textContent = on ? '■' : '▶';
      label.textContent = on ? 'Stop' : 'Listen';
      button.title = on ? 'Stop' : 'Listen';
      button.classList.toggle('is-playing', on);
    };
    const play = async () => {
      for (const other of log.querySelectorAll('.tutor-msg__play.is-playing')) other.dispatchEvent(new CustomEvent('voice:reset'));
      show(true);
      await speak(text, { voice, token });
      show(false);
    };
    button.addEventListener('voice:reset', () => show(false));
    button.addEventListener('click', () => (playing ? (stopVoice(), show(false)) : play()));
    msg.append(button);
    return play;
  }

  // New answers are read aloud when the player turned Auto-read on and narration is not muted.
  function autoRead(play) {
    const st = store.get();
    if (st.settings?.autoRead && !st.muted) play();
  }

  function reveal(msg) {
    msg.scrollIntoView({ block: msg.offsetHeight > log.clientHeight * 0.6 ? 'start' : 'nearest' });
  }

  function askFaq(item) {
    say('you', item.question);
    const msg = say('penny', item.answer, { voice: 'penny' });
    reveal(msg);
    announce(item.answer);
    turns.push({ role: 'user', content: item.question }, { role: 'assistant', content: item.answer });
    autoRead(() => msg.querySelector('.tutor-msg__play')?.click());
  }

  // work() resolves to { answer, voice?, tts? }. The answer is shown, voiced, announced and kept as a turn.
  async function reply(work, { question } = {}) {
    const thinking = h('div', { class: 'tutor-msg tutor-msg--penny is-thinking' }, [h('span', { class: 'tutor-msg__text', text: future ? 'Future You is thinking…' : 'Penny is thinking…' })]);
    log.append(thinking);
    reveal(thinking);
    send.disabled = true;
    const r = await work();
    const answer = r?.answer || '';
    thinking.classList.remove('is-thinking');
    thinking.querySelector('.tutor-msg__text').textContent = answer;
    const play = voiced(thinking, answer, { voice: r?.voice || localVoice, token: r?.tts || '' });
    reveal(thinking);
    announce(answer);
    if (question) turns.push({ role: 'user', content: question });
    turns.push({ role: 'assistant', content: answer });
    send.disabled = false;
    autoRead(play);
  }

  async function explain(m, given) {
    say('you', QUICK[m]);
    await reply(async () => {
      // A screen may pass the numbers itself; anything that doesn't look like them is ignored.
      const fits = given && (m === 'explain_future' ? given.p50 >= 0 : Number.isFinite(given.score));
      const data = fits ? given : await modeData(m, store, config);
      if (!data) return { answer: 'I need a little more first: finish a market, take the Money Check or make a Future You plan, then ask me again.' };
      return (await askPenny({ mode: m, tier, data })) || { answer: localAnswer(m, data) };
    });
  }

  async function ask(e) {
    e.preventDefault();
    const question = input.value.replace(/\s+/g, ' ').trim();
    if (!question) return;
    input.value = '';
    await askText(question);
    input.focus();
  }

  async function askText(question) {
    say('you', question);
    if (CONTACT.some((re) => re.test(question))) {
      say('penny', 'Please keep emails, phone numbers and links to yourself, even with me. Ask me anything about money and the town instead!');
      return;
    }
    const history = turns.slice(-HISTORY_TURNS);
    await reply(async () => {
      if (future) return (await askPenny({ mode: 'future', tier, question, context: ctxData, history })) || { answer: futureFallback(ctxData) };
      const r = await askPenny({ mode: 'ask', tier, question, context: ctxData || undefined, history });
      if (r) return r;
      const match = closest(question, faq);
      return match ? { answer: match.answer, voice: 'penny' } : { answer: 'That’s a good one! I can’t look it up right now. Try one of the buttons below, I know those well.' };
    }, { question });
  }
}

// The FAQ entry that shares the most meaningful words with the question, or null if none is close enough.
function closest(question, faq) {
  const words = (s) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9$ ]+/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w))
        .map((w) => w.replace(/ies$/, 'y').replace(/ing$/, '').replace(/(?<!s)s$/, '')), // prices → price, coins → coin
    );
  const asked = words(question);
  let best = null;
  let bestScore = 0;
  for (const item of faq) {
    const q = words(item.question);
    const a = words(item.answer);
    let score = 0;
    for (const w of asked) score += q.has(w) ? 2 : a.has(w) ? 1 : 0;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}
