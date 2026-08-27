import { MigrationInterface, QueryRunner } from "typeorm";

export class EnvironmentExecution1786400000000 implements MigrationInterface {
    name = "EnvironmentExecution1786400000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "ALTER TABLE \"environment\" ADD \"execution\" character varying NOT NULL DEFAULT 'container'",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"execution\"");
    }

}
