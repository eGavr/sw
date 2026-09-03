import { MigrationInterface, QueryRunner } from "typeorm";

// A NetBridge access key: a long-lived, project-scoped credential a tunnel client presents to attach.
// Only the secret's fingerprint (`secret_hash`, sha256) is stored — never the plaintext. Revoked by
// deleting the row; optionally time-boxed via `expires_at`. Cascades away with its project.
export class NetBridgeCredential1788100000000 implements MigrationInterface {
    name = "NetBridgeCredential1788100000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("CREATE TABLE \"net_bridge_credential\" (\"id\" uuid NOT NULL, \"project_id\" uuid NOT NULL, \"name\" character varying, \"secret_hash\" character varying NOT NULL, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"expires_at\" TIMESTAMP WITH TIME ZONE, \"last_used_at\" TIMESTAMP WITH TIME ZONE, CONSTRAINT \"PK_net_bridge_credential\" PRIMARY KEY (\"id\"))");
        await queryRunner.query("ALTER TABLE \"net_bridge_credential\" ADD CONSTRAINT \"FK_net_bridge_credential_project\" FOREIGN KEY (\"project_id\") REFERENCES \"project\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
        await queryRunner.query("CREATE UNIQUE INDEX \"UX_net_bridge_credential_secret_hash\" ON \"net_bridge_credential\" (\"secret_hash\")");
        await queryRunner.query("CREATE INDEX \"IX_net_bridge_credential_project\" ON \"net_bridge_credential\" (\"project_id\")");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("DROP INDEX \"IX_net_bridge_credential_project\"");
        await queryRunner.query("DROP INDEX \"UX_net_bridge_credential_secret_hash\"");
        await queryRunner.query("ALTER TABLE \"net_bridge_credential\" DROP CONSTRAINT \"FK_net_bridge_credential_project\"");
        await queryRunner.query("DROP TABLE \"net_bridge_credential\"");
    }
}
