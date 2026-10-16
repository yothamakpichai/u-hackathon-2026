// Block explorer (BRIEF §7; slice J4). Today's trades as a chain of blocks with real SHA-256
// fingerprints, each opening to its transactions, and the tamper demo: change one old trade and
// watch its block and every block after it stop matching.
import { WHO, currentMarket } from './coinkit.js';
import { BLOCK_TICKS, formBlocks, gasFor, hashBlock, linkChain } from '../sim/chain.js';
import { animate, announce, h, icon, money, number, reducedMotion, stateView } from '../ui.js';
import { NFT_LESSON, badgeArt, badgeInfo, listBadges } from './badges.js';

const SHOWN = 40;
const TAMPER_FACTOR = 1000;

const short = (hash) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;
const plural = (n, word) => `${number(n, 0)} ${n === 1 ? word : `${word}s`}`;
// A block is labelled by when it was sealed. One sealed at midnight closes the day before, so the
// market's last block reads "Day 30, 24:00" rather than "Day 31, 00:00".
function when(b) {
  const day = Math.ceil(b.timestamp / 86400);
  const hour = Math.round((b.timestamp - (day - 1) * 86400) / 3600);
  return `Day ${day}, ${String(hour).padStart(2, '0')}:00`;
}
function coinAmount(n) {
  const abs = Math.abs(n);
  if (abs >= 1000) return number(n, 0);
  if (abs >= 1) return number(n, 2);
  return abs === 0 ? '0' : number(n, Math.min(8, 3 - Math.floor(Math.log10(abs))));
}
// `badges` is store.badges, so a cow's certificate is named after the cow, as on its card.
const tradeText = (tx, badges) =>
  tx.side === 'mint'
    ? `Minted the “${badgeInfo(tx.badge, badges[tx.badge])?.title || 'badge'}” badge: soulbound, no price`
    : `${tx.side === 'buy' ? 'Bought' : 'Sold'} ${coinAmount(tx.coins)} ${tx.coin} for ${money(tx.L)}`;
const mintedAt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

// The badge gallery (BRIEF §15): soulbound badges with their mint transactions, and the NFT lesson.
// A card says "in today's chain" only while the open market's chain holds its mint (`mints`, with
// `sealed` complete blocks); after a reload or on another day it shows just the mint date.
function badgeGallery(store, mints, sealed, closed) {
  const where = (id) => {
    const tx = mints.find((x) => x.badge === id);
    if (!tx) return '';
    const height = Math.floor(tx.t / BLOCK_TICKS);
    if (height < sealed) return ` · in today’s chain, Block #${height + 1}`;
    return closed ? '' : ' · joins today’s chain in the next block';
  };
  const records = listBadges(store);
  const list = records.length
    ? h('ul', { class: 'badge-grid' }, records.map((rec) => {
        const info = badgeInfo(rec.id, rec);
        if (!info) return null;
        return h('li', { class: 'badge-card' }, [
          badgeArt(info),
          h('p', { class: 'badge-card__title', text: info.title }),
          h('p', { class: 'badge-card__how', text: info.how }),
          h('p', { class: 'badge-card__meta', text: `Minted ${mintedAt.format(rec.at)}${where(rec.id)}` }),
          h('p', { class: 'badge-card__meta hash', text: rec.hash ? `Mint fingerprint ${short(rec.hash)}` : 'Fingerprint unavailable in this browser' }),
          h('span', { class: 'chip chip--ok', text: 'Soulbound · no price' }),
        ]);
      }))
    : h('p', { class: 'badges__empty', text: 'No badges yet. Finish a Coach chapter or a Learning Path unit, or raise a calf on the Farm, to mint your first one.' });
  return h('section', { class: 'badges', 'aria-labelledby': 'badges-title' }, [
    h('div', { class: 'badges__main' }, [h('h2', { class: 'badges__title', id: 'badges-title', text: 'Your soulbound badges' }), list]),
    h('div', { class: 'card card--quiet lesson-mini badges__lesson' }, [
      h('h2', { class: 'lesson-mini__title', text: 'NFTs, and why these can’t be sold' }),
      ...NFT_LESSON.map((t) => h('p', { text: t })),
    ]),
  ]);
}

export function mount(root, ctx) {
  const { tier, navigate, config, store } = ctx;
  const tierInfo = config.getTier(tier);
  const market = currentMarket(tier);
  const wide = matchMedia('(min-width: 900px)');
  let alive = true;
  let unwatch = null;
  const view = h('section', { class: 'screen explorer-screen' });
  root.append(view);
  const head = h('div', { class: 'screen-head' }, [
    h('p', { class: 'screen-eyebrow', text: `${tierInfo.name} · Ages ${tierInfo.ages}` }),
    h('h1', { class: 'screen-title', text: 'Block explorer' }),
    h('p', {
      class: 'screen-sub',
      text: `Every trade in today’s market is a transaction. Every ${(BLOCK_TICKS / 10).toFixed(0)} seconds of market time, the new ones are sealed into a block with a fingerprint called a hash.`,
    }),
  ]);
  const backButton = (label = 'Back to the market', kind = 'btn btn--primary') =>
    h('button', { class: kind, type: 'button', onClick: () => navigate('/lab') }, [label, icon('arrow-right', { size: 20 })]);
  // Below Builder the PEG arbitrage bot gets a plain name, as the PEG news at those levels has.
  const who = (id) => (id === 'arb' && tierInfo.rank < 2 ? 'PEG keeper bot' : WHO[id] || id);
  const done = () => {
    alive = false;
    unwatch?.();
    view.remove();
  };

  // Only what this level can see (BRIEF §2): its coins, the player's own among them, and badge
  // mints. The wash bot is shown and explained only at Builder (BRIEF §5).
  const st = market?.session.getState();
  const visible = new Set(Object.keys(st?.coins || {}));
  const txs = market
    ? market.session.getTransactions().filter((tx) => tx.who === 'mint' || (visible.has(tx.coin) && (tx.who !== 'wash' || tierInfo.rank >= 2)))
    : [];
  const blocks = market ? formBlocks(txs, st.t) : [];
  const closed = Boolean(market?.closed || st?.closed);
  const gallery = badgeGallery(store, txs.filter((tx) => tx.who === 'mint'), blocks.length, closed);
  view.append(head, gallery);

  // Everything below the gallery is swapped in place, so the head (and the h1 the router focused)
  // never leaves the page. If focus was in the part being replaced, it moves to `focus`.
  function setBody(nodes, focus = null) {
    const lost = [...view.children].some((el) => el !== head && el !== gallery && el.contains(document.activeElement));
    while (gallery.nextSibling) gallery.nextSibling.remove();
    view.append(...nodes);
    if (lost && focus) {
      if (!focus.matches('button, a')) focus.setAttribute('tabindex', '-1');
      focus.focus({ preventScroll: true });
    }
  }

  if (!market) {
    setBody([stateView({ kind: 'empty', title: 'Open today’s market first', body: 'Blocks are made from the trades in today’s market. Open it, let it run for a few seconds, then come back.', actions: [backButton('Open today’s market')] })]);
    return done;
  }
  if (!blocks.length) {
    setBody([stateView({ kind: 'empty', title: 'No blocks yet', body: 'The first block is sealed after 5 seconds of trading. Go back to the market and let it run.', actions: [backButton()] })]);
    return done;
  }

  // Work out every fingerprint; if Web Crypto fails, the error state can try again.
  function load() {
    const loading = stateView({ kind: 'loading', title: 'Sealing the blocks…' });
    setBody([loading], loading.querySelector('.state__title'));
    linkChain(blocks)
      .then(() => alive && show())
      .catch(() => {
        if (!alive) return;
        const retry = h('button', { class: 'btn btn--primary', type: 'button', onClick: load }, 'Try again');
        setBody([stateView({
          kind: 'error',
          title: 'The fingerprints couldn’t be worked out',
          body: 'This browser blocked the hashing tool. Open the site over https in an up-to-date browser, then try again.',
          actions: [retry, backButton('Back to the market', 'btn')],
        })], retry);
      });
  }
  load();

  function show() {
    const badges = store.get().badges || {};
    // The demo edits the player's earliest trade if they made one, otherwise the day's first trade.
    // Never a badge mint, and never under L$0.01: changing those wouldn't change the hashed amount.
    const find = (ok) => {
      for (const b of blocks) {
        const i = b.txs.findIndex(ok);
        if (i >= 0) return { height: b.height, index: i };
      }
      return null;
    };
    const target = find((tx) => tx.who === 'player' && tx.L >= 0.01) || find((tx) => tx.who !== 'mint' && tx.L >= 0.01);
    let tampered = null; // { height, txs, hashes: Map(height -> recomputed hash) }

    const chainList = h('ol', { class: 'chain', 'aria-label': 'Blocks, newest first' });
    const demo = h('div', { class: 'card tamper' });

    // After a change, the forger reseals every later block on top of it, so each later block points
    // to the new fingerprint before it and gets a new one itself. Each changed fingerprint is shown
    // next to the one everyone else still has.
    function blockCard(b) {
      const now = tampered?.hashes.get(b.height) ?? b.hash;
      const broken = now !== b.hash;
      const changedHere = broken && b.height === tampered.height;
      const prev = b.height === 0 ? null : tampered?.hashes.get(b.height - 1) ?? b.prevHash;
      const n = b.txs.length;
      const gas = gasFor(n);
      const volume = b.txs.reduce((s, tx) => s + tx.L, 0);
      const list = h('ol', { class: 'tx-list', hidden: true });
      // An empty block says so rather than offering "Show 0 transactions". The list shows the first 40.
      const showLabel = `Show ${n > SHOWN ? `the first ${SHOWN} of ${number(n, 0)} transactions` : plural(n, 'transaction')}`;
      const toggle = n
        ? h('button', { class: 'btn btn--sm', type: 'button', 'aria-expanded': 'false' }, showLabel)
        : h('p', { class: 'block__meta', text: 'No trades were sealed in this block (the market was quiet).' });
      if (n) toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Hide transactions' : showLabel;
        if (open && !list.childElementCount) {
          const rows = changedHere ? tampered.txs : b.txs;
          const changed = changedHere ? rows[target.index] : null;
          // Badge mints and the player's own trades list first, so they're never lost among 500 rows.
          const mine = (tx) => tx.who === 'mint' || tx.who === 'player' || tx === changed;
          const shown = [...rows.filter(mine), ...rows.filter((tx) => !mine(tx))];
          list.append(
            ...shown.slice(0, SHOWN).map((tx) =>
              h('li', { class: `tx${tx.who === 'player' ? ' is-player' : ''}${tx.who === 'mint' ? ' is-mint' : ''}${tx === changed ? ' is-tampered' : ''}` }, [
                h('span', { class: 'tx__who', text: who(tx.who) }),
                h('span', { class: 'tx__what' }, [
                  tradeText(tx, badges),
                  // Colour is never the only signal (BRIEF §10): the edited row says so, with the real amount.
                  tx === changed ? h('span', { class: 'chip chip--loss tx__changed', text: `Changed from ${money(b.txs[target.index].L)}` }) : null,
                ]),
                h('span', { class: 'tx__gas', text: `gas ${money(gas, 3)}` }),
              ]),
            ),
          );
          if (rows.length > SHOWN) list.append(h('li', { class: 'tx tx--more', text: `and ${number(rows.length - SHOWN, 0)} more` }));
        }
        list.hidden = !open;
        if (open) animate(list, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 200 });
      });
      const status = broken
        ? h('span', { class: 'chip chip--loss' }, [icon('alert', { size: 14 }), changedHere ? 'Changed: fingerprint no longer matches' : 'No longer matches'])
        : h('span', { class: 'chip chip--ok' }, [icon('check', { size: 14 }), 'Sealed']);
      return h('li', { class: `card block${broken ? ' is-broken' : ''}${changedHere ? ' is-changed' : ''}` }, [
        h('div', { class: 'block__head' }, [
          h('h2', { class: 'block__title', text: `Block #${b.height + 1}` }),
          b.txs.some((tx) => tx.who === 'mint') ? h('span', { class: 'chip chip--mine', text: 'Badge mint' }) : null,
          status,
        ]),
        h('p', { class: 'block__meta', text: `${when(b)} · ${plural(n, 'transaction')} · ${money(volume, 0)} traded · gas ${money(gas, 3)} each` }),
        h('dl', { class: 'block__hashes' }, [
          h('dt', { text: 'Fingerprint' }),
          h('dd', { class: 'hash', text: short(now) }),
          broken ? h('dt', { text: 'Everyone else has' }) : null,
          broken ? h('dd', { class: 'hash', text: short(b.hash) }) : null,
          h('dt', { text: 'Points to' }),
          h('dd', { class: 'hash', text: prev ? short(prev) : 'The start of the chain' }),
        ]),
        toggle,
        list,
      ]);
    }

    function renderChain() {
      chainList.replaceChildren(...blocks.slice().reverse().map(blockCard));
    }

    function renderDemo() {
      if (!target) {
        demo.replaceChildren(h('p', { text: 'There are no trades to change yet. Let the market run a little longer.' }));
        return;
      }
      const b = blocks[target.height];
      const tx = b.txs[target.index];
      if (!tampered) {
        demo.replaceChildren(
          h('h2', { class: 'tamper__title', text: 'Try to rewrite history' }),
          h('p', { text: `Block #${b.height + 1} holds this trade: ${tx.who === 'player' ? 'you' : who(tx.who)} ${tradeText(tx, badges).replace(/^./, (c) => c.toLowerCase())}.` }),
          h('p', { class: 'tamper__hint', text: 'What if someone quietly changed it afterwards?' }),
          h('button', { class: 'btn btn--primary', type: 'button', onClick: tamper }, `Change it to ${money(tx.L * TAMPER_FACTOR, 0)}`),
        );
        return;
      }
      const later = blocks.length - 1 - target.height;
      demo.replaceChildren(
        h('h2', { class: 'tamper__title' }, [icon('alert', { size: 22 }), 'The chain caught it']),
        h('p', { text: `Changing one old trade changed Block #${b.height + 1}’s fingerprint. Every block stores the fingerprint of the block before it, so ${later === 1 ? 'the block after it no longer matches either' : later > 1 ? `all ${later} blocks after it no longer match either` : 'anyone checking sees it straight away'}.` }),
        h('p', { text: 'Everyone else still has the real copy, so the change is caught at once. That’s why history on a blockchain can’t be quietly rewritten.' }),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: seeChanged }, `See Block #${b.height + 1}`),
        h('button', { class: 'btn', type: 'button', onClick: undo }, 'Undo the change'),
      );
    }

    // The changed block is the oldest red one, so on a long chain it sits far below the demo.
    // It's centred when it fits on screen (an open list makes it tall), with its title focused.
    function seeChanged() {
      const card = chainList.querySelector('.block.is-changed');
      const title = card?.querySelector('.block__title');
      if (!title) return;
      title.setAttribute('tabindex', '-1');
      card.scrollIntoView({ block: card.offsetHeight < innerHeight / 2 ? 'center' : 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      title.focus({ preventScroll: true });
    }

    async function tamper() {
      const b = blocks[target.height];
      const txs = b.txs.map((tx, i) => (i === target.index ? { ...tx, L: tx.L * TAMPER_FACTOR } : tx));
      const hashes = new Map();
      let prev = await hashBlock({ ...b, txs }, b.prevHash);
      hashes.set(b.height, prev);
      for (const later of blocks.slice(b.height + 1)) {
        prev = await hashBlock(later, prev);
        hashes.set(later.height, prev);
      }
      if (!alive) return;
      tampered = { height: b.height, txs, hashes };
      renderDemo();
      renderChain();
      announce(`Block ${b.height + 1} and every block after it no longer match.`);
      animate(demo, [{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 300 });
      // The break ripples forward: the changed block flashes first, then each later one in turn.
      const cards = [...chainList.querySelectorAll('.block.is-broken')].reverse();
      cards.forEach((card, i) => {
        animate(card, [
          { boxShadow: '0 0 0 0 rgb(209 47 58 / 0)', transform: 'scale(1)' },
          { boxShadow: '0 0 0 6px rgb(209 47 58 / 0.28)', transform: 'scale(1.01)' },
          { boxShadow: '0 0 0 0 rgb(209 47 58 / 0)', transform: 'scale(1)' },
        ], { duration: 300, delay: Math.min(i, 12) * 70, fill: 'none' });
      });
      const title = demo.querySelector('.tamper__title');
      title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
      // Phones: the demo moves to the top of the screen, so the first red blocks show right below it.
      demo.scrollIntoView({ block: wide.matches ? 'nearest' : 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }

    function undo() {
      tampered = null;
      renderDemo();
      renderChain();
      announce('The trade is back to the real one. Every block matches again.');
      demo.querySelector('button')?.focus();
    }

    const lessons = [
      ['Wallets and keys', 'A wallet is an address that holds coins. A secret key proves it’s yours, like a password that can never be reset. Never share a real one with anyone. This lab has no real wallets or keys.'],
      ['Confirmations', 'A trade is confirmed once it’s sealed in a block. Every new block on top makes it harder to change, which is why people wait for a few blocks.'],
      ['Fees (gas)', 'Each transaction pays a small network fee called gas. It goes up when blocks are busy. This lab shows the fee but doesn’t charge it.'],
    ];
    const lessonCards = h('div', { class: 'explorer__lessons' }, lessons.map(([title, body]) => h('div', { class: 'card card--quiet lesson-mini' }, [h('h2', { class: 'lesson-mini__title', text: title }), h('p', { text: body })])));
    const side = h('div', { class: 'explorer__side' }, [demo]);
    const layout = h('div', { class: 'explorer' }, [side, chainList]);
    // Wide screens keep the lesson cards in the side column under the demo. Phones list them after
    // the chain, so the demo sits right above the blocks it breaks.
    const placeLessons = () => (wide.matches ? side : layout).append(lessonCards);
    placeLessons();
    wide.addEventListener('change', placeLessons);
    unwatch = () => wide.removeEventListener('change', placeLessons);

    const summary = h('p', {
      class: 'explorer__summary',
      text: `${plural(blocks.length, 'block')} ${closed ? `${blocks.length === 1 ? 'was' : 'were'} sealed` : 'sealed so far'} in today’s market, newest first.`,
    });
    renderDemo();
    renderChain();
    head.append(backButton('Back to the market', 'btn btn--sm explorer__back'));
    setBody([summary, layout, backButton()], summary);
  }

  return done;
}
