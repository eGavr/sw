import { MigrationInterface, QueryRunner } from "typeorm";

// The connection config moves onto the compute bindings: the grant is always (resource × the kind's
// roles), so what the user names — the folder for a vm kind, the cluster for kubernetes — belongs to the
// binding, and access is probed per binding. The account keeps nothing but its type. Existing vm
// bindings inherit the account's folderId so their environments keep provisioning where they did.
export class BindingScopedConfig1788000000000 implements MigrationInterface {
    name = "BindingScopedConfig1788000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "compute_binding" AS "binding"
            SET "config" = "binding"."config" || jsonb_build_object('folderId', "account"."config"->>'folderId')
            FROM "cloud_account" AS "account"
            WHERE "binding"."cloud_account_id" = "account"."id"
                AND "binding"."kind" = 'vm'
                AND "account"."config" ? 'folderId'`);
        await queryRunner.query("ALTER TABLE \"cloud_account\" DROP COLUMN \"config\"");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"cloud_account\" ADD \"config\" jsonb NOT NULL DEFAULT '{}'");
        await queryRunner.query(`UPDATE "cloud_account" AS "account"
            SET "config" = jsonb_build_object('folderId', "binding"."config"->>'folderId')
            FROM "compute_binding" AS "binding"
            WHERE "binding"."cloud_account_id" = "account"."id"
                AND "binding"."kind" = 'vm'
                AND "binding"."config" ? 'folderId'`);
    }
}
