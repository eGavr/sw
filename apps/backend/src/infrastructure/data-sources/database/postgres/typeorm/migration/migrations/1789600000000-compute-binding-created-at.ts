import { MigrationInterface, QueryRunner } from "typeorm";

// A project may now bind one platform on several clouds (own machines for the baseline, a public cloud
// for the peaks), so placements need an order to walk. The order is when the binding was made — the
// first one bound is the primary — which the table did not record. Existing rows take the current time:
// they are all equally primary today, and their relative order is arbitrary either way.
export class ComputeBindingCreatedAt1789600000000 implements MigrationInterface {
    name = "ComputeBindingCreatedAt1789600000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "ALTER TABLE \"compute_binding\" ADD \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"compute_binding\" DROP COLUMN \"created_at\"");
    }
}
