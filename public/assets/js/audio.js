// Narration playback (BRIEF §9), exposed to screens as ctx.audio.
// play(id) plays assets/audio/<id>.mp3 and resolves true when it finishes. It never throws or rejects:
// mute, a missing file or a browser that blocks sound before the first tap all resolve false,
// so callers always show the same words on screen. The captioned player UI arrives in slice Y2.
import { AUDIO_BASE } from './config.js';

export function createAudio({ store }) {
  const el = new Audio();
  el.preload = 'none';
  let settle = null;

  function finish(played) {
    const fn = settle;
    settle = null;
    if (fn) fn(played);
  }

  el.addEventListener('ended', () => finish(true));
  el.addEventListener('error', () => finish(false));

  const isMuted = () => Boolean(store.get().muted);

  function stop() {
    if (!el.paused) el.pause();
    finish(false);
  }

  function play(id) {
    stop();
    if (!id || isMuted()) return Promise.resolve(false);
    return new Promise((resolve) => {
      settle = resolve;
      el.src = `${AUDIO_BASE}${encodeURIComponent(id)}.mp3`;
      const started = el.play();
      if (started) started.catch(() => finish(false));
    });
  }

  function setMuted(muted) {
    store.set({ muted: Boolean(muted) });
    if (muted) stop();
  }

  return {
    play,
    stop,
    isMuted,
    setMuted,
    toggleMuted: () => setMuted(!isMuted()),
  };
}
