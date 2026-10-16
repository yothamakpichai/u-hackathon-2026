// Optional account and saving across devices (BRIEF §16). Guest play needs none of this. When someone is signed in,
// the whole local store is saved to their account a few seconds after each change (newest copy wins on the server),
// and piggy entries a parent confirmed come back marked verified. Nothing here runs unless accounts are available.
const API = 'api/account.php';
const SAVE_DELAY = 4000;

let user = null;
let csrf = null;
let unsubscribe = null;
let timer = 0;
let quiet = false; // our own store writes don't trigger another save

export const currentAccount = () => user;
export const csrfToken = () => csrf;

export async function call(action, { method = 'GET', data, query = '' } = {}) {
  let res;
  try {
    res = await fetch(`${API}?action=${action}${query}`, {
      method,
      credentials: 'same-origin',
      headers: method === 'POST' ? { 'Content-Type': 'application/json', ...(csrf && { 'X-CSRF-Token': csrf }) } : {},
      body: method === 'POST' ? JSON.stringify(data || {}) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Could not reach Penny’s server. Check your connection and try again.'), { code: 'NETWORK' });
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw Object.assign(new Error(json?.error?.message || `Something went wrong (error ${res.status}). Try again in a moment.`), { code: json?.error?.code || 'HTTP', body: json });
  return json;
}

export async function accountsAvailable() {
  try {
    return (await call('status')).enabled === true;
  } catch {
    return false;
  }
}

export async function refreshMe() {
  const r = await call('me');
  user = r.user;
  csrf = r.csrf;
  return user;
}

// Resolves to the signed-in user, or to { pending, token, user } when an under-13 account waits for a parent.
export async function signIn(mode, data) {
  let r;
  try {
    r = await call(mode, { method: 'POST', data });
  } catch (err) {
    if (err.code === 'NEEDS_PARENT') return { pending: true, token: err.body?.parentToken, user: err.body?.user };
    throw err;
  }
  if (r.pending) return { pending: true, token: r.parentToken, user: r.user };
  user = r.user;
  csrf = r.csrf;
  return user;
}

export async function signOut() {
  stopAutoSave();
  await call('logout', { method: 'POST' }).catch(() => {});
  user = null;
  csrf = null;
}

export async function deleteAccount() {
  await call('delete', { method: 'POST' });
  stopAutoSave();
  user = null;
  csrf = null;
}

const hasProgress = (s) => Boolean(s.profile || s.assessment || s.progress?.xp || s.lab || s.piggy);
// This device's progress counts as the account's only when this account saved it (accountUser), never another one's.
const sameName = (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const isMine = (s) => Boolean(user && sameName(s.accountUser, user.username));
// An unanswered "Which progress should we keep?" survives a reload: nothing is loaded or saved until the player chooses.
export const choicePending = (store) => Boolean(user && sameName(store.get().accountPending, user.username));

function quietly(store, fn) {
  quiet = true;
  try {
    fn();
  } finally {
    quiet = false;
  }
}

export function applyConfirmations(store, ids = []) {
  const piggy = store.get().piggy;
  if (!piggy?.entries?.length || !ids.length) return;
  const set = new Set(ids);
  if (!piggy.entries.some((e) => set.has(e.id) && !e.verified)) return;
  quietly(store, () => store.set({ piggy: { ...piggy, entries: piggy.entries.map((e) => (set.has(e.id) ? { ...e, verified: true } : e)) } }));
}

export async function saveNow(store) {
  const at = Date.now();
  const owner = user?.username || null;
  await call('state', { method: 'POST', data: { state: { ...store.get(), accountSavedAt: at, accountUser: owner, accountPending: null }, updatedAt: at } });
  quietly(store, () => store.set({ accountSavedAt: at, accountUser: owner, accountPending: null }));
  return at;
}

// After logging in: returns 'loaded' (the account's progress replaced an empty device), 'saved' (this device's
// progress was saved to the account) or { ask: updatedAt } when both have progress and the player must choose.
export async function loadAfterLogin(store) {
  const server = await call('state');
  const local = store.get();
  if (!server.state) {
    await saveNow(store);
    return 'saved';
  }
  if (!hasProgress(local)) {
    useAccountCopy(store, server);
    return 'loaded';
  }
  if (isMine(local) && local.accountSavedAt && server.updatedAt <= local.accountSavedAt) {
    await saveNow(store);
    return 'saved';
  }
  quietly(store, () => store.set({ accountPending: user.username }));
  return { ask: server.updatedAt, server };
}

export function useAccountCopy(store, server) {
  quietly(store, () => store.replace({ ...server.state, accountSavedAt: server.updatedAt, accountUser: user?.username || null, accountPending: null }));
  applyConfirmations(store, server.confirmations);
}

// One line per copy for the choice: level, XP, Money Check and Piggy entries.
export function describe(s) {
  if (!s) return 'Nothing saved';
  const bits = [s.tier ? s.tier[0].toUpperCase() + s.tier.slice(1) : 'No level yet', `${s.progress?.xp || 0} XP`];
  if (s.assessment) bits.push(`Money Health ${s.assessment.score}`);
  const entries = s.piggy?.entries?.length || 0;
  bits.push(`${entries} Piggy Bank ${entries === 1 ? 'entry' : 'entries'}`);
  return bits.join(' · ');
}

export function startAutoSave(store) {
  stopAutoSave();
  unsubscribe = store.subscribe(() => {
    if (quiet || !user) return;
    clearTimeout(timer);
    timer = setTimeout(
      () =>
        saveNow(store).catch((err) => {
          // Logged out elsewhere (a parent set a new password, or the session ended): stop trying. The account screen
          // then offers to log in again, because this device still remembers which account it saved to.
          if (err.code === 'SIGNED_OUT') {
            stopAutoSave();
            user = null;
            csrf = null;
          }
        }),
      SAVE_DELAY,
    );
  });
}

export function stopAutoSave() {
  clearTimeout(timer);
  unsubscribe?.();
  unsubscribe = null;
}

// On page load: if accounts are on and a session exists, keep saving and pick up parent confirmations.
export async function bootAccount(store) {
  if (!(await accountsAvailable())) return;
  try {
    if (!(await refreshMe())) return;
    if (choicePending(store)) return; // the player hasn't chosen which progress to keep: change nothing until they do
    const server = await call('state');
    const local = store.get();
    if (server.state && server.updatedAt > (local.accountSavedAt || 0)) {
      // Another device saved after this one: load its copy, so progress follows the account. Progress on this device
      // that this account never saved (a guest's, or another account's) is never replaced without asking.
      if (!isMine(local) && hasProgress(local)) {
        quietly(store, () => store.set({ accountPending: user.username }));
        return;
      }
      useAccountCopy(store, server);
    } else applyConfirmations(store, server.confirmations);
    startAutoSave(store);
  } catch {
    // stay a guest on this load
  }
}
