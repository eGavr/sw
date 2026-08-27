import { MigrationInterface, QueryRunner } from "typeorm";

export class ProviderAccount1785999788032 implements MigrationInterface {
    name = "ProviderAccount1785999788032"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"account\" DROP CONSTRAINT \"FK_42b5c085315577f9b098825ddae\"");
        await queryRunner.query("CREATE TABLE \"provider_account\" (\"id\" uuid NOT NULL, \"account_id\" uuid NOT NULL, \"provider_type\" character varying NOT NULL, \"external_ref\" character varying, \"credential_ref\" character varying, \"state\" character varying NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT \"PK_bc676d10be9807a0c1e67ca98b2\" PRIMARY KEY (\"id\"))");
        await queryRunner.query("ALTER TABLE \"account\" DROP CONSTRAINT \"REL_42b5c085315577f9b098825dda\"");
        await queryRunner.query("ALTER TABLE \"account\" DROP COLUMN \"resource_provider_id\"");
        await queryRunner.query("DROP TABLE \"account_resource_provider\"");
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"provider_account_id\" uuid");
        await queryRunner.query("ALTER TABLE \"provider_account\" ADD CONSTRAINT \"FK_7dd2f0216e7c247d76c73f54ae5\" FOREIGN KEY (\"account_id\") REFERENCES \"account\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION");
        await queryRunner.query("ALTER TABLE \"environment\" ADD CONSTRAINT \"FK_a313ad85d25087dda56032513a6\" FOREIGN KEY (\"provider_account_id\") REFERENCES \"provider_account\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" DROP CONSTRAINT \"FK_a313ad85d25087dda56032513a6\"");
        await queryRunner.query("ALTER TABLE \"provider_account\" DROP CONSTRAINT \"FK_7dd2f0216e7c247d76c73f54ae5\"");
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"provider_account_id\"");
        await queryRunner.query("ALTER TABLE \"account\" ADD \"resource_provider_id\" uuid NOT NULL");
        await queryRunner.query("ALTER TABLE \"account\" ADD CONSTRAINT \"REL_42b5c085315577f9b098825dda\" UNIQUE (\"resource_provider_id\")");
        await queryRunner.query("DROP TABLE \"provider_account\"");
        await queryRunner.query("CREATE TABLE \"account_resource_provider\" (\"id\" uuid NOT NULL, \"provider_id\" character varying NOT NULL, \"provider_type\" character varying NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT \"PK_42b5c085315577f9b098825ddae\" PRIMARY KEY (\"id\"))");
        await queryRunner.query("ALTER TABLE \"account\" ADD CONSTRAINT \"FK_42b5c085315577f9b098825ddae\" FOREIGN KEY (\"resource_provider_id\") REFERENCES \"account_resource_provider\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION");
    }

}
