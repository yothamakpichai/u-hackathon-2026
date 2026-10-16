// Create a coin (BRIEF §3 step 5; slices J3 and J13). A light shell: it shows the screen with a proper loading
// state at once, then loads the coin designer (coin-designer.js). The Lab imports this shell and calls prefetch()
// once Create opens up, so the trip from the market is usually instant.
import { blockedReason, currentMarket } from './coinkit.js';
import { h, icon, stateView } from '../ui.js';

// A failed dynamic import stays in the page's module map, so each retry asks for a fresh URL. The designer's own
// imports keep their normal URLs, so the open market stays shared.
let designer = null;
let fails = 0;
const loadDesigner = () => {
  designer ??= import(fails ? `./coin-designer.js?retry=${fails}` : './coin-designer.js').catch((err) => {
    designer = null;
    fails += 1;
    throw err;
  });
  return designer;
};

// The Lab warms the designer once Create opens up. Once per page: a failed warm-up only bumps the retry URL.
let prefetched = false;
export function prefetch() {
  if (prefetched) return;
  prefetched = true;
  loadDesigner().catch(() => {});
}

export function mount(root, ctx) {
  const { tier, config, navigate } = ctx;
  const tierInfo = config.getTier(tier);
  const market = currentMarket(tier);
  let alive = true;
  let unmount = null;
  const title = h('h1', { class: 'screen-title', text: 'Create a coin' });
  const head = h('div', { class: 'screen-head' }, [h('p', { class: 'screen-eyebrow', text: `${tierInfo.name} · Ages ${tierInfo.ages}` }), title]);
  let state = h('div');
  const view = h('section', { class: 'screen create-screen' }, [head, state]);
  root.append(view);

  // Swap only the state under the heading, so focus on the heading survives. If the focused button goes
  // (Try again), focus moves to the heading instead of dropping to the page.
  function show(next) {
    const hadFocus = view.contains(document.activeElement);
    state.replaceWith(next);
    state = next;
    if (hadFocus && !view.contains(document.activeElement)) {
      title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
    }
  }

  // No market, closed, already launched or no news yet: say so without loading the designer and the Coach.
  const stop = blockedReason(market);
  if (stop) {
    show(stateView({
      kind: 'empty',
      title: stop.title,
      body: stop.body,
      actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('/lab') }, [market ? 'Back to the market' : 'Open today’s market', icon('arrow-right', { size: 20 })])],
    }));
    return () => view.remove();
  }

  function open() {
    view.setAttribute('aria-busy', 'true');
    show(stateView({ kind: 'loading', title: 'Getting the coin designer ready…' }));
    loadDesigner()
      .then((m) => {
        if (!alive) return;
        // The designer draws its own screen; keep keyboard focus on the heading if it was on this screen.
        const focused = view.contains(document.activeElement);
        view.remove();
        unmount = m.mount(root, ctx);
        if (focused) {
          const h1 = root.querySelector('h1');
          h1?.setAttribute('tabindex', '-1');
          h1?.focus({ preventScroll: true });
        }
      })
      .catch((err) => {
        if (!alive) return;
        console.error(err);
        view.removeAttribute('aria-busy');
        show(stateView({
          kind: 'error',
          title: 'The coin designer didn’t load',
          body: `Check your connection and try again.${currentMarket(tier) ? ' Your market is still waiting for you.' : ''}`,
          actions: [
            h('button', { class: 'btn btn--primary', type: 'button', onClick: open }, 'Try again'),
            h('button', { class: 'btn', type: 'button', onClick: () => navigate('/lab') }, 'Back to the market'),
          ],
        }));
      });
  }

  open();
  return () => {
    alive = false;
    view.remove();
    unmount?.();
  };
}
