import { MigrationInterface, QueryRunner } from "typeorm";

// Disconnecting a cloud is now a real delete (refused while environments reference the account), so the
// active/disabled state that existed only for soft delete goes away.
export class DropCloudAccountState1787500000000 implements MigrationInterface {
    name = "DropCloudAccountState1787500000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DELETE FROM \"cloud_account\" WHERE \"state\" = 'disabled' AND NOT EXISTS (SELECT 1 FROM \"environment\" WHERE \"environment\".\"cloud_account_id\" = \"cloud_account\".\"id\")");
        await queryRunner.query("ALTER TABLE \"cloud_account\" DROP COLUMN \"state\"");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"cloud_account\" ADD \"state\" character varying NOT NULL DEFAULT 'active'");
    }
}
