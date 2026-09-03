import { MigrationInterface, QueryRunner } from "typeorm";

// The host pool: big rented machines (`pool_host`) sliced into slots, and which environment sits
// on which slot (`host_placement`). One pool per compute binding. The cloud-account FK restricts
// deletion while hosts exist (rented metal must never be lost track of); the environment FK cascades
// so a hard-GC'd environment can never leave a slot permanently taken.
export class HostPool1788200000000 implements MigrationInterface {
    name = "HostPool1788200000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("CREATE TABLE \"pool_host\" (\"id\" uuid NOT NULL, \"cloud_account_id\" uuid NOT NULL, \"binding_id\" uuid NOT NULL, \"state\" character varying NOT NULL, \"capacity_slots\" integer NOT NULL, \"host_ip\" character varying, \"provider_context\" jsonb NOT NULL DEFAULT '{}', \"last_seen_at\" TIMESTAMP WITH TIME ZONE, \"last_emptied_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT \"PK_pool_host\" PRIMARY KEY (\"id\"))");
        await queryRunner.query("ALTER TABLE \"pool_host\" ADD CONSTRAINT \"FK_pool_host_cloud_account\" FOREIGN KEY (\"cloud_account_id\") REFERENCES \"cloud_account\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION");
        await queryRunner.query("CREATE INDEX \"IX_pool_host_pool_key\" ON \"pool_host\" (\"cloud_account_id\", \"binding_id\")");
        await queryRunner.query("CREATE TABLE \"host_placement\" (\"id\" uuid NOT NULL, \"host_id\" uuid NOT NULL, \"environment_id\" uuid NOT NULL, \"slot_index\" integer NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT \"PK_host_placement\" PRIMARY KEY (\"id\"), CONSTRAINT \"UX_host_placement_environment\" UNIQUE (\"environment_id\"), CONSTRAINT \"UX_host_placement_slot\" UNIQUE (\"host_id\", \"slot_index\"))");
        await queryRunner.query("ALTER TABLE \"host_placement\" ADD CONSTRAINT \"FK_host_placement_host\" FOREIGN KEY (\"host_id\") REFERENCES \"pool_host\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
        await queryRunner.query("ALTER TABLE \"host_placement\" ADD CONSTRAINT \"FK_host_placement_environment\" FOREIGN KEY (\"environment_id\") REFERENCES \"environment\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"host_placement\" DROP CONSTRAINT \"FK_host_placement_environment\"");
        await queryRunner.query("ALTER TABLE \"host_placement\" DROP CONSTRAINT \"FK_host_placement_host\"");
        await queryRunner.query("DROP TABLE \"host_placement\"");
        await queryRunner.query("DROP INDEX \"IX_pool_host_pool_key\"");
        await queryRunner.query("ALTER TABLE \"pool_host\" DROP CONSTRAINT \"FK_pool_host_cloud_account\"");
        await queryRunner.query("DROP TABLE \"pool_host\"");
    }
}
