import { MigrationInterface, QueryRunner } from "typeorm";

// Index audit: every recurring query gets an index (small data today is no excuse — tables grow).
// - (state, created_at): the worker's claim (withNext: state + oldest-first FOR UPDATE SKIP LOCKED)
//   and the deleting-drain findByState.
// - (state, updated_at): the reaper's stuck-provisioning and crashed-executing sweeps.
// - (state, last_heartbeat_at): GC's "deleting and its container is provably gone" predicate.
// - (project_id, state, occupancy, execution, last_heartbeat_at): session allocation candidates.
// - environment.cloud_account_id: the FK existence check behind DELETE cloudAccount's in-use 409
//   (Postgres does not index FK columns on its own).
// - cloud_account.project_id: per-project cloud lists and connect-time overlap resolution.
export class HotQueryIndexes1787800000000 implements MigrationInterface {
    name = "HotQueryIndexes1787800000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "CREATE INDEX \"IDX_environment_state_created\" ON \"environment\" (\"state\", \"created_at\")",
        );
        await queryRunner.query(
            "CREATE INDEX \"IDX_environment_state_updated\" ON \"environment\" (\"state\", \"updated_at\")",
        );
        await queryRunner.query(
            "CREATE INDEX \"IDX_environment_state_heartbeat\" ON \"environment\" (\"state\", \"last_heartbeat_at\")",
        );
        await queryRunner.query(
            "CREATE INDEX \"IDX_environment_allocation\" ON \"environment\" "
            + "(\"project_id\", \"state\", \"occupancy\", \"execution\", \"last_heartbeat_at\")",
        );
        await queryRunner.query(
            "CREATE INDEX \"IDX_environment_cloud_account\" ON \"environment\" (\"cloud_account_id\")",
        );
        await queryRunner.query(
            "CREATE INDEX \"IDX_cloud_account_project\" ON \"cloud_account\" (\"project_id\")",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP INDEX \"IDX_cloud_account_project\"");
        await queryRunner.query("DROP INDEX \"IDX_environment_cloud_account\"");
        await queryRunner.query("DROP INDEX \"IDX_environment_allocation\"");
        await queryRunner.query("DROP INDEX \"IDX_environment_state_heartbeat\"");
        await queryRunner.query("DROP INDEX \"IDX_environment_state_updated\"");
        await queryRunner.query("DROP INDEX \"IDX_environment_state_created\"");
    }
}
