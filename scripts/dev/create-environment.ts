import { DockerClient } from "../../src/data/data-sources/compute/docker/docker-client";
import {
    buildDockerEnvironmentConfig,
    DockerEnvironmentDataSource,
} from "../../src/data/data-sources/compute/docker/environment-data-source";

// Dev helper: provisions a Docker environment (a browser container) and prints its id once the
// WebDriver endpoint is ready, so the wd data-plane can be exercised without the api control-plane.
const image = process.env.COMPUTE_DOCKER_IMAGE ?? "seleniarm/standalone-chromium:latest";
const accountId = process.env.DEV_ACCOUNT_ID ?? "11111111-1111-4111-8111-111111111111";
const sessionTimeoutSeconds = Number(process.env.COMPUTE_DOCKER_SESSION_TIMEOUT ?? "300");

async function waitReady(endpoint: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${endpoint}/status`);
            const body = (await response.json()) as { value?: { ready?: boolean } };

            if (body.value?.ready) {
                return;
            }
        } catch {
            // container is still starting
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("webdriver did not become ready in time");
}

async function main(): Promise<void> {
    const config = buildDockerEnvironmentConfig({
        image,
        baseImage: process.env.COMPUTE_DOCKER_BASE_IMAGE,
        platform: process.env.COMPUTE_DOCKER_PLATFORM,
        internalPort: 4444,
        sessionTimeoutSeconds,
    });
    const dataSource = new DockerEnvironmentDataSource(new DockerClient(), config);

    const environment = await dataSource.create({
        accountId,
        platform: { name: "linux", version: "22.04" },
        applications: [{ name: "chrome", version: "latest", kind: "browser" }],
    });

    process.stdout.write(`provisioning ${environment.id} (${image}); waiting for the browser to become ready...\n`);
    await waitReady(environment.endpoint as string, 120_000);

    process.stdout.write(`${JSON.stringify({ environmentId: environment.id, endpoint: environment.endpoint }, null, 4)}\n`);
}

main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
});
