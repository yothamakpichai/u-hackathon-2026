// The app store: one plain object, persisted under one localStorage key.
// Each feature owns one top-level key (tier, muted, check, lesson, lab, ...). Keep it small:
// no per-tick data. If storage is blocked (private mode, full quota) the app keeps working in memory.
import { STORAGE_KEY, getTier } from './config.js';

const DEFAULTS = Object.freeze({ tier: null, muted: false });
const SAVE_DELAY_MS = 250;

function readSaved() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function createStore() {
  let state = { ...DEFAULTS, ...readSaved() };
  if (!getTier(state.tier)) state = { ...state, tier: null };

  const listeners = new Set();
  let saveTimer = 0;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable: state still lives in memory for this visit.
    }
  }

  function scheduleSave() {
    if (!saveTimer) saveTimer = setTimeout(save, SAVE_DELAY_MS);
  }

  function emit() {
    for (const fn of listeners) {
      try {
        fn(state);
      } catch (err) {
        console.error(err);
      }
    }
  }

  // Never lose the last write when the tab closes or goes to the background.
  addEventListener('pagehide', () => saveTimer && save());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) save();
  });

  return {
    get: () => state,

    // Shallow merge. Pass an object, or a function (state) => patch.
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      scheduleSave();
      emit();
      return state;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    reset() {
      state = { ...DEFAULTS };
      save();
      emit();
    },

    // Swap in a whole saved state, for example progress loaded from an account (BRIEF §16).
    replace(next) {
      state = { ...DEFAULTS, ...next };
      save();
      emit();
    },
  };
}
