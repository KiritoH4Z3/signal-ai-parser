/**
 * Web Storage plumbing, shared by `key-store.ts` (sessionStorage), `history.ts`
 * and `library.ts` (localStorage).
 *
 * Extracted because all three had grown the same guarded accessor and the same
 * "storage is hostile territory" comment. Storage is absent during a server
 * render, throws on access when site data is blocked, fills up, and returns
 * whatever a previous version of the app — or a user with devtools — left there.
 * Every caller degrades to "no stored data" rather than throwing; a corrupt blob
 * must never be able to take the page down.
 *
 * The *policy* differences stay with the callers, where they are readable: what
 * shape is valid, what a cap is, and whether the data dies with the tab.
 */

export type StorageKind = "local" | "session";

/** The requested Storage, or null when it is unavailable for any reason. */
export function safeStorage(kind: StorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    // Site data blocked (Safari private mode, enterprise policy, an iframe with
    // third-party storage partitioned off).
    return null;
  }
}

/** Read and JSON-parse a stored array. Anything unreadable reads as empty. */
export function readArray(kind: StorageKind, key: string): unknown[] {
  let raw: string | null;
  try {
    raw = safeStorage(kind)?.getItem(key) ?? null;
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt blob: a truncated write, hand-edited data, or something foreign
    // sitting on our key.
    return [];
  }
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Write a value as JSON. Returns false when the write did not land (quota,
 * blocked storage) so a caller that promised the user something was *saved* can
 * tell them the truth. Callers that only mirror in-memory state can ignore it.
 */
export function writeJson(kind: StorageKind, key: string, value: unknown): boolean {
  try {
    const store = safeStorage(kind);
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Remove a key. Failure is indistinguishable from success here, and harmless. */
export function removeKey(kind: StorageKind, key: string): void {
  try {
    safeStorage(kind)?.removeItem(key);
  } catch {
    // Already unreachable — nothing to do.
  }
}

/**
 * Monotonic suffix so two entries minted inside the same millisecond can't
 * collide when `crypto.randomUUID` is unavailable (non-secure origins, older
 * browsers). Not a dependency, not a UUID — just unique within this document.
 */
let counter = 0;

export function newId(prefix: string): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the deterministic path.
  }
  counter += 1;
  return `${prefix}${Date.now().toString(36)}-${counter.toString(36)}`;
}
