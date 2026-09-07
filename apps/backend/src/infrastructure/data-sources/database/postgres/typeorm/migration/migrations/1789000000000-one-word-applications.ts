import { MigrationInterface, QueryRunner } from "typeorm";

// An application is ONE word whoever registers it — the catalog project behaves like any other. The
// catalog's reverse-DNS canonicals with a wire alias (`com.android.settings` + `settings`) become the
// alias word itself (identity is detected on the device, never declared), environments addressing
// them follow, and the aliases column goes.
export class OneWordApplications1789000000000 implements MigrationInterface {
    name = "OneWordApplications1789000000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "environment_application" ea
            SET "application_name" = pa."aliases"->>0
            FROM "project_application" pa
            JOIN "project" p ON p."id" = pa."project_id"
            WHERE p."resource_id" = 'catalog'
              AND jsonb_array_length(pa."aliases") > 0
              AND ea."application_name" = pa."name"
        `);
        await queryRunner.query(`
            UPDATE "project_application" pa
            SET "name" = pa."aliases"->>0
            FROM "project" p
            WHERE p."id" = pa."project_id"
              AND p."resource_id" = 'catalog'
              AND jsonb_array_length(pa."aliases") > 0
        `);
        await queryRunner.query("ALTER TABLE \"project_application\" DROP COLUMN \"aliases\"");
    }

    // The column returns empty: the aliases are gone for good, the words they became stay.
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "ALTER TABLE \"project_application\" ADD COLUMN \"aliases\" jsonb NOT NULL DEFAULT '[]'",
        );
    }
}
