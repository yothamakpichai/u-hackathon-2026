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
  if (!res.ok || !json?.ok) throw Object.assign(new Error(json?.error?.message || `Something went wrong (error ${res.status}). Try again in a moment.`), { code: json?.error?.code || 'HTTP' });
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

export async function signIn(mode, data) {
  const r = await call(mode, { method: 'POST', data });
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
  await call('state', { method: 'POST', data: { state: { ...store.get(), accountSavedAt: at }, updatedAt: at } });
  quietly(store, () => store.set({ accountSavedAt: at }));
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
  if (local.accountSavedAt && server.updatedAt <= local.accountSavedAt) {
    await saveNow(store);
    return 'saved';
  }
  return { ask: server.updatedAt, server };
}

export function useAccountCopy(store, server) {
  quietly(store, () => store.replace({ ...server.state, accountSavedAt: server.updatedAt }));
  applyConfirmations(store, server.confirmations);
}

export function startAutoSave(store) {
  stopAutoSave();
  unsubscribe = store.subscribe(() => {
    if (quiet || !user) return;
    clearTimeout(timer);
    timer = setTimeout(() => saveNow(store).catch(() => {}), SAVE_DELAY);
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
    const server = await call('state');
    // Another device saved after this one: load its copy, so progress follows the account.
    if (server.state && server.updatedAt > (store.get().accountSavedAt || 0)) useAccountCopy(store, server);
    else applyConfirmations(store, server.confirmations);
    startAutoSave(store);
  } catch {
    // stay a guest on this load
  }
}
