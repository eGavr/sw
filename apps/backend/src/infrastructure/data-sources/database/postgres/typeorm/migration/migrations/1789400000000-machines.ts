import { MigrationInterface, QueryRunner } from "typeorm";

// The machine inventory: every machine the control plane knows — the user's own boxes attached to a
// self-hosted cloud, and servers we ordered for a lease. A lease now names the machine it holds.
export class Machines1789400000000 implements MigrationInterface {
    name = "Machines1789400000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("CREATE TABLE \"machine\" (\"id\" uuid NOT NULL, \"cloud_account_id\" uuid NOT NULL, \"origin\" character varying NOT NULL, \"fqdn\" character varying, \"provides\" jsonb NOT NULL DEFAULT '[]', \"state\" character varying NOT NULL, \"admission\" character varying NOT NULL, \"facts\" jsonb, \"slot_capacity_override\" integer, \"slot_capacity\" integer, \"ready\" boolean NOT NULL DEFAULT false, \"lease_id\" uuid, \"registration_token_hash\" character varying, \"registration_token_expires_at\" TIMESTAMP WITH TIME ZONE, \"last_sync_at\" TIMESTAMP WITH TIME ZONE, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT \"PK_machine\" PRIMARY KEY (\"id\"), CONSTRAINT \"UX_machine_lease\" UNIQUE (\"lease_id\"))");
        await queryRunner.query("ALTER TABLE \"machine\" ADD CONSTRAINT \"FK_machine_cloud_account\" FOREIGN KEY (\"cloud_account_id\") REFERENCES \"cloud_account\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION");
        await queryRunner.query("CREATE INDEX \"IX_machine_cloud_account\" ON \"machine\" (\"cloud_account_id\")");
        await queryRunner.query("ALTER TABLE \"machine_lease\" ADD \"machine_id\" uuid");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"machine_lease\" DROP COLUMN \"machine_id\"");
        await queryRunner.query("DROP INDEX \"IX_machine_cloud_account\"");
        await queryRunner.query("ALTER TABLE \"machine\" DROP CONSTRAINT \"FK_machine_cloud_account\"");
        await queryRunner.query("DROP TABLE \"machine\"");
    }
}
