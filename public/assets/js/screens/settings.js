// Settings (P1.B): nickname, character, Future You voice, narration, account and the parent link. English only.
// Store keys written here:
//   profile.nickname     string, the same filter as Create (nickname.js)
//   profile.futureVoice  'female' | 'male' | 'neutral' (default 'neutral'); Future You and Penny read it (BRIEF §17)
//   muted                narration off (audio.toggleMuted)
//   settings.autoRead    boolean: Penny reads her answers aloud by herself (the tutor reads it)
import { h, icon, animate, announce } from '../ui.js';
import { dataUri } from '../../../js/avatar.js';
import { nicknameField } from '../nickname.js';
import { leaveDemo } from '../shell.js';

const VOICES = [
  { id: 'neutral', title: 'Neutral', body: 'A calm, even voice. The default.' },
  { id: 'female', title: 'Female', body: 'A lighter, warmer voice.' },
  { id: 'male', title: 'Male', body: 'A deeper, slower voice.' },
];

export function mount(root, ctx) {
  const { store, audio, config } = ctx;
  let alive = true;
  const s = store.get();
  const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.TIME_ZONE, year: 'numeric' }).format(new Date()));
  const age = s.birthYear ? thisYear - Number(s.birthYear) : 25;

  const setProfile = (patch) => store.set((st) => ({ profile: { ...st.profile, ...patch } }));
  const setSettings = (patch) => store.set((st) => ({ settings: { ...st.settings, ...patch } }));
  const saved = (el, text = 'Saved') => {
    el.textContent = text;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    announce(text);
  };

  const section = (id, title, sub, body) =>
    h('section', { class: 'set-card', 'aria-labelledby': id }, [
      h('div', { class: 'set-card__head' }, [h('h2', { class: 'set-card__title', id, text: title }), sub ? h('p', { class: 'set-card__sub', text: sub }) : null]),
      ...[].concat(body),
    ]);

  // ------------------------------------------------ nickname
  const nickSaved = h('span', { class: 'set-saved', 'aria-hidden': 'true' });
  const nick = nicknameField({ id: 'settings-nickname', value: s.profile?.nickname || '' });
  const nickSave = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => {
    if (!nick.validate()) return nick.input.focus();
    setProfile({ nickname: nick.value() });
    saved(nickSaved, 'Nickname saved');
  } }, 'Save nickname');

  // ------------------------------------------------ character
  const avatar = h('img', { class: 'set-avatar', alt: 'Your character', width: 88, height: 88 });
  if (s.profile?.character) avatar.src = dataUri(s.profile.character, age);
  else avatar.hidden = true;

  // ------------------------------------------------ Future You voice
  const voice = s.profile?.futureVoice || 'neutral';
  const voiceSaved = h('span', { class: 'set-saved', 'aria-hidden': 'true' });
  const voices = h('div', { class: 'set-voices' },
    VOICES.map((v) => {
      const input = h('input', { class: 'set-voice__input', type: 'radio', name: 'future-voice', id: `voice-${v.id}`, value: v.id, checked: v.id === voice });
      input.addEventListener('change', () => {
        setProfile({ futureVoice: v.id });
        saved(voiceSaved, `Future You voice: ${v.title}`);
      });
      return h('label', { class: 'set-voice', for: `voice-${v.id}` }, [
        input,
        h('span', { class: 'set-voice__dot', 'aria-hidden': 'true' }),
        h('span', { class: 'set-voice__text' }, [h('span', { class: 'set-voice__title', text: v.title }), h('span', { class: 'set-voice__body', text: v.body })]),
      ]);
    }),
  );

  // ------------------------------------------------ narration and auto-read
  const toggle = (id, label, hint, on, onChange) => {
    const input = h('input', { class: 'set-switch__input', type: 'checkbox', role: 'switch', id, checked: on });
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'set-switch', for: id }, [
      h('span', { class: 'set-switch__text' }, [h('span', { class: 'set-switch__label', text: label }), h('span', { class: 'set-switch__hint', text: hint })]),
      input,
      h('span', { class: 'set-switch__track', 'aria-hidden': 'true' }, [h('span', { class: 'set-switch__thumb' })]),
    ]);
  };
  const narration = toggle('set-narration', 'Narration', 'Listen buttons read lessons and questions aloud.', !store.get().muted, (on) => {
    if (on === audio.isMuted()) audio.toggleMuted();
  });
  const autoRead = toggle('set-autoread', 'Penny reads aloud by herself', 'When Penny answers, she reads the answer without a tap.', Boolean(s.settings?.autoRead), (on) => setSettings({ autoRead: on }));

  // ------------------------------------------------ account
  const accountBox = h('div', { class: 'set-account' }, [h('p', { class: 'set-card__sub', text: 'Checking your account…' })]);

  async function renderAccount() {
    let sync;
    let available = false;
    let user = null;
    try {
      sync = await import('../sync.js');
      available = await sync.accountsAvailable();
      if (available) user = sync.currentAccount() || (await sync.refreshMe().catch(() => null));
    } catch {
      available = false;
    }
    if (!alive) return;
    const link = (href, text, primary = false) => h('a', { class: `btn ${primary ? 'btn--primary' : ''} set-btn`, href }, [text, icon('arrow-right', { size: 18 })]);
    if (!available) {
      accountBox.replaceChildren(h('p', { class: 'set-card__sub', text: 'Accounts aren’t available right now. Everything works as a guest, and your progress stays on this device.' }));
      return;
    }
    if (!user) {
      accountBox.replaceChildren(
        h('p', { class: 'set-card__sub', text: 'You’re playing as a guest. An account saves your town across devices, opens the Arena and makes a parent link.' }),
        h('div', { class: 'set-actions' }, [link('#/account', 'Create an account', true), link('#/account', store.get().accountUser ? `Log in as ${store.get().accountUser}` : 'Log in')]),
      );
      return;
    }
    const logout = h('button', { class: 'btn set-btn', type: 'button', onClick: async () => {
      logout.disabled = true;
      await sync.signOut();
      renderAccount();
      announce('Logged out. Your progress stays on this device.');
    } }, 'Log out');
    accountBox.replaceChildren(
      h('p', { class: 'set-account__who' }, [icon('check', { size: 18 }), `Signed in as ${user.username}`]),
      h('div', { class: 'set-move' }, [
        h('h3', { class: 'set-move__title', text: 'Move to another device' }),
        h('ol', { class: 'set-move__steps' }, [
          h('li', { text: 'Your progress saves to your account a few seconds after each change.' }),
          h('li', { text: `On the other device, open ${config.PRODUCT_NAME}, then Settings, then Log in.` }),
          h('li', { text: `Log in as ${user.username} with your password. Your town follows you.` }),
        ]),
      ]),
      h('div', { class: 'set-actions' }, [link('#/account', 'Account and parent link', true), logout]),
    );
  }

  const demo = store.get().demo;
  const view = h('section', { class: 'screen settings' }, [
    h('div', { class: 'screen-head' }, [
      h('p', { class: 'screen-eyebrow', text: 'Settings' }),
      h('h1', { class: 'screen-title', tabindex: '-1', text: 'Make Penny yours' }),
      h('p', { class: 'screen-sub', text: 'Everything here stays on this device unless you sign in.' }),
    ]),
    demo
      ? h('div', { class: 'set-demo' }, [
          h('p', {}, [h('strong', { text: 'Demo profile. ' }), `${demo.label || 'Judge demo'} loaded ${new Date(demo.at).toLocaleString('en-GB', { timeZone: config.TIME_ZONE, hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}. Leaving it clears this device and starts fresh.`]),
          h('button', { class: 'btn set-btn', type: 'button', onClick: () => leaveDemo(store) }, 'Leave demo'),
        ])
      : null,
    section('set-you', 'You', 'Your nickname and the character that grows older in Future You.', [
      nick.el,
      h('div', { class: 'set-actions' }, [nickSave, nickSaved]),
      h('div', { class: 'set-char' }, [avatar, h('a', { class: 'btn set-btn', href: '#/character?next=settings' }, ['Edit character', icon('arrow-right', { size: 18 })])]),
    ]),
    section('set-voice', 'Future You voice', 'How Future You sounds when Penny speaks as your older self. Pick the one you like.', [voices, voiceSaved]),
    section('set-sound', 'Sound', null, [narration, autoRead]),
    section('set-acc', 'Account', null, [accountBox]),
    section('set-parent', 'Parent link', 'A parent opens a private link on their own phone to follow progress and confirm Piggy Bank entries. It needs an account.', [
      h('div', { class: 'set-actions' }, [h('a', { class: 'btn set-btn', href: '#/account' }, ['Make a parent link', icon('arrow-right', { size: 18 })])]),
    ]),
    h('p', { class: 'set-foot' }, [h('a', { href: '#/privacy', text: 'Privacy' }), ' · ', h('a', { href: '#/research', text: 'Why this works' })]),
  ]);
  root.append(view);
  renderAccount();
  animate(view, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }]);
  view.querySelector('.screen-title')?.focus({ preventScroll: true });

  // Keep the narration switch honest if the header mute button changes it.
  const off = store.subscribe((st) => {
    const input = view.querySelector('#set-narration');
    if (input && input.checked === Boolean(st.muted)) input.checked = !st.muted;
  });
  return () => {
    alive = false;
    off();
    view.remove();
  };
}
