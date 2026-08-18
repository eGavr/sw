import { MigrationInterface, QueryRunner } from "typeorm";

// Indexes backing keyset pagination over (created_at, id): a range scan from the cursor, no sort of the
// whole filtered set. Environments are paged within a project; projects are paged by created_at + id.
export class KeysetPaginationIndexes1786800000000 implements MigrationInterface {
    name = "KeysetPaginationIndexes1786800000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "CREATE INDEX \"IDX_environment_project_keyset\" ON \"environment\" (\"project_id\", \"created_at\", \"id\")",
        );
        await queryRunner.query("CREATE INDEX \"IDX_project_keyset\" ON \"project\" (\"created_at\", \"id\")");
        await queryRunner.query("CREATE INDEX \"IDX_project_iam_binding_member\" ON \"project_iam_binding\" (\"member\")");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP INDEX \"IDX_project_iam_binding_member\"");
        await queryRunner.query("DROP INDEX \"IDX_project_keyset\"");
        await queryRunner.query("DROP INDEX \"IDX_environment_project_keyset\"");
    }
}
