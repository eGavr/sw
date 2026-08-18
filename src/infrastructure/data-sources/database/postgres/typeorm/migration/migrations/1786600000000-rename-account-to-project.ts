import { MigrationInterface, QueryRunner } from "typeorm";

// The tenant aggregate was renamed Account -> Project. Rename the tables and the account_id foreign-key
// columns to match; FK references follow the renamed tables automatically (constraint names are left as-is).
export class RenameAccountToProject1786600000000 implements MigrationInterface {
    name = "RenameAccountToProject1786600000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"account\" RENAME TO \"project\"");
        await queryRunner.query("ALTER TABLE \"account_iam_binding\" RENAME TO \"project_iam_binding\"");
        await queryRunner.query("ALTER TABLE \"environment\" RENAME COLUMN \"account_id\" TO \"project_id\"");
        await queryRunner.query("ALTER TABLE \"provider_account\" RENAME COLUMN \"account_id\" TO \"project_id\"");
        await queryRunner.query("ALTER TABLE \"storage_destination\" RENAME COLUMN \"account_id\" TO \"project_id\"");
        await queryRunner.query("ALTER TABLE \"project_iam_binding\" RENAME COLUMN \"account_id\" TO \"project_id\"");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"project_iam_binding\" RENAME COLUMN \"project_id\" TO \"account_id\"");
        await queryRunner.query("ALTER TABLE \"storage_destination\" RENAME COLUMN \"project_id\" TO \"account_id\"");
        await queryRunner.query("ALTER TABLE \"provider_account\" RENAME COLUMN \"project_id\" TO \"account_id\"");
        await queryRunner.query("ALTER TABLE \"environment\" RENAME COLUMN \"project_id\" TO \"account_id\"");
        await queryRunner.query("ALTER TABLE \"project_iam_binding\" RENAME TO \"account_iam_binding\"");
        await queryRunner.query("ALTER TABLE \"project\" RENAME TO \"account\"");
    }
}
