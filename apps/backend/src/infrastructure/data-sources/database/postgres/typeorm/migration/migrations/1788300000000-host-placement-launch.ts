import { MigrationInterface, QueryRunner } from "typeorm";

// What the slot launcher needs to start this seat's workload (AVD name, internal callback URL, …).
// Opaque to the pool — the bridge that placed the workload wrote it, and the host agent hands it to
// the launcher verbatim; this is what keeps the pool generic across workload types.
export class HostPlacementLaunch1788300000000 implements MigrationInterface {
    name = "HostPlacementLaunch1788300000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"host_placement\" ADD \"launch\" jsonb NOT NULL DEFAULT '{}'");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"host_placement\" DROP COLUMN \"launch\"");
    }
}
