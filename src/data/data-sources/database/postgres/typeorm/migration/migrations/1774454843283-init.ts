import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1774454843283 implements MigrationInterface {
    name = 'Init1774454843283'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "account_user_permission" DROP CONSTRAINT "FK_00df962bc9f1522322cdc0c75b9"`);
        await queryRunner.query(`ALTER TABLE "account_user_permission" RENAME COLUMN "permission_id" TO "name"`);
        await queryRunner.query(`ALTER TABLE "account_user_permission" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "account_user_permission" ADD "name" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "account_user_permission" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "account_user_permission" ADD "name" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "account_user_permission" RENAME COLUMN "name" TO "permission_id"`);
        await queryRunner.query(`ALTER TABLE "account_user_permission" ADD CONSTRAINT "FK_00df962bc9f1522322cdc0c75b9" FOREIGN KEY ("permission_id") REFERENCES "account_permission"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
