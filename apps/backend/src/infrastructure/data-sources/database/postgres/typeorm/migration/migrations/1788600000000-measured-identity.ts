import { MigrationInterface, QueryRunner } from "typeorm";

// Identity turns measured. A registered build's id becomes a free-form ALIAS (everything a human
// declares is an alias); only the catalog also declares the exact full version — a custom's truth is
// measured on the device. Environment applications gain the measured layer (package id + versionName
// from the APK manifest, reported at registration) next to the declared words, and the declared
// version becomes nullable: a custom has none until measured.
export class MeasuredIdentity1788600000000 implements MigrationInterface {
    name = "MeasuredIdentity1788600000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"project_application_version\" ADD \"alias\" character varying");
        await queryRunner.query("UPDATE \"project_application_version\" SET \"alias\" = \"version\"");
        await queryRunner.query("ALTER TABLE \"project_application_version\" ALTER COLUMN \"alias\" SET NOT NULL");
        await queryRunner.query("ALTER TABLE \"project_application_version\" ALTER COLUMN \"version\" DROP NOT NULL");
        await queryRunner.query(
            "ALTER TABLE \"project_application_version\" ADD \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()",
        );
        await queryRunner.query(`ALTER TABLE "project_application_version"
            ADD CONSTRAINT "UQ_project_application_build_alias" UNIQUE ("project_application_id", "alias")`);

        await queryRunner.query("ALTER TABLE \"environment_application\" ALTER COLUMN \"application_version\" DROP NOT NULL");
        await queryRunner.query("ALTER TABLE \"environment_application\" ADD \"build_alias\" character varying");
        await queryRunner.query("ALTER TABLE \"environment_application\" ADD \"measured_name\" character varying");
        await queryRunner.query("ALTER TABLE \"environment_application\" ADD \"measured_version\" character varying");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment_application\" DROP COLUMN \"measured_version\"");
        await queryRunner.query("ALTER TABLE \"environment_application\" DROP COLUMN \"measured_name\"");
        await queryRunner.query("ALTER TABLE \"environment_application\" DROP COLUMN \"build_alias\"");
        await queryRunner.query("ALTER TABLE \"environment_application\" ALTER COLUMN \"application_version\" SET NOT NULL");

        await queryRunner.query(
            "ALTER TABLE \"project_application_version\" DROP CONSTRAINT \"UQ_project_application_build_alias\"",
        );
        await queryRunner.query("ALTER TABLE \"project_application_version\" DROP COLUMN \"created_at\"");
        await queryRunner.query("ALTER TABLE \"project_application_version\" ALTER COLUMN \"version\" SET NOT NULL");
        await queryRunner.query("ALTER TABLE \"project_application_version\" DROP COLUMN \"alias\"");
    }
}
