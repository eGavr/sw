import { MigrationInterface, QueryRunner } from "typeorm";

// An environment may carry a client-chosen human-readable id (AIP-133), unique within its project and
// addressing it in the URL alongside its uid. The partial index lets uid-addressed environments leave it
// NULL, and scopes uniqueness to the project (the same id may exist in different projects).
export class EnvironmentResourceId1787100000000 implements MigrationInterface {
    name = "EnvironmentResourceId1787100000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"resource_id\" character varying");
        await queryRunner.query(
            "CREATE UNIQUE INDEX \"UQ_environment_project_resource_id\" ON \"environment\" "
            + "(\"project_id\", \"resource_id\") WHERE \"resource_id\" IS NOT NULL",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP INDEX \"UQ_environment_project_resource_id\"");
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"resource_id\"");
    }
}
