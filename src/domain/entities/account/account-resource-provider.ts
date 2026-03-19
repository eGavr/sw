import { Uuid } from "../../types/uuid/uuid";

export type AccountResourceProviderData = {
    id: string;
    providerId: string;
    providerType: string;
    createdAt: Date;
    updatedAt: Date;
}

type CreateAccountResourceProviderParams = {
    providerId: string;
    providerType: string;
}

type AccountResourceProviderConstructorParams = {
    id?: string;
    providerId: string;
    providerType: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export class AccountResourceProvider {
    static fromObject(data: AccountResourceProviderData): AccountResourceProvider {
        return new AccountResourceProvider(data);
    }

    static create(params: CreateAccountResourceProviderParams): AccountResourceProvider {
        return new AccountResourceProvider(params);
    }

    readonly providerId: string;
    readonly providerType: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;

    private readonly _id: Uuid;

    private constructor(params: AccountResourceProviderConstructorParams) {
        this._id = params.id ? Uuid.fromString(params.id) : Uuid.create();
        this.providerId = params.providerId;
        this.providerType = params.providerType;
        this.createdAt = params.createdAt ?? new Date();
        this.updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }
}
