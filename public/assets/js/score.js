// Money Health Score (BRIEF §6): 0–100, scoring wisdom rather than profit, each part with a one-line reason.
// Pure functions with no DOM, so score.test.mjs can run them in Node. Input is the run the Lab saves in
// store.lab[tier] (docs/DECISIONS-sim.md) plus store.check[tier] and store.lesson[tier] (DECISIONS.md #11).
// When the run carries metrics (BRIEF §14), the report uses exactly those numbers, the same ones the Learning Path
// missions check, so a mission and the report card never disagree. Older runs without metrics use the raw data.

const TICKS_PER_SECOND = 10;
const PANIC_WINDOW = 10 * TICKS_PER_SECOND; // "no sell-everything within 10 s after a negative event"
const SHOCKS = ['unlock', 'whale_dump', 'depeg_scare']; // market shocks; scams are scored under scam avoidance
const RUGS = ['rug_pull', 'copycat_rug'];

const pct = (x) => `${Math.round(x * 100)}%`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const L = (n) => `L$${Math.round(n).toLocaleString('en-US')}`;

function knowledge({ run, check, lesson }) {
  const skipped = !check || check.skipped;
  const checkAsked = check?.total ?? 3;
  const checkRight = skipped ? 0 : check.score;
  const lessonAsked = lesson?.done ? 1 : 0;
  const lessonRight = lesson?.done && lesson.quizCorrect ? 1 : 0;
  const quiz = run.quiz || [];
  const quizAsked = run.metrics ? run.metrics.quizTotal : quiz.length;
  const quizRight = run.metrics ? run.metrics.quizCorrect : quiz.filter((q) => q.correct).length;
  const asked = checkAsked + lessonAsked + quizAsked;
  const right = checkRight + lessonRight + quizRight;
  const where = ['the check', lessonAsked && 'the lesson quiz', quizAsked && `Penny’s ${plural(quizAsked, 'market question')}`].filter(Boolean);
  const list = where.length > 1 ? `${where.slice(0, -1).join(', ')} and ${where.at(-1)}` : where[0];
  return {
    value: asked ? (30 * right) / asked : 0,
    reason: `${right} of ${asked} right across ${list}.${skipped ? ' A skipped check counts as 0 of 3.' : ''}`,
  };
}

function riskManagement({ run, bought }) {
  if (!bought) return { value: 0, reason: 'You never bought a coin, so there was no risk to manage. Try spreading L$ across a few coins.' };
  const m = run.metrics;
  if (m) {
    const top = m.maxSingleExposurePct;
    const cash = m.minCashPct;
    const spread = top <= 50 ? 1 : Math.max(0, (100 - top) / 50);
    const cushion = cash >= 10 ? 1 : Math.max(0, cash / 10);
    return {
      value: 12.5 * spread + 12.5 * cushion,
      reason: `At its biggest, one coin was ${Math.round(top)}% of your money (aim for 50% or less), and your cash never fell below ${Math.round(cash)}% (aim for 10% or more).`,
    };
  }
  const r = run.risk || {};
  const ticks = r.ticks || 0;
  if (!ticks) return { value: 0, reason: 'The market closed before there was time to judge your risk.' };
  const spread = 1 - (r.overExposedTicks || 0) / ticks;
  const safe = 1 - (r.lowSafeTicks || 0) / ticks;
  return {
    value: 12.5 * spread + 12.5 * safe,
    reason: `No coin was over half your money ${pct(spread)} of the time, and you kept at least 10% in L$ or PEG ${pct(safe)} of the time.`,
  };
}

function scamAvoidance({ run, tier }) {
  const rugs = (run.events || []).filter((e) => RUGS.includes(e.id));
  if (!rugs.length) {
    return {
      value: 20,
      reason: tier === 'builder' ? 'No scam hit a coin you held.' : 'No scam coins at this level. BLOOP and copycats show up at Builder.',
    };
  }
  let lost = 0;
  const notes = [];
  for (const e of rugs) {
    const share = e.playerValue > 0 ? e.playerValue / valueAt(run, e.t) : 0;
    const name = e.id === 'rug_pull' ? e.coinId : 'the copycat';
    if (share > 0.005) {
      lost += Math.round(share * 100);
      notes.push(`${L(e.playerValue)} in ${name} when it was rug pulled, ${pct(share)} of your money`);
    }
  }
  if (!notes.length) return { value: 20, reason: `You held none of ${rugs.map((e) => (e.id === 'rug_pull' ? e.coinId : 'the copycat')).join(' or ')} when it was rug pulled.` };
  return { value: Math.max(0, 20 - lost), reason: `You had ${notes.join(', and ')}. You lose a point for each 1%.` };
}

function composure({ run, bought }) {
  if (!bought) return { value: 0, reason: 'You held no coins through the news, so composure wasn’t tested.' };
  if (run.metrics) {
    const n = run.metrics.panicSellsAfterNegativeEvents;
    return {
      value: Math.max(0, 15 - 5 * n),
      reason: n ? `You sold a whole coin within 10 seconds of bad news ${plural(n, 'time')}. Each panic sale costs 5 points.` : 'You never sold a whole coin in a panic after bad news.',
    };
  }
  const trades = run.trades || [];
  const panics = (run.events || [])
    .filter((e) => SHOCKS.includes(e.id))
    .map((e) => ({ e, sale: trades.find((x) => x.side === 'sell' && x.coinId === e.coinId && x.t >= e.t && x.t <= e.t + PANIC_WINDOW && x.holdingBefore > 0 && x.holdingAfter <= 0) }))
    .filter((p) => p.sale);
  if (!panics.length) return { value: 15, reason: 'You never sold everything in a panic after bad news.' };
  const first = panics[0];
  const secs = Math.max(1, Math.round((first.sale.t - first.e.t) / TICKS_PER_SECOND));
  return {
    value: Math.max(0, 15 - 5 * panics.length),
    reason: `You sold all your ${first.e.coinId} ${plural(secs, 'second')} after the bad news${panics.length > 1 ? `, and panicked ${plural(panics.length - 1, 'more time')}` : ''}. Each panic sale costs 5 points.`,
  };
}

function returns({ run }) {
  const value = run.metrics?.finalValue ?? run.value;
  const change = run.startValue > 0 ? value / run.startValue - 1 : 0;
  const signed = `${change >= 0 ? '+' : '−'}${Math.abs(change * 100).toFixed(1)}%`;
  return {
    value: 10 * Math.min(1, Math.max(0, change / 0.5)),
    reason: `You finished with ${L(value)}, ${signed}. ${change > 0 ? 'Full points need +50%.' : 'Only gains score here, and they are worth just 10 points.'}`,
  };
}

// Portfolio value at tick t: the last per-candle sample at or before t, else the starting value.
function valueAt(run, t) {
  let v = run.startValue || 1;
  for (const s of run.history || []) if (s.t <= t) v = s.value;
  return v > 0 ? v : 1;
}

const PARTS = [
  { id: 'knowledge', label: 'Knowledge', max: 30, score: knowledge },
  { id: 'risk', label: 'Risk management', max: 25, score: riskManagement },
  { id: 'scams', label: 'Scam avoidance', max: 20, score: scamAvoidance },
  { id: 'composure', label: 'Composure', max: 15, score: composure },
  { id: 'returns', label: 'Returns', max: 10, score: returns },
];

export function scoreRun({ run, check = null, lesson = null, tier }) {
  const bought = (run.trades || []).some((x) => x.side === 'buy');
  const input = { run, check, lesson, tier, bought };
  const parts = PARTS.map(({ id, label, max, score }) => {
    const { value, reason } = score(input);
    return { id, label, max, points: Math.max(0, Math.min(max, Math.round(value))), reason };
  });
  const total = parts.reduce((n, p) => n + p.points, 0);
  return { total, parts, band: band(total) };
}

export function band(total) {
  if (total >= 80) return { label: 'Excellent money health', mood: 'celebrating' };
  if (total >= 60) return { label: 'Healthy', mood: 'celebrating' };
  if (total >= 40) return { label: 'Getting there', mood: 'happy' };
  return { label: 'Needs care', mood: 'thinking' };
}

// "3 things you learned": the ideas behind the news this run, then the level's basics.
const LEARNED = {
  hype_wave: 'Hype can lift a price fast, and it usually fades just as fast.',
  halving: 'A halving slows down how many new coins are made. Coins you hold stay yours.',
  unlock: 'When locked coins unlock, more coins can be sold, so the price can drop.',
  whale_dump: 'One big sale can drop a price even when nothing about the coin changed.',
  rug_pull: 'An unlocked pool and one creator holding most coins are rug pull red flags.',
  depeg_scare: 'A stablecoin can slip below L$1. Swaps back to L$1 pull it up again.',
  wash_volume: 'Busy volume with a flat price can be one bot trading with itself.',
  copycat: 'Anyone can copy a coin’s name. Check who made it and whether its pool is locked.',
  copycat_rug: 'A copycat’s creator can pull its pool, leaving its buyers with almost nothing.',
};
const BASICS = {
  explorer: [
    'When more of something is made, each one is usually worth less.',
    'Prices move when more people want to buy, or more want to sell.',
    'Waiting and staying calm often beats rushing.',
  ],
  trader: [
    'Spreading your money means one bad coin can’t sink you.',
    'Prices move when buyers and sellers push against each other.',
    'Keeping some L$ or PEG gives you a cushion on bad days.',
  ],
  builder: [
    'Before trusting a launch, check who holds the coins and whether the pool is locked.',
    'Unlock schedules show when new supply can reach the market.',
    'Volume only means demand when real buyers are behind it.',
  ],
};

// Scams and shocks first: they are the lessons that protect real money later.
const PRIORITY = ['rug_pull', 'copycat_rug', 'copycat', 'whale_dump', 'depeg_scare', 'unlock', 'hype_wave', 'wash_volume', 'halving'];

export function learned({ run, tier }) {
  const lines = [];
  const seen = new Set((run.events || []).map((e) => e.id));
  for (const id of PRIORITY) if (seen.has(id) && !lines.includes(LEARNED[id])) lines.push(LEARNED[id]);
  for (const line of BASICS[tier] || BASICS.explorer) if (lines.length < 3 && !lines.includes(line)) lines.push(line);
  return lines.slice(0, 3);
}
