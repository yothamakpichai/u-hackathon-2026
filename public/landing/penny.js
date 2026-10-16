// Penny landing (banknote edition): entrance motion, reveal-on-scroll and the live Ask Penny note.
// Everything is visible without JavaScript; this file only adds motion and the chat.
const root = document.documentElement;
root.classList.add('js');

// Reveal blocks as they enter the viewport. A scroll check (not IntersectionObserver) so slow devices never leave
// text hidden, plus a safety net that shows everything after 4 s whatever happens.
const pending = new Set(document.querySelectorAll('[data-reveal]'));
function revealCheck() {
  const limit = window.innerHeight * 0.92;
  for (const el of pending) {
    if (el.getBoundingClientRect().top < limit) {
      el.classList.add('is-in');
      pending.delete(el);
    }
  }
  if (!pending.size) window.removeEventListener('scroll', revealCheck);
}
window.addEventListener('scroll', revealCheck, { passive: true });
window.addEventListener('resize', revealCheck, { passive: true });
requestAnimationFrame(revealCheck);
setTimeout(() => {
  for (const el of pending) el.classList.add('is-in');
  pending.clear();
}, 4000);

// Ask Penny: the same endpoint the app uses (api/tutor.php), with the checked FAQ as a silent fallback.
const note = document.querySelector('[data-ask]');
if (note) {
  import('./ask.js').then((m) => m.initAsk(note)).catch(() => {});
}
