import { MigrationInterface, QueryRunner } from "typeorm";

// The reserved catalog project is named for what it holds — applications — not for who owns it.
export class ApplicationCatalogName1789200000000 implements MigrationInterface {
    name = "ApplicationCatalogName1789200000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "UPDATE \"project\" SET \"name\" = 'Application catalog' WHERE \"resource_id\" = 'catalog' AND \"name\" = 'Install catalog'",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "UPDATE \"project\" SET \"name\" = 'Install catalog' WHERE \"resource_id\" = 'catalog' AND \"name\" = 'Application catalog'",
        );
    }
}
