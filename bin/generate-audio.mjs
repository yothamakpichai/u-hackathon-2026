#!/usr/bin/env node
// Audio generator (BRIEF §9). ElevenLabs reads every narration line in gate, lessons and events into
// public/assets/audio/<id>.mp3 and records each clip's caption in manifest.json, so the app plays a clip only while
// its caption is unchanged (DECISIONS.md #10). Clips whose caption is unchanged are skipped. Before generating,
// it counts the characters and checks the remaining quota; if the quota is short, event narrations go first.
//   node bin/generate-audio.mjs [--plan] [--voice <premade voice id>]
// Reads ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID from ../u-hackathon-2026-private/.env. Never prints the key.

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');
const AUDIO = join(ROOT, 'public', 'assets', 'audio');
const MANIFEST = join(AUDIO, 'manifest.json');
const TIERS = ['explorer', 'trader', 'builder'];
const MODEL_ID = 'eleven_v4'; // "our highest quality audio" in the ElevenLabs model docs (DECISIONS.md)
const OUTPUT = 'mp3_44100_64'; // speech only, so 64 kbps keeps clips small for phones
const API = 'https://api.elevenlabs.io';

const args = process.argv.slice(2);
const plan = args.includes('--plan');
const env = loadEnv(join(dirname(ROOT), 'u-hackathon-2026-private', '.env'));
const voiceId = args.includes('--voice') ? args[args.indexOf('--voice') + 1] : env.ELEVENLABS_VOICE_ID;
if (!env.ELEVENLABS_API_KEY || !voiceId) fail('ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID (or --voice <id>) are needed.');
const read = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));

// Clip ids are the ones the screens ask for (gate.js, lesson.js, lab.js). Order = priority when the quota is short.
function clips() {
  const gate = read('gate.json');
  const lessons = read('lessons.json');
  const events = read('events.json');
  const ev = Object.entries(events).flatMap(([id, byTier]) => TIERS.filter((t) => byTier[t]).map((t) => [`event-${id}-${t}`, byTier[t]]));
  const groups = [
    ev.map(([id, e]) => [id, e.narration]),
    TIERS.flatMap((t) => gate[t].map((q) => [`gate-${t}-${q.id}`, q.prompt])),
    TIERS.flatMap((t) => lessons[t].cards.map((c, i) => [`lesson-${t}-${i + 1}`, c.body])),
    ev.map(([id, e]) => [`${id}-question`, e.question.prompt]),
    TIERS.map((t) => [`lesson-${t}-quiz`, lessons[t].quiz.prompt]),
    ev.filter(([, e]) => e.question.explain).map(([id, e]) => [`${id}-question-explain`, e.question.explain]),
    TIERS.flatMap((t) => gate[t].map((q) => [`gate-${t}-${q.id}-explain`, q.explain])),
    TIERS.map((t) => [`lesson-${t}-quiz-explain`, lessons[t].quiz.explain]),
    pathUnitOne(),
  ];
  return groups.flat().map(([id, text]) => ({ id, text, speech: speakable(text) }));
}

// Learning Path (BRIEF §14 Y8): audio for Unit 1 only. Later units are text-only, so they get no Listen button.
function pathUnitOne() {
  let path = {};
  try {
    path = read('path.json');
  } catch {
    return [];
  }
  const out = [];
  for (const t of TIERS) {
    for (const n of path[t]?.units?.[0]?.nodes || []) {
      const id = `path-${t}-${n.id}`;
      if (n.type === 'lesson') {
        n.lesson.cards.forEach((c, i) => out.push([`${id}-${i + 1}`, c.body]));
        out.push([`${id}-quiz`, n.lesson.quiz.prompt], [`${id}-quiz-explain`, n.lesson.quiz.explain]);
      }
      if (n.type === 'checkpoint') n.questions.forEach((q, i) => out.push([`${id}-q${i + 1}`, q.prompt], [`${id}-q${i + 1}-explain`, q.explain]));
    }
  }
  return out;
}

// The caption stays as written; only what Penny says is adjusted, so "L$50" is read as "50 Lab Dollars".
function speakable(text) {
  return text
    .replace(/L\$\s?(\d[\d,]*(?:\.\d+)?)/g, (_, n) => `${n.replace(/\.00$/, '')} Lab ${Number(n.replace(/,/g, '')) === 1 ? 'Dollar' : 'Dollars'}`)
    .replace(/\bL\$/g, 'Lab Dollars')
    .replace(/\b(VAULT|EDUU|PEG|FUEL|ORBIT|ZOOMZ|BLOOP)\b/g, (w) => w[0] + w.slice(1).toLowerCase())
    .replace(/\bx\s*[·×*]\s*y\s*=\s*k\b/gi, 'x times y equals k')
    .replace(/\b1:1\b/g, 'one to one')
    .replace(/\s*×\s*/g, ' times ')
    .replace(/\s*÷\s*/g, ' divided by ')
    .replace(/\s+−\s+/g, ' minus ')
    .replace(/[↑↓→]\s*/g, '')
    .replace(/\bvs\.?\s/g, 'versus ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function api(path, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API + path, { ...init, headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, ...init.headers } });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`ElevenLabs ${res.status} on ${path.split('?')[0]}: ${body?.detail?.message || body?.detail || 'request failed'}`);
    }
    return res;
  }
}

const seedOf = (id) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

const all = clips();
const ids = new Set(all.map((c) => c.id));
const dupes = all.length - ids.size;
if (dupes) fail(`${dupes} clip ids are used twice; ids must be unique.`);

let manifest = {};
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch {}
const mp3 = (id) => join(AUDIO, `${id}.mp3`);
const pending = all.filter((c) => manifest[c.id] !== c.text || !existsSync(mp3(c.id)));
const need = pending.reduce((n, c) => n + c.speech.length, 0);

const sub = await (await api('/v1/user/subscription')).json();
const remaining = sub.character_limit - sub.character_count;
const voice = await (await api(`/v1/voices/${voiceId}`)).json();
console.log(`Voice: ${voice.name} (${voice.voice_id}, ${voice.category}). Model: ${MODEL_ID}, ${OUTPUT}.`);
console.log(`Clips: ${all.length} in content, ${pending.length} to generate, ${need.toLocaleString('en')} characters.`);
console.log(`Quota: ${remaining.toLocaleString('en')} of ${sub.character_limit.toLocaleString('en')} characters left (${sub.tier}).`);
if (voice.category !== 'premade') fail(`The brief asks for a premade library voice, and this one is "${voice.category}". Pass --voice <premade voice id>.`);
if (plan) process.exit(0);

let budget = remaining;
const queue = [];
const missing = [];
for (const c of pending) {
  if (c.speech.length <= budget) {
    budget -= c.speech.length;
    queue.push(c);
  } else missing.push(c);
}

let sent = 0;
const failed = [];
async function worker() {
  for (let c = queue.shift(); c; c = queue.shift()) {
    try {
      const res = await api(`/v1/text-to-speech/${voiceId}?output_format=${OUTPUT}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text: c.speech, model_id: MODEL_ID, seed: seedOf(c.id) }),
      });
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 1000) throw new Error(`only ${bytes.length} bytes came back`);
      writeFileSync(mp3(c.id), bytes);
      manifest[c.id] = c.text;
      sent += c.speech.length;
      process.stderr.write(`  ${c.id} ${kb(bytes.length)}\n`);
    } catch (err) {
      failed.push(`${c.id}: ${err.message}`);
    }
  }
}
await Promise.all([worker(), worker(), worker()]);

// Keep only clips that exist and still match their caption, in priority order; delete audio for lines that are gone.
const next = {};
for (const c of all) if (manifest[c.id] === c.text && existsSync(mp3(c.id))) next[c.id] = c.text;
writeFileSync(MANIFEST, `${JSON.stringify(next, null, 2)}\n`);
for (const f of readdirSync(AUDIO)) if (/^(gate|lesson|event|path)-[a-z0-9_-]+\.mp3$/.test(f) && !ids.has(f.slice(0, -4))) unlinkSync(join(AUDIO, f));

const size = Object.keys(next).reduce((n, id) => n + statSync(mp3(id)).size, 0);
const after = await (await api('/v1/user/subscription')).json();
console.log(`Done: ${Object.keys(next).length} of ${all.length} clips have audio, ${(size / 1048576).toFixed(2)} MB in total.`);
console.log(`Characters: ${sent.toLocaleString('en')} sent this run; the account counter went from ${sub.character_count.toLocaleString('en')} to ${after.character_count.toLocaleString('en')}.`);
if (missing.length) console.log(`Not enough quota for ${missing.length} clips:\n${missing.map((c) => `  ${c.id} (${c.speech.length} chars)`).join('\n')}`);
if (failed.length) console.log(`Failed:\n${failed.map((f) => `  ${f}`).join('\n')}`);
process.exit(failed.length || missing.length ? 1 : 0);

function loadEnv(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    fail(`Missing ${file}. Copy .env.example there and fill it in.`);
  }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
