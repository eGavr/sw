import { PostgresConnection as Connection } from "../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-connection";

import { PgConnection } from "./postgres-connection";

const pgConnection = new PgConnection(Connection.fromEnv());

beforeAll(async () => {
    await pgConnection.initialize();

    await pgConnection.runMigrations();

    await pgConnection.destroy();
});

// Local auth is stateless (any `Bearer <id>` is a user), so only Postgres state needs resetting
// between cases — permissions/accounts live there.
beforeEach(async () => {
    await pgConnection.initialize();

    await pgConnection.unseed();

    await pgConnection.destroy();
});
