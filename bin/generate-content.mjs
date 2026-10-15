#!/usr/bin/env node
// Content generator (BRIEF §8, §9). Claude writes gate, lessons, events and tutor_faq through forced tool use.
// Each file is checked against its schema, the brief's rules and public/data/facts.json, then reviewed by a second
// Claude pass and a blind answer check. Problems go back to Claude to fix; a file is written only when it is clean.
//   node bin/generate-content.mjs [gate] [lessons] [events] [tutor_faq]     (default: all four)
//   node bin/generate-content.mjs --check [files]                          (rule checks only, no API calls)
// Reads ANTHROPIC_API_KEY and ANTHROPIC_MODEL_CONTENT from ../u-hackathon-2026-private/.env. Never prints the key.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');
const TIERS = ['explorer', 'trader', 'builder'];
const ATTEMPTS = 4;

const env = loadEnv(join(dirname(ROOT), 'u-hackathon-2026-private', '.env'));
const MODEL = env.ANTHROPIC_MODEL_CONTENT || 'claude-sonnet-5-5';
const read = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));
const facts = read('facts.json');
const scenario = read('scenario.json');

// Every event and the tiers that see it (BRIEF §5), plus the Builder copycat events from slice J3.
const EVENTS = [
  ...scenario.events.map((e) => ({ id: e.id, coin: e.coin, tiers: e.tiers })),
  { id: 'copycat', coin: 'the player’s coin', tiers: ['builder'] },
  { id: 'copycat_rug', coin: 'the copycat coin', tiers: ['builder'] },
];

// What the player sees when each event fires (measured in the sim, docs/DECISIONS-sim.md).
const EVENT_NOTES = {
  hype_wave: 'Hype buyers are starting to rush into ZOOMZ. After the popup closes, its price climbs a lot over about half a minute, then fades as early buyers take profit.',
  halving: 'VAULT starts making half as many new coins. Miners have fewer new coins to sell, so selling pressure eases slowly. Nothing jumps at once and nobody loses coins they hold.',
  unlock: 'A quarter of ORBIT’s locked team and investor coins just unlocked and some insiders sold at once, so the drop is already on the chart. After the popup it partly recovers, then slides as more coins vest.',
  whale_dump: 'One whale just sold a huge pile of VAULT in one go, so the drop is already on the chart. After the popup it recovers part of the way. Nothing about VAULT itself changed. Panic sellers who dump everything lock in the loss.',
  rug_pull: 'BLOOP’s creator is pulling almost all the money out of its pool and selling their bag. A second after the popup closes, the price is almost zero. The red flags were visible before: the creator held 60% of the coins, the pool was not locked, and hype pumped the price first.',
  depeg_scare: 'Scared holders just sold PEG and it is at about L$0.96. After the popup, traders who can swap PEG back for L$1 buy the cheap coins, so it returns to L$1.00 within about 15 seconds.',
  wash_volume: 'Shown with the real vs wash volume overlay in the Builder Advanced view. An NPC bot trades FUEL with itself all session. The volume bars look busy but the price barely moves, because no real buyer is behind that volume.',
  copycat: 'Builder only, when the player launched a coin with an unlocked pool. An NPC just listed a look-alike with "Official" in its name at the same price and is hyping it. Do not name the coin; say "your coin".',
  copycat_rug: 'Builder only, about 30 seconds after the copycat appeared. Its creator just pulled its pool, so people who bought the copycat cannot sell it for anything close to what they paid. The player’s real coin keeps trading.',
};

const SYSTEM = `You write the in-app content for Market Lab, an educational crypto-market simulation for kids aged 8 to 16, made by Cenedury. Penny, a friendly round coin, reads every line out loud and the same words appear on screen.

Tiers:
- explorer (ages 8 to 12): concrete thinking. Money is exchange: earn, save, spend, share; waiting pays. Lens: scarcity ("make more, each is worth less"). Sees VAULT, EDUU and PEG. Use words a 9-year-old knows and sentences under 12 words.
- trader (ages 13 to 15): probability, risk, supply and demand. Lens: concentration risk and hype cycles. Also sees FUEL, ORBIT and ZOOMZ.
- builder (16+): speculation and token design. Lens: full launch anatomy and rug-pull recognition. Also sees BLOOP and the wash-volume overlay.

Lab coins (all fictional): VAULT (store of value, hard cap, halving), EDUU (Cenedury's official coin, fixed supply, learner rewards pool), PEG (stablecoin aiming at L$1.00), FUEL (utility coin, issuance plus a burn on every trade), ORBIT (project coin with team and investor coins that unlock over time), ZOOMZ (meme coin on a bonding curve, hype-driven, survives), BLOOP (meme coin whose NPC creator rug pulls it).

Canonical facts. Never contradict them:
${facts.facts.map((f) => `- ${f.text}`).join('\n')}

Rules:
${facts.rules.map((r) => `- ${r}`).join('\n')}
- Penny reads the text aloud, so write plain spoken English: no emoji, no parentheses, no abbreviations like "e.g.", no markdown.
- Warm and calm. Explain, never scare and never hype. Talk to the player as "you".
- Use L$ for money, written like L$50 or L$1,000.
- Do not quote exact percentage moves or prices, except PEG's L$1.00 and about L$0.96, and amounts in your own worked examples.
- Questions have exactly one clearly correct option. Wrong options are plausible but clearly wrong once you know the idea. Never use "all of the above" or "none of the above", and never refer to options by letter or position, because the options are shuffled.`;

const str = (maxLength, description) => ({ type: 'string', minLength: 1, maxLength, description });
const question = (n, extra = {}) => ({
  type: 'object',
  additionalProperties: false,
  required: ['prompt', 'options', 'answerIndex', 'explain', ...Object.keys(extra)],
  properties: {
    ...extra,
    prompt: str(170, 'The question, at most 25 words. A concrete situation with L$ amounts where it helps.'),
    options: { type: 'array', minItems: n, maxItems: n, items: str(72, 'At most 10 words.') },
    answerIndex: { type: 'integer', minimum: 0, maximum: n - 1 },
    explain: str(260, 'At most 35 words. Why the correct option is right. Penny reads it after any answer, so it must make sense whether the player was right or wrong. Do not start with "Correct" or "Wrong".'),
  },
});
const byTier = (item, tiers = TIERS) => ({
  type: 'object',
  additionalProperties: false,
  required: tiers,
  properties: Object.fromEntries(tiers.map((t) => [t, item])),
});
const list = (n, item) => ({ type: 'array', minItems: n, maxItems: n, items: item });
const ID = { type: 'string', pattern: '^[a-z][a-z0-9-]{1,23}$', description: 'Short kebab-case id, unique in its tier.' };

const INTERACTION = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'prompt', 'reveal'],
      properties: { type: { const: 'reveal' }, prompt: str(80, 'Tap-to-reveal teaser, at most 10 words.'), reveal: str(200, 'What the tap reveals, at most 25 words.') },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'prompt', 'options', 'answerIndex', 'explain'],
      properties: {
        type: { const: 'choice' },
        prompt: str(130, 'A quick question, at most 16 words.'),
        options: { type: 'array', minItems: 2, maxItems: 2, items: str(72, 'At most 10 words.') },
        answerIndex: { type: 'integer', minimum: 0, maximum: 1 },
        explain: str(170, 'Shown after the right pick, at most 20 words.'),
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'prompt', 'options'],
      properties: {
        type: { const: 'toggle' },
        prompt: str(80, 'At most 10 words.'),
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'result'],
            properties: { label: str(28, 'At most 4 words.'), result: str(130, 'What happens, at most 16 words. Start with ↑ or ↓ when it describes a price move.') },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'label', 'min', 'max', 'step', 'start', 'formula', 'constant', 'resultLabel', 'unit', 'valueUnit'],
      properties: {
        type: { const: 'slider' },
        label: str(48, 'What the slider sets, at most 7 words.'),
        min: { type: 'number' },
        max: { type: 'number' },
        step: { type: 'number', exclusiveMinimum: 0 },
        start: { type: 'number' },
        formula: { enum: ['divide', 'multiply', 'subtract'], description: 'divide: result = constant ÷ value. multiply: result = value × constant. subtract: result = constant − value.' },
        constant: { type: 'number', exclusiveMinimum: 0 },
        resultLabel: str(48, 'What the result means, at most 7 words.'),
        unit: { enum: ['L$', '%'], description: 'Unit of the result.' },
        valueUnit: { enum: ['', '%'], description: 'Unit shown after the slider value.' },
      },
    },
  ],
};

const EVENT_ENTRY = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'narration', 'question'],
  properties: {
    headline: str(56, 'Plain news headline, at most 7 words, no clickbait.'),
    narration: str(420, 'At most 60 words. What just happened, why, and the one idea to take away, for this tier’s age.'),
    question: question(3),
  },
};

const LESSON = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'cards', 'quiz'],
  properties: {
    title: str(40, 'Lesson title, at most 6 words.'),
    cards: list(4, {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'body', 'interaction'],
      properties: { title: str(36, 'At most 5 words.'), body: str(300, 'At most 45 words. Penny reads it aloud.'), interaction: INTERACTION },
    }),
    quiz: question(3),
  },
};

// Learning Path (BRIEF §14): per tier 3 units, each with 2 lessons and a 5-question checkpoint. Missions are not
// generated: they are exact conditions on the Lab's run metrics, written by hand in MISSIONS below.
const UNIT_TOPICS = {
  explorer: [
    'Money basics: earning, saving, spending and sharing; needs and wants; why waiting can pay; making a simple plan before buying.',
    'Markets and prices: prices come from buyers and sellers; scarcity; why prices change; not putting all your money in one place.',
    'Crypto and blockchain as ideas: a blockchain is a shared notebook nobody can secretly rub out; blocks; small fees; a wallet and its secret key are like a locker and its key, and you never share the key.',
  ],
  trader: [
    'Money basics: budgets; interest and compound interest; inflation (prices rising over time); opportunity cost.',
    'Markets and prices: supply and demand; pools and price impact; diversification and concentration risk; hype cycles.',
    'Crypto and blockchain: wallets and keys as concepts (a private key or recovery words must never be shared, and nobody legitimate asks for them); blocks and confirmations; fees; a block explorer shows every transaction.',
  ],
  builder: [
    'Money basics: compound interest over long periods; inflation and real returns; risk and return go together; emergency savings.',
    'Markets and prices: liquidity and slippage; market makers; wash trading; token unlocks and vesting; reading volume honestly.',
    'Crypto and blockchain: wallets, public addresses and private keys as concepts; hashes and why changing an old block breaks every later one; confirmations and fees; using a block explorer to check claims.',
  ],
};
const PATH_UNIT = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'intro', 'lessons', 'checkpoint'],
  properties: {
    title: str(32, 'Unit title, at most 4 words.'),
    intro: str(170, 'What this unit teaches, at most 25 words.'),
    lessons: list(2, LESSON),
    checkpoint: { type: 'object', additionalProperties: false, required: ['questions'], properties: { questions: list(5, question(3)) } },
  },
};
// One unit per call keeps each reply well inside the output limit.
const pathSpec = (tier, u) => ({
  tool: `write_path_${tier}_${u + 1}`,
  describe: `Unit ${u + 1} of the ${tier} Learning Path: 2 lessons and a 5-question checkpoint.`,
  schema: PATH_UNIT,
  ask: `Write unit ${u + 1} of 3 of the Learning Path for the ${tier} tier. Its topic: ${UNIT_TOPICS[tier][u]}
The whole path, for context: ${UNIT_TOPICS[tier].map((x, i) => `${i + 1}. ${x.split(':')[0]}`).join('; ')}.
- 2 lessons that build on each other, then a checkpoint of exactly 5 questions covering both lessons.
- Each lesson: exactly 4 cards using each interaction type once (reveal, choice, toggle, slider), then 1 quiz question.
- The slider maths must be exactly right at every position, and its label, resultLabel and units must describe that maths.
- Use lab examples (L$, the lab coins) where they help. Never show, invent or ask for a real recovery phrase, key or password.`,
});
const PATH_FILES = Object.fromEntries(TIERS.flatMap((tier) => [0, 1, 2].map((u) => [`path_${tier}_${u + 1}`, pathSpec(tier, u)])));
const MISSIONS = {
  explorer: [
    { title: 'Keep a cushion', goal: 'Finish a market holding at least one coin, without letting your cash drop below 10% of your money.', check: [{ metric: 'maxSingleExposurePct', op: '>', value: 0 }, { metric: 'minCashPct', op: '>=', value: 10 }] },
    { title: 'Spread it out', goal: 'Finish a market holding coins, with no single coin ever above half of your money.', check: [{ metric: 'maxSingleExposurePct', op: '>', value: 0 }, { metric: 'maxSingleExposurePct', op: '<=', value: 50 }] },
    { title: 'Ask why', goal: 'Answer at least 2 of Penny’s market questions right in one market.', check: [{ metric: 'quizCorrect', op: '>=', value: 2 }] },
  ],
  trader: [
    { title: 'Keep a cushion', goal: 'Finish a market holding at least one coin, without letting your cash drop below 10% of your money.', check: [{ metric: 'maxSingleExposurePct', op: '>', value: 0 }, { metric: 'minCashPct', op: '>=', value: 10 }] },
    { title: 'Stay calm', goal: 'Finish a market holding coins, with no coin above half of your money and no panic sale after bad news.', check: [{ metric: 'maxSingleExposurePct', op: '>', value: 0 }, { metric: 'maxSingleExposurePct', op: '<=', value: 50 }, { metric: 'panicSellsAfterNegativeEvents', op: '==', value: 0 }] },
    { title: 'Read the news', goal: 'Answer at least 3 of Penny’s market questions right in one market.', check: [{ metric: 'quizCorrect', op: '>=', value: 3 }] },
  ],
  builder: [
    { title: 'Keep a cushion', goal: 'Finish a market holding at least one coin, without letting your cash drop below 10% of your money.', check: [{ metric: 'maxSingleExposurePct', op: '>', value: 0 }, { metric: 'minCashPct', op: '>=', value: 10 }] },
    { title: 'Dodge the rug', goal: 'Finish a market holding coins, with no BLOOP when it is rug pulled and no panic sale after bad news.', check: [{ metric: 'maxSingleExposurePct', op: '>', value: 0 }, { metric: 'heldBloopAtRug', op: '==', value: false }, { metric: 'panicSellsAfterNegativeEvents', op: '==', value: 0 }] },
    { title: 'Honest launch', goal: 'Launch your own coin with its pool locked, so nobody can pull its money out.', check: [{ metric: 'coinLaunched.lpLocked', op: '==', value: true }] },
  ],
};

const FILES = {
  gate: {
    tool: 'write_gate',
    describe: 'The Money Health Check questions.',
    schema: byTier(list(3, question(3, { id: ID }))),
    ask: `Write the Money Health Check: for each tier, exactly 3 questions that test the money sense the tier's lens needs before entering the lab. A kid who thinks carefully gets at least 2 of 3; one question per tier may be a little harder.
- explorer: choosing between wants with limited L$, saving and waiting, and scarcity.
- trader: concentration risk, supply and demand, and hype.
- builder: unlocks and vesting, liquidity and pool locks, and fake volume or rug-pull red flags.`,
  },
  lessons: {
    tool: 'write_lessons',
    describe: 'One lesson per tier.',
    schema: byTier(LESSON),
    ask: `Write one lesson per tier. A player sees it after missing the check, so it teaches the tier's lens from zero, step by step, and builds up to the quiz.
- Exactly 4 cards. Use each interaction type exactly once per lesson: reveal, choice, toggle and slider.
- The card body introduces the idea and, when it helps, invites the interaction ("Slide to see...").
- The slider maths must be exactly right at every position, and its label, resultLabel and units must describe that maths.
- The quiz is one question on the lesson's main idea.
- explorer: why rare things cost more (scarcity). trader: spreading risk and the hype cycle. builder: the anatomy of a launch and how to spot a rug pull.`,
  },
  events: {
    tool: 'write_events',
    describe: 'Penny’s news popup for each market event and tier.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: EVENTS.map((e) => e.id),
      properties: Object.fromEntries(EVENTS.map((e) => [e.id, byTier(EVENT_ENTRY, e.tiers)])),
    },
    ask: `Write Penny's news popup for every market event and every tier that sees it. The market pauses, the player reads the headline, Penny reads the narration, then asks one question that checks the idea from the narration.
- Tell the same event differently per tier: explorer simplest, builder the most detail.
- Penny speaks the moment the event fires, with the market paused. Say what just happened, and say what may come next with "may" or "watch". Never tell later moves as if they already happened.
- Do not mention the day; the popup already shows it.
- Headlines in sentence case, like "PEG dips below L$1.00".
- The question may ask what a calm player does in the lab, but never give buy or sell advice.
Events, what the player sees, and the tiers that get each one:
${EVENTS.map((e) => `- ${e.id} (${e.coin}; tiers: ${e.tiers.join(', ')}): ${EVENT_NOTES[e.id]}`).join('\n')}`,
  },
  ...PATH_FILES,
  tutor_faq: {
    tool: 'write_tutor_faq',
    describe: 'Suggested "Ask Penny" questions and answers per tier.',
    schema: byTier(
      list(6, {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'question', 'answer'],
        properties: { id: ID, question: str(70, 'As the kid would ask it, at most 10 words.'), answer: str(420, 'Penny’s answer, at most 60 words.') },
      }),
    ),
    ask: `Write the suggested questions for "Ask Penny": exactly 6 per tier, as a kid of that age would ask them, each with Penny's answer.
- Cover: whether this is real money; what L$ and a coin are; why prices move; two questions on the tier's lens; and how the Money Health Score works.
- Replace one of those with a question a curious kid asks about real crypto or real money. Penny answers with a friendly redirect: she never gives advice about real money, the lab is a safe place to practise, and a trusted adult is the right person to ask.`,
  },
};

const LIMITS = { options: 10, prompt: 25, explain: 35, body: 45, narration: 60, answer: 60, headline: 7, question: 10, title: 6, reveal: 25, result: 16 };

// ---------------------------------------------------------------- checks

function validate(schema, value, path = '$', out = []) {
  if (schema.anyOf) {
    const fits = schema.anyOf.map((s) => validate(s, value, path, []));
    if (!fits.some((e) => e.length === 0)) {
      const best = fits.reduce((a, b) => (b.length < a.length ? b : a));
      out.push(...best);
    }
    return out;
  }
  if ('const' in schema && value !== schema.const) out.push(`${path}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) out.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  const type = schema.type;
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out.push(`${path}: must be an object`), out;
    for (const k of schema.required || []) if (!(k in value)) out.push(`${path}.${k}: missing`);
    for (const k of Object.keys(value)) {
      if (schema.properties?.[k]) validate(schema.properties[k], value[k], `${path}.${k}`, out);
      else if (schema.additionalProperties === false) out.push(`${path}.${k}: not allowed`);
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) return out.push(`${path}: must be an array`), out;
    if (schema.minItems != null && value.length < schema.minItems) out.push(`${path}: needs ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) out.push(`${path}: at most ${schema.maxItems} items`);
    value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`, out));
  } else if (type === 'string') {
    if (typeof value !== 'string') return out.push(`${path}: must be a string`), out;
    if (schema.minLength && value.trim().length < schema.minLength) out.push(`${path}: empty`);
    if (schema.maxLength && value.length > schema.maxLength) out.push(`${path}: longer than ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${path}: must match ${schema.pattern}`);
  } else if (type === 'integer' || type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (type === 'integer' && !Number.isInteger(value))) return out.push(`${path}: must be a ${type}`), out;
    if (schema.minimum != null && value < schema.minimum) out.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) out.push(`${path}: above ${schema.maximum}`);
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) out.push(`${path}: must be above ${schema.exclusiveMinimum}`);
  }
  return out;
}

function* strings(value, path = '$') {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`);
}

const words = (s) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BANNED = [
  ...facts.banned.words.map((w) => [new RegExp(`\\b${escape(w)}\\b`, 'i'), `names "${w}"`]),
  ...facts.banned.tickers.map((w) => [new RegExp(`\\b${w}\\b`), `uses the real ticker ${w}`]),
  ...facts.banned.phrases.map((w) => [new RegExp(`(^|\\W)${escape(w)}(\\W|$)`, 'i'), `uses "${w}"`]),
];
const CONTRADICTIONS = [
  [/halving[^.]*\b(doubles?|more new coins|increases?)\b/i, 'a halving cuts new coins in half (facts: halving)'],
  [/unlock\w*[^.]*\b(reduces?|decreases?|shrinks?|lowers?)\s+(the\s+)?(circulating\s+)?supply/i, 'unlocks increase circulating supply (facts: unlock)'],
  [/\b(stablecoins?|PEG)\b[^.]*\b(can(not|'t|’t)|never)\b[^.]*\b(depeg|drop|fall|slip|change)/i, 'stablecoins can depeg (facts: stablecoin)'],
  [/\b(PEG|stablecoins?)\b[^.]*\b(always|guaranteed)\b[^.]*\bL\$\s?1\b/i, 'stablecoins can depeg (facts: stablecoin)'],
];
// The idea each event's narration must carry (facts.json), as a word that has to appear.
const MUST_MENTION = {
  hype_wave: /hype|excite|everyone/i,
  halving: /half|halv/i,
  unlock: /unlock/i,
  whale_dump: /\b(sold|sell|sells|selling|dump)/i,
  rug_pull: /pool|liquidity/i,
  depeg_scare: /L\$1(\.00)?\b/,
  wash_volume: /volume/i,
  copycat: /copy|look-alike|lookalike|fake/i,
  copycat_rug: /pool|liquidity/i,
};

function check(name, data) {
  const errors = validate(FILES[name].schema, data);
  if (errors.length) return errors;
  for (const [path, text] of strings(data)) {
    const field = path.match(/\.(\w+)(\[\d+\])?$/)?.[1];
    if (LIMITS[field] && words(text) > LIMITS[field]) errors.push(`${path}: ${words(text)} words, the limit is ${LIMITS[field]}`);
    for (const [re, why] of BANNED) if (re.test(text)) errors.push(`${path}: ${why}`);
    for (const [re, why] of CONTRADICTIONS) if (re.test(text)) errors.push(`${path}: contradicts a fact, ${why}`);
    if (/\p{Extended_Pictographic}/u.test(text)) errors.push(`${path}: no emoji`);
    if (/[^\x20-\x7E£·×÷−–—‘’“”…↑↓→]/.test(text)) errors.push(`${path}: unexpected character, English text only`);
    if (/\b(million|\d{1,3}(,\d{3}){2,})\b/i.test(text) && /\b(cap|capped|limit|maximum|max|most)\b/i.test(text) && /VAULT/.test(text) && !/21(,000,000| million)/.test(text))
      errors.push(`${path}: VAULT's cap is 21,000,000 (facts: vault_cap)`);
  }
  const lists = name === 'tutor_faq' ? TIERS.map((t) => data[t]) : name === 'gate' ? TIERS.map((t) => data[t]) : [];
  for (const items of lists) {
    const ids = items.map((x) => x.id);
    if (new Set(ids).size !== ids.length) errors.push(`duplicate ids: ${ids.join(', ')}`);
  }
  for (const [path, q] of questions(name, data)) {
    const seen = new Set(q.options.map((o) => o.trim().toLowerCase()));
    if (seen.size !== q.options.length) errors.push(`${path}: two options are the same`);
    if (q.options.some((o) => /\b(all|none|both) of (the|these) (above|answers|options)\b/i.test(o))) errors.push(`${path}: no "all/none of the above"`);
  }
  for (const [path, lesson] of allLessons(name, data)) {
    const types = lesson.cards.map((c) => c.interaction.type).sort().join(',');
    if (types !== 'choice,reveal,slider,toggle') errors.push(`${path}.cards: use reveal, choice, toggle and slider once each (got ${types})`);
    lesson.cards.forEach((c, i) => {
      if (c.interaction.type === 'slider') errors.push(...sliderErrors(c.interaction, `${path}.cards[${i}].interaction`));
    });
  }
  if (name === 'events') {
    for (const e of EVENTS) for (const t of e.tiers) if (!MUST_MENTION[e.id].test(data[e.id][t].narration)) errors.push(`$.${e.id}.${t}.narration: must explain the event's idea (expected ${MUST_MENTION[e.id]})`);
  }
  return errors;
}

function sliderErrors(s, path) {
  const errors = [];
  if (!(s.min < s.max)) return [`${path}: min must be below max`];
  const steps = (s.max - s.min) / s.step;
  if (Math.abs(steps - Math.round(steps)) > 1e-9 || steps < 2 || steps > 100) errors.push(`${path}: (max − min) ÷ step must be a whole number from 2 to 100`);
  const onStep = (Math.round(((s.start - s.min) / s.step) * 1e9) / 1e9) % 1 === 0;
  if (s.start < s.min || s.start > s.max || !onStep) errors.push(`${path}: start must be a slider position`);
  if (s.formula === 'divide' && s.min < 1) errors.push(`${path}: divide needs min of at least 1`);
  for (const x of positions(s)) {
    const r = compute(s, x);
    if (!Number.isFinite(r) || r < 0) errors.push(`${path}: result ${r} at ${x} is not a sensible amount`);
  }
  return errors;
}
const positions = (s) => Array.from({ length: Math.round((s.max - s.min) / s.step) + 1 }, (_, i) => +(s.min + i * s.step).toFixed(6));
const compute = (s, x) => (s.formula === 'divide' ? s.constant / x : s.formula === 'multiply' ? x * s.constant : s.constant - x);

// Every lesson in a file, as [path, lesson].
function* allLessons(name, data) {
  if (name === 'lessons') for (const t of TIERS) yield [`$.${t}`, data[t]];
  if (name.startsWith('path_')) for (const [l, lesson] of data.lessons.entries()) yield [`$.lessons[${l}]`, lesson];
}

// Every multiple-choice question in a file, as [path, {prompt, options, answerIndex}].
function* questions(name, data) {
  if (name === 'gate') for (const t of TIERS) for (const [i, q] of data[t].entries()) yield [`$.${t}[${i}]`, q];
  for (const [path, lesson] of allLessons(name, data)) {
    for (const [i, c] of lesson.cards.entries()) if (c.interaction.type === 'choice') yield [`${path}.cards[${i}].interaction`, c.interaction];
    yield [`${path}.quiz`, lesson.quiz];
  }
  if (name.startsWith('path_')) for (const [i, q] of data.checkpoint.questions.entries()) yield [`$.checkpoint.questions[${i}]`, q];
  if (name === 'events') for (const e of EVENTS) for (const t of e.tiers) yield [`$.${e.id}.${t}.question`, data[e.id][t].question];
}

// Moves each correct option to a fixed, balanced position sequence, so the answer key has no pattern.
function shuffle(name, data) {
  const seq3 = [1, 2, 0, 2, 0, 1, 0, 1, 2];
  const seq2 = [1, 0, 0, 1];
  let n3 = 0;
  let n2 = 0;
  for (const [, q] of questions(name, data)) {
    const target = q.options.length === 3 ? seq3[n3++ % seq3.length] : seq2[n2++ % seq2.length];
    const right = q.options[q.answerIndex];
    const wrong = q.options.filter((_, i) => i !== q.answerIndex);
    wrong.splice(target, 0, right);
    q.options = wrong;
    q.answerIndex = target;
  }
}

// ---------------------------------------------------------------- Claude

async function claude({ system, messages, tool }) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        system,
        messages,
        tools: [tool],
        // This model accepts only tool_choice auto, so the tool is the only one offered and the prompt asks for it.
        tool_choice: { type: 'auto' },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 3000 * attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${body?.error?.message || 'request failed'}`);
    if (body.stop_reason === 'max_tokens') throw new Error('Claude ran out of output tokens');
    const use = body.content.find((b) => b.type === 'tool_use' && b.name === tool.name);
    if (!use) throw new Error(`Claude did not call ${tool.name}`);
    return { use, content: body.content };
  }
}

const REVIEW_TOOL = {
  name: 'report_problems',
  description: 'Report every real problem in the content. An empty list means it can ship.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['problems'],
    properties: {
      problems: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'quote', 'problem', 'severity'],
          properties: {
            path: { type: 'string' },
            quote: { type: 'string' },
            problem: { type: 'string' },
            severity: { enum: ['error', 'warning'], description: 'error: must be fixed before kids see it. warning: a human reviewer should look.' },
          },
        },
      },
    },
  },
};

async function review(name, data) {
  const sliders = [];
  for (const [path, lesson] of allLessons(name, data))
    lesson.cards.forEach((c, i) => {
      const s = c.interaction;
      if (s.type === 'slider') sliders.push(`${path}.cards[${i}]: "${s.label}" at ${[s.min, s.start, s.max].map((x) => `${x}${s.valueUnit} → "${s.resultLabel}" ${+compute(s, x).toFixed(2)}${s.unit}`).join('; ')}`);
    });
  const { use } = await claude({
    system: `You are the strict content reviewer for Market Lab, an educational market simulation for kids aged 8 to 16. Check content against these canonical facts and rules.\n\nFacts:\n${facts.facts.map((f) => `- [${f.id}] ${f.text}`).join('\n')}\n\nRules:\n${facts.rules.map((r) => `- ${r}`).join('\n')}`,
    messages: [
      {
        role: 'user',
        content: `Review this ${name}.json (${FILES[name].describe}). Report only real problems: a statement that contradicts a fact or is false, an answer key that is wrong, a wrong option that could also be defended as right, slider maths that does not match its label, a line too hard or too babyish for its tier (explorer 8–12, trader 13–15, builder 16+), scary or hype tone, buy or sell advice, a real coin, company or person, or wording that is unclear when read aloud. Quote the exact text. Call report_problems with your findings.${sliders.length ? `\n\nSlider values as the app computes them:\n${sliders.join('\n')}` : ''}\n\n${JSON.stringify(data, null, 1)}`,
      },
    ],
    tool: REVIEW_TOOL,
  });
  return use.input.problems;
}

// A second Claude answers every question without seeing the key. Any disagreement means the question is ambiguous.
async function blindCheck(name, data) {
  const qs = [...questions(name, data)];
  if (!qs.length) return [];
  const { use } = await claude({
    system: 'You are a careful 16-year-old student taking a quiz about money and markets in a classroom simulation called Market Lab. Lab facts:\n' + facts.facts.map((f) => `- ${f.text}`).join('\n'),
    messages: [{ role: 'user', content: `Answer every question with the index of the best option (0-based), then call submit_answers.\n\n${qs.map(([path, q]) => `${path}: ${q.prompt}\n${q.options.map((o, i) => `  ${i}. ${o}`).join('\n')}`).join('\n\n')}` }],
    tool: {
      name: 'submit_answers',
      description: 'Submit the chosen option for every question.',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['answers'],
        properties: { answers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['path', 'index'], properties: { path: { type: 'string' }, index: { type: 'integer' } } } } },
      },
    },
  });
  const picked = new Map(use.input.answers.map((a) => [a.path, a.index]));
  return qs.filter(([path, q]) => picked.get(path) !== q.answerIndex).map(([path, q]) => `${path}: a blind reader picked "${q.options[picked.get(path)] ?? 'nothing'}" instead of "${q.options[q.answerIndex]}". Make the correct option clearly the only right one.`);
}

async function generate(name) {
  const spec = FILES[name];
  const tool = { name: spec.tool, description: `Write ${name}.json: ${spec.describe}`, input_schema: spec.schema };
  const messages = [{ role: 'user', content: `${spec.ask}\n\nCall ${spec.tool} with the complete file.` }];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const { use, content } = await claude({ system: SYSTEM, messages, tool });
    const data = use.input;
    let problems = check(name, data);
    let warnings = [];
    if (!problems.length) {
      shuffle(name, data);
      const [found, blind] = await Promise.all([review(name, data), blindCheck(name, data)]);
      problems = [...found.filter((p) => p.severity === 'error').map((p) => `${p.path}: "${p.quote}" ${p.problem}`), ...blind];
      warnings = found.filter((p) => p.severity === 'warning').map((p) => `${p.path}: "${p.quote}" ${p.problem}`);
    }
    log(name, `attempt ${attempt}: ${problems.length} problem(s), ${warnings.length} warning(s)`);
    if (!problems.length) {
      if (name === 'lessons') for (const t of TIERS) data[t].quiz = { id: 'quiz', ...data[t].quiz };
      if (name === 'tutor_faq') for (const t of TIERS) data[t] = data[t].map((x) => ({ ...x, source: 'claude' }));
      // Stable key order: events in scenario order, tiers youngest first.
      const pick = (keys, obj) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
      const out = name === 'events' ? Object.fromEntries(EVENTS.map((e) => [e.id, pick(TIERS, data[e.id])])) : pick(TIERS, data);
      if (name.startsWith('path_')) writePath(name.split('_')[1], Number(name.split('_')[2]), data);
      else writeFileSync(join(DATA, `${name}.json`), `${JSON.stringify(out, null, 2)}\n`);
      return { name, ok: true, attempts: attempt, warnings };
    }
    problems.forEach((p) => log(name, `  - ${p}`));
    messages.push(
      { role: 'assistant', content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Fix these problems and call ${spec.tool} again with the complete corrected file. Keep everything else that was fine.\n${problems.map((p) => `- ${p}`).join('\n')}` }] },
    );
  }
  return { name, ok: false, attempts: ATTEMPTS, warnings: [] };
}

// path.json = { tier: { units: [{ id, title, intro, nodes: [lesson, lesson, mission, checkpoint] }] } }.
// Each call writes its own unit into the file (synchronously, so parallel calls can't interleave).
function writePath(tier, unitNo, u) {
  let all = {};
  try {
    all = JSON.parse(readFileSync(join(DATA, 'path.json'), 'utf8'));
  } catch {}
  const id = String(unitNo);
  const units = all[tier]?.units ? [...all[tier].units] : [];
  units[unitNo - 1] = {
    id,
    title: u.title,
    intro: u.intro,
    nodes: [
      ...u.lessons.map((l, j) => ({ id: `u${id}-l${j + 1}`, type: 'lesson', title: l.title, lesson: { ...l, quiz: { id: 'quiz', ...l.quiz } }, ...(id === '3' && { explore: true }) })),
      { id: `u${id}-m`, type: 'mission', ...MISSIONS[tier][unitNo - 1] },
      { id: `u${id}-c`, type: 'checkpoint', title: `${u.title} checkpoint`, questions: u.checkpoint.questions },
    ],
  };
  all[tier] = { units };
  const ordered = Object.fromEntries(TIERS.filter((x) => x in all).map((x) => [x, all[x]]));
  writeFileSync(join(DATA, 'path.json'), `${JSON.stringify(ordered, null, 2)}\n`);
}

function log(name, msg) {
  process.stderr.write(`[${name}] ${msg}\n`);
}

function loadEnv(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`Missing ${file}. Copy .env.example there and fill it in.`);
  }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const wanted = names.length ? names : Object.keys(FILES);
const unknown = wanted.filter((n) => !FILES[n]);
if (unknown.length) {
  console.error(`Unknown file: ${unknown.join(', ')}. Choose from ${Object.keys(FILES).join(', ')}.`);
  process.exit(1);
}
// --check runs the rule checks on the files as they are, for example after a human edit. No API calls.
if (process.argv.includes('--check')) {
  let bad = 0;
  for (const n of wanted.filter((x) => !x.startsWith('path_'))) {
    const data = read(`${n}.json`);
    if (n === 'lessons') for (const t of TIERS) delete data[t]?.quiz?.id;
    if (n === 'tutor_faq') for (const t of TIERS) for (const x of data[t] || []) delete x.source;
    const errors = check(n, data);
    console.log(`${errors.length ? 'FAIL' : 'ok'} public/data/${n}.json${errors.map((e) => `
  - ${e}`).join('')}`);
    bad += errors.length;
  }
  process.exit(bad ? 1 : 0);
}
if (!env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set in ../u-hackathon-2026-private/.env');
  process.exit(1);
}
console.log(`Generating ${wanted.join(', ')} with ${MODEL}…`);
const results = await Promise.all(wanted.map((n) => generate(n).catch((err) => ({ name: n, ok: false, error: err.message, warnings: [] }))));
for (const r of results) {
  console.log(`${r.ok ? 'wrote' : 'FAILED'} public/data/${r.name}.json${r.attempts ? ` (${r.attempts} attempt${r.attempts > 1 ? 's' : ''})` : ''}${r.error ? `: ${r.error}` : ''}`);
  for (const w of r.warnings) console.log(`  review: ${w}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
