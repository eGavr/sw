import { DataSource } from "typeorm";

export class PgConnection {
    constructor(private readonly connection: DataSource) {}

    async initialize(): Promise<void> {
        await this.connection.initialize();
    }

    async runMigrations(): Promise<void> {
        await this.connection.runMigrations();
    }

    async unseed(): Promise<void> {
        const tableNamesToUnseed = await this.getTableNames({ exclude: [this.migrationsTableName] });

        await this.truncateTables(tableNamesToUnseed);
    }

    private get migrationsTableName(): string {
        const migrationsTableName = this.connection.options.migrationsTableName;
        if (!migrationsTableName) {
            throw new Error("migrations table name: must be specified explicitly");
        }

        return migrationsTableName;
    }

    private async getTableNames({ exclude }: { exclude: Array<string> }): Promise<Array<string>> {
        const result: Array<{ "table_name": string }> = await this.connection.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        `);

        return result.map((item) => item["table_name"]).filter((tableName) => !exclude.includes(tableName));
    }

    private async truncateTables(tableNames: Array<string>): Promise<void> {
        await this.connection.query(`TRUNCATE TABLE "${tableNames.join("\", \"")}" CASCADE`);
    }

    async destroy(): Promise<void> {
        await this.connection.destroy();
    }
}
