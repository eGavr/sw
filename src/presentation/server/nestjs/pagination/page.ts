export type Page<T> = {
    items: Array<T>;
    nextPageToken?: string;
};

const defaultPageSize = 50;
const maxPageSize = 1000;

// Opaque, URL-safe page tokens over an offset (AIP-158). Real backends would paginate at the data
// source; ours returns the full list, so a page is sliced here.
export function paginate<T>(items: Array<T>, pageSize?: number, pageToken?: string): Page<T> {
    const size = Math.min(Math.max(pageSize ?? defaultPageSize, 1), maxPageSize);
    const offset = decodeOffset(pageToken);
    const nextOffset = offset + size;

    return {
        items: items.slice(offset, nextOffset),
        nextPageToken: nextOffset < items.length ? encodeOffset(nextOffset) : undefined,
    };
}

function encodeOffset(offset: number): string {
    return Buffer.from(String(offset)).toString("base64url");
}

function decodeOffset(pageToken?: string): number {
    if (!pageToken) {
        return 0;
    }

    const offset = Number(Buffer.from(pageToken, "base64url").toString("utf8"));

    return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}
