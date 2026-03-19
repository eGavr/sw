import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1774535265328 implements MigrationInterface {
    name = 'Init1774535265328'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user" ("id" uuid NOT NULL, "external_id" character varying NOT NULL, "provider_type" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_bc5f1d7eb28fea73b3b3d5d5e6a" UNIQUE ("external_id", "provider_type"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "account_resource_provider" ("id" uuid NOT NULL, "provider_id" character varying NOT NULL, "provider_type" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_42b5c085315577f9b098825ddae" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "account" ("id" uuid NOT NULL, "name" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_by_id" uuid NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "resource_provider_id" uuid NOT NULL, CONSTRAINT "REL_42b5c085315577f9b098825dda" UNIQUE ("resource_provider_id"), CONSTRAINT "PK_54115ee388cdb6d86bb4bf5b2ea" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "account_user_permission" ("id" uuid NOT NULL, "account_id" uuid NOT NULL, "user_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_811ece1e10ad6e0f0bbc098a8f2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "account" ADD CONSTRAINT "FK_b5eb4da98013234fc2a6a98e8f1" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "account" ADD CONSTRAINT "FK_42b5c085315577f9b098825ddae" FOREIGN KEY ("resource_provider_id") REFERENCES "account_resource_provider"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "account_user_permission" ADD CONSTRAINT "FK_7f708979b0e0121900d6308b398" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "account_user_permission" ADD CONSTRAINT "FK_f310c36661229c5536f1b09d49f" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "account_user_permission" DROP CONSTRAINT "FK_f310c36661229c5536f1b09d49f"`);
        await queryRunner.query(`ALTER TABLE "account_user_permission" DROP CONSTRAINT "FK_7f708979b0e0121900d6308b398"`);
        await queryRunner.query(`ALTER TABLE "account" DROP CONSTRAINT "FK_42b5c085315577f9b098825ddae"`);
        await queryRunner.query(`ALTER TABLE "account" DROP CONSTRAINT "FK_b5eb4da98013234fc2a6a98e8f1"`);
        await queryRunner.query(`DROP TABLE "account_user_permission"`);
        await queryRunner.query(`DROP TABLE "account"`);
        await queryRunner.query(`DROP TABLE "account_resource_provider"`);
        await queryRunner.query(`DROP TABLE "user"`);
    }

}
