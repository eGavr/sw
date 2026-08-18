// Keyset (cursor) pagination — the page position is the sort key of the last row seen, not an offset,
// so pages are stable under inserts and the data source never scans skipped rows. Rows are ordered by
// (createdAt, id); the cursor is that pair. `Page` is what a repository returns; the opaque wire token
// is derived from `nextCursor` in the presentation layer.
export type PageCursor = {
    readonly createdAt: Date;
    readonly id: string;
};

export type PageRequest = {
    readonly limit: number;
    readonly after?: PageCursor;
};

export type Page<T> = {
    readonly items: Array<T>;
    readonly nextCursor?: PageCursor;
};

export const defaultPageSize = 50;
export const maxPageSize = 1000;

export function clampPageSize(pageSize?: number): number {
    return Math.min(Math.max(pageSize ?? defaultPageSize, 1), maxPageSize);
}
