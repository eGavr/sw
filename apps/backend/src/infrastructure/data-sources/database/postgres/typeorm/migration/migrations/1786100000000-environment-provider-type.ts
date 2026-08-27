import { MigrationInterface, QueryRunner } from "typeorm";

export class EnvironmentProviderType1786100000000 implements MigrationInterface {
    name = "EnvironmentProviderType1786100000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"provider_type\" character varying");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"provider_type\"");
    }

}
