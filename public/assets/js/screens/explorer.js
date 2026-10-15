// Block explorer (BRIEF §7; slice J4). Today's trades as a chain of blocks with real SHA-256
// fingerprints, each opening to its transactions, and the tamper demo: change one old trade and
// watch its block and every block after it stop matching.
import { WHO, currentMarket } from './lab.js';
import { BLOCK_TICKS, formBlocks, gasFor, hashBlock, linkChain } from '../sim/chain.js';
import { animate, announce, h, icon, money, number, stateView } from '../ui.js';

const SHOWN = 40;
const TAMPER_FACTOR = 1000;

const short = (hash) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;
const when = (b) => `Day ${Math.floor(b.timestamp / 86400) + 1}, ${String(Math.floor((b.timestamp % 86400) / 3600)).padStart(2, '0')}:00`;
function coinAmount(n) {
  const abs = Math.abs(n);
  if (abs >= 1000) return number(n, 0);
  if (abs >= 1) return number(n, 2);
  return abs === 0 ? '0' : number(n, Math.min(8, 3 - Math.floor(Math.log10(abs))));
}
const tradeText = (tx) => `${tx.side === 'buy' ? 'Bought' : 'Sold'} ${coinAmount(tx.coins)} ${tx.coin} for ${money(tx.L)}`;

export function mount(root, ctx) {
  const { tier, navigate, config } = ctx;
  const tierInfo = config.getTier(tier);
  const market = currentMarket(tier);
  let alive = true;
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
  const backButton = (label = 'Back to the market') =>
    h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('/lab') }, [label, icon('arrow-right', { size: 20 })]);
  const done = () => {
    alive = false;
    view.remove();
  };

  if (!market) {
    view.replaceChildren(head, stateView({ kind: 'empty', title: 'Open today’s market first', body: 'Blocks are made from the trades in today’s market. Open it, let it run for a few seconds, then come back.', actions: [backButton('Open today’s market')] }));
    return done;
  }
  const st = market.session.getState();
  const blocks = formBlocks(market.session.getTransactions(), st.t);
  if (!blocks.length) {
    view.replaceChildren(head, stateView({ kind: 'empty', title: 'No blocks yet', body: 'The first block is sealed after 5 seconds of trading. Go back to the market and let it run.', actions: [backButton()] }));
    return done;
  }

  view.replaceChildren(head, stateView({ kind: 'loading', title: 'Sealing the blocks…' }));
  linkChain(blocks)
    .then(() => alive && show())
    .catch(() => {
      if (!alive) return;
      view.replaceChildren(head, stateView({
        kind: 'error',
        title: 'The fingerprints couldn’t be worked out',
        body: 'This browser blocked the hashing tool. Open the site over https in an up-to-date browser, then try again.',
        actions: [backButton()],
      }));
    });

  function show() {
    // The demo edits the player's earliest trade if they made one, otherwise the first trade of the day.
    let target = null;
    for (const b of blocks) {
      const i = b.txs.findIndex((tx) => tx.who === 'player');
      if (i >= 0) {
        target = { height: b.height, index: i };
        break;
      }
    }
    if (!target) {
      const b = blocks.find((x) => x.txs.length);
      target = b ? { height: b.height, index: 0 } : null;
    }
    let tampered = null; // { height, hashes: Map(height -> recomputed hash) }

    const chainList = h('ol', { class: 'chain', 'aria-label': 'Blocks, newest first' });
    const demo = h('div', { class: 'card tamper' });

    function blockCard(b) {
      const broken = tampered && b.height >= tampered.height;
      const now = broken ? tampered.hashes.get(b.height) : b.hash;
      const gas = gasFor(b.txs.length);
      const volume = b.txs.reduce((s, tx) => s + tx.L, 0);
      const list = h('ol', { class: 'tx-list', hidden: true });
      const toggle = h('button', { class: 'btn btn--sm', type: 'button', 'aria-expanded': 'false' }, `Show ${number(b.txs.length, 0)} transactions`);
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Hide transactions' : `Show ${number(b.txs.length, 0)} transactions`;
        if (open && !list.childElementCount) {
          const txs = tampered && tampered.height === b.height ? tampered.txs : b.txs;
          list.append(
            ...txs.slice(0, SHOWN).map((tx, i) =>
              h('li', { class: `tx${tx.who === 'player' ? ' is-player' : ''}${tampered && tampered.height === b.height && i === target.index ? ' is-tampered' : ''}` }, [
                h('span', { class: 'tx__who', text: WHO[tx.who] || tx.who }),
                h('span', { class: 'tx__what', text: tradeText(tx) }),
                h('span', { class: 'tx__gas', text: `gas ${money(gas, 3)}` }),
              ]),
            ),
          );
          if (txs.length > SHOWN) list.append(h('li', { class: 'tx tx--more', text: `and ${number(txs.length - SHOWN, 0)} more` }));
        }
        list.hidden = !open;
      });
      const status = broken
        ? h('span', { class: 'chip chip--loss' }, [icon('alert', { size: 14 }), b.height === tampered.height ? 'Changed: fingerprint no longer matches' : 'Link broken'])
        : h('span', { class: 'chip chip--ok' }, [icon('check', { size: 14 }), 'Sealed']);
      return h('li', { class: `card block${broken ? ' is-broken' : ''}` }, [
        h('div', { class: 'block__head' }, [h('h2', { class: 'block__title', text: `Block #${b.height + 1}` }), status]),
        h('p', { class: 'block__meta', text: `${when(b)} · ${number(b.txs.length, 0)} transactions · ${money(volume, 0)} traded · gas ${money(gas, 3)} each` }),
        h('dl', { class: 'block__hashes' }, [
          h('dt', { text: 'Fingerprint' }),
          h('dd', { class: 'hash', text: short(now) }),
          broken && b.height === tampered.height ? h('dt', { text: 'Everyone else has' }) : null,
          broken && b.height === tampered.height ? h('dd', { class: 'hash', text: short(b.hash) }) : null,
          h('dt', { text: 'Points to' }),
          h('dd', { class: 'hash', text: b.height === 0 ? 'The start of the chain' : short(b.prevHash) }),
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
          h('p', { text: `Block #${b.height + 1} holds this trade: ${WHO[tx.who] === 'You' ? 'you' : WHO[tx.who]} ${tradeText(tx).replace(/^./, (c) => c.toLowerCase())}.` }),
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
        h('button', { class: 'btn', type: 'button', onClick: undo }, 'Undo the change'),
      );
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
      demo.querySelector('.tamper__title')?.setAttribute('tabindex', '-1');
      demo.querySelector('.tamper__title')?.focus();
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

    renderDemo();
    renderChain();
    view.replaceChildren(
      head,
      h('p', { class: 'explorer__summary', text: `${number(blocks.length, 0)} blocks sealed so far in today’s market, newest first.` }),
      h('div', { class: 'explorer' }, [
        h('div', { class: 'explorer__side' }, [
          demo,
          ...lessons.map(([title, body]) => h('div', { class: 'card card--quiet lesson-mini' }, [h('h2', { class: 'lesson-mini__title', text: title }), h('p', { text: body })])),
        ]),
        chainList,
      ]),
      backButton(),
    );
  }

  return done;
}
