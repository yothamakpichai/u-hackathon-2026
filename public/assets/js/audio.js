// Narration (BRIEF §9), exposed to screens as ctx.audio.
//
// Captions always show: line() renders the words on screen and adds a Listen button only when
// assets/audio/manifest.json lists that id with exactly the same text. Until slice Y3 generates
// audio the manifest is empty, so the app is silent and no audio controls appear.
// The manifest maps id -> the text that was spoken: { "gate-explorer-choose": "You have L$10. ..." }.
//
// play(id) resolves true when the clip finishes and false when muted, missing or blocked
// (browsers block sound before the first tap). It never throws or rejects.
import { AUDIO_BASE } from './config.js';
import { h, icon } from './ui.js';

export function createAudio({ store }) {
  const el = new Audio();
  el.preload = 'none';
  let settle = null;
  let manifest = null;

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

  function loadManifest() {
    manifest ??= fetch(`${AUDIO_BASE}manifest.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => (data && typeof data === 'object' && !Array.isArray(data) ? data : {}))
      .catch(() => ({}));
    return manifest;
  }

  // True when a clip exists for this id and was recorded from exactly this text.
  const has = async (id, text) => {
    const m = await loadManifest();
    return typeof m[id] === 'string' && (text === undefined || m[id] === text);
  };

  const hasAny = async () => Object.keys(await loadManifest()).length > 0;

  // A captioned line: the text always shows; a Listen button appears only if the clip exists.
  // autoplay plays it once on mount, only after the visitor has already tapped something.
  function line({ id, text, tag = 'p', className = '', autoplay = false }) {
    const label = h('span', { class: 'visually-hidden', text: 'Listen' });
    const button = h('button', { class: 'narration__play', type: 'button', hidden: true }, [icon('speaker'), label]);
    const root = h('div', { class: `narration ${className}`.trim() }, [
      button,
      h(tag, { class: 'narration__text', text }),
    ]);
    let playing = false;

    function show(state) {
      playing = state;
      button.replaceChildren(icon(state ? 'stop' : 'speaker'), label);
      label.textContent = state ? 'Stop' : 'Listen';
      button.classList.toggle('is-playing', state);
    }

    async function speak() {
      show(true);
      await play(id);
      show(false);
    }

    button.addEventListener('click', () => {
      if (playing) return stop();
      if (isMuted()) setMuted(false); // an explicit Listen tap turns sound back on
      speak();
    });

    has(id, text).then((ok) => {
      if (!ok) return;
      button.hidden = false;
      const tapped = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
      if (autoplay && tapped && !isMuted() && root.isConnected) speak();
    });

    return root;
  }

  return {
    play,
    stop,
    isMuted,
    setMuted,
    toggleMuted: () => setMuted(!isMuted()),
    has,
    hasAny,
    line,
  };
}
