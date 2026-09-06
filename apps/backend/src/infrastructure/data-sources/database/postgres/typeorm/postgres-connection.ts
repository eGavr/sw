import { readFileSync } from "fs";
import path from "path";

import "reflect-metadata"
import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";

import { CloudAccount } from "./entities/cloud-account/cloud-account";
import { ComputeBinding } from "./entities/cloud-account/compute-binding";
import { Environment } from "./entities/environment/environment";
import { EnvironmentApplication } from "./entities/environment/environment-application";
import { HostPlacement } from "./entities/host-pool/host-placement";
import { PoolHost } from "./entities/host-pool/pool-host";
import { NetBridgeCredential } from "./entities/net-bridge-credential/net-bridge-credential";
import { Project } from "./entities/project/project";
import { ProjectIamBinding } from "./entities/project/project-iam-binding";
import { ProjectApplication } from "./entities/project-application/project-application";
import { ProjectApplicationVersion } from "./entities/project-application/project-application-version";
import { SessionOwnership } from "./entities/session-ownership/session-ownership";
import { StorageDestination } from "./entities/storage-destination/storage-destination";
import { User } from "./entities/user/user";

export class PostgresConnection {
    static fromEnv(): DataSource {
        config({ 
            path: [".env", `env/.env.${process.env.NODE_ENV || "development"}`], 
            quiet: true, 
        });

        const configService = new ConfigService();

        return PostgresConnection.create(configService);
    }

    static create(configService: ConfigService): DataSource {
        return new DataSource({
            type: "postgres",
            host: configService.getOrThrow("POSTGRES_HOST"),
            port: Number(configService.getOrThrow("POSTGRES_PORT")),
            username: configService.getOrThrow("POSTGRES_USER"),
            password: configService.getOrThrow("POSTGRES_PASSWORD"),
            database: configService.getOrThrow("POSTGRES_DATABASE"),
            ssl: PostgresConnection.ssl(configService),
            migrations: [path.join(__dirname, "migration", "migrations", "*")],
            migrationsTableName: "__migrations",
            namingStrategy: new SnakeNamingStrategy(),
            entities: [
                ProjectIamBinding,
                Project,
                User,
                CloudAccount,
                ComputeBinding,
                Environment,
                EnvironmentApplication,
                PoolHost,
                HostPlacement,
                NetBridgeCredential,
                SessionOwnership,
                StorageDestination,
                ProjectApplication,
                ProjectApplicationVersion,
            ],
        })
    }

    // TLS is off by default (local dev / kind). Managed clusters (e.g. Yandex Managed PostgreSQL)
    // require it: set POSTGRES_SSL=true, and POSTGRES_SSL_CA to the CA bundle for full verification.
    private static ssl(configService: ConfigService): boolean | { ca?: string; rejectUnauthorized: boolean } {
        if (configService.get<string>("POSTGRES_SSL") !== "true") {
            return false;
        }

        const caPath = configService.get<string>("POSTGRES_SSL_CA");

        return caPath ? { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: false };
    }
}
