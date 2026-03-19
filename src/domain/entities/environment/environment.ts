import { Account } from "../account/account";
import { User } from "../user/user";

import { EnvironmentId } from "./environment-id";

export type EnvironmentData = {
    id: string;
}

export type EnvironmentParams = {
    id?: string;
}

export class Environment {
    static fromObject(data: EnvironmentData): Environment {
        return new Environment(data);
    }

    static create(): Environment {
        return new Environment({});
    }

    private readonly _id: EnvironmentId;

    private constructor(params: EnvironmentParams) {
        this._id = params.id ? EnvironmentId.fromString(params.id) : EnvironmentId.create();
    }

    get id(): string {
        return this._id.getValue();
    }

    get account(): Account {
        return Account.create({ 
            name: "some-name", 
            createdBy: User.create({ externalId: "", providerType: "" }), 
            resources: { providerId: "", providerType: "" }, 
        });
    }
}
