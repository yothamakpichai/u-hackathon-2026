// Account (BRIEF §16): optional. Guest play is the default and never blocked. A free account (username, password,
// birth year, plus 3 safety questions) saves progress across devices, opens the Arena and makes a parent link.
// No email or phone for children: a parent link can reset a forgotten password instead.
import { h, icon, stateView, animate } from '../ui.js';
import * as sync from '../sync.js';
import qrcode from '../../../js/vendor/qrcode-generator/qrcode.mjs';

const SVG = 'http://www.w3.org/2000/svg';

// The parent link as a QR code: one black path on white, with the standard 4-module quiet zone, built with DOM
// calls (no innerHTML). Black on white on purpose, in dark mode too, so every camera can read it.
export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const pad = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
  const el = (tag, attrs) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  };
  const size = n + pad * 2;
  const svg = el('svg', { class: 'qr', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': 'QR code of the parent link', 'shape-rendering': 'crispEdges' });
  svg.append(el('rect', { width: size, height: size, fill: '#FFFFFF' }), el('path', { d, fill: '#000000' }));
  return svg;
}

export function mount(root, ctx) {
  const { store, navigate, config } = ctx;
  let alive = true;
  const next = new URLSearchParams(location.hash.split('?')[1] || '').get('next');
  const view = h('section', { class: 'screen account' });
  root.append(view);

  const head = (title, sub) =>
    h('div', { class: 'screen-head' }, [
      h('p', { class: 'screen-eyebrow', text: 'Your account' }),
      h('h1', { class: 'screen-title', tabindex: '-1', text: title }),
      sub ? h('p', { class: 'screen-sub', text: sub }) : null,
    ]);
  const backToTown = () => h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate(store.get().tier ? '/town' : '/') }, 'Back to my town');
  const show = (...nodes) => {
    view.replaceChildren(...nodes.filter(Boolean)); // a null would print as text
    animate(view, [{ opacity: 0 }, { opacity: 1 }]);
    view.querySelector('h1')?.focus({ preventScroll: true });
  };

  async function start() {
    view.replaceChildren(stateView({ kind: 'loading', heading: 'h1', title: 'Checking your account…' }));
    if (!(await sync.accountsAvailable())) {
      if (alive) show(head('Accounts are resting'), stateView({ kind: 'empty', title: 'Accounts aren’t available right now', body: 'Everything still works as a guest, and your progress stays on this device.' }), backToTown());
      return;
    }
    try {
      const user = await sync.refreshMe();
      if (!alive) return;
      if (user && sync.choicePending(store)) {
        const loaded = await sync.loadAfterLogin(store);
        if (!alive) return;
        if (loaded?.ask) return choose(user, loaded);
        sync.startAutoSave(store);
        return signedIn(user);
      }
      if (user) signedIn(user);
      else auth(store.get().accountUser ? 'login' : 'signup');
    } catch (err) {
      if (alive) show(head('Your account'), stateView({ kind: 'error', title: 'Your account didn’t load', body: err.message, actions: [h('button', { class: 'btn', type: 'button', onClick: start }, 'Try again')] }), backToTown());
    }
  }

  // ---------------------------------------------------------------- create account / log in

  async function auth(mode) {
    const error = h('p', { class: 'arena-error', role: 'alert', hidden: true });
    const field = (id, label, input, hint) => h('div', { class: 'arena-field' }, [h('label', { class: 'arena-label', for: id, text: label }), input, hint ? h('p', { class: 'arena-hint', text: hint }) : null]);
    const username = h('input', { id: 'acc-user', class: 'arena-input', autocomplete: 'username', maxlength: 16, spellcheck: 'false' });
    const password = h('input', { id: 'acc-pass', class: 'arena-input', type: 'password', autocomplete: mode === 'signup' ? 'new-password' : 'current-password', maxlength: 128 });
    const fields = [
      field('acc-user', 'Username', username, mode === 'signup' ? '3 to 16 letters, numbers or _. Not your real name.' : null),
      field('acc-pass', 'Password', password, mode === 'signup' ? 'At least 8 characters. Don’t reuse a password from anywhere else.' : 'Forgot it? A parent with your parent link can set a new one.'),
    ];
    let year = null;
    const answers = [];
    if (mode === 'signup') {
      const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: config.TIME_ZONE, year: 'numeric' }).format(new Date()));
      year = h('select', { id: 'acc-year', class: 'arena-input' }, Array.from({ length: 98 }, (_, i) => thisYear - 3 - i).map((y) => h('option', { value: String(y), text: String(y), selected: y === store.get().birthYear })));
      fields.push(field('acc-year', 'Birth year', year, 'Used only to check your age: a parent approves accounts under 13, and the Arena opens at 13.'));
      let quiz = [];
      try {
        quiz = (await sync.call('quiz')).quiz;
      } catch {
        quiz = [];
      }
      quiz.forEach((q, i) => {
        answers[i] = null;
        fields.push(
          h('fieldset', { class: 'quiz' }, [
            h('legend', { class: 'quiz__legend', text: `${i + 1}. ${q.prompt}` }),
            ...q.options.map((opt, j) => h('label', { class: 'quiz__option' }, [h('input', { type: 'radio', name: `acc-q${i}`, value: String(j), onChange: () => (answers[i] = j) }), h('span', { text: opt })])),
          ]),
        );
      });
    }
    const submit = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, mode === 'signup' ? 'Create my free account' : 'Log in');
    const tabs = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Account' }, [
      h('button', { class: 'segmented__btn', type: 'button', 'aria-pressed': String(mode === 'signup'), onClick: () => auth('signup') }, 'Create account'),
      h('button', { class: 'segmented__btn', type: 'button', 'aria-pressed': String(mode === 'login'), onClick: () => auth('login') }, 'Log in'),
    ]);
    const form = h('form', { class: 'card arena-auth', novalidate: true, onSubmit: send }, [
      tabs,
      h('p', { class: 'arena-auth__note', text: mode === 'signup' ? 'We keep only a username, a scrambled password and your birth year: no email, no phone, no real name.' : store.get().accountUser ? `This device was saving to “${store.get().accountUser}”. Log in to keep saving.` : 'Welcome back!' }),
      ...fields,
      error,
      submit,
    ]);
    show(
      head('Save your progress', 'An account is optional: you can keep playing as a guest. With one, your town follows you to any device, the Arena opens, and a parent can follow along.'),
      form,
      h('p', { class: 'arena__privacy' }, [h('a', { href: '#/privacy', text: 'Privacy notice' })]),
      backToTown(),
    );

    async function send(e) {
      e.preventDefault();
      error.hidden = true;
      if (mode === 'signup' && answers.some((a) => a === null)) {
        error.textContent = 'Answer the 3 safety questions first.';
        error.hidden = false;
        return;
      }
      submit.disabled = true;
      try {
        const data = { username: username.value.trim(), password: password.value };
        if (mode === 'signup') Object.assign(data, { birthYear: Number(year.value), quiz: answers });
        const u = await sync.signIn(mode, data);
        if (u?.pending) return waiting(u);
        const loaded = await sync.loadAfterLogin(store);
        if (!alive) return;
        if (loaded?.ask) return choose(u, loaded);
        sync.startAutoSave(store);
        done(u, loaded === 'loaded' ? 'Your progress is back on this device.' : 'Your progress is saved to your account.');
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        submit.disabled = false;
        password.value = '';
      }
    }
  }

  // Under 13: the account switches on only when a parent approves it through the parent link. Guest play goes on.
  function waiting(p) {
    const url = `${location.origin}${location.pathname}#/parent?t=${p.token}`;
    show(
      head('Ask a parent to say yes', `Your account “${p.user?.username || ''}” is ready, and it switches on when a parent approves it.`),
      h('section', { class: 'card account__card' }, [
        h('p', { text: 'Show a parent this link or QR code. They open it on their own phone and tap Approve.' }),
        parentLinkBox(url),
      ]),
      h('p', { class: 'account__note', text: 'Until then, keep playing as a guest: everything works, it just isn’t saved to an account yet. When your parent has approved it, log in here.' }),
      backToTown(),
    );
  }

  // The parent link as a QR code, with the link itself, Copy and Share.
  function parentLinkBox(url) {
    const field = h('input', { class: 'arena-input account__link', readonly: true, value: url, 'aria-label': 'Parent link' });
    const copy = h('button', { class: 'btn btn--block', type: 'button', onClick: async () => { try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied'; } catch { field.select(); } } }, 'Copy the link');
    const share = navigator.share ? h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => navigator.share({ title: 'Penny parent link', url }).catch(() => {}) }, 'Share with a parent') : null;
    return h('div', { class: 'account__linkbox' }, [h('div', { class: 'account__qr' }, [qrSvg(url)]), h('p', { class: 'account__note', text: 'A parent can scan this with their phone camera, or use the link.' }), field, share, copy]);
  }

  // Both this device and the account have progress: the player decides which to keep. Until then nothing is
  // loaded or saved, even after a reload.
  function choose(u, loaded) {
    const when = new Date(loaded.ask).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    show(
      head('Which progress should we keep?', 'This device and your account both have progress. The one you don’t keep is replaced.'),
      h('ul', { class: 'account__copies' }, [
        h('li', {}, [h('strong', { text: 'This device: ' }), sync.describe(store.get())]),
        h('li', {}, [h('strong', { text: `Your account (saved ${when}): ` }), sync.describe(loaded.server?.state)]),
      ]),
      h('div', { class: 'report-actions' }, [
        h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => { sync.useAccountCopy(store, loaded.server); sync.startAutoSave(store); done(u, 'Your account’s progress is on this device now.'); } }, 'Use my account’s progress'),
        h('button', { class: 'btn btn--block', type: 'button', onClick: async () => { await sync.saveNow(store).catch(() => {}); sync.startAutoSave(store); done(u, 'This device’s progress is saved to your account.'); } }, 'Keep this device’s progress'),
      ]),
    );
  }

  function done(u, message) {
    if (next) {
      navigate(next);
      return;
    }
    signedIn(u, message);
  }

  // ---------------------------------------------------------------- signed in

  async function signedIn(u, message) {
    const saved = store.get().accountSavedAt;
    const status = h('p', { class: 'account__saved', role: 'status', text: message || (saved ? `Saved to your account ${new Date(saved).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Your progress saves to your account automatically.') });
    const parent = h('div', { class: 'account__parent' });
    show(
      head(`Hi, ${u.username}`, 'Your progress saves to your account automatically, a few seconds after each change.'),
      h('section', { class: 'card account__card' }, [
        status,
        h('button', { class: 'btn btn--block', type: 'button', onClick: async () => { try { await sync.saveNow(store); status.textContent = 'Saved just now.'; } catch (err) { status.textContent = err.message; } } }, 'Save now'),
      ]),
      h('section', { class: 'card account__card', 'aria-labelledby': 'parent-title' }, [
        h('h2', { class: 'report-section__title', id: 'parent-title', text: 'Parent link' }),
        h('p', { text: 'Give a parent a private link. On their own phone they can see your progress, confirm your Piggy Bank entries, and set a new password if you forget yours. No email needed.' }),
        parent,
      ]),
      h('div', { class: 'report-actions' }, [
        h('button', { class: 'btn btn--block', type: 'button', onClick: async () => { await sync.signOut(); auth('login'); } }, 'Log out'),
        h('button', { class: 'btn btn--ghost btn--block', type: 'button', onClick: remove }, 'Delete my account'),
        h('a', { class: 'btn btn--ghost btn--block', href: '#/privacy' }, 'Privacy notice'),
        backToTown(),
      ]),
    );
    renderParent(parent);
  }

  async function renderParent(box) {
    let linked = false;
    try {
      linked = (await sync.call('parent_status')).linked;
    } catch {
      linked = false;
    }
    const make = h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: create }, linked ? 'Make a new parent link' : 'Make a parent link');
    box.replaceChildren(...[linked ? h('p', { class: 'account__note', text: 'A parent link is active. A new link replaces it, and “Stop sharing” switches it off.' }) : null, make, linked ? stopButton() : null].filter(Boolean));

    async function create() {
      try {
        const { token } = await sync.call('parent_create', { method: 'POST' });
        const url = `${location.origin}${location.pathname}#/parent?t=${token}`;
        box.replaceChildren(h('p', { class: 'account__note', text: 'Send this link to a parent. Anyone with it can see your progress and reset your password, so share it only with them.' }), parentLinkBox(url), stopButton());
        box.querySelector('.account__link')?.focus();
      } catch (err) {
        box.append(h('p', { class: 'arena-error', role: 'alert', text: err.message }));
      }
    }
    function stopButton() {
      return h('button', { class: 'btn btn--ghost btn--block', type: 'button', onClick: async () => { await sync.call('parent_revoke', { method: 'POST' }).catch(() => {}); await renderParent(box); box.querySelector('button')?.focus(); } }, 'Stop sharing');
    }
  }

  async function remove() {
    if (!confirm('Delete your account? Your saved progress, Arena coins and parent link are removed for good. Progress on this device stays.')) return;
    try {
      await sync.deleteAccount();
      auth('signup');
    } catch (err) {
      alert(err.message);
    }
  }

  start();
  return () => {
    alive = false;
    view.remove();
  };
}
