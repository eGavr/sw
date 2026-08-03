import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { ApiModule } from "./api-module";

(async function(): Promise<void> {
    const app = await NestFactory.create(ApiModule);

    app.setGlobalPrefix("v1"); // AIP-185: major version in the path

    app.enableShutdownHooks(); // FIXME: enable shutdown hooks in the main module

    const configService = app.get(ConfigService);

    await app.listen(configService.getOrThrow("API_PORT"));
})();
