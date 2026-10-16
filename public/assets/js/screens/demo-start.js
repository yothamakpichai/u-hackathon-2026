// #/demo: the landing page's "Judge demo" link. Runs the same Judge demo as the welcome screen's button; if the
// player keeps their progress or the demo fails, it goes to the welcome screen (which shows the error note).
import { h } from '../ui.js';
import { startDemo } from '../judge-demo.js';

export function mount(root, ctx) {
  const view = h('section', { class: 'screen' }, [
    h('div', { class: 'state state--loading', role: 'status' }, [h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { class: 'state__title', text: 'Building the demo town…' })]),
  ]);
  root.append(view);
  let alive = true;
  setTimeout(async () => {
    if (!alive) return;
    const result = await startDemo(ctx, { replace: true });
    if (alive && result !== 'town') ctx.navigate('/', { replace: true });
  }, 0);
  return () => {
    alive = false;
    view.remove();
  };
}
