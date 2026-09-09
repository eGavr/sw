import { MigrationInterface, QueryRunner } from "typeorm";

// A connection is now named in every create-environment request where a project has several, so it
// gets the same two things a project has: an optional human-readable id it can be addressed by
// (unique within the project, uid still works) and a free display label. The unique index is partial —
// connections that stay unnamed are all addressed by uid and must not collide on NULL.
export class CloudAccountHandle1789700000000 implements MigrationInterface {
    name = "CloudAccountHandle1789700000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"cloud_account\" ADD \"resource_id\" character varying");
        await queryRunner.query("ALTER TABLE \"cloud_account\" ADD \"display_name\" character varying");
        await queryRunner.query(
            "CREATE UNIQUE INDEX \"UQ_cloud_account_project_resource_id\""
                + " ON \"cloud_account\" (\"project_id\", \"resource_id\") WHERE \"resource_id\" IS NOT NULL",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP INDEX \"UQ_cloud_account_project_resource_id\"");
        await queryRunner.query("ALTER TABLE \"cloud_account\" DROP COLUMN \"display_name\"");
        await queryRunner.query("ALTER TABLE \"cloud_account\" DROP COLUMN \"resource_id\"");
    }
}
