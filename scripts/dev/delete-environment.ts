import { DockerClient } from "../../src/infrastructure/data-sources/compute/docker/docker-client";
import { DockerEnvironmentDataSource } from "../../src/infrastructure/data-sources/compute/docker/environment-data-source";

// Dev helper: tears down a Docker environment by id (the same code path as DELETE /environments/:id).
const environmentId = process.argv[2] ?? process.env.ENVIRONMENT_ID;

async function main(): Promise<void> {
    if (!environmentId) {
        process.stderr.write("usage: npm run env:delete:dev -- <environmentId>\n");
        process.exit(1);
    }

    await new DockerEnvironmentDataSource(new DockerClient()).delete(environmentId);

    process.stdout.write(`deleted environment ${environmentId}\n`);
}

main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
});
