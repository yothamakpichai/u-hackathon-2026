#!/usr/bin/env node
// Repo check (BRIEF §13). Run before every commit: node bin/check.mjs
//   1. every JS file parses as an ES module (vendor/ is third-party and skipped)
//   2. every JSON file parses
//   3. unit tests pass (*.test.mjs, e.g. public/assets/js/sim/)
//   4. php -l on every PHP file, when PHP is installed
//   5. guards for hard rules in the brief (determinism, English only, CSP, no third-party requests, no secrets)
// Exits 1 on any failure. Warnings print but do not fail.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const TEXT = /\.(m?js|json|css|html|svg|php|md|txt|htaccess)$|^\.htaccess$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else out.push({ abs, rel: relative(ROOT, abs).split(sep).join('/'), name: entry.name });
  }
  return out;
}

const files = walk(ROOT);
const read = (f) => (f.text ??= readFileSync(f.abs, 'utf8'));
// JS source without comments, so guards don't trip on comments that name the rule.
const code = (f) => (f.code ??= read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1'));
const failures = [];
const warnings = [];
const isVendor = (f) => f.rel.includes('/vendor/');
const ours = (f) => !isVendor(f) && f.rel !== 'bin/check.mjs';

function section(label, run) {
  const before = failures.length;
  const note = run();
  const failed = failures.length - before;
  console.log(`${failed ? 'FAIL' : 'ok  '}  ${label}${note ? ` (${note})` : ''}`);
}

// 1. JavaScript syntax
section('JavaScript parses', () => {
  const js = files.filter((f) => /\.m?js$/.test(f.name) && !isVendor(f));
  for (const f of js) {
    // Plain `node --check file.js` silently passes broken ES modules when there is no package.json "type",
    // so feed the source in as a module explicitly.
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: read(f), encoding: 'utf8' });
    if (r.status !== 0) failures.push(`${f.rel}: syntax error\n${String(r.stderr).replaceAll('[stdin]', f.rel).trim()}`);
  }
  return `${js.length} files`;
});

// 2. JSON validity
section('JSON parses', () => {
  const json = files.filter((f) => f.name.endsWith('.json'));
  for (const f of json) {
    try {
      JSON.parse(read(f));
    } catch (err) {
      failures.push(`${f.rel}: invalid JSON: ${err.message}`);
    }
  }
  return `${json.length} files`;
});

// 3. Unit tests
section('Unit tests pass', () => {
  const tests = files.filter((f) => f.name.endsWith('.test.mjs'));
  for (const f of tests) {
    const r = spawnSync(process.execPath, [f.abs], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    if (r.status !== 0) {
      const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-25).join('\n');
      failures.push(`${f.rel}: test failed (exit ${r.status ?? r.signal})\n${out}`);
    }
  }
  return tests.length ? `${tests.length} files` : 'none yet';
});

// 4. PHP lint
section('PHP lints', () => {
  const php = files.filter((f) => f.name.endsWith('.php'));
  if (!php.length) return 'no PHP files yet';
  const probe = spawnSync('php', ['-v'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    warnings.push('PHP not found: php -l skipped.');
    return 'skipped, PHP not installed';
  }
  for (const f of php) {
    const r = spawnSync('php', ['-l', f.abs], { encoding: 'utf8' });
    if (r.status !== 0) failures.push(`${f.rel}: php -l failed\n${`${r.stdout}${r.stderr}`.trim()}`);
  }
  return `${php.length} files`;
});

// 5. Hard rules from the brief
section('Brief guards', () => {
  const textFiles = files.filter((f) => TEXT.test(f.name));
  for (const f of textFiles) {
    const src = read(f);

    // English only, everywhere (§0).
    if (/[฀-๿]/.test(src) && ours(f)) failures.push(`${f.rel}: contains Thai text; the app is English only (§0).`);

    // Never commit secrets (§13).
    if (/sk-ant-[A-Za-z0-9_-]{16,}|\bsk_[a-f0-9]{32,}\b/.test(src)) failures.push(`${f.rel}: looks like an API key. Secrets live in ../u-hackathon-2026-private/.env.`);
  }

  // Sim determinism (§5): no Math.random() in the sim.
  for (const f of files.filter((x) => x.rel.startsWith('public/assets/js/sim/') && /\.js$/.test(x.name))) {
    if (/Math\.random\s*\(/.test(code(f))) failures.push(`${f.rel}: uses Math.random(); the sim must use the seeded PRNG (§5).`);
  }

  // CSP (§11): no inline scripts, inline styles or inline handlers in HTML; no third-party requests anywhere.
  for (const f of files.filter((x) => x.rel.startsWith('public/') && !isVendor(x))) {
    if (f.name.endsWith('.html')) {
      const html = read(f);
      if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) failures.push(`${f.rel}: inline <script>; the CSP allows only script files.`);
      if (/<style[\s>]/i.test(html) || /\sstyle\s*=/i.test(html)) failures.push(`${f.rel}: inline style; the CSP allows only stylesheet files.`);
      if (/\son[a-z]+\s*=/i.test(html)) failures.push(`${f.rel}: inline event handler; attach listeners in JS.`);
      if (/\b(?:src|srcset)\s*=\s*["']?(?:https?:)?\/\//i.test(html) || /<link[^>]+href\s*=\s*["']?(?:https?:)?\/\//i.test(html)) {
        failures.push(`${f.rel}: loads a third-party resource; everything is self-hosted (§1).`);
      }
    }
    if (f.name.endsWith('.css') && /url\(\s*["']?(?:https?:)?\/\//i.test(read(f))) failures.push(`${f.rel}: CSS loads a third-party resource.`);
    if (/\.m?js$/.test(f.name) && ours(f)) {
      const src = code(f);
      if (/(?:fetch|import)\s*\(\s*["'`](?:https?:)?\/\//.test(src) || /from\s+["'](?:https?:)?\/\//.test(src)) {
        failures.push(`${f.rel}: requests a third-party URL; connect-src is 'self' only.`);
      }
      if (/\.(?:inner|outer)HTML\s*=|insertAdjacentHTML|document\.write/.test(src)) {
        warnings.push(`${f.rel}: writes HTML; dynamic text must go in via textContent (§11).`);
      }
      if (/setAttribute\(\s*["']style["']/.test(src)) warnings.push(`${f.rel}: sets a style attribute, which the CSP blocks; use classes or el.style.`);
    }
  }

  // Browser-loaded JSON lives under the document root (docs/DECISIONS.md #1).
  for (const f of files.filter((x) => x.rel.startsWith('data/') && x.name.endsWith('.json'))) {
    warnings.push(`${f.rel}: outside the document root, so the browser cannot load it. Move it to public/${f.rel} (DECISIONS.md #1).`);
  }
});

for (const w of warnings) console.log(`warn  ${w}`);
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`- ${f}\n`);
  process.exit(1);
}
console.log('\ncheck passed');
