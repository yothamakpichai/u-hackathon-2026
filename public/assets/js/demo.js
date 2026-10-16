// Judge demo (P1.B): one tap from the landing to a full town. Loads a clearly labelled sample profile into the store:
// an adult (Builder level, 25), a character and nickname, the Money Check done (Steady Turtle), Path unit 1 done, a
// finished Builder market with its report, a grown cow and orchard trees, and a Town wallet grant. store.demo marks
// it, the header strip says "Demo profile", and "Leave demo" resets the store (shell.js).
// It also asks the server for an Arena demo account (POST api/account.php?action=demo: "Demo-XXXX", adult, flagged
// demo, deleted after 24 h; it signs this browser in like a normal login). When that fails (Arena off, offline) the
// demo still works on this device only.
import { cowTraits } from './sim/farm.js';
import { dayKey } from './sim/piggy.js';
import * as wallet from '../../js/wallet.js';
import { OPTIONS } from '../../js/avatar.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const TIER = 'builder';
export const DEMO_GRANT = 1000;

// A fixed look (the second option of each part where there is one), so every judge sees the same town.
const DEMO_CHARACTER = Object.fromEntries(Object.entries(OPTIONS).map(([k, list]) => [k, list[Math.min(1, list.length - 1)]]));

function demoState(now) {
  const days = Array.from({ length: 10 }, (_, i) => dayKey(now - i * DAY)); // [today, yesterday, ...]
  const ago = (d) => now - d * DAY;

  // Path (path.js): path[tier].done[nodeId] = { at, xp }. Unit 1 of the Builder path in data/path.json.
  const pathDone = {
    'u1-l1': { at: ago(9), xp: 10 },
    'u1-l2': { at: ago(8), xp: 10 },
    'u1-m': { at: ago(7), xp: 20 },
    'u1-c': { at: ago(6), xp: 30 },
  };

  // A finished market (lab.js run summary, consistent with sim/metrics.js).
  const runAt = now - 2 * HOUR;
  const history = Array.from({ length: 13 }, (_, i) => ({ t: i * 200, value: Math.round((1000 + i * 10.4 + (i === 7 ? -38 : 0)) * 100) / 100, maxShare: 0.38, safeShare: 0.24 }));
  const lab = {
    [TIER]: {
      date: dayKey(runAt), seed: 20261016, tier: TIER, t: 2400, ticks: 2400, finishedEarly: false,
      value: 1124.6, startValue: 1000, cash: 210,
      holdings: { VAULT: { coins: 3.1, value: 389.2 }, EDUU: { coins: 160, value: 330.4 }, PEG: { coins: 195, value: 195 } },
      risk: { ticks: 2400, overExposedTicks: 0, lowSafeTicks: 0, maxShare: 0.42, minCashShare: 0.18 },
      history,
      trades: [
        { t: 20, coinId: 'VAULT', side: 'buy', filledCoins: 3.1, 'filledL$': 372, holdingBefore: 0, holdingAfter: 3.1 },
        { t: 30, coinId: 'EDUU', side: 'buy', filledCoins: 160, 'filledL$': 320, holdingBefore: 0, holdingAfter: 160 },
        { t: 40, coinId: 'PEG', side: 'buy', filledCoins: 195, 'filledL$': 195, holdingBefore: 0, holdingAfter: 195 },
      ],
      created: null,
      events: [
        { id: 'hype_wave', coinId: 'ZOOMZ', t: 350, negative: false, playerCoins: 0, playerValue: 0 },
        { id: 'halving', coinId: 'VAULT', t: 700, negative: false, playerCoins: 3.1, playerValue: 380 },
        { id: 'unlock', coinId: 'ORBIT', t: 1050, negative: true, playerCoins: 0, playerValue: 0 },
        { id: 'whale_dump', coinId: 'VAULT', t: 1400, negative: true, playerCoins: 3.1, playerValue: 352 },
        { id: 'rug_pull', coinId: 'BLOOP', t: 1750, negative: true, playerCoins: 0, playerValue: 0 },
        { id: 'depeg_scare', coinId: 'PEG', t: 2050, negative: true, playerCoins: 195, playerValue: 190 },
      ],
      quiz: [{ id: 'unlock', correct: true }, { id: 'whale_dump', correct: true }, { id: 'rug_pull', correct: true }, { id: 'depeg_scare', correct: false }],
      metrics: { maxSingleExposurePct: 42, minCashPct: 18, panicSellsAfterNegativeEvents: 0, heldBloopAtRug: false, coinLaunched: null, quizCorrect: 3, quizTotal: 4, finalValue: 1124.6 },
      at: runAt,
    },
  };

  // Progress (progress.js): 10 Bangkok days in a row with actions, so a 10-day streak and today's goal met.
  const progressDays = Object.fromEntries(days.map((d, i) => [d, { xp: i === 0 ? 30 : 20, actions: i === 0 ? 3 : 2 }]));
  const refs = {
    'path:builder:u1-l1': days[9], 'path:builder:u1-l2': days[8], 'path:builder:u1-m': days[7], 'path:builder:u1-c': days[6],
    'money-check': days[9],
    [`market:builder:${runAt}`]: dayKey(runAt),
  };
  const progress = { xp: Object.values(progressDays).reduce((s, d) => s + d.xp, 0), days: progressDays, refs };

  // A grown cow (sim/farm.js: adult once feed since birth >= 35; this history gives 38).
  const cowId = `cow-1-${days[9]}`;
  const cow = { id: cowId, born: ago(9), bornAtFeed: 5, ...cowTraits(`${cowId}:424242`) };
  const farm = { seed: 424242, walletMigrated: true, cows: [cow] };

  // Orchard (sim/orchard.js, 4 plots): a fruit tree ready, a big tree fruiting again, a big tree still growing.
  const orchard = {
    plots: [
      { seed: 'fruit', plantedAt: now - DAY - HOUR, harvests: 0, lastHarvestAt: null },
      { seed: 'big', plantedAt: now - 8 * DAY, harvests: 1, lastHarvestAt: now - DAY - HOUR },
      { seed: 'big', plantedAt: now - 3 * DAY, harvests: 0, lastHarvestAt: null },
      null,
    ],
    choices: [
      { at: now - 8 * DAY, seed: 'big', patience: 'later' },
      { at: now - 3 * DAY, seed: 'big', patience: 'later' },
      { at: now - DAY - HOUR, seed: 'fruit', patience: 'soon' },
    ],
  };

  // Money Check as moneycheck.js finish() writes it (moneytype.js scoreMoneyCheck): 4/5 knowledge, 9/12 behaviour.
  const checkAt = ago(9);
  const assessment = {
    knowledgeCorrect: 4, knowledgeTotal: 5, behaviourSum: 9, knowledge: 40, behaviour: 38, score: 78,
    time: 'later', risk: 'careful', presentBias: false, flipAt80: false,
    scripts: { worship: false, status: false, unsure: false }, type: 'turtle',
    answers: {}, at: checkAt,
  };

  return {
    cow,
    patch: {
      assessment, assessmentLater: null, mcDraft: null, resultSeenAt: checkAt,
      unlocked: { [TIER]: true },
      path: { [TIER]: { done: pathDone } },
      lab, progress, farm, orchard,
      report: { [TIER]: { runAt, posted: true } },
    },
  };
}

// Replaces whatever is on this device with the demo profile, then (best effort) signs in an Arena demo account.
export async function loadDemo(store, { config, character } = {}) {
  const now = Date.now();
  const thisYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: config?.TIME_ZONE || 'Asia/Bangkok', year: 'numeric' }).format(new Date(now)));
  const birthYear = thisYear - 25;
  const { cow, patch } = demoState(now);
  const char = { ...DEMO_CHARACTER, ...character };
  // Someone signed in on this device: log them out first, so the demo is never auto-saved into their account.
  try {
    const sync = await import('./sync.js');
    if (sync.currentAccount()) await sync.signOut();
    else sync.stopAutoSave();
  } catch {
    // offline: nothing to save to anyway
  }
  store.replace({
    ...patch,
    tier: TIER,
    birthYear,
    profile: { character: char, nickname: 'Demo judge', futureVoice: 'neutral', birthYear, createdAt: now - 9 * DAY },
    settings: { autoRead: false },
    demo: { at: now, label: 'Judge demo' },
  });

  // Town wallet: only through the ledger.
  try {
    wallet.ensureStarter?.(store, now - 9 * DAY);
    wallet.post(store, { amount: DEMO_GRANT, kind: 'grant', note: 'Judge demo coins', ref: 'demo' }, now);
  } catch {
    // the town still opens without coins
  }

  // The cow's soulbound birth certificate and the unit badge, the way the farm and the path mint them.
  import('./screens/badges.js')
    .then(async (m) => {
      await m.mintBadge(store, { kind: 'cow', ref: cow.id, tier: TIER, meta: { title: `${cow.name}’s birth certificate`, how: `${cow.name} was born on your farm from your own actions.` } });
      await m.mintBadge(store, { kind: 'unit', ref: '1', tier: TIER });
    })
    .catch(() => {});

  // Arena demo account (another device-free login). Never blocks the demo.
  signInDemoAccount(store).catch(() => {});
}

async function signInDemoAccount(store) {
  const sync = await import('./sync.js');
  if (!(await sync.accountsAvailable())) return null;
  if (sync.currentAccount()) await sync.signOut();
  const user = await sync.signIn('demo', {});
  if (!user || user.pending) return null;
  store.set((s) => ({ demo: { ...s.demo, account: user.username || null } }));
  await sync.saveNow(store).catch(() => {});
  sync.startAutoSave(store);
  return user;
}
