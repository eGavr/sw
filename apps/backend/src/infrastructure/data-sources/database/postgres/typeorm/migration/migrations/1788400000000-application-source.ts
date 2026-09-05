import { MigrationInterface, QueryRunner } from "typeorm";

// Applications gain a source: `provided` (delivered by the service's catalog or preinstalled) or
// `custom` (the user's artifact in the project's delegated bucket — app_key, plus an optional paired
// webdriver_key for browser-like apps). Alongside, the platform family word "linux" is retired for the
// honest OS name: a platform names a concrete OS whose version is really ITS version (ubuntu 24.04,
// android 14) — "linux" survives only as a session-boundary alias.
export class ApplicationSource1788400000000 implements MigrationInterface {
    name = "ApplicationSource1788400000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "ALTER TABLE \"environment_application\" ADD \"source_type\" character varying NOT NULL DEFAULT 'provided'",
        );
        await queryRunner.query("ALTER TABLE \"environment_application\" ADD \"app_key\" character varying");
        await queryRunner.query("ALTER TABLE \"environment_application\" ADD \"webdriver_key\" character varying");

        await queryRunner.query("UPDATE \"environment\" SET \"platform_name\" = 'ubuntu' WHERE \"platform_name\" = 'linux'");
        await queryRunner.query(
            "UPDATE \"compute_binding\" SET \"platform_name\" = 'ubuntu' WHERE \"platform_name\" = 'linux'",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "UPDATE \"compute_binding\" SET \"platform_name\" = 'linux' WHERE \"platform_name\" = 'ubuntu'",
        );
        await queryRunner.query("UPDATE \"environment\" SET \"platform_name\" = 'linux' WHERE \"platform_name\" = 'ubuntu'");

        await queryRunner.query("ALTER TABLE \"environment_application\" DROP COLUMN \"webdriver_key\"");
        await queryRunner.query("ALTER TABLE \"environment_application\" DROP COLUMN \"app_key\"");
        await queryRunner.query("ALTER TABLE \"environment_application\" DROP COLUMN \"source_type\"");
    }
}
