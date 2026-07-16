/**
 * Client-side Gemini key storage (docs/PLAN.md § "Key transport").
 *
 * Privacy contract, enforced by review:
 *   * `sessionStorage` ONLY — the key dies with the tab. Never localStorage,
 *     never a cookie (a cookie would ride along on every request to the server).
 *   * Never logged, never put in a URL, never written into a request body. The
 *     only way it leaves this module is the caller placing it in the
 *     `X-Gemini-Key` header of a same-origin request.
 *
 * Every accessor is guarded: sessionStorage throws in a server render and in
 * browsers with site data blocked, and a thrown storage error must never take
 * the app down.
 */

const STORAGE_KEY = "signal.gemini_key.v1";

/**
 * Google AI Studio keys are `AIza` + 35 chars. This is a *hint*, not a gate:
 * we warn but never block, so a future key format can't lock a user out.
 */
export function looksLikeGeminiKey(key: string): boolean {
  return /^AIza[0-9A-Za-z_-]{35}$/.test(key);
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Site data blocked — degrade to in-memory-for-this-render, never crash.
    return null;
  }
}

/** The key for this tab, or "" if none. */
export function getKey(): string {
  try {
    return storage()?.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Persist for this tab only. An empty/blank value clears instead of storing. */
export function setKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    clearKey();
    return;
  }
  try {
    storage()?.setItem(STORAGE_KEY, trimmed);
  } catch {
    // Quota or blocked storage: the in-memory key still works for this session.
  }
}

export function clearKey(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the key is already unreachable.
  }
}
