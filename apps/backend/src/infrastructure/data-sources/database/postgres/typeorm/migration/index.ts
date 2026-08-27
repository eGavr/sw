import { PostgresConnection } from "../postgres-connection";

export const postgresConnection = PostgresConnection.fromEnv();
