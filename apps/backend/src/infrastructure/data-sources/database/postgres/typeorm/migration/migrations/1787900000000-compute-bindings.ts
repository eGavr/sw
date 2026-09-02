import { MigrationInterface, QueryRunner } from "typeorm";

// Compute bindings: per substrate, WHICH kind runs it on the connection (vm / kubernetes / docker) with
// that kind's own settings. Replaces the materialised `provides` blob — a connection now serves exactly
// what the user bound. environment.compute_kind stamps the binding's kind at creation for routing.
// Pre-existing accounts lose their (unbound) substrates and environments their kind — acceptable: no
// production users, connections are re-created via the new API.
export class ComputeBindings1787900000000 implements MigrationInterface {
    name = "ComputeBindings1787900000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "compute_binding" (
            "id" uuid NOT NULL,
            "cloud_account_id" uuid NOT NULL,
            "platform_name" character varying NOT NULL,
            "execution" character varying NOT NULL,
            "kind" character varying NOT NULL,
            "config" jsonb NOT NULL DEFAULT '{}',
            CONSTRAINT "PK_compute_binding" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_compute_binding_substrate" UNIQUE ("cloud_account_id", "platform_name", "execution"),
            CONSTRAINT "FK_compute_binding_cloud_account" FOREIGN KEY ("cloud_account_id")
                REFERENCES "cloud_account"("id") ON DELETE CASCADE
        )`);
        await queryRunner.query("CREATE INDEX \"IDX_compute_binding_account\" ON \"compute_binding\" (\"cloud_account_id\")");
        await queryRunner.query("ALTER TABLE \"cloud_account\" DROP COLUMN \"provides\"");
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"compute_kind\" character varying");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"compute_kind\"");
        await queryRunner.query("ALTER TABLE \"cloud_account\" ADD \"provides\" jsonb NOT NULL DEFAULT '[]'");
        await queryRunner.query("DROP INDEX \"IDX_compute_binding_account\"");
        await queryRunner.query("DROP TABLE \"compute_binding\"");
    }
}
