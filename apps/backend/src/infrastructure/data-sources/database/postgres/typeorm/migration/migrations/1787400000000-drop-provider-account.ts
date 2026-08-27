import { MigrationInterface, QueryRunner } from "typeorm";

// The provider-account model is fully replaced by cloud_account (provider = compute kind x cloud;
// environments route by (cloud type, execution) since EnvironmentCloudAccount1787300000000), so the
// table goes away. Breaking, no real data to preserve (no users).
export class DropProviderAccount1787400000000 implements MigrationInterface {
    name = "DropProviderAccount1787400000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP TABLE \"provider_account\"");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("CREATE TABLE \"provider_account\" (\"id\" uuid NOT NULL, \"project_id\" uuid NOT NULL, \"provider\" character varying NOT NULL, \"credential_ref\" character varying, \"state\" character varying NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"platform_name\" character varying NOT NULL, \"execution\" character varying NOT NULL, \"config\" jsonb NOT NULL DEFAULT '{}', CONSTRAINT \"PK_bc676d10be9807a0c1e67ca98b2\" PRIMARY KEY (\"id\"))");
        await queryRunner.query("ALTER TABLE \"provider_account\" ADD CONSTRAINT \"FK_7dd2f0216e7c247d76c73f54ae5\" FOREIGN KEY (\"project_id\") REFERENCES \"project\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION");
    }
}
