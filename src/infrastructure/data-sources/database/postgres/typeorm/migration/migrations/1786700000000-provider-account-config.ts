import { MigrationInterface, QueryRunner } from "typeorm";

// A provider account now carries an opaque provider-specific `config` (JSON) the adapter interprets,
// replacing the single `external_ref` string (which folds into config as just another key).
export class ProviderAccountConfig1786700000000 implements MigrationInterface {
    name = "ProviderAccountConfig1786700000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"provider_account\" ADD \"config\" jsonb NOT NULL DEFAULT '{}'");
        await queryRunner.query("ALTER TABLE \"provider_account\" DROP COLUMN \"external_ref\"");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"provider_account\" ADD \"external_ref\" character varying");
        await queryRunner.query("ALTER TABLE \"provider_account\" DROP COLUMN \"config\"");
    }
}
