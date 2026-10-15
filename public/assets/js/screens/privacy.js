// Arena privacy notice (BRIEF §15): what the Arena keeps, why, and what it never asks for. Short and plain,
// because most players are under 18.
import { h } from '../ui.js';

export function mount(root, ctx) {
  const { navigate } = ctx;
  const section = (title, items) =>
    h('section', { class: 'card privacy__section' }, [
      h('h2', { class: 'report-section__title', text: title }),
      h('ul', { class: 'privacy__list' }, items.map((text) => h('li', { text }))),
    ]);

  const view = h('section', { class: 'screen privacy' }, [
    h('div', { class: 'screen-head' }, [
      h('p', { class: 'screen-eyebrow', text: 'Arena' }),
      h('h1', { class: 'screen-title', tabindex: '-1', text: 'Privacy notice' }),
      h('p', { class: 'screen-sub', text: 'The Arena keeps as little as it can, because many players are under 18.' }),
    ]),
    section('What the Arena keeps', [
      'Your username. Other players see it on the leaderboard and in the list of trades.',
      'Your password, stored only as an argon2id hash: a scrambled version that can’t be turned back into the password.',
      'Your birth year, only to check that you are 13 or older.',
      'Your simulated L$, coins and recent trades. None of it is real money.',
    ]),
    section('What it never asks for', [
      'No real name, email, phone number, address, school, photo or location.',
      'No ads, no analytics and no tracking. Nothing is sold or shared.',
    ]),
    section('The one cookie', [
      'A session cookie called __Host-arena keeps you logged in. Only this site can read it, scripts can’t, and it ends after 7 days or when you log out.',
      'The rest of the lab uses no cookies: your progress stays in this browser.',
    ]),
    section('Your choices', [
      'Log out at any time.',
      'Delete your Arena account from the Arena screen. Your username, password hash, birth year, coins, trades and leaderboard place are removed straight away.',
    ]),
    h('div', { class: 'report-actions' }, [
      h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => navigate('/arena') }, 'Back to the Arena'),
      h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate('/') }, 'Back to start'),
    ]),
  ]);
  root.append(view);
  view.querySelector('.screen-title')?.focus({ preventScroll: true });
  return () => view.remove();
}
