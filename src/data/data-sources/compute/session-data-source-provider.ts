import { ConfigService } from "@nestjs/config";

import { InternalError } from "../../../domain/entities/error/internal-error";

import { LocalComputeStore } from "./local/local-compute-store";
import { LocalSessionDataSource } from "./local/session-data-source";
import { SessionDataSource } from "./session-data-source";

export const SessionDataSourceProvider = {
    provide: SessionDataSource,
    useFactory: (configService: ConfigService, store: LocalComputeStore): SessionDataSource => {
        const provider = configService.getOrThrow<"local">("COMPUTE_PROVIDER");

        switch (provider) {
            case "local":
                return new LocalSessionDataSource(store);
            default:
                throw new InternalError(`compute provider: ${provider}: unknown`);
        }
    },
    inject: [ConfigService, LocalComputeStore],
};
