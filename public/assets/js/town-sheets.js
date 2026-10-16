// The Town's two sheets, shared by the Town and Money Town: the ⓘ "Why this works" note, and the one lesson card a
// building under construction opens (it is never a dead end). One sheet at a time; closing removes it.
import { h, icon } from './ui.js';

let sheet = null;

function openSheet(title, nodes) {
  sheet?.remove();
  sheet = h('dialog', { class: 'tutor town-sheet', 'aria-labelledby': 'town-sheet-title' }, [
    h('div', { class: 'tutor__head' }, [
      h('h2', { class: 'tutor__title', id: 'town-sheet-title', text: title }),
      h('button', { class: 'icon-btn tutor__close', type: 'button', onClick: () => sheet?.close() }, [icon('close'), h('span', { class: 'visually-hidden', text: 'Close' })]),
    ]),
    h('div', { class: 'town-sheet__body' }, nodes),
  ]);
  const mine = sheet;
  mine.addEventListener('close', () => {
    mine.remove();
    if (sheet === mine) sheet = null;
  });
  document.body.append(mine);
  mine.showModal();
}

export function whySheet(b) {
  openSheet(`Why the ${b.name} works`, [
    h('ul', { class: 'privacy__list' }, b.why.map((t) => h('li', { text: t }))),
    h('a', { href: '#/research', text: 'All our sources', onClick: () => sheet?.close() }),
  ]);
}

export function lessonSheet(b, backLabel = 'Back to my town') {
  openSheet(b.lesson.title, [
    h('p', { class: 'town-sheet__badge' }, [icon('blocks', { size: 18 }), `${b.name}: under construction`]),
    ...b.lesson.body.map((t) => h('p', { text: t })),
    b.lesson.source ? h('p', { class: 'part__why', text: `Source: ${b.lesson.source}` }) : null,
    h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => sheet?.close() }, backLabel),
  ]);
}

export function closeSheet() {
  sheet?.remove();
  sheet = null;
}
