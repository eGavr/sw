import { MigrationInterface, QueryRunner } from "typeorm";

// Pessimistic session allocation: occupancy becomes a three-way word (free | reserved | busy) instead
// of the busy boolean. `occupancy_last_confirmed_at` is when that word was last vouched for by its
// owner — the reserving wd keeps confirming `reserved` while the node creates the session, the agent's
// heartbeat confirms `busy`/`free` (and deliberately does NOT confirm a reservation it cannot know
// about, which is how a dead reserver's hold goes stale). The partial index is the sweep's work list:
// near-empty in steady state, maintained only on reservation-side writes.
export class EnvironmentOccupancy1787700000000 implements MigrationInterface {
    name = "EnvironmentOccupancy1787700000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"occupancy\" character varying NOT NULL DEFAULT 'free'");
        await queryRunner.query("UPDATE \"environment\" SET \"occupancy\" = 'busy' WHERE \"busy\" = true");
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"busy\"");
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"occupancy_last_confirmed_at\" TIMESTAMP WITH TIME ZONE");
        await queryRunner.query(
            "CREATE INDEX \"IDX_environment_stale_reservation\" ON \"environment\" (\"occupancy_last_confirmed_at\") "
            + "WHERE \"occupancy\" = 'reserved'",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP INDEX \"IDX_environment_stale_reservation\"");
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"occupancy_last_confirmed_at\"");
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"busy\" boolean NOT NULL DEFAULT false");
        await queryRunner.query("UPDATE \"environment\" SET \"busy\" = true WHERE \"occupancy\" = 'busy'");
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"occupancy\"");
    }
}
