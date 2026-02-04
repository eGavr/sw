import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { ApiModule } from "./api-module";

(async function(): Promise<void> {
    const app = await NestFactory.create(ApiModule);

    const configService = app.get(ConfigService);

    await app.listen(configService.getOrThrow("API_PORT"));
})();
