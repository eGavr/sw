// Environments whose session was just killed: the busy hint clears with the next agent heartbeat
// (~3s), and this marker bridges the gap — persisted so a page reload right after a kill does not
// resurrect a stale "busy". Entries carry their own expiry and are pruned on every read, so the store
// cannot accumulate: nothing here outlives freeingTtlMs.

export const freeingTtlMs = 15_000;

const storageKey = "sw:freeing-environments";

type Entries = Record<string, number>; // environment uid -> expiresAt (epoch ms)

function read(): Entries {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return (JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Entries) ?? {};
  } catch {
    return {};
  }
}

function write(entries: Entries): void {
  if (typeof window === "undefined") {
    return;
  }

  if (Object.keys(entries).length === 0) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(entries));
}

function pruned(): Entries {
  const now = Date.now();
  const alive = Object.fromEntries(Object.entries(read()).filter(([, expiresAt]) => expiresAt > now));

  write(alive);

  return alive;
}

export function loadFreeing(): Set<string> {
  return new Set(Object.keys(pruned()));
}

export function addFreeing(environmentUid: string): void {
  write({ ...pruned(), [environmentUid]: Date.now() + freeingTtlMs });
}

export function removeFreeing(environmentUid: string): void {
  const entries = pruned();
  delete entries[environmentUid];
  write(entries);
}
