import { MigrationInterface, QueryRunner } from "typeorm";

// The account's singleton object-storage destination (one row per account). Access is delegated (the
// user grants our service identity write access via a bucket policy), so no credentials are stored.
export class StorageDestination1786400000000 implements MigrationInterface {
    name = "StorageDestination1786400000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("CREATE TABLE \"storage_destination\" (\"account_id\" uuid NOT NULL, \"endpoint\" character varying, \"region\" character varying, \"bucket\" character varying NOT NULL, \"prefix\" character varying NOT NULL, CONSTRAINT \"PK_storage_destination\" PRIMARY KEY (\"account_id\"))");
        await queryRunner.query("ALTER TABLE \"storage_destination\" ADD CONSTRAINT \"FK_storage_destination_account\" FOREIGN KEY (\"account_id\") REFERENCES \"account\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"storage_destination\" DROP CONSTRAINT \"FK_storage_destination_account\"");
        await queryRunner.query("DROP TABLE \"storage_destination\"");
    }

}
