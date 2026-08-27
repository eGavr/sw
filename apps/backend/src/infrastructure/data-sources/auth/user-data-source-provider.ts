import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet } from "jose";

import { InternalError } from "../../../domain/entities/error/internal-error";

import { LocalUserDataSource } from "./local/user-data-source";
import { OidcTokenVerifier } from "./oidc/oidc-token-verifier";
import { OidcUserDataSource } from "./oidc/user-data-source";
import { UserDataSource } from "./user-data-source";

const defaultGroupsClaim = "groups";

export const UserDataSourceProvider = {
    provide: UserDataSource,
    useFactory: async (configService: ConfigService): Promise<UserDataSource> => {
        const strategy = configService.getOrThrow<"local" | "oidc">("AUTH_STRATEGY");

        switch (strategy) {
            case "local":
                // The local stub authenticates any bearer token without a signature check — dev/test only.
                if (process.env.NODE_ENV === "production") {
                    throw new InternalError("auth strategy: local: forbidden in production");
                }

                return new LocalUserDataSource();
            case "oidc":
                return new OidcUserDataSource(new OidcTokenVerifier(
                    createRemoteJWKSet(new URL(configService.getOrThrow<string>("OIDC_JWKS_URI"))),
                    {
                        issuer: configService.getOrThrow<string>("OIDC_ISSUER"),
                        audience: configService.getOrThrow<string>("OIDC_AUDIENCE"),
                        groupsClaim: configService.get<string>("OIDC_GROUPS_CLAIM") ?? defaultGroupsClaim,
                    },
                ));
            default:
                throw new InternalError(`auth strategy: ${strategy}: unknown`);
        }
    },
    inject: [ConfigService],
}
