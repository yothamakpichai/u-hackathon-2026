// Unit checks for the avatar renderer. Run: node public/js/avatar.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { AGES, OPTIONS, dataUri, normalize, render } from './avatar.js';

const someone = { skin: 'tone4', hairStyle: 'curly', hairColor: 'brown', outfit: 'hoodie', glasses: 'round' };
const wrinkles = (svg) => (svg.match(/data-wrinkle="1"/g) || []).length;

test('renders a self-contained SVG string with no styles or scripts', () => {
  const svg = render(someone, 25);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 120 120"/);
  assert.ok(svg.endsWith('</svg>'));
  assert.doesNotMatch(svg, /style=|<style|<script|\son[a-z]+=|href=/i);
  assert.equal(render(someone, 25), svg, 'deterministic');
  assert.match(dataUri(someone, 25), /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
});

test('ages visibly at 25, 40, 60 and 80', () => {
  const svgs = AGES.map((a) => render(someone, a));
  assert.equal(new Set(svgs).size, 4, 'four different pictures');
  const lines = svgs.map(wrinkles);
  assert.equal(lines[0], 0);
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i] > lines[i - 1], `more lines at ${AGES[i]} (${lines})`);
  assert.ok(svgs[3].includes('data-stage="80"'));
  // Hair greys: the 80-year-old's hair colour is lighter than the 25-year-old's.
  const hairOf = (svg) => svg.match(/<circle cx="38" cy="\d+(\.\d+)?" r="[\d.]+" fill="(#[0-9A-F]{6})"/)[2];
  const lum = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  assert.ok(lum(hairOf(svgs[3])) > lum(hairOf(svgs[0])) + 200);
  // In-between ages snap to the nearest stage.
  assert.equal(render(someone, 33), render(someone, 40));
  assert.equal(render(someone, 71), render(someone, 80));
});

test('unknown values fall back, and there is no gender field', () => {
  assert.deepEqual(normalize({ skin: 'nope', hairStyle: '<script>', hairColor: 42, outfit: null, glasses: 'monocle' }), {
    skin: 'tone1', hairStyle: 'short', hairColor: 'black', outfit: 'tee', glasses: 'none',
  });
  assert.equal(render({ ...someone, gender: 'anything' }, 40), render(someone, 40), 'extra fields are ignored');
  assert.deepEqual(Object.keys(normalize(someone)).sort(), ['glasses', 'hairColor', 'hairStyle', 'outfit', 'skin']);
  assert.equal(normalize({ glasses: true }).glasses, 'round');
  for (const style of OPTIONS.hairStyle) for (const a of AGES) assert.ok(render({ ...someone, hairStyle: style }, a).includes('</svg>'));
  assert.ok(render(undefined).startsWith('<svg'));
});
