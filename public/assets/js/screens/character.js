// Character (BRIEF §16). There is no gender question anywhere: a character is { skin, hairStyle, hairColor, outfit,
// glasses }, drawn by public/js/avatar.js. "Surprise me" picks every part at random. Saved in store.profile.
import { h, icon, animate } from '../ui.js';
import { OPTIONS, LABELS, dataUri } from '../../../js/avatar.js';
import { nicknameField } from '../nickname.js';

const PARTS = [
  ['skin', 'Skin tone'],
  ['hairStyle', 'Hair'],
  ['hairColor', 'Hair colour'],
  ['outfit', 'Outfit'],
  ['glasses', 'Glasses'],
];

export const randomCharacter = () => Object.fromEntries(Object.entries(OPTIONS).map(([k, list]) => [k, list[Math.floor(Math.random() * list.length)]]));

export function mount(root, ctx) {
  const { store, navigate, config } = ctx;
  const s = store.get();
  const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.TIME_ZONE, year: 'numeric' }).format(new Date()));
  const age = s.birthYear ? thisYear - Number(s.birthYear) : 25;
  let character = { ...randomCharacter(), ...s.profile?.character };

  const preview = h('img', { class: 'character__img', alt: 'Your character', width: 180, height: 180 });
  const groups = h('div', { class: 'character__parts' });
  const nick = nicknameField({ id: 'character-nickname', value: s.profile?.nickname || '' });

  function draw() {
    preview.src = dataUri(character, age);
    groups.replaceChildren(
      ...PARTS.map(([key, legend]) =>
        h('fieldset', { class: 'character__part' }, [
          h('legend', { class: 'character__legend', text: legend }),
          h(
            'div',
            { class: 'character__choices' },
            OPTIONS[key].map((value, i) =>
              h('button', { class: 'chip-choice', type: 'button', 'aria-pressed': String(character[key] === value), onClick: () => set(key, value) }, LABELS[key][i]),
            ),
          ),
        ]),
      ),
    );
  }

  function set(key, value) {
    character = { ...character, [key]: value };
    draw();
    groups.querySelector(`.character__part:nth-child(${PARTS.findIndex(([k]) => k === key) + 1}) [aria-pressed="true"]`)?.focus();
  }

  function surprise() {
    character = randomCharacter();
    draw();
    animate(preview, [{ transform: 'scale(0.92) rotate(-3deg)' }, { transform: 'none' }], { duration: 260 });
  }

  function save() {
    if (!nick.validate()) {
      nick.input.focus();
      return;
    }
    const nickname = nick.value();
    store.set((st) => ({ profile: { ...st.profile, character, nickname, birthYear: st.birthYear, createdAt: st.profile?.createdAt || Date.now() } }));
    // Opened from Settings (#/character?next=settings): go back there instead of on to the Money Check.
    navigate(new URLSearchParams(location.hash.split('?')[1] || '').get('next') === 'settings' ? '/settings' : '/money-check');
  }

  const view = h('section', { class: 'screen character' }, [
    h('div', { class: 'screen-head' }, [
      h('p', { class: 'screen-eyebrow', text: 'Step 2 of 3' }),
      h('h1', { class: 'screen-title', tabindex: '-1', text: 'Make your character' }),
      h('p', { class: 'screen-sub', text: 'This is you in your town. Future You will show how you might look as you grow older.' }),
    ]),
    h('div', { class: 'card character__stage' }, [
      preview,
      h('button', { class: 'btn btn--sm', type: 'button', onClick: surprise }, 'Surprise me'),
    ]),
    h('div', { class: 'card character__nick' }, [nick.el]),
    groups,
    h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onClick: save }, ['Next: Money Check', icon('arrow-right', { size: 22 })]),
  ]);
  root.append(view);
  draw();
  view.querySelector('.screen-title')?.focus({ preventScroll: true });
  return () => view.remove();
}
