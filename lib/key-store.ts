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
 * Every accessor is guarded (see `lib/storage.ts`): sessionStorage throws in a
 * server render and in browsers with site data blocked, and a thrown storage
 * error must never take the app down.
 */

import { removeKey, safeStorage } from "@/lib/storage";

const STORAGE_KEY = "signal.gemini_key.v1";

/**
 * Google AI Studio keys are `AIza` + 35 chars. This is a *hint*, not a gate:
 * we warn but never block, so a future key format can't lock a user out.
 */
export function looksLikeGeminiKey(key: string): boolean {
  return /^AIza[0-9A-Za-z_-]{35}$/.test(key);
}

/**
 * The key is stored as a raw string, not JSON — hence `safeStorage` directly
 * rather than the `readArray`/`writeJson` helpers next to it.
 */
function storage(): Storage | null {
  return safeStorage("session");
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
  // Nothing to do on failure — the key is already unreachable.
  removeKey("session", STORAGE_KEY);
}
