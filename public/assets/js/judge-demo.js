// The Judge demo (P1.B), shared by the landing button in screens/welcome.js and the #/demo route that the landing
// page links to (screens/demo-start.js). A real player's progress is never swapped out without asking.
export const DEMO_ERROR = 'The demo didn’t load. Check your connection and try again.';

// A note for the welcome screen when #/demo failed and sent the player there; read once.
let pendingNote = '';
export function takeDemoNote() {
  const note = pendingNote;
  pendingNote = '';
  return note;
}

// Resolves to 'town' after moving to the demo town, 'cancelled' if the player kept their progress, or 'failed'.
// onStart runs once the player has agreed, before the demo module loads. replace: the move to the town replaces the
// current history entry (used by #/demo, so Back never reloads the demo).
export async function startDemo({ store, config, navigate }, { onStart = () => {}, replace = false } = {}) {
  const s = store.get();
  if ((s.profile || s.assessment || s.progress?.xp) && !s.demo && !confirm('The demo replaces the progress saved on this device. Continue?')) return 'cancelled';
  onStart();
  try {
    const m = await import('./demo.js');
    await m.loadDemo(store, { config });
    navigate('/town', { replace });
    return 'town';
  } catch {
    pendingNote = DEMO_ERROR;
    return 'failed';
  }
}
