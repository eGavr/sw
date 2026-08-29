import { MigrationInterface, QueryRunner } from "typeorm";

// Who created the CURRENT session of an environment — one row per environment (PK = environment id),
// no secrets (the session id lives only on the node). Lets the creator, and nobody else, recover the
// live session id on demand. Cleanup is event-driven: replaced on the next create, deleted when the
// agent reports the environment free, cascaded away with the environment.
export class SessionOwnership1787600000000 implements MigrationInterface {
    name = "SessionOwnership1787600000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("CREATE TABLE \"session_ownership\" (\"environment_id\" uuid NOT NULL, \"created_by\" character varying NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT \"PK_session_ownership_environment\" PRIMARY KEY (\"environment_id\"))");
        await queryRunner.query("ALTER TABLE \"session_ownership\" ADD CONSTRAINT \"FK_session_ownership_environment\" FOREIGN KEY (\"environment_id\") REFERENCES \"environment\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP TABLE \"session_ownership\"");
    }
}
