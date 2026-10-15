// "Ask Penny" (BRIEF §9): a chat sheet over any screen. Suggested questions answer at once from data/tutor_faq.json.
// Typed questions go to api/tutor.php. When the server has no key, hits its daily cap or fails, Penny answers from
// the same FAQ instead, with no error shown. Personal details are refused here, before anything is sent.
import { h, icon, penny, getJSON, animate, announce } from '../ui.js';

const MAX_CHARS = 300;
const API = 'api/tutor.php';
const CONTACT = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // email
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|th|app|xyz|me|gg|ly)\b/i, // link
  /(?:\+\d{1,3}[\s-]?\d|(?<!\d)0\d)[\d\s-]{7,13}\d/, // phone
];
const STOP = new Set('a an and are as at be but by can could do does for from get got has have how i if in into is it its just me my not of on or our so than that the their them then there these they this to too us was we were what when where which who why will with would you your'.split(' '));

let dialog = null;

export async function openTutor({ store, config }) {
  const tier = store.get().tier || 'explorer';
  dialog?.remove();

  const log = h('div', { class: 'tutor__log', 'aria-live': 'polite' });
  const chips = h('div', { class: 'tutor__chips', role: 'group', 'aria-label': 'Questions Penny knows well' });
  const input = h('textarea', { id: 'tutor-input', class: 'tutor__input', rows: 2, maxlength: MAX_CHARS, placeholder: 'Type your question…', autocomplete: 'off' });
  const send = h('button', { class: 'btn btn--primary', type: 'submit' }, ['Ask', icon('arrow-right', { size: 20 })]);
  const form = h('form', { class: 'tutor__form', onSubmit: ask }, [
    h('label', { class: 'visually-hidden', for: 'tutor-input', text: 'Your question for Penny' }),
    input,
    h('div', { class: 'tutor__row' }, [h('p', { class: 'tutor__privacy', text: 'Never share your name, email, phone number or links.' }), send]),
  ]);
  const close = h('button', { class: 'icon-btn tutor__close', type: 'button', onClick: () => dialog.close() }, [icon('close'), h('span', { class: 'visually-hidden', text: 'Close' })]);

  dialog = h('dialog', { class: 'tutor', 'aria-labelledby': 'tutor-title' }, [
    h('div', { class: 'tutor__head' }, [
      penny('happy', { size: 44 }),
      h('div', { class: 'tutor__titles' }, [
        h('h2', { class: 'tutor__title', id: 'tutor-title', text: 'Ask Penny' }),
        h('p', { class: 'tutor__sub', text: 'Questions about money and the lab' }),
      ]),
      close,
    ]),
    log,
    chips,
    form,
  ]);
  dialog.addEventListener('close', () => {
    document.dispatchEvent(new CustomEvent('askpenny', { detail: { open: false } }));
    dialog.remove();
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
  say('penny', 'Hi! I’m Penny. Ask me how money and the lab work, or tap a question below. I can’t give advice about real money.');

  let faq = [];
  try {
    const data = await getJSON(`${config.DATA_BASE}tutor_faq.json`);
    faq = Array.isArray(data?.[tier]) ? data[tier] : [];
  } catch {
    faq = [];
  }
  chips.replaceChildren(...faq.map((item) => h('button', { class: 'tutor__chip', type: 'button', onClick: () => askFaq(item) }, item.question)));
  input.focus();

  function say(who, text) {
    const msg = h('div', { class: `tutor-msg tutor-msg--${who}` }, [text]);
    log.append(msg);
    animate(msg, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }]);
    msg.scrollIntoView({ block: 'nearest' });
    return msg;
  }

  function askFaq(item) {
    say('you', item.question);
    say('penny', item.answer);
    announce(item.answer);
  }

  async function ask(e) {
    e.preventDefault();
    const question = input.value.replace(/\s+/g, ' ').trim();
    if (!question) return;
    input.value = '';
    say('you', question);

    if (CONTACT.some((re) => re.test(question))) {
      say('penny', 'Please keep emails, phone numbers and links to yourself, even with me. Ask me anything about money and the lab instead!');
      return;
    }

    const thinking = say('penny', 'Penny is thinking…');
    thinking.classList.add('is-thinking');
    send.disabled = true;
    let answer = null;
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier, question }) });
      const body = await res.json();
      if (res.ok && body?.ok && typeof body.answer === 'string') answer = body.answer;
    } catch {
      answer = null; // offline, server error or no PHP: answered from the FAQ below
    }
    if (!answer) {
      const match = closest(question, faq);
      answer = match
        ? match.answer
        : 'That’s a good one! I can’t look it up right now. Try one of the questions below, I know those well.';
    }
    thinking.classList.remove('is-thinking');
    thinking.textContent = answer;
    announce(answer);
    send.disabled = false;
    input.focus();
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
