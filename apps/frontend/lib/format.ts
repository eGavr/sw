const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The GitHub-short-SHA convention: a uuid reads as its first group (8 chars), the full value stays a
// tooltip/copy away. Human-chosen ids are shown as-is — they are short and meaningful already.
export function shortId(handle: string): string {
  return uuidPattern.test(handle) ? handle.slice(0, 8) : handle;
}
