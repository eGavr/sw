import { MigrationInterface, QueryRunner } from "typeorm";

// Rename the compute-provider column to `provider` on the aggregates that carry it, disambiguating it
// from the identity provider (user.provider_type, left untouched).
export class RenameProviderTypeToProvider1786300000000 implements MigrationInterface {
    name = "RenameProviderTypeToProvider1786300000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"provider_account\" RENAME COLUMN \"provider_type\" TO \"provider\"");
        await queryRunner.query("ALTER TABLE \"environment\" RENAME COLUMN \"provider_type\" TO \"provider\"");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" RENAME COLUMN \"provider\" TO \"provider_type\"");
        await queryRunner.query("ALTER TABLE \"provider_account\" RENAME COLUMN \"provider\" TO \"provider_type\"");
    }

}
