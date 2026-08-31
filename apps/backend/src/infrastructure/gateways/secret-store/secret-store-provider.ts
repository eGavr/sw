import { ConfigService } from "@nestjs/config";

import { SecretStore } from "../../../application/interfaces/gateways/secret-store";
import { InternalError } from "../../../domain/entities/error/internal-error";

import { FsSecretStore } from "./fs-secret-store";
import { InMemorySecretStore } from "./in-memory-secret-store";

const defaultFsRoot = ".dev-secrets";

// Selects the secret-store backend per install (SECRET_STORE): `fs` for local development (plaintext files
// under SECRET_STORE_FS_ROOT — shared by all processes, unlike `memory`), `memory` (default) for the
// in-process fake used in tests, `yc-lockbox` for production (Yandex Lockbox — added in the YC slice).
export const SecretStoreProvider = {
    provide: SecretStore,
    useFactory: (configService: ConfigService): SecretStore => {
        switch (configService.get<string>("SECRET_STORE")) {
            case "fs":
                return new FsSecretStore(configService.get<string>("SECRET_STORE_FS_ROOT") ?? defaultFsRoot);
            case "yc-lockbox":
                throw new InternalError("secret store: yc-lockbox: not implemented yet");
            default:
                return new InMemorySecretStore();
        }
    },
    inject: [ConfigService],
};
