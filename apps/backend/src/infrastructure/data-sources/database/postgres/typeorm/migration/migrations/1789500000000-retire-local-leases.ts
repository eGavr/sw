import { MigrationInterface, QueryRunner } from "typeorm";

// The `local` cloud no longer provides emulator slots (its byo route moved to the self-hosted cloud,
// where the machine is attached explicitly), so leases it left behind have no provider to return them
// to. They held nothing but a dev Mac's seats; dropping them stops the pool's sweep from retrying a
// return that can never succeed. Seats go with them (ON DELETE CASCADE).
export class RetireLocalLeases1789500000000 implements MigrationInterface {
    name = "RetireLocalLeases1789500000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DELETE FROM \"machine_lease\" WHERE provider_context->>'cloud' = 'local'");
    }

    public async down(): Promise<void> {
        // Data retired on purpose; nothing to restore.
    }
}
