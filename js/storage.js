// localStorage wrapper. Every access is guarded; if storage fails the app keeps
// working from memory and `status()` reports the problem so the UI can say so.

export const KEY = 'budget.v1';

let lastGood = true;
let problem = null; // null | 'unavailable' | 'corrupt' | 'full'

function getLS() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** @returns {{ value: object|null, problem: string|null }} */
export function load() {
  const ls = getLS();
  if (!ls) { lastGood = false; problem = 'unavailable'; return { value: null, problem }; }
  let raw;
  try {
    raw = ls.getItem(KEY);
  } catch {
    lastGood = false; problem = 'unavailable';
    return { value: null, problem };
  }
  if (raw === null) return { value: null, problem: null };
  try {
    return { value: JSON.parse(raw), problem: null };
  } catch {
    // Keep the unreadable copy so nothing is silently lost.
    try { ls.setItem(`${KEY}.unreadable-${Date.now()}`, raw); } catch { /* ignore */ }
    problem = 'corrupt';
    return { value: null, problem };
  }
}

/** Save the whole state. Returns true on success. */
export function save(data) {
  const ls = getLS();
  if (!ls) { lastGood = false; problem = 'unavailable'; return false; }
  try {
    ls.setItem(KEY, JSON.stringify(data));
    lastGood = true;
    if (problem === 'unavailable' || problem === 'full') problem = null;
    return true;
  } catch (err) {
    lastGood = false;
    problem = err && /quota/i.test(err.name || '') ? 'full' : 'unavailable';
    return false;
  }
}

/** Keep a copy of data we couldn't use, under a separate key. */
export function backup(label, value) {
  try { getLS()?.setItem(`${KEY}.${label}-${Date.now()}`, JSON.stringify(value)); } catch { /* ignore */ }
}

/** Raw read of a small flag (used for the test-only no-seed switch). */
export function readFlag(name) {
  try { return getLS()?.getItem(name) ?? null; } catch { return null; }
}

export function status() {
  return { ok: lastGood && problem !== 'unavailable' && problem !== 'full', problem };
}

/** Ask the browser not to evict our data. Resolves to true/false/null (unsupported). */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
