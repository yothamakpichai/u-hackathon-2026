# U-Hackathon 2026 — Eduu (team Cenedury) — BRIEF

Single source of truth for this repo. Read all of it before doing anything.

## 0. Hard facts

- Event: U-Hackathon 2026, AI track. Build window Thu 15 Oct 11:30 → **Fri 16 Oct 14:00 ICT (submissions close)**.
- Rule: "Existing Project is NOT allowed. Pre-research is acceptable." Every line of code in this repo is written during the build window. Do not import code from other repos.
- Submission: public GitHub repo, a demo website that shows the real product (not a landing page), and a pitch deck.
- Judging: App execution 40%, Practicality 40%, Usability & design 10% (intuitive navigation, clear flow, readable design, helpful errors, accessibility), Innovation & ecosystem 5% (partner: ElevenLabs), U-Bot integration 5%.
- First-round judges review the submitted links **without us present**, probably on a phone, possibly hours after submission. The worst moment of the demo sets the score. Every path must work, every state must explain itself, and no feature may be half-finished. Delete unfinished features instead of disabling them.
- Production URL: `https://u-hackathon-2026.cenedury.com`. sv1 is Plesk with PHP 8.3. Plesk Git auto-deploys `main` on every push. The document root is `public/`.

## 1. Product

**Vision line (pitch, not scope):** Cenedury builds the global standard for education quality: measuring whether students become thinkers and builders, not test-takers.

**What we ship in 24h (the wedge):** A teacher records a 1–2 minute spoken note about their week of teaching, in Thai. Eduu:
1. transcribes it (ElevenLabs speech-to-text),
2. turns it into structured teaching evidence mapped to the official Thai teacher performance indicators (ว.PA, ก.ค.ศ. circular ว 9/2564),
3. scores how much of the students' work was *creating/applying* versus *recalling* (the "Generativity" signal — the bridge to the vision),
4. shows which indicators still have no evidence, and suggests one concrete next step,
5. exports an A4 evidence report that the teacher can save as a PDF.

Every note becomes a data point. The evidence board shows quality accumulating over weeks.

**Users:** Thai government-school teachers, who carry a heavy ว.PA documentation burden. Judges must also be able to use the demo without speaking Thai and without a microphone (see §4).

## 2. Stack and constraints

- Vanilla PHP 8.3 (no framework), vanilla JS (ES modules, no build step, no npm runtime dependencies), vanilla CSS. Google Fonts: **IBM Plex Sans Thai** for body text, **Baloo 2** for the wordmark only.
- Brand: education green `#0DA678` as primary, plus one amber "spark" accent (pick a hex that passes WCAG AA where used as text; record it in DECISIONS.md). Light theme first; dark theme only if time allows.
- **No database.** The server is a stateless PHP API with a file cache. Client state, meaning the visitor's own notes, lives in `localStorage` wrapped in try/catch. Seeded demo data ships as JSON in the repo. Reason: fewer moving parts at judging time.
- Secrets and writable state live **outside the repo** in a sibling directory named `u-hackathon-2026-private/`, resolved as `dirname(REPO_ROOT) . '/u-hackathon-2026-private'`:
  - Production: `/var/www/vhosts/cenedury.com/u-hackathon-2026-private/`
  - Local (Yotha): `C:\Users\yotha-hack\code\u-hackathon-2026-private\`
  - Contents: `.env` (keys), `cache/`, `ratelimit/`. Create missing subdirectories at runtime with mode 0700.
- `.env` keys: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `ELEVENLABS_API_KEY`, `DAILY_AI_CAP` (default 400), `APP_ENV` (`local`|`production`). Commit `.env.example` with names only.
- The repo is **public forever**. No secrets, no personal data, no real teacher data in commits. A `.gitignore` covering `.env*` (except `.env.example`), `u-hackathon-2026-private/`, `node_modules/`, OS junk must be in the first code commit.
- Local dev server: `php -S 127.0.0.1:8000 -t public`.

## 3. Repo layout and ownership

```
public/                 docroot
  index.html            app shell (single page)          — Joewee
  assets/css/*.css                                        — Joewee
  assets/js/*.js        ES modules                       — Joewee
  assets/mock/*.json    API mocks for offline UI work    — Joewee
  api/transcribe.php    thin entrypoints → src/          — Yotha
  api/analyze.php                                         — Yotha
  api/health.php                                          — Yotha
src/                    PHP (not web-reachable)          — Yotha
  bootstrap.php         config, error handler, JSON responses, security headers
  Http.php  Config.php  RateLimit.php  Cache.php
  ElevenLabs.php  Anthropic.php  Analysis.php (schema validation)
data/                   versioned data                   — Yotha
  pa-indicators.json    the 15 indicators, TH + EN, with source note
  demo/teacher.json     fictional demo teacher, 8 weeks of notes + precomputed analyses
  demo/sample-note.*    a real recorded Thai sample note (added by the team)
docs/  BRIEF.md  DECISIONS.md  STATUS.md  EVIDENCE.md (user research, written by humans)
bin/check.mjs           the one check script
.claude/settings.json
```

Two people with two Claude Code sessions work in parallel on `main`. **Stay inside your own folders.** The only shared contract is §5. If the contract has to change, change it in this file first, in a separate commit.

## 4. Screens and flow (mobile-first, 360px and up; also 1440px desktop)

The app opens directly on the product. There is no marketing page.

1. **Board (home).** Shows the demo teacher "ครูตัวอย่าง (Demo)" by default, plus any notes the visitor has added.
   - Coverage of the 15 indicators across the 3 domains, drawn as a grid or heatmap: covered / weak / missing.
   - A Generativity trend over the weeks.
   - The latest notes.
   - One primary action: **"บันทึกสัปดาห์นี้ / Record this week"**.
   - A clearly visible label stating that this is sample data for a fictional teacher.
2. **Record.** Three ways to give a note, in this priority order:
   - **Use sample recording** — always visible. It plays and processes `data/demo/sample-note.*`. This is the judge path.
   - **Record** with the microphone (MediaRecorder; max 120 s; visible timer; cancel button).
   - **Type instead** (textarea). This also serves accessibility and the case where mic permission is denied.
3. **Review.** Shows the transcript (editable), then the analysis:
   - summary;
   - activities, each tagged recall / understand / apply / create;
   - evidence items, each with indicator id, claim and supporting quote;
   - Generativity score 0–100;
   - indicators still missing;
   - one next step.
   The teacher can edit before choosing **Save**. Saving adds the note to the board.
4. **Export.** An A4 print stylesheet producing a ว.PA evidence report: teacher info (editable header fields), an indicator-by-indicator table of evidence with dates, and the Generativity summary. Uses `window.print()` with a "Save as PDF" hint. Thai text must render correctly in print.
5. **Language toggle TH/EN** for all UI strings, kept in `assets/js/i18n.js`. AI output stays in the teacher's language.

Every async step needs loading, empty and error states. Error messages say what happened and what to do next, in TH and EN. Accessibility:
- WCAG AA contrast;
- full keyboard path;
- `aria-live` for status updates;
- visible focus;
- `prefers-reduced-motion` respected;
- tap targets at least 44px.

AI output must be inserted with `textContent` and never with `innerHTML`.

## 5. API contract (shared)

All responses are JSON with `Content-Type: application/json; charset=utf-8`.

Success responses look like `{"ok":true, ...}`. Errors look like this, with a matching HTTP status:

```json
{"ok":false,"error":{"code":"RATE_LIMITED","message_th":"...","message_en":"..."}}
```

`GET /api/health.php`
```json
{"ok":true,"stt":true,"ai":true,"cache_only":false,"version":"<git short sha or date>"}
```

`POST /api/transcribe.php` — multipart field `audio`:
- size ≤ 10 MB;
- MIME type verified server-side with finfo, allowlist `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/x-wav`;
- optional field `sample=1` means: use the bundled sample note.

```json
{"ok":true,"text":"...","source":"elevenlabs|cache"}
```

`POST /api/analyze.php` — JSON body `{"note":"...","subject":"","grade":"","week":"2026-W42"}`, note ≤ 6000 characters.

```json
{"ok":true,"source":"ai|cache","analysis":{
  "summary":"...",
  "activities":[{"text":"...","level":"recall|understand|apply|create"}],
  "evidence":[{"indicator":"1.3","claim":"...","quote":"..."}],
  "generativity":0-100,
  "missing":["2.4","3.2"],
  "next_step":"..."
}}
```

Server rules:
- `indicator` must exist in `pa-indicators.json`; drop any item that does not.
- `generativity` = round(100 × (apply + create) / total activities), computed **server-side** from the levels. Never trust a model-supplied number.
- `missing` = all indicator ids minus those with evidence in this note. The client merges across notes for the board.
- Errors: `BAD_INPUT`, `TOO_LARGE`, `UNSUPPORTED_AUDIO`, `RATE_LIMITED`, `UPSTREAM_FAILED`, `CAP_REACHED`, `SERVER_ERROR`.

Until the API is live, the frontend uses `assets/mock/*.json` when the URL has `?mock=1`, or automatically when `health.php` is unreachable on localhost.

## 6. Integrations and failure modes

- **ElevenLabs speech-to-text** (Scribe): `POST https://api.elevenlabs.io/v1/speech-to-text` with header `xi-api-key` and multipart `file` + `model_id`. Read the current docs to confirm the model id and the Thai language code before coding, and record what you used in DECISIONS.md.
- **Anthropic Messages API** via PHP cURL. Use a tool definition with a JSON `input_schema` to force structured output.
  - Timeout 25 s.
  - One retry on 429/5xx with backoff.
  - The system prompt treats the teacher note as untrusted data, never as instructions.
- **Cache:** key = sha256(model + prompt version + normalized input). Cache every successful AI and STT result. The sample note and all 8 demo weeks must be **pre-cached and committed** under `data/demo/` so the judge path works even if every upstream API is down.
- **Rate limit:** per IP, file-based token bucket. Transcribe: 6/min. Analyze: 10/min. A global daily cap of `DAILY_AI_CAP` paid calls applies; once reached, serve cache only and set `cache_only:true` in health. The UI then shows a calm banner explaining this.
- **U-Bot:** no public docs yet. Leave a clearly named integration point (`assets/js/ubot.js`, which does nothing until configured). Do not fake it.
- **Security headers** on every response:
  - a CSP allowing self plus Google Fonts only;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Permissions-Policy: microphone=(self)`.
  Also: no stack traces in production responses; log to `u-hackathon-2026-private/logs/`.

## 7. Data: ว.PA indicators (verify before shipping)

Structure as we understand ว 9/2564. **Verify it against the official ก.ค.ศ. text and record the source URL in `pa-indicators.json`.** If verification is not possible, keep the list but set `"verified": false`.

- Domain 1 การจัดการเรียนรู้:
  - 1.1 สร้างและหรือพัฒนาหลักสูตร
  - 1.2 ออกแบบการจัดการเรียนรู้
  - 1.3 จัดกิจกรรมการเรียนรู้
  - 1.4 สร้างและหรือพัฒนาสื่อ นวัตกรรม เทคโนโลยี และแหล่งเรียนรู้
  - 1.5 วัดและประเมินผลการเรียนรู้
  - 1.6 ศึกษา วิเคราะห์ และสังเคราะห์ เพื่อแก้ปัญหาหรือพัฒนาการเรียนรู้
  - 1.7 จัดบรรยากาศที่ส่งเสริมและพัฒนาผู้เรียน
  - 1.8 อบรมและพัฒนาคุณลักษณะที่ดีของผู้เรียน
- Domain 2 การส่งเสริมและสนับสนุนการจัดการเรียนรู้:
  - 2.1 จัดทำข้อมูลสารสนเทศของผู้เรียนและรายวิชา
  - 2.2 ดำเนินการตามระบบดูแลช่วยเหลือผู้เรียน
  - 2.3 ปฏิบัติงานวิชาการ และงานอื่น ๆ ของสถานศึกษา
  - 2.4 ประสานความร่วมมือกับผู้ปกครอง ภาคีเครือข่าย และหรือสถานประกอบการ
- Domain 3 การพัฒนาตนเองและวิชาชีพ:
  - 3.1 พัฒนาตนเองอย่างเป็นระบบและต่อเนื่อง
  - 3.2 มีส่วนร่วมในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ
  - 3.3 นำความรู้ ความสามารถ ทักษะที่ได้จากการพัฒนาตนเองและวิชาชีพมาใช้

Each indicator also gets an English label. The demo teacher is fictional (a grade 8 science teacher) and must be labelled as sample data everywhere it appears.

## 8. Phases

- **Phase A — end-to-end loop, deployed (target tonight 23:00).** Includes:
  - health;
  - analyze (with cache and rate limit);
  - typed-note path;
  - Board with demo data;
  - Review;
  - Save;
  - Export;
  - TH/EN toggle.
  It must work on `https://u-hackathon-2026.cenedury.com` from a phone. Then STOP and write `docs/STATUS.md`.
- **Phase B — voice and polish (overnight → Fri 10:00).** Includes:
  - transcribe with ElevenLabs;
  - mic recording;
  - sample-recording judge path;
  - pre-cached demo;
  - Generativity trend;
  - an accessibility pass;
  - a mobile pass.
- **Freeze Fri 12:00.** After freeze, only fixes for things that are broken.

## 9. Working rules

- One vertical slice per commit, message format `area: what changed`.
- `node bin/check.mjs` must pass before every commit. It runs:
  - `node --check` on all JS;
  - JSON validation of `data/` and `assets/mock/`;
  - `php -l` on all PHP (skipped with a warning if PHP is missing);
  - the PHP unit checks in `bin/` for Analysis validation and RateLimit (also skipped when PHP is missing).
- Before every commit run `git pull --rebase`. Push after every green commit, because production deploys from `main`.
- Never force push. Never change remotes. Never write files with PowerShell redirection. All times are stored in UTC and displayed in Asia/Bangkok.
- When this brief is ambiguous, choose the option with fewer moving parts, record it in `docs/DECISIONS.md`, and continue without asking.
