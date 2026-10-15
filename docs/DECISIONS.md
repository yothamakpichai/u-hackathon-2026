# Decisions

Choices made where the brief was silent or ambiguous (BRIEF §13). Newest last.

1. **Browser-loaded JSON lives in `public/data/`.** The document root is `public/`, so files in a repo-root `data/` can never reach the browser, and the UI must fetch gate, lessons, events, coins, agents and scenario. Static files under the root are the option with the fewest moving parts (no PHP passthrough, normal caching). Every `data/x.json` in the brief means `public/data/x.json`; fetch them as `config.DATA_BASE + 'x.json'`. `bin/check.mjs` warns about JSON left in a repo-root `data/`.
2. **Fonts.** Inter and Nunito variable woff2, latin subset, from the Fontsource npm packages `@fontsource-variable/inter@5.3.0` and `@fontsource-variable/nunito@5.3.0`, under the SIL OFL 1.1. The licence texts sit next to the files in `public/assets/fonts/`.
3. **Buttons with white text use `--primary-600` (#09855F).** White on the brand green #0DA678 is 3.1:1, which fails AA for normal text; #09855F gives 4.6:1. #0DA678 stays the brand and EDUU colour (`--primary-500`) for fills, marks and large graphics.
4. **The product name lives only in `config.js`.** `index.html` has no product name in its title or header; `app.js` fills `[data-slot="product-name"]` and each route sets `document.title`.
5. **Screen hooks.** The router lazy-loads `screens/<name>.js` and sets `<html data-route="<name>">`, so screen CSS can scope itself, for example `[data-route="lab"] .app-main { max-width: var(--lab-max); }`. `index.html` already links `assets/css/lab.css`. Every route except `#/` sends the player to `#/` until a tier is chosen.
6. **Store.** One localStorage key, `market-lab:v1`, holding one object; each feature owns one top-level key (`tier`, `muted`, then `check`, `lab`, ...). Writes are batched and flushed on `pagehide`; if storage is blocked the app runs in memory.
7. **`ctx.audio`.** `play(id)` plays `assets/audio/<id>.mp3` and resolves `true` when it finishes, `false` when muted, missing or blocked; it never throws or rejects. Also `stop()`, `isMuted()`, `setMuted(bool)`, `toggleMuted()`. The captioned player UI comes with slice Y2.
8. **Caching.** No build step means no hashed file names, so `.htaccess` sends `Cache-Control: no-cache` (revalidate, cheap 304s) for everything except fonts (one week). A push is live at once and Cloudflare never serves a stale script.
9. **`bin/check.mjs` parses JS by piping it to `node --input-type=module --check`.** Plain `node --check file.js` passes a broken ES module silently when there is no `package.json` "type".
