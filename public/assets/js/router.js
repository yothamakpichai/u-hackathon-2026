// Hash router (BRIEF §11). Each route lazy-loads a screen module that exports
// mount(root, ctx) and returns an unmount function.
import { h, stateView } from './ui.js';

const SLOW_MS = 200; // show the loading state only if a screen takes longer than this

export function createRouter({ root, routes, fallback = '/', makeCtx, getState, formatTitle }) {
  let unmount = null;
  let seq = 0;
  let first = true;

  const currentPath = () => {
    const raw = location.hash.replace(/^#/, '').split('?')[0];
    return raw.startsWith('/') ? raw : '/';
  };

  function navigate(path, { replace = false } = {}) {
    const target = '#' + String(path).replace(/^#/, '');
    if (replace) {
      history.replaceState(history.state, '', target);
      render();
    } else if (location.hash === target) {
      render(); // same route: remount (for example, Replay)
    } else {
      location.hash = target; // hashchange renders
    }
  }

  function teardown() {
    if (!unmount) return;
    const fn = unmount;
    unmount = null;
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }

  function showError(path) {
    root.replaceChildren(
      stateView({
        kind: 'error',
        heading: 'h1',
        title: 'This screen didn’t load',
        body: 'Check your connection, then try again. If it keeps happening, go back to the start.',
        actions: [
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => location.reload() }, 'Try again'),
          path !== fallback
            ? h('button', { class: 'btn', type: 'button', onClick: () => navigate(fallback) }, 'Back to start')
            : null,
        ],
      }),
    );
  }

  // After a navigation, move focus to the new screen's heading so keyboard and screen-reader users land on it.
  function settleFocus() {
    if (first) {
      first = false;
      return;
    }
    window.scrollTo(0, 0);
    const heading = root.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    } else {
      root.focus({ preventScroll: true });
    }
  }

  async function render() {
    const token = ++seq;
    const path = currentPath();
    const route = routes[path];
    if (!route) return navigate(fallback, { replace: true });

    const redirect = route.guard ? route.guard(getState()) : null;
    if (redirect && redirect !== path) return navigate(redirect, { replace: true });

    teardown();
    document.documentElement.dataset.route = route.name;
    document.title = formatTitle(route);
    const slow = setTimeout(() => {
      if (token === seq) root.replaceChildren(stateView({ kind: 'loading', heading: 'h1', title: 'Loading…' }));
    }, SLOW_MS);

    let mod = null;
    try {
      mod = await route.load();
    } catch (err) {
      console.error(err);
    }
    clearTimeout(slow);
    if (token !== seq) return; // a newer navigation started while this one loaded

    root.replaceChildren();
    try {
      if (!mod) throw new Error(`The ${route.name} screen could not be loaded.`);
      const fn = mod.mount(root, makeCtx());
      unmount = typeof fn === 'function' ? fn : null;
    } catch (err) {
      console.error(err);
      showError(path);
    }
    settleFocus();
  }

  return {
    navigate,
    start() {
      addEventListener('hashchange', render);
      if (!location.hash) history.replaceState(history.state, '', '#' + fallback);
      render();
    },
  };
}
