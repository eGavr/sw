import { NestFactory } from "@nestjs/core";

import { WorkerModule } from "./worker-module";

// The worker has no HTTP surface: it's an application context that boots the EnvironmentWorker
// (LISTEN loop) and stays alive on its open pg connection.
async function bootstrap(): Promise<void> {
    const app = await NestFactory.createApplicationContext(WorkerModule);

    app.enableShutdownHooks();
}

bootstrap().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
});
