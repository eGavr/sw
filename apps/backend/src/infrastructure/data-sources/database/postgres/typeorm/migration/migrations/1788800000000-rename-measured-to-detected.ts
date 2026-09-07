import { MigrationInterface, QueryRunner } from "typeorm";

// A human declares an alias; the truth is READ off the artifact, not measured — a package id and
// versionName are detected, not quantified. The environment application's honest-identity columns are
// renamed measured_* -> detected_* to say so.
export class RenameMeasuredToDetected1788800000000 implements MigrationInterface {
    name = "RenameMeasuredToDetected1788800000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "ALTER TABLE \"environment_application\" RENAME COLUMN \"measured_name\" TO \"detected_name\"",
        );
        await queryRunner.query(
            "ALTER TABLE \"environment_application\" RENAME COLUMN \"measured_version\" TO \"detected_version\"",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "ALTER TABLE \"environment_application\" RENAME COLUMN \"detected_version\" TO \"measured_version\"",
        );
        await queryRunner.query(
            "ALTER TABLE \"environment_application\" RENAME COLUMN \"detected_name\" TO \"measured_name\"",
        );
    }
}
