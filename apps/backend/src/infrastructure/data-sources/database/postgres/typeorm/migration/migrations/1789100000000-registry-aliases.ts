import { MigrationInterface, QueryRunner } from "typeorm";

// A registered application and its builds are resources by their server ids; the words humans
// address them by are ALIASES — the same words an environment carries as nameAlias/versionAlias. The
// columns are renamed to say so.
export class RegistryAliases1789100000000 implements MigrationInterface {
    name = "RegistryAliases1789100000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"project_application\" RENAME COLUMN \"name\" TO \"name_alias\"");
        await queryRunner.query(
            "ALTER TABLE \"project_application_version\" RENAME COLUMN \"alias\" TO \"version_alias\"",
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            "ALTER TABLE \"project_application_version\" RENAME COLUMN \"version_alias\" TO \"alias\"",
        );
        await queryRunner.query("ALTER TABLE \"project_application\" RENAME COLUMN \"name_alias\" TO \"name\"");
    }
}
