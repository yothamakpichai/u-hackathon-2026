// Nickname (P1.B): the name Penny and the town call you. Saved in store.profile.nickname, on this device only.
// It uses the same friendly-name filter as Create (sim/names.js checkName): 3 to 16 letters or spaces, nothing rude,
// no real coin or brand. Shared by the character step and Settings.
import { h, animate } from './ui.js';
import { checkName } from './sim/names.js';

const FIRST = ['Sunny', 'Brave', 'Clever', 'Lucky', 'Happy', 'Calm', 'Quick', 'Bright', 'Kind', 'Jolly', 'Swift', 'Cosy'];
const SECOND = ['Otter', 'Panda', 'Turtle', 'Mango', 'Comet', 'Robin', 'Tiger', 'Lotus', 'Pebble', 'Maple', 'Koala', 'Falcon'];

export const cleanNickname = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

// null when fine, or a friendly message.
export function checkNickname(name) {
  const n = cleanNickname(name);
  if (!n) return 'Pick a nickname, or tap Suggest one.';
  return checkName(n)?.message.replace('for the name', 'for your nickname') || null;
}

export function suggestNickname(rand = Math.random) {
  for (;;) {
    const n = `${FIRST[Math.floor(rand() * FIRST.length)]} ${SECOND[Math.floor(rand() * SECOND.length)]}`;
    if (n.length <= 16 && !checkName(n)) return n;
  }
}

// A labelled input with a Suggest button and an inline error. Returns { el, input, value(), validate() }.
export function nicknameField({ id = 'nickname', value = '', onInput } = {}) {
  const input = h('input', { id, class: 'nick__input', type: 'text', autocomplete: 'nickname', maxlength: 16, spellcheck: 'false', value, 'aria-describedby': `${id}-hint ${id}-error` });
  const error = h('p', { class: 'nick__error', id: `${id}-error`, role: 'alert' });
  const suggest = h('button', { class: 'nick__suggest', type: 'button' }, 'Suggest one');
  const el = h('div', { class: 'nick' }, [
    h('label', { class: 'nick__label', for: id, text: 'Nickname' }),
    h('div', { class: 'nick__row' }, [input, suggest]),
    h('p', { class: 'nick__hint', id: `${id}-hint`, text: 'What Penny calls you. Not your real name: 3 to 16 letters or spaces.' }),
    error,
  ]);

  const validate = () => {
    const msg = checkNickname(input.value);
    error.textContent = msg || '';
    input.setAttribute('aria-invalid', String(Boolean(msg)));
    el.classList.toggle('is-invalid', Boolean(msg));
    return !msg;
  };

  input.addEventListener('input', () => {
    if (el.classList.contains('is-invalid')) validate();
    onInput?.(cleanNickname(input.value));
  });
  input.addEventListener('blur', () => input.value && validate());
  suggest.addEventListener('click', () => {
    input.value = suggestNickname();
    validate();
    onInput?.(cleanNickname(input.value));
    animate(input, [{ transform: 'scale(0.97)', backgroundColor: '#FFF7E6' }, { transform: 'none' }], { duration: 260 });
  });

  return { el, input, value: () => cleanNickname(input.value), validate };
}
