import { MigrationInterface, QueryRunner } from "typeorm";

// A provider account now declares the substrate it provisions — (platform, execution) — so an account can
// hold several providers and create-environment routes by that pair. Existing rows are backfilled from the
// provider name (android* -> android, otherwise linux) and default to the container execution.
export class ProviderAccountSubstrate1786500000000 implements MigrationInterface {
    name = "ProviderAccountSubstrate1786500000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"provider_account\" ADD \"platform_name\" character varying");
        await queryRunner.query("ALTER TABLE \"provider_account\" ADD \"execution\" character varying");
        await queryRunner.query("UPDATE \"provider_account\" SET \"execution\" = 'container' WHERE \"execution\" IS NULL");
        await queryRunner.query(
            "UPDATE \"provider_account\" SET \"platform_name\" = CASE WHEN \"provider\" LIKE 'android%' THEN 'android' ELSE 'linux' END WHERE \"platform_name\" IS NULL",
        );
        await queryRunner.query("ALTER TABLE \"provider_account\" ALTER COLUMN \"platform_name\" SET NOT NULL");
        await queryRunner.query("ALTER TABLE \"provider_account\" ALTER COLUMN \"execution\" SET NOT NULL");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"provider_account\" DROP COLUMN \"execution\"");
        await queryRunner.query("ALTER TABLE \"provider_account\" DROP COLUMN \"platform_name\"");
    }
}
