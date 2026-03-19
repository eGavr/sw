import { PostgresConnection as Connection } from "../../../src/data/data-sources/database/postgres/postgres-connection";
import { UserCollection } from "../../../src/data/data-sources/resource-provider/local/enties/user-collection";

import { PgConnection } from "./postgres-connection";

const pgConnection = new PgConnection(Connection.fromEnv());

beforeAll(async () => {
    await pgConnection.initialize();

    await pgConnection.runMigrations();

    await pgConnection.destroy();
});

beforeEach(async () => {
    await pgConnection.initialize();

    await pgConnection.unseed();

    await pgConnection.destroy();

    UserCollection.getInstance().clear();
});
