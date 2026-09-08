import { MigrationInterface, QueryRunner } from "typeorm";

// Vocabulary, not shape: the pool's record of a machine it holds is a MACHINE LEASE (`pool_host` said
// "host", which is the word for an address and, soon, for the user's own machines), and an environment's
// seat on it is a SLOT ASSIGNMENT. Pure renames — every row, index and constraint survives.
export class MachinePoolVocabulary1789300000000 implements MigrationInterface {
    name = "MachinePoolVocabulary1789300000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"pool_host\" RENAME TO \"machine_lease\"");
        await queryRunner.query("ALTER TABLE \"machine_lease\" RENAME COLUMN \"capacity_slots\" TO \"slot_capacity\"");
        await queryRunner.query("ALTER TABLE \"machine_lease\" RENAME CONSTRAINT \"PK_pool_host\" TO \"PK_machine_lease\"");
        await queryRunner.query("ALTER TABLE \"machine_lease\" RENAME CONSTRAINT \"FK_pool_host_cloud_account\" TO \"FK_machine_lease_cloud_account\"");
        await queryRunner.query("ALTER INDEX \"IX_pool_host_pool_key\" RENAME TO \"IX_machine_lease_pool_key\"");
        await queryRunner.query("ALTER TABLE \"host_placement\" RENAME TO \"slot_assignment\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME COLUMN \"host_id\" TO \"machine_lease_id\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME CONSTRAINT \"PK_host_placement\" TO \"PK_slot_assignment\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME CONSTRAINT \"UX_host_placement_environment\" TO \"UX_slot_assignment_environment\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME CONSTRAINT \"UX_host_placement_slot\" TO \"UX_slot_assignment_slot\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME CONSTRAINT \"FK_host_placement_host\" TO \"FK_slot_assignment_machine_lease\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME CONSTRAINT \"FK_host_placement_environment\" TO \"FK_slot_assignment_environment\"");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME CONSTRAINT \"FK_slot_assignment_environment\" TO \"FK_host_placement_environment\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME CONSTRAINT \"FK_slot_assignment_machine_lease\" TO \"FK_host_placement_host\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME CONSTRAINT \"UX_slot_assignment_slot\" TO \"UX_host_placement_slot\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME CONSTRAINT \"UX_slot_assignment_environment\" TO \"UX_host_placement_environment\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME CONSTRAINT \"PK_slot_assignment\" TO \"PK_host_placement\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME COLUMN \"machine_lease_id\" TO \"host_id\"");
        await queryRunner.query("ALTER TABLE \"slot_assignment\" RENAME TO \"host_placement\"");
        await queryRunner.query("ALTER INDEX \"IX_machine_lease_pool_key\" RENAME TO \"IX_pool_host_pool_key\"");
        await queryRunner.query("ALTER TABLE \"machine_lease\" RENAME CONSTRAINT \"FK_machine_lease_cloud_account\" TO \"FK_pool_host_cloud_account\"");
        await queryRunner.query("ALTER TABLE \"machine_lease\" RENAME CONSTRAINT \"PK_machine_lease\" TO \"PK_pool_host\"");
        await queryRunner.query("ALTER TABLE \"machine_lease\" RENAME COLUMN \"slot_capacity\" TO \"capacity_slots\"");
        await queryRunner.query("ALTER TABLE \"machine_lease\" RENAME TO \"pool_host\"");
    }
}
