import {  ConfigService } from "@nestjs/config";

import { InternalError } from "../../../domain/entities/error/internal-error";

import { LocalUserDataSource } from "./local/user-data-source";
import { UserDataSource } from "./user-data-source";

export const UserDataSourceProvider = {
    provide: UserDataSource,
    useFactory: async (configService: ConfigService): Promise<UserDataSource> => {
        const strategy = configService.getOrThrow<"local">("AUTH_STRATEGY");

        switch (strategy) {
            case "local":
                return new LocalUserDataSource();
            default:
                throw new InternalError(`auth strategy: ${strategy}: unknown`);
        }
    },
    inject: [ConfigService],
}
