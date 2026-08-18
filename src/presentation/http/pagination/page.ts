import { PageCursor } from "../../../application/pagination";

// Opaque, URL-safe page token (AIP-158) over a keyset cursor — the (createdAt, id) of the last row on
// the page. Encodes to base64url; a malformed/absent token means "from the beginning".
export function encodePageToken(cursor: PageCursor): string {
    return Buffer.from(JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.id })).toString("base64url");
}

export function decodePageToken(token?: string): PageCursor | undefined {
    if (!token) {
        return undefined;
    }

    try {
        const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as { c?: unknown; i?: unknown };

        if (typeof decoded.c !== "string" || typeof decoded.i !== "string") {
            return undefined;
        }

        const createdAt = new Date(decoded.c);

        return Number.isNaN(createdAt.getTime()) ? undefined : { createdAt, id: decoded.i };
    } catch {
        return undefined;
    }
}
