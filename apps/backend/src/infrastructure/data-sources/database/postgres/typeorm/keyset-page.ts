import { SelectQueryBuilder } from "typeorm";

import { Page, PageRequest } from "../../../../../application/pagination";

// Applies keyset pagination over (created_at, id) to an already-filtered query builder: orders by the
// pair, fetches one extra row to detect whether a next page exists, and returns the entities plus the
// next cursor. No OFFSET — the query starts right after the cursor row, so skipped rows are never scanned.
export async function keysetPage<T extends { createdAt: Date; id: string }>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    page: PageRequest,
): Promise<Page<T>> {
    // take() (not limit()) bounds the number of ROOT entities even when eager/joined relations are
    // selected — otherwise a OneToMany join would multiply rows and cut the page mid-entity.
    qb.orderBy(`${alias}.createdAt`, "ASC").addOrderBy(`${alias}.id`, "ASC").take(page.limit + 1);

    if (page.after) {
        qb.andWhere(`(${alias}.createdAt, ${alias}.id) > (:__cursorCreatedAt, :__cursorId)`, {
            __cursorCreatedAt: page.after.createdAt,
            __cursorId: page.after.id,
        });
    }

    const rows = await qb.getMany();

    if (rows.length <= page.limit) {
        return { items: rows };
    }

    const items = rows.slice(0, page.limit);
    const last = items[items.length - 1];

    return { items, nextCursor: { createdAt: last.createdAt, id: last.id } };
}
