import { MigrationInterface, QueryRunner } from "typeorm";

// A project may carry a client-chosen human-readable id (AIP-133), addressing it in the URL alongside its
// uid. Unique when set; the partial index lets uid-addressed projects leave it NULL without collisions.
export class ProjectResourceId1787000000000 implements MigrationInterface {
    name = "ProjectResourceId1787000000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"project\" ADD \"resource_id\" character varying");
        await queryRunner.query(
            "CREATE UNIQUE INDEX \"UQ_project_resource_id\" ON \"project\" (\"resource_id\") WHERE \"resource_id\" IS NOT NULL",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP INDEX \"UQ_project_resource_id\"");
        await queryRunner.query("ALTER TABLE \"project\" DROP COLUMN \"resource_id\"");
    }
}
