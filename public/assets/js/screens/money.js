// Money Town (BRIEF §17 "Town groups"): one Town building that opens a street of its places, from the entries in
// public/js/buildings.js with group 'money', plus an Arena shortcut.
import { h, icon } from '../ui.js';
import { placesIn } from '../../../js/buildings.js';

export function mount(root, ctx) {
  const { navigate } = ctx;
  const view = h('section', { class: 'screen money-town' }, [
    h('button', { class: 'btn btn--sm', type: 'button', onClick: () => navigate('/town') }, [icon('chevron-right', { size: 18 }), 'Back to my town']),
    h('h1', { class: 'screen-title', tabindex: '-1', text: 'Money Town' }),
    h(
      'ul',
      { class: 'money-street' },
      [...placesIn('money'), { id: 'arena', name: 'Arena', route: '/arena', status: 'live', blurb: 'Shortcut to the Arena' }].map((p) =>
        h('li', {}, [
          p.status === 'live'
            ? h('a', { href: `#${p.route}` }, [h('strong', { text: p.name }), ' ', p.blurb])
            : h('details', {}, [h('summary', { text: `${p.name}: under construction` }), ...p.lesson.body.map((t) => h('p', { text: t }))]),
        ]),
      ),
    ),
  ]);
  root.append(view);
  view.querySelector('.screen-title')?.focus({ preventScroll: true });
  return () => view.remove();
}
