import { MigrationInterface, QueryRunner } from "typeorm";

export class EnvironmentWorker1786011737720 implements MigrationInterface {
    name = "EnvironmentWorker1786011737720"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" ADD \"attempts\" integer NOT NULL DEFAULT '0'");
        // Doorbell for the compute worker: any environment entering a state that needs work
        // (enqueued -> start, deleting -> stop) pokes LISTEN'ers. The payload is just a hint (the id).
        await queryRunner.query("CREATE OR REPLACE FUNCTION notify_environment_work() RETURNS trigger AS $$ BEGIN PERFORM pg_notify('environment_work', NEW.id::text); RETURN NEW; END; $$ LANGUAGE plpgsql");
        await queryRunner.query("CREATE TRIGGER environment_work_notify AFTER INSERT OR UPDATE ON \"environment\" FOR EACH ROW WHEN (NEW.state IN ('enqueued', 'deleting')) EXECUTE FUNCTION notify_environment_work()");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP TRIGGER IF EXISTS environment_work_notify ON \"environment\"");
        await queryRunner.query("DROP FUNCTION IF EXISTS notify_environment_work");
        await queryRunner.query("ALTER TABLE \"environment\" DROP COLUMN \"attempts\"");
    }

}
