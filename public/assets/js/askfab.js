// "Ask Penny" (BRIEF §9, §16), never over a control. On phones and tablets (under 1024 px) it is a small button in
// the sticky header: always in reach, inside the safe areas, and it can't cover anything. On desktop it floats in
// the bottom-right corner, where the page margin usually leaves it clear; it slides away while a dialog, the Coach
// or any modal panel is open, while a text field has focus, and whenever a button, link or field sits under it.
import { h, penny } from './ui.js';

const OPEN_PANEL = 'dialog[open], [aria-modal="true"], .coach';
const INTERACTIVE = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="slider"], [role="tab"], [tabindex]:not([tabindex="-1"])';

export function mountAskFab({ store, onOpen }) {
  const button = h('button', { class: 'ask-fab', type: 'button', title: 'Ask Penny', onClick: onOpen }, [
    penny('happy', { size: 36, className: 'ask-fab__penny' }),
    h('span', { class: 'visually-hidden', text: 'Ask Penny' }),
  ]);
  const inHeader = h('button', { class: 'icon-btn ask-head', type: 'button', title: 'Ask Penny', onClick: onOpen }, [
    penny('happy', { size: 30, className: 'ask-head__penny' }),
    h('span', { class: 'visually-hidden', text: 'Ask Penny' }),
  ]);
  button.hidden = true;
  inHeader.hidden = true;
  document.body.append(button);
  document.querySelector('.app-header__actions')?.append(inHeader);
  let frame = 0;

  // Is any control under the floating button's home spot? Sample a 3 × 3 grid of points. The home spot comes from
  // the CSS offsets, not the live box, because the box moves while the button is away.
  function coversControl() {
    const width = button.offsetWidth;
    const height = button.offsetHeight;
    if (!width) return false; // not shown at this width (the header button is used instead)
    const cs = getComputedStyle(button);
    const view = document.documentElement;
    const r = { left: view.clientWidth - parseFloat(cs.right) - width, top: view.clientHeight - parseFloat(cs.bottom) - height, width, height };
    for (const fx of [0.15, 0.5, 0.85]) {
      for (const fy of [0.15, 0.5, 0.85]) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        for (const el of document.elementsFromPoint(x, y)) {
          if (el === button || button.contains(el)) continue;
          if (el.closest(INTERACTIVE)) return true;
          break; // only the topmost element under the button matters
        }
      }
    }
    return false;
  }

  function update() {
    frame = 0;
    const show = Boolean(store.get().tier);
    // write only on change: the observer below watches 'hidden'
    if (button.hidden === show) button.hidden = !show;
    if (inHeader.hidden === show) inHeader.hidden = !show;
    document.body.classList.toggle('has-ask', show);
    if (!show) return;
    const typing = document.activeElement?.matches?.('input:not([type="button"]):not([type="radio"]):not([type="checkbox"]), textarea, select');
    const away = Boolean(document.querySelector(OPEN_PANEL)) || typing || coversControl();
    button.classList.toggle('is-away', away);
    button.tabIndex = away ? -1 : 0;
    button.setAttribute('aria-hidden', String(away));
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  addEventListener('hashchange', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'hidden', 'class'] });
  store.subscribe(schedule);
  schedule();
  return button;
}
