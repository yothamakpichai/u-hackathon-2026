// Soulbound badges (BRIEF §15; slice J8). Finishing a Coach chapter or a Learning Path unit mints a
// non-transferable badge: a mint transaction with a real SHA-256 hash, kept in store.badges, and
// added to today's simulated chain when a market is open. Badges have no price and can't be traded,
// sold or transferred. All badge art is original SVG drawn here.
//
// For the Learning Path (Y7): import { mintBadge } from './badges.js' and call
// mintBadge(store, { kind: 'unit', ref: '1', tier }) when a unit is completed. This module does not
// load the Lab or the chart library.
import { sha256Hex } from '../sim/chain.js';
import { h } from '../ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Badge catalogue. Colours are palette ids from config.COIN_COLORS; shapes are drawn below.
const COACH = {
  candle: { title: 'Candle Reader', how: 'Finished the Coach chapter “Reading a candle”.', color: 'gold', shape: 'candle' },
  tools: { title: 'Tool Wise', how: 'Finished the Coach chapter “Volume, SMA and RSI”.', color: 'blue', shape: 'bars' },
  trade: { title: 'First Trade', how: 'Finished the Coach chapter “Your first trade”.', color: 'mint', shape: 'arrow' },
  whale: { title: 'Calm in a Storm', how: 'Finished the Coach chapter “Surviving a whale dump”.', color: 'sky', shape: 'wave' },
  build: { title: 'Honest Builder', how: 'Finished the Coach chapter “Build your coin”.', color: 'violet', shape: 'shield' },
};
const UNITS = {
  1: { title: 'Money Basics', color: 'teal', shape: 'coin' },
  2: { title: 'Market Minded', color: 'orange', shape: 'bars' },
  3: { title: 'Chain Explorer', color: 'indigo', shape: 'blocks' },
};

export function badgeInfo(id, record) {
  const [kind, a, b] = String(id).split(':');
  if (kind === 'cow') {
    return { id, kind, title: record?.meta?.title || 'Cow birth certificate', how: record?.meta?.how || 'A cow born on your farm.', color: 'gold', shape: 'cow' };
  }
  if (kind === 'coach' && COACH[a]) return { id, kind, ...COACH[a] };
  if (kind === 'unit' && UNITS[b]) {
    const tier = a.charAt(0).toUpperCase() + a.slice(1);
    return { id, kind, ...UNITS[b], title: `${UNITS[b].title}`, how: `Finished Unit ${b} of the ${tier} Learning Path.` };
  }
  return null;
}

// Coach badges are one per chapter; unit badges are per level, because each level's units differ.
export const badgeId = ({ kind, ref, tier }) => (kind === 'unit' ? `unit:${tier}:${ref}` : kind === 'cow' ? `cow:${ref}` : `coach:${ref}`);

export const listBadges = (store) => Object.values(store.get().badges || {}).sort((x, y) => x.at - y.at);

// The open market's chain, set by the Lab while a market exists (null otherwise).
let chainSink = null;
export const setChainSink = (fn) => {
  chainSink = fn;
};

// Mint once. Resolves to the stored badge record (or the existing one when already minted).
export async function mintBadge(store, { kind, ref, tier, meta = null }) {
  const id = badgeId({ kind, ref, tier });
  const existing = store.get().badges?.[id];
  if (existing) return existing;
  if (!badgeInfo(id, { meta })) return null;
  const at = Date.now();
  const owner = store.get().nickname || 'you';
  let hash = null;
  try {
    hash = await sha256Hex(`mint|${id}|${owner}|${at}|soulbound`);
  } catch {
    hash = null; // no Web Crypto: the badge still mints, the card says the fingerprint is missing
  }
  const record = { id, kind, ref: String(ref), tier, at, hash, onChain: false, ...(meta ? { meta: { title: String(meta.title).slice(0, 60), how: String(meta.how).slice(0, 120) } } : {}) };
  try {
    record.onChain = Boolean(chainSink?.(id));
  } catch {
    record.onChain = false;
  }
  store.set((s) => ({ badges: { ...s.badges, [id]: record } }));
  return record;
}

// ---- art ----------------------------------------------------------------------------------

const SHAPES = {
  candle: [['line', { x1: 48, y1: 30, x2: 48, y2: 66, class: 'badge-art__line' }], ['rect', { x: 41, y: 38, width: 14, height: 20, rx: 2, class: 'badge-art__fill' }]],
  bars: [['rect', { x: 34, y: 50, width: 7, height: 14, rx: 2, class: 'badge-art__fill' }], ['rect', { x: 45, y: 42, width: 7, height: 22, rx: 2, class: 'badge-art__fill' }], ['rect', { x: 56, y: 34, width: 7, height: 30, rx: 2, class: 'badge-art__fill' }]],
  arrow: [['path', { d: 'M48 64V34M37 45l11-11 11 11', class: 'badge-art__line' }]],
  wave: [['path', { d: 'M32 52c5-7 11-7 16 0s11 7 16 0', class: 'badge-art__line' }], ['path', { d: 'M32 42c5-7 11-7 16 0s11 7 16 0', class: 'badge-art__line badge-art__soft' }]],
  shield: [['path', { d: 'M48 30l15 6v10c0 9-6 15-15 19-9-4-15-10-15-19V36z', class: 'badge-art__fill' }], ['path', { d: 'M42 47l4 4 8-9', class: 'badge-art__tick' }]],
  coin: [['circle', { cx: 48, cy: 48, r: 14, class: 'badge-art__fill' }], ['circle', { cx: 48, cy: 48, r: 8, class: 'badge-art__hole' }]],
  cow: [['ellipse', { cx: 48, cy: 50, rx: 13, ry: 12, class: 'badge-art__fill' }], ['ellipse', { cx: 34, cy: 40, rx: 6, ry: 3.5, class: 'badge-art__fill' }], ['ellipse', { cx: 62, cy: 40, rx: 6, ry: 3.5, class: 'badge-art__fill' }], ['ellipse', { cx: 48, cy: 56, rx: 8, ry: 5, class: 'badge-art__hole' }]],
  blocks: [['rect', { x: 32, y: 42, width: 10, height: 10, rx: 2, class: 'badge-art__fill' }], ['rect', { x: 46, y: 42, width: 10, height: 10, rx: 2, class: 'badge-art__fill' }], ['rect', { x: 60, y: 42, width: 6, height: 10, rx: 2, class: 'badge-art__fill' }], ['path', { d: 'M42 47h4M56 47h4', class: 'badge-art__line' }]],
};

export function badgeArt(info, { size = 88, locked = false } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const set = (el, attrs) => {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  };
  set(svg, { viewBox: '0 0 96 96', width: size, height: size, 'aria-hidden': 'true', focusable: 'false', class: `badge-art coin--${info.color}${locked ? ' is-locked' : ''}` });
  const add = (tag, attrs) => svg.append(set(document.createElementNS(SVG_NS, tag), attrs));
  add('path', { d: 'M30 70l-6 22 12-6 8 8 6-20z', class: 'badge-art__ribbon' });
  add('path', { d: 'M66 70l6 22-12-6-8 8-6-20z', class: 'badge-art__ribbon' });
  add('circle', { cx: 48, cy: 46, r: 34, class: 'badge-art__medal' });
  add('circle', { cx: 48, cy: 46, r: 27, class: 'badge-art__inner' });
  for (const [tag, attrs] of SHAPES[info.shape] || SHAPES.coin) add(tag, attrs);
  return svg;
}

// A small "badge minted" note for the end of a Coach chapter, with a link to the explorer's gallery
// (the Lab has no explorer button at the Explorer level).
export function mintedNote(promise) {
  const text = h('p', { class: 'badge-note__text', text: 'Minting your badge…' });
  const box = h('div', { class: 'badge-note', role: 'status' }, [text]);
  promise.then((record) => {
    const info = record && badgeInfo(record.id, record);
    if (!info) {
      box.remove();
      return;
    }
    box.replaceChildren(badgeArt(info, { size: 56 }), h('div', {}, [
      h('p', { class: 'badge-note__title', text: `Badge minted: ${info.title}` }),
      h('p', { class: 'badge-note__text', text: 'Soulbound: it’s yours to keep and can’t be sold or traded.' }),
      h('a', { class: 'badge-note__link', href: '#/explorer', text: 'See it in the block explorer' }),
    ]));
  });
  return box;
}

export const NFT_LESSON = [
  'An NFT is a record on a blockchain that says one digital item belongs to one wallet. The record can be real even when the item itself is just a picture.',
  'Your badges are soulbound: they’re minted to you and can’t be sold, traded or transferred. They have no price, because they show what you learned, not what you paid.',
  'Many NFTs are sold with price tags. Their price may depend only on someone wanting to pay more later, so it can drop to nothing, and the picture behind them can often be copied for free.',
];
