import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { InternalModule } from "./internal-module";

(async function(): Promise<void> {
    const app = await NestFactory.create(InternalModule);

    app.enableShutdownHooks(); // FIXME: enable shutdown hooks in the main module

    const configService = app.get(ConfigService);

    await app.listen(configService.getOrThrow("INTERNAL_PORT"));
})();
