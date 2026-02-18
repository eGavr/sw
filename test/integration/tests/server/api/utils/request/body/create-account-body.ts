import { defaultsDeep } from "lodash";
import { v4 as uuidv4 } from "uuid";

import { 
    CreateAccountRequestDto, 
} from "../../../../../../../../src/presentation/server/nestjs/modules/api/controllers/accounts/dtos/create-account-request-dto";

export class CreateAccountBody {
    private static get defaultName(): string {
        return `default-${uuidv4().substring(0, 8)}`;
    }

    private static get defaultResources(): { providerId: string, providerType: string } {
        return { providerId: "default-provider-id", providerType: "default-provider-type" };
    }

    static create<T extends { [K in keyof CreateAccountRequestDto]?: unknown }>(params: T | object = {}): T {
        return defaultsDeep({}, params, {
            name: CreateAccountBody.defaultName,
            resources: CreateAccountBody.defaultResources,
        });
    }
}
