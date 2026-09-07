import { MigrationInterface, QueryRunner } from "typeorm";

// An environment's device field names the KIND of device it is (`pixel-7`, `desktop`) — a model, not
// the name of an instance. The column is renamed to say so; values are already canonical ids.
export class DeviceModel1788900000000 implements MigrationInterface {
    name = "DeviceModel1788900000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" RENAME COLUMN \"device_name\" TO \"device_model\"");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" RENAME COLUMN \"device_model\" TO \"device_name\"");
    }
}
