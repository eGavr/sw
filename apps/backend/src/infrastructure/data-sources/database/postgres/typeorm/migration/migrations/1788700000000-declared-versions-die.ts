import { MigrationInterface, QueryRunner } from "typeorm";

// Declared versions die everywhere: a build IS its label plus its artifacts — nobody declares a
// version, not even the catalog. The honest version exists only as measured on the device, and
// measurement always precedes allocatability (it rides the registration heartbeat), so nothing needs
// a declared version even transiently. Dropping environment_application.application_version takes the
// old (environment, name, version) uniqueness with it, replaced by (environment, name, build_alias).
export class DeclaredVersionsDie1788700000000 implements MigrationInterface {
    name = "DeclaredVersionsDie1788700000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"project_application_version\" DROP COLUMN \"version\"");

        await queryRunner.query(
            "UPDATE \"environment_application\" SET \"build_alias\" = COALESCE(\"build_alias\", \"application_version\")",
        );
        await queryRunner.query("ALTER TABLE \"environment_application\" DROP COLUMN \"application_version\"");
        await queryRunner.query(`ALTER TABLE "environment_application"
            ADD CONSTRAINT "UQ_environment_application_build"
            UNIQUE ("environment_id", "application_name", "build_alias")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "ALTER TABLE \"environment_application\" DROP CONSTRAINT \"UQ_environment_application_build\"",
        );
        await queryRunner.query("ALTER TABLE \"environment_application\" ADD \"application_version\" character varying");
        await queryRunner.query("UPDATE \"environment_application\" SET \"application_version\" = \"build_alias\"");

        await queryRunner.query("ALTER TABLE \"project_application_version\" ADD \"version\" character varying");
        await queryRunner.query("UPDATE \"project_application_version\" SET \"version\" = \"alias\"");
    }
}
