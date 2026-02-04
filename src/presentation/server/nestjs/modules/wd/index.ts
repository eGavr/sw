import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { WdModule } from "./wd-module";

(async function(): Promise<void> {
    const app = await NestFactory.create(WdModule);

    const configService = app.get(ConfigService);

    await app.listen(configService.getOrThrow("WD_PORT"));
})();
