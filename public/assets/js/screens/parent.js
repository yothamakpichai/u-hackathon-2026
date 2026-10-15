// Parent link (BRIEF §16): a parent opens their child's private link on their own phone. They see a read-only
// snapshot of progress, can confirm Piggy Bank entries (a "verified" seal only) and can set a new password, so no
// child email is ever collected. The link works until the child makes a new one or stops sharing.
import { h, icon, stateView } from '../ui.js';

const API = 'api/account.php';
const TYPE_NAMES = { turtle: 'Steady Turtle', eagle: 'Patient Eagle', cat: 'Cosy Cat', monkey: 'Spark Monkey' };
const baht = (n) => `${Math.round(n).toLocaleString('en-US')} baht`;

export function mount(root, ctx) {
  const { navigate } = ctx;
  const token = new URLSearchParams(location.hash.split('?')[1] || '').get('t') || '';
  let alive = true;
  const view = h('section', { class: 'screen parent' });
  root.append(view);

  async function post(action, data) {
    const res = await fetch(`${API}?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, ...data }) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'That didn’t work. Try again in a moment.');
    return json;
  }

  async function load() {
    view.replaceChildren(stateView({ kind: 'loading', title: 'Opening your child’s progress…' }));
    let snap;
    try {
      const res = await fetch(`${API}?action=parent_view&t=${encodeURIComponent(token)}`);
      snap = await res.json();
      if (!res.ok || !snap?.ok) throw new Error(snap?.error?.message || 'This parent link doesn’t work. Ask your child to make a new one.');
    } catch (err) {
      if (alive) view.replaceChildren(stateView({ kind: 'error', title: 'This link can’t be opened', body: err.message, actions: [h('button', { class: 'btn', type: 'button', onClick: () => navigate('/') }, 'Go to Penny')] }));
      return;
    }
    if (!alive) return;
    const c = snap.child;
    const stat = (label, value) => h('li', { class: 'parent__stat' }, [h('span', { text: label }), h('strong', { text: value })]);
    const goals = snap.piggy.goals;
    const goalName = Object.fromEntries(goals.map((g) => [g.id, g.name]));

    view.replaceChildren(
      h('div', { class: 'screen-head' }, [
        h('p', { class: 'screen-eyebrow', text: 'Parent view · read-only' }),
        h('h1', { class: 'screen-title', tabindex: '-1', text: `${c.username}’s progress` }),
        h('p', { class: 'screen-sub', text: snap.savedAt ? `Age ${c.age}. Last saved ${new Date(snap.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : `Age ${c.age}. Nothing has been saved to the account yet.` }),
      ]),
      h('section', { class: 'card' }, [
        h('h2', { class: 'report-section__title', text: 'At a glance' }),
        h('ul', { class: 'parent__stats' }, [
          stat('Money Health Score', snap.moneyCheck ? `${snap.moneyCheck.score} / 100` : 'Not taken yet'),
          stat('Money Type', snap.moneyCheck ? TYPE_NAMES[snap.moneyCheck.type] || '–' : '–'),
          stat('Streak', `${snap.streak} day${snap.streak === 1 ? '' : 's'}`),
          stat('XP', String(snap.xp)),
          stat('Learning Path steps', String(snap.pathSteps)),
        ]),
        snap.market
          ? h('p', { class: 'part__why', text: `Last practice market (${snap.market.date}): the biggest single coin reached ${Math.round(snap.market.biggestCoinPct)}% of the money, cash never fell below ${Math.round(snap.market.lowestCashPct)}%, and ${snap.market.panicSells} panic sale${snap.market.panicSells === 1 ? '' : 's'} after bad news. All simulated money.` })
          : null,
      ]),
      h('section', { class: 'card parent__piggy' }, [
        h('h2', { class: 'report-section__title', text: 'Piggy Bank: real savings your child recorded' }),
        h('p', { class: 'part__why', text: 'Penny never touches this money. Confirming an entry only adds a “verified by a parent” seal.' }),
        goals.length
          ? h('ul', { class: 'parent__goals' }, goals.map((g) => h('li', {}, [h('strong', { text: g.name || 'Goal' }), ` ${baht(g.saved)} of ${baht(g.target)}`])))
          : h('p', { text: 'No goals yet.' }),
        snap.piggy.entries.length
          ? h(
              'ul',
              { class: 'parent__entries' },
              snap.piggy.entries.map((e) => {
                const seal = h('span', { class: 'chip chip--ok' }, [icon('check', { size: 14 }), 'Verified']);
                const confirm = h('button', { class: 'btn btn--sm', type: 'button', onClick: async () => { confirm.disabled = true; try { await post('parent_confirm', { entryId: e.id }); confirm.replaceWith(seal); } catch (err) { confirm.disabled = false; confirm.textContent = err.message; } } }, 'Confirm');
                return h('li', { class: 'parent__entry' }, [
                  h('span', { text: `${e.date} · ${e.kind === 'in' ? 'saved' : 'took out'} ${baht(e.amount)}${e.goalId && goalName[e.goalId] ? ` · ${goalName[e.goalId]}` : ''}` }),
                  e.verified ? seal : confirm,
                ]);
              }),
            )
          : h('p', { text: 'No entries yet.' }),
      ]),
      resetCard(c.username),
      h('p', { class: 'part__why', text: 'This page shows progress only. It never shows your child’s password or anything they typed to Penny. The link stops working when your child makes a new one or stops sharing.' }),
    );
    view.querySelector('h1')?.focus({ preventScroll: true });
  }

  function resetCard(name) {
    const pass = h('input', { id: 'parent-pass', class: 'arena-input', type: 'password', autocomplete: 'new-password', maxlength: 128 });
    const again = h('input', { id: 'parent-pass2', class: 'arena-input', type: 'password', autocomplete: 'new-password', maxlength: 128 });
    const note = h('p', { class: 'part__why', role: 'status' });
    const form = h('form', { class: 'card arena-auth', novalidate: true, onSubmit: async (e) => {
      e.preventDefault();
      if (pass.value !== again.value) {
        note.textContent = 'The two passwords don’t match.';
        return;
      }
      try {
        await post('parent_reset', { password: pass.value });
        note.textContent = `Done. ${name} can log in with the new password now. Every other device was logged out.`;
        pass.value = '';
        again.value = '';
      } catch (err) {
        note.textContent = err.message;
      }
    } }, [
      h('h2', { class: 'report-section__title', text: 'Forgotten password?' }),
      h('p', { text: `Set a new password for ${name}. At least 8 characters.` }),
      h('div', { class: 'arena-field' }, [h('label', { class: 'arena-label', for: 'parent-pass', text: 'New password' }), pass]),
      h('div', { class: 'arena-field' }, [h('label', { class: 'arena-label', for: 'parent-pass2', text: 'Type it again' }), again]),
      h('button', { class: 'btn btn--block', type: 'submit' }, 'Set the new password'),
      note,
    ]);
    return form;
  }

  load();
  return () => {
    alive = false;
    view.remove();
  };
}
