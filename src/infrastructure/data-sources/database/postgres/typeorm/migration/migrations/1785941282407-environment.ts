import { MigrationInterface, QueryRunner } from "typeorm";

export class Environment1785941282407 implements MigrationInterface {
    name = "Environment1785941282407"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("CREATE TABLE \"environment_application\" (\"id\" uuid NOT NULL, \"environment_id\" uuid NOT NULL, \"application_name\" character varying NOT NULL, \"application_version\" character varying NOT NULL, CONSTRAINT \"UQ_8aef647a23ba735d010bce4dea9\" UNIQUE (\"environment_id\", \"application_name\", \"application_version\"), CONSTRAINT \"PK_360e5c4a6525a6420f8aa575b75\" PRIMARY KEY (\"id\"))");
        await queryRunner.query("CREATE TABLE \"environment\" (\"id\" uuid NOT NULL, \"account_id\" uuid NOT NULL, \"state\" character varying NOT NULL, \"state_reason\" character varying, \"platform_name\" character varying NOT NULL, \"platform_version\" character varying NOT NULL, \"device_name\" character varying NOT NULL, \"endpoint\" character varying, \"busy\" boolean NOT NULL DEFAULT false, \"last_heartbeat_at\" TIMESTAMP WITH TIME ZONE, \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL, \"updated_at\" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT \"PK_f0ec97d0ac5e0e2f50f7475699f\" PRIMARY KEY (\"id\"))");
        await queryRunner.query("ALTER TABLE \"environment_application\" ADD CONSTRAINT \"FK_bf1e614655421dd9d5d99c1b387\" FOREIGN KEY (\"environment_id\") REFERENCES \"environment\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
        await queryRunner.query("ALTER TABLE \"environment\" ADD CONSTRAINT \"FK_c3f7ed0907010c67bb01d8d4867\" FOREIGN KEY (\"account_id\") REFERENCES \"account\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"environment\" DROP CONSTRAINT \"FK_c3f7ed0907010c67bb01d8d4867\"");
        await queryRunner.query("ALTER TABLE \"environment_application\" DROP CONSTRAINT \"FK_bf1e614655421dd9d5d99c1b387\"");
        await queryRunner.query("DROP TABLE \"environment\"");
        await queryRunner.query("DROP TABLE \"environment_application\"");
    }

}
