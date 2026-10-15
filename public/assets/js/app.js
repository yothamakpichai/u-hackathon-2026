// Boot: build the shared context and start the router.
import * as config from './config.js';
import { createStore } from './state.js';
import { createAudio } from './audio.js';
import { createRouter } from './router.js';

const store = createStore();
const audio = createAudio({ store });

// Every screen after the welcome needs a chosen tier.
const needsTier = (state) => (state.tier ? null : '/');

const routes = {
  '/': { name: 'welcome', title: 'Choose your level', load: () => import('./screens/welcome.js') },
  '/check': { name: 'check', title: 'Money Health Check', load: () => import('./screens/gate.js'), guard: needsTier },
  '/lesson': { name: 'lesson', title: 'Lesson', load: () => import('./screens/lesson.js'), guard: needsTier },
  '/lab': { name: 'lab', title: 'Today’s Market', load: () => import('./screens/lab.js'), guard: needsTier },
  '/create': { name: 'create', title: 'Create a coin', load: () => import('./screens/create.js'), guard: needsTier },
  '/explorer': { name: 'explorer', title: 'Block explorer', load: () => import('./screens/explorer.js'), guard: needsTier },
  '/report': { name: 'report', title: 'Report card', load: () => import('./screens/report.js'), guard: needsTier },
};

for (const el of document.querySelectorAll('[data-slot="product-name"]')) el.textContent = config.PRODUCT_NAME;

const router = createRouter({
  root: document.getElementById('main'),
  routes,
  getState: () => store.get(),
  formatTitle: (route) => `${route.title} · ${config.PRODUCT_NAME}`,
  // The screen contract: ctx = { tier, store, audio, navigate, config }.
  makeCtx: () => ({ tier: store.get().tier, store, audio, navigate: router.navigate, config }),
});

router.start();
