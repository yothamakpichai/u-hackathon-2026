// Boot: build the shared context and start the router.
import * as config from './config.js';
import { createStore } from './state.js';
import { createAudio } from './audio.js';
import { createRouter } from './router.js';
import { h, icon, penny } from './ui.js';

const store = createStore();
const audio = createAudio({ store });

// Every screen after the welcome needs a chosen tier; the market needs the check passed,
// the lesson finished or the demo skip (store.unlocked[tier]).
const needsTier = (state) => (state.tier ? null : '/');
const needsUnlock = (state) => (!state.tier ? '/' : state.unlocked?.[state.tier] ? null : '/check');

const routes = {
  '/': { name: 'welcome', title: 'Choose your level', load: () => import('./screens/welcome.js') },
  '/check': { name: 'check', title: 'Money Health Check', load: () => import('./screens/gate.js'), guard: needsTier },
  '/lesson': { name: 'lesson', title: 'Lesson', load: () => import('./screens/lesson.js'), guard: needsTier },
  '/lab': { name: 'lab', title: 'Today’s Market', load: () => import('./screens/lab.js'), guard: needsUnlock },
  '/create': { name: 'create', title: 'Create a coin', load: () => import('./screens/create.js'), guard: needsUnlock },
  '/explorer': { name: 'explorer', title: 'Block explorer', load: () => import('./screens/explorer.js'), guard: needsUnlock },
  '/report': { name: 'report', title: 'Report card', load: () => import('./screens/report.js'), guard: needsUnlock },
  // The Arena screen itself explains when it is closed or locked (BRIEF §15).
  '/arena': { name: 'arena', title: 'Arena', load: () => import('./screens/arena.js'), guard: needsTier },
  '/privacy': { name: 'privacy', title: 'Arena privacy', load: () => import('./screens/privacy.js') },
};

for (const el of document.querySelectorAll('[data-slot="product-name"]')) el.textContent = config.PRODUCT_NAME;

// Narration never carries over to the next screen.
addEventListener('hashchange', () => audio.stop());

// The global mute toggle appears only once there is audio to mute (BRIEF §9).
audio.hasAny().then((any) => {
  if (!any) return;
  const button = h('button', { class: 'icon-btn', type: 'button', onClick: () => audio.toggleMuted() });
  const render = () => {
    const muted = audio.isMuted();
    button.setAttribute('aria-pressed', String(muted));
    button.title = muted ? 'Narration is off' : 'Mute narration';
    button.replaceChildren(icon(muted ? 'speaker-off' : 'speaker'), h('span', { class: 'visually-hidden', text: 'Mute narration' }));
  };
  store.subscribe(render);
  render();
  document.querySelector('.app-header__actions')?.append(button);
});

// "Ask Penny" (BRIEF §9) floats over every screen once a level is chosen.
const askButton = h('button', { class: 'ask-fab', type: 'button', hidden: true, onClick: openTutor }, [
  penny('happy', { size: 32, className: 'ask-fab__penny' }),
  h('span', { text: 'Ask Penny' }),
]);
document.body.append(askButton);
const renderAsk = () => {
  askButton.hidden = !store.get().tier;
  document.body.classList.toggle('has-ask', !askButton.hidden);
};
store.subscribe(renderAsk);
renderAsk();

function openTutor() {
  import('./screens/tutor.js')
    .then((m) => m.openTutor({ store, config }))
    .catch(() => {}); // offline: the button simply does nothing until the page can load the module
}

const router = createRouter({
  root: document.getElementById('main'),
  routes,
  getState: () => store.get(),
  formatTitle: (route) => `${route.title} · ${config.PRODUCT_NAME}`,
  // The screen contract: ctx = { tier, store, audio, navigate, config }.
  makeCtx: () => ({ tier: store.get().tier, store, audio, navigate: router.navigate, config }),
});

router.start();
