import path from "path";

import "reflect-metadata"
import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";

import { Account } from "./entities/account";
import { AccountResourceProvider } from "./entities/account-resource-provider";
import { User } from "./entities/user";

export class PostgresConnection {
    static fromEnv(): PostgresConnection {
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
            migrations: [path.join(__dirname, "migration", "migrations", "*")],
            migrationsTableName: "__migrations",
            namingStrategy: new SnakeNamingStrategy(),
            entities: [
                Account,
                AccountResourceProvider,
                User,
            ],
        })
    }
}
