import { AccountId } from "../account/account-id";
import { InvalidArgumentError } from "../error/invalid-argument-error";

import { ProviderAccountId } from "./provider-account-id";
import { ProviderAccountState } from "./provider-account-state";

export type ProviderAccountData = {
    id: string;
    accountId: string;
    provider: string;
    externalRef?: string | null;
    credentialRef?: string | null;
    state: string;
    createdAt: Date;
    updatedAt: Date;
};

export type ProviderAccountCreateParams = {
    accountId: AccountId;
    provider: string;
    externalRef?: string | null;
    credentialRef?: string | null;
};

type ProviderAccountConstructorParams = {
    id?: ProviderAccountId;
    accountId: AccountId;
    provider: string;
    externalRef?: string | null;
    credentialRef?: string | null;
    state?: ProviderAccountState;
    createdAt?: Date;
    updatedAt?: Date;
};

export class ProviderAccount {
    static create(params: ProviderAccountCreateParams): ProviderAccount {
        return new ProviderAccount({ ...params, state: ProviderAccountState.Active });
    }

    static fromObject(data: ProviderAccountData): ProviderAccount {
        return new ProviderAccount({
            id: ProviderAccountId.fromString(data.id),
            accountId: AccountId.fromString(data.accountId),
            provider: data.provider,
            externalRef: data.externalRef ?? null,
            credentialRef: data.credentialRef ?? null,
            state: ProviderAccount.toState(data.state),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        });
    }

    private static toState(value: string): ProviderAccountState {
        const state = Object.values(ProviderAccountState).find((candidate) => candidate === value);

        if (!state) {
            throw new InvalidArgumentError(`provider account state: ${value}: unknown`);
        }

        return state;
    }

    readonly provider: string;
    readonly externalRef: string | null;
    readonly credentialRef: string | null;
    readonly createdAt: Date;

    private readonly _id: ProviderAccountId;
    private readonly _accountId: AccountId;
    private _state: ProviderAccountState;
    private _updatedAt: Date;

    private constructor(params: ProviderAccountConstructorParams) {
        this._id = params.id ?? ProviderAccountId.create();
        this._accountId = params.accountId;
        this.provider = params.provider;
        this.externalRef = params.externalRef ?? null;
        this.credentialRef = params.credentialRef ?? null;
        this._state = params.state ?? ProviderAccountState.Active;
        this.createdAt = params.createdAt ?? new Date();
        this._updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }

    get accountId(): AccountId {
        return this._accountId;
    }

    get state(): ProviderAccountState {
        return this._state;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    isActive(): boolean {
        return this._state === ProviderAccountState.Active;
    }

    markInvalid(): void {
        this._state = ProviderAccountState.Invalid;
        this.touch();
    }

    markActive(): void {
        this._state = ProviderAccountState.Active;
        this.touch();
    }

    toObject(): ProviderAccountData {
        return {
            id: this.id,
            accountId: this._accountId.getValue(),
            provider: this.provider,
            externalRef: this.externalRef,
            credentialRef: this.credentialRef,
            state: this._state,
            createdAt: this.createdAt,
            updatedAt: this._updatedAt,
        };
    }

    private touch(): void {
        this._updatedAt = new Date();
    }
}
