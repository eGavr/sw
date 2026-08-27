import { MigrationInterface, QueryRunner } from "typeorm";

// The cloud-account model (provider = compute kind × cloud). A project connects a cloud (opaque `type` +
// non-secret `config` + `credential_ref`) whose supported substrates are materialised into `provides`
// (jsonb list of {platformName, execution}); environments route by (platform, execution) against those.
// Added alongside `provider_account` — the old model is removed in a later step.
export class CloudAccount1787200000000 implements MigrationInterface {
    name = "CloudAccount1787200000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("CREATE TABLE \"cloud_account\" (\"id\" uuid NOT NULL, \"project_id\" uuid NOT NULL, \"type\" character varying NOT NULL, \"config\" jsonb NOT NULL DEFAULT '{}', \"credential_ref\" character varying, \"provides\" jsonb NOT NULL DEFAULT '[]', \"state\" character varying NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT \"PK_cloud_account\" PRIMARY KEY (\"id\"))");
        await queryRunner.query("ALTER TABLE \"cloud_account\" ADD CONSTRAINT \"FK_cloud_account_project\" FOREIGN KEY (\"project_id\") REFERENCES \"project\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION");
        await queryRunner.query("CREATE INDEX \"IX_cloud_account_project_state\" ON \"cloud_account\" (\"project_id\", \"state\")");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"cloud_account\" DROP CONSTRAINT \"FK_cloud_account_project\"");
        await queryRunner.query("DROP TABLE \"cloud_account\"");
    }
}
