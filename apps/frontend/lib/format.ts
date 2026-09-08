const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The GitHub-short-SHA convention: a uuid reads as its first group (8 chars), the full value stays a
// tooltip/copy away. Human-chosen ids are shown as-is — they are short and meaningful already.
export function shortId(handle: string): string {
  return uuidPattern.test(handle) ? handle.slice(0, 8) : handle;
}

// "12s ago" / "3m ago" for a liveness timestamp; the exact instant stays a tooltip away.
export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));

  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  return `${Math.floor(seconds / 86400)}d ago`;
}
