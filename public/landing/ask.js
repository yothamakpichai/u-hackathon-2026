// Ask Penny on the landing page: the same companion endpoint the app uses (api/tutor.php, mode "ask").
// If the AI is unavailable, Penny answers from the checked FAQ (data/tutor_faq.json) without showing an error.
const API = 'api/tutor.php';
const FAQ_URL = 'data/tutor_faq.json';
const TIER = 'builder';
const LIMIT = 8;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let faq = null;
async function loadFaq() {
  if (faq) return faq;
  try {
    const res = await fetch(FAQ_URL);
    const data = await res.json();
    faq = Object.values(data).flat().filter((x) => x && x.question && x.answer);
  } catch {
    faq = [];
  }
  return faq;
}

// Written answers for the suggested questions, so the first try always works even without the AI.
const CHIP_ANSWERS = {
  double: 'Almost certainly a scam. Real investments can’t promise big returns, and money that “doubles in a week” is usually paid to early people from later people’s money until it collapses. Watch for a huge promise, pressure to decide fast, and being asked to bring in friends. In Penny’s Market Lab you can watch a rug pull happen safely.',
  minimum: 'Because interest keeps charging on everything you haven’t paid. If you pay only the minimum, much of each payment goes to interest and the balance shrinks slowly, so a small purchase can take years to clear and cost far more than its price. In Thailand, card interest can be up to 16% a year. Paying in full each month avoids it. The Town Card in Penny’s Bank shows exactly what the minimum costs.',
  inflation: 'Your jar keeps the same number of baht, but prices rise, so each baht buys a little less every year. With 3% inflation, 1,000 baht in a year buys about what 971 baht buys today, and the gap keeps growing. That’s why Future You shows everything in today’s baht.',
  rug: 'A rug pull is when the people behind a coin suddenly pull out the money that lets others trade, or dump their huge share, so the price crashes and holders can’t sell for much. Red flags: an anonymous team, a big share held by the creators, and liquidity that isn’t locked. You can see one coming in Penny’s Market Lab.',
};
function chipAnswer(q) {
  const s = q.toLowerCase();
  if (s.includes('double') && s.includes('week')) return CHIP_ANSWERS.double;
  if (s.includes('minimum') && s.includes('credit')) return CHIP_ANSWERS.minimum;
  if (s.includes('inflation') && s.includes('jar')) return CHIP_ANSWERS.inflation;
  if (s.includes('rug pull')) return CHIP_ANSWERS.rug;
  return null;
}

const STOP = new Set(['what', 'does', 'with', 'that', 'this', 'have', 'your', 'about', 'from', 'will', 'when', 'they', 'them', 'there', 'money', 'into', 'than', 'then', 'which', 'would', 'could', 'should', 'some', 'more', 'just', 'like', 'make', 'much', 'many', 'very', 'really', 'here', 'where', 'were', 'been', 'being', 'also', 'only', 'mean', 'means', 'happen', 'happens']);
const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 3 && !STOP.has(w)));

async function fromFaq(question) {
  const items = await loadFaq();
  const q = words(question);
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const w = words(item.question);
    let hit = 0;
    for (const x of q) if (w.has(x)) hit++;
    const score = hit / Math.max(2, Math.min(q.size, w.size));
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 0.5 ? best.answer : null;
}

async function askServer(question) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'ask', tier: TIER, question }),
      signal: ctrl.signal,
    });
    const body = await res.json();
    return res.ok && body && body.ok && typeof body.answer === 'string' ? body.answer : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function speakButton(text) {
  if (!('speechSynthesis' in window)) return null;
  const btn = el('button', 'msg__speak', 'Listen');
  btn.type = 'button';
  btn.addEventListener('click', () => {
    const synth = window.speechSynthesis;
    if (btn.dataset.on === '1') {
      synth.cancel();
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1;
    const voice = synth.getVoices().find((v) => /en[-_](US|GB)/i.test(v.lang) && /female|samantha|google us english|zira|serena/i.test(v.name))
      || synth.getVoices().find((v) => /^en/i.test(v.lang));
    if (voice) u.voice = voice;
    u.onend = u.onerror = () => {
      btn.dataset.on = '0';
      btn.textContent = 'Listen';
    };
    btn.dataset.on = '1';
    btn.textContent = 'Stop';
    synth.speak(u);
  });
  return btn;
}

export function initAsk(root) {
  const log = root.querySelector('.ask__log');
  const form = root.querySelector('.ask__form');
  const input = root.querySelector('#ask-input');
  const send = root.querySelector('.ask__send');
  const chips = [...root.querySelectorAll('.chip')];
  let busy = false;
  let count = 0;

  const scroll = () => { log.scrollTop = log.scrollHeight; };

  function addUser(text) {
    const row = el('div', 'msg msg--user');
    row.append(el('p', 'msg__bubble', text));
    log.append(row);
    scroll();
  }

  function addPenny() {
    const row = el('div', 'msg msg--penny');
    const img = el('img', 'msg__avatar');
    img.src = 'assets/svg/penny/thinking.svg';
    img.alt = '';
    img.width = 40;
    img.height = 40;
    const body = el('div', 'msg__body');
    const bubble = el('p', 'msg__bubble');
    const typing = el('span', 'typing');
    typing.setAttribute('aria-label', 'Penny is thinking');
    typing.append(el('i'), el('i'), el('i'));
    bubble.append(typing);
    body.append(bubble);
    row.append(img, body);
    log.append(row);
    scroll();
    return { img, body, bubble };
  }

  async function typeOut(bubble, text) {
    bubble.textContent = '';
    if (reduced) {
      bubble.textContent = text;
      return;
    }
    const step = Math.max(1, Math.round(text.length / 120));
    for (let i = 0; i < text.length; i += step) {
      bubble.textContent = text.slice(0, i + step);
      scroll();
      await new Promise((r) => setTimeout(r, 16));
    }
    bubble.textContent = text;
  }

  function setBusy(on) {
    busy = on;
    send.disabled = on;
    chips.forEach((c) => { c.disabled = on; });
  }

  async function ask(question) {
    const q = question.trim().slice(0, 300);
    if (!q || busy) return;
    setBusy(true);
    addUser(q);
    input.value = '';
    const { img, body, bubble } = addPenny();
    count++;
    let answer;
    if (count > LIMIT) {
      answer = 'I love these questions! Come into the town and we can keep going there, with a market to practise in.';
    } else {
      answer = (await askServer(q)) || chipAnswer(q) || (await fromFaq(q)) || 'I can’t reach my notes right now. Open Penny and ask me inside the town; I’ll be there.';
    }
    img.src = 'assets/svg/penny/happy.svg';
    await typeOut(bubble, answer);
    const btn = speakButton(answer);
    if (btn) body.append(btn);
    if (count >= 2) {
      const go = el('a', 'msg__speak', 'Open Penny');
      go.href = 'app.html';
      body.append(go);
    }
    scroll();
    setBusy(false);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });
  chips.forEach((c) => c.addEventListener('click', () => ask(c.dataset.q || c.textContent)));
}
