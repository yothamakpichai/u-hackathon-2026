// Penny's voice (BRIEF §9, §17; docs/DECISIONS.md #60). The <audio> element plays api/tts.php directly: same
// origin, so the strict CSP holds (media-src 'self', no blob:). The server speaks only an answer it just gave
// (with its tts token) or allowlisted static text. On any error, a refusal, a timeout or a long text, the browser's
// own speechSynthesis reads it instead, in an English voice. One voice plays at a time.
const API = 'api/tts.php';
const MAX_CHARS = 900;
const START_TIMEOUT_MS = 8000;

let el = null;
let current = null;

// Stops whatever Penny is saying. Safe to call any time.
export function stopVoice() {
  const playing = current;
  current = null;
  if (el && !el.paused) el.pause();
  try {
    globalThis.speechSynthesis?.cancel();
  } catch {
    /* nothing to stop */
  }
  playing?.finish();
}

// Speaks the text and resolves when it ends or is stopped. Never rejects.
export function speak(text, { voice = 'penny', token = '' } = {}) {
  stopVoice();
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return Promise.resolve();
  return new Promise((resolve) => {
    const me = {};
    let done = false;
    let timer = 0;
    me.finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (current === me) current = null;
      resolve();
    };
    current = me;
    const fallback = () => {
      if (done || current !== me) return;
      clearTimeout(timer);
      if (el && !el.paused) el.pause();
      browserSpeak(clean, voice, me.finish);
    };
    if (clean.length > MAX_CHARS || typeof Audio === 'undefined') return fallback();
    el ??= new Audio();
    el.preload = 'auto';
    el.onended = () => me.finish();
    el.onerror = fallback;
    el.onplaying = () => clearTimeout(timer);
    const query = new URLSearchParams({ text: clean, voice });
    if (token) query.set('token', token);
    el.src = `${API}?${query}`;
    timer = setTimeout(fallback, START_TIMEOUT_MS);
    const started = el.play();
    if (started) started.catch(fallback);
  });
}

// Penny's v4 styles (assets/css/v4-penny.css), added once if index.html doesn't link them already.
export function ensurePennyStyles() {
  if (typeof document === 'undefined' || document.querySelector('link[href$="v4-penny.css"]')) return;
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'assets/css/v4-penny.css' }));
}

// The browser's own speech, with an English voice when there is one. Calls done when it ends or fails.
function browserSpeak(text, voice, done) {
  const synth = globalThis.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return done();
  try {
    const u = new SpeechSynthesisUtterance(text);
    const english = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
    const hint = voice === 'male' ? /\b(male|david|daniel|george|guy|mark|james|ryan)\b/i : voice === 'neutral' ? null : /\b(female|zira|samantha|susan|hazel|libby|aria|jenny|karen|moira)\b/i;
    u.voice = (hint && english.find((v) => hint.test(v.name))) || english.find((v) => /en[-_]US/i.test(v.lang)) || english[0] || null;
    u.lang = u.voice?.lang || 'en-US';
    u.rate = 1;
    u.onend = done;
    u.onerror = done;
    synth.cancel();
    synth.speak(u);
  } catch {
    done();
  }
}
