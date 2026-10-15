// Privacy notice (BRIEF §15, §16): what Penny keeps, why, and what it never asks for. Short and plain, because many
// players are under 18. Guest play keeps everything on the device; an account is optional.
import { h } from '../ui.js';

export function mount(root, ctx) {
  const { navigate, store } = ctx;
  const section = (title, items) =>
    h('section', { class: 'card privacy__section' }, [
      h('h2', { class: 'report-section__title', text: title }),
      h('ul', { class: 'privacy__list' }, items.map((text) => h('li', { text }))),
    ]);

  const view = h('section', { class: 'screen privacy' }, [
    h('div', { class: 'screen-head' }, [
      h('p', { class: 'screen-eyebrow', text: 'Privacy' }),
      h('h1', { class: 'screen-title', tabindex: '-1', text: 'Privacy notice' }),
      h('p', { class: 'screen-sub', text: 'Penny keeps as little as it can, because many players are under 18.' }),
    ]),
    section('Playing as a guest (the default)', [
      'Everything you do, including your birth year, character, Money Check and Piggy Bank, stays in this browser.',
      'If you add a score to the Market Lab leaderboard, only a random nickname, your level, the score and the date are sent.',
      'Ask Penny sends your question, and the review buttons send only numbers from your game, to our server and to Claude, the AI that writes Penny’s answers. Emails, phone numbers and links are blocked before anything is sent, so please never type your name either.',
    ]),
    section('If you make an account (optional)', [
      'We keep your username, your password as an argon2id hash (a scrambled version that can’t be turned back into the password), and your birth year, to check your age for the Arena.',
      'Your progress is saved to your account so it can follow you to another device. That includes the Piggy Bank amounts you record. Penny never touches real money.',
      'In the Arena, other players see your username, your simulated trades and your place on the leaderboard.',
      'Children never give an email or a phone number. If a password is forgotten, a parent with the parent link can set a new one.',
    ]),
    section('The parent link', [
      'You can make a private link for a parent. On their own phone they see your progress, can confirm your Piggy Bank entries (a “verified” seal only) and can set a new password.',
      'Anyone with the link can do this, so share it only with a parent. Making a new link, or “Stop sharing”, switches the old one off.',
    ]),
    section('What we never ask for', [
      'No real name, email for children, phone number, address, school, photo or location.',
      'No ads, no analytics and no tracking. Nothing is sold or shared.',
    ]),
    section('The one cookie', [
      'Only an account uses a cookie: __Host-penny keeps you logged in. Only this site can read it, scripts can’t, and it ends after 30 days or when you log out.',
    ]),
    section('Your choices', [
      'Log out at any time.',
      'Delete your account from the account screen. Your username, password hash, birth year, saved progress, Arena coins and parent link are removed straight away. Progress on this device stays until you clear it.',
    ]),
    h('div', { class: 'report-actions' }, [
      h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => navigate('/account') }, 'Your account'),
      h('button', { class: 'btn btn--block', type: 'button', onClick: () => navigate(store.get().tier ? '/town' : '/') }, store.get().tier ? 'Back to my town' : 'Back to start'),
    ]),
  ]);
  root.append(view);
  view.querySelector('.screen-title')?.focus({ preventScroll: true });
  return () => view.remove();
}
