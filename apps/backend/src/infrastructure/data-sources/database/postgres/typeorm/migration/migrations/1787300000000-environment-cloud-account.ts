import { MigrationInterface, QueryRunner } from "typeorm";

// Route environments by cloud account instead of provider account (provider = compute kind x cloud):
// drop provider_account_id/provider, add cloud_account_id (FK -> cloud_account) + cloud_type (denormalised
// for routing by (cloud type, execution)). Breaking, no real data to preserve (no users) — any pre-existing
// environment rows lose their routing binding, which is fine since the old provider model is being removed.
export class EnvironmentCloudAccount1787300000000 implements MigrationInterface {
    name = "EnvironmentCloudAccount1787300000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" DROP CONSTRAINT \"FK_a313ad85d25087dda56032513a6\"");
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"provider_account_id\"");
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"provider\"");
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"cloud_account_id\" uuid");
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"cloud_type\" character varying");
        await queryRunner.query("ALTER TABLE \"environment\" ADD CONSTRAINT \"FK_environment_cloud_account\" FOREIGN KEY (\"cloud_account_id\") REFERENCES \"cloud_account\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" DROP CONSTRAINT \"FK_environment_cloud_account\"");
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"cloud_type\"");
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"cloud_account_id\"");
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"provider\" character varying");
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"provider_account_id\" uuid");
        await queryRunner.query("ALTER TABLE \"environment\" ADD CONSTRAINT \"FK_a313ad85d25087dda56032513a6\" FOREIGN KEY (\"provider_account_id\") REFERENCES \"provider_account\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION");
    }
}
