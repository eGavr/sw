import { MigrationInterface, QueryRunner } from "typeorm";

// The delivery catalog becomes project data (the GCE vendor-project model): applications registered in
// a project, versions being its builds pointing at their artifacts. The reserved `catalog` project's
// rows are the install's provided set; a user project's rows are its customs. Environment snapshots
// rename app_key/webdriver_key to app_ref/webdriver_ref — provided builds snapshot refs too now (an
// environment is self-contained; registry edits never touch a live one).
export class ProjectApplications1788500000000 implements MigrationInterface {
    name = "ProjectApplications1788500000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "project_application" (
            "id" uuid NOT NULL,
            "project_id" uuid NOT NULL,
            "platform_name" character varying NOT NULL,
            "name" character varying NOT NULL,
            "aliases" jsonb NOT NULL DEFAULT '[]',
            "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
            CONSTRAINT "PK_project_application" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_project_application_word" UNIQUE ("project_id", "platform_name", "name"))`);
        await queryRunner.query(`ALTER TABLE "project_application"
            ADD CONSTRAINT "FK_project_application_project" FOREIGN KEY ("project_id")
            REFERENCES "project"("id") ON DELETE CASCADE`);

        await queryRunner.query(`CREATE TABLE "project_application_version" (
            "id" uuid NOT NULL,
            "project_application_id" uuid NOT NULL,
            "version" character varying NOT NULL,
            "app_ref" character varying,
            "webdriver_ref" character varying,
            CONSTRAINT "PK_project_application_version" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_project_application_version" UNIQUE ("project_application_id", "version"))`);
        await queryRunner.query(`ALTER TABLE "project_application_version"
            ADD CONSTRAINT "FK_project_application_version_application" FOREIGN KEY ("project_application_id")
            REFERENCES "project_application"("id") ON DELETE CASCADE`);

        await queryRunner.query("ALTER TABLE \"environment_application\" RENAME COLUMN \"app_key\" TO \"app_ref\"");
        await queryRunner.query(
            "ALTER TABLE \"environment_application\" RENAME COLUMN \"webdriver_key\" TO \"webdriver_ref\"",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "ALTER TABLE \"environment_application\" RENAME COLUMN \"webdriver_ref\" TO \"webdriver_key\"",
        );
        await queryRunner.query("ALTER TABLE \"environment_application\" RENAME COLUMN \"app_ref\" TO \"app_key\"");
        await queryRunner.query("DROP TABLE \"project_application_version\"");
        await queryRunner.query("DROP TABLE \"project_application\"");
    }
}
