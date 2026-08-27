import { MigrationInterface, QueryRunner } from "typeorm";

// Replace the flat per-user permission rows with Google-IAM-style role bindings: one row per
// (account, role, member), the member stored as its external-identity string.
export class AccountIam1786200000000 implements MigrationInterface {
    name = "AccountIam1786200000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP TABLE \"account_user_permission\"");
        await queryRunner.query("CREATE TABLE \"account_iam_binding\" (\"account_id\" uuid NOT NULL, \"role\" character varying NOT NULL, \"member\" character varying NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT \"PK_account_iam_binding\" PRIMARY KEY (\"account_id\", \"role\", \"member\"))");
        await queryRunner.query("ALTER TABLE \"account_iam_binding\" ADD CONSTRAINT \"FK_account_iam_binding_account\" FOREIGN KEY (\"account_id\") REFERENCES \"account\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"account_iam_binding\" DROP CONSTRAINT \"FK_account_iam_binding_account\"");
        await queryRunner.query("DROP TABLE \"account_iam_binding\"");
        await queryRunner.query("CREATE TABLE \"account_user_permission\" (\"id\" uuid NOT NULL, \"account_id\" uuid NOT NULL, \"user_id\" uuid NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"name\" character varying NOT NULL, CONSTRAINT \"PK_811ece1e10ad6e0f0bbc098a8f2\" PRIMARY KEY (\"id\"))");
    }

}
