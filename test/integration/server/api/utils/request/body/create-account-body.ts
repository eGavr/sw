import { v4 as uuidv4 } from "uuid";

import { 
    CreateAccountRequest, 
} from "../../../../../../../src/presentation/server/nestjs/modules/api/controllers/accounts/dtos/create-account-request";

export class CreateAccountBody {
    private static get defaultName(): string {
        return `some-name-${uuidv4().substring(0, 8)}`;
    }

    static create<K extends keyof CreateAccountRequest>(
        params: Partial<{ [k in K]: unknown }> = {},
    ): { [k in K]: unknown } {
        return {
            name: CreateAccountBody.defaultName,
            ...params,
        }
    }
}
