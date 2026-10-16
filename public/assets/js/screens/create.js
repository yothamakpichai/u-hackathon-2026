// Create a coin (BRIEF §3 step 5; slices J3 and J13). A light shell: it shows the screen with a proper loading
// state at once, then loads the coin designer (coin-designer.js). The Lab prefetches the designer once Create
// opens up, so the trip from the market is usually instant.
import { h, stateView } from '../ui.js';

let designer = null;
const loadDesigner = () => {
  designer ??= import('./coin-designer.js').catch((err) => {
    designer = null;
    throw err;
  });
  return designer;
};

export function mount(root, ctx) {
  const { tier, config, navigate } = ctx;
  const tierInfo = config.getTier(tier);
  let alive = true;
  let unmount = null;
  const title = h('h1', { class: 'screen-title', text: 'Create a coin' });
  const head = h('div', { class: 'screen-head' }, [h('p', { class: 'screen-eyebrow', text: `${tierInfo.name} · Ages ${tierInfo.ages}` }), title]);
  const view = h('section', { class: 'screen create-screen', 'aria-busy': 'true' });
  root.append(view);

  function open() {
    view.replaceChildren(head, stateView({ kind: 'loading', title: 'Getting the coin designer ready…' }));
    loadDesigner()
      .then((m) => {
        if (!alive) return;
        // The designer draws its own screen; keep keyboard focus on the heading if it was there.
        const focused = document.activeElement === title;
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
        view.replaceChildren(head, stateView({
          kind: 'error',
          title: 'The coin designer didn’t load',
          body: 'Check your connection and try again. Your market is still waiting for you.',
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
