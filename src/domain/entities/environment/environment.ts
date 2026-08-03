import { AccountId } from "../account/account-id";
import { InvalidArgumentError } from "../error/invalid-argument-error";

import { Application, ApplicationData } from "./application/application";
import { ApplicationList } from "./application/application-list";
import { EnvironmentEndpoint } from "./environment-endpoint";
import { EnvironmentId } from "./environment-id";
import { Platform, PlatformData } from "./platform/platform";
import { EnvironmentProviderName } from "./provider/environment-provider-name";

export type EnvironmentData = {
    id: string;
    accountId: string;
    providerName: string;
    platform: PlatformData;
    applications: Array<ApplicationData>;
    endpoint?: string | null;
    createdAt: Date;
};

export type EnvironmentCreateParams = {
    accountId: AccountId;
    providerName: EnvironmentProviderName;
    platform: Platform;
    applications: ApplicationList;
};

type EnvironmentConstructorParams = {
    id?: EnvironmentId;
    accountId: AccountId;
    providerName: EnvironmentProviderName;
    platform: Platform;
    applications: ApplicationList;
    endpoint?: EnvironmentEndpoint | null;
    createdAt?: Date;
};

export class Environment {
    static create(params: EnvironmentCreateParams): Environment {
        return new Environment(params);
    }

    static fromObject(data: EnvironmentData): Environment {
        return new Environment({
            id: EnvironmentId.fromString(data.id),
            accountId: AccountId.fromString(data.accountId),
            providerName: Environment.toProviderName(data.providerName),
            platform: Platform.fromObject(data.platform),
            applications: ApplicationList.fromObject(data.applications),
            endpoint: data.endpoint ? new EnvironmentEndpoint(data.endpoint) : null,
            createdAt: data.createdAt,
        });
    }

    private static toProviderName(value: string): EnvironmentProviderName {
        const providerName = Object.values(EnvironmentProviderName).find((candidate) => candidate === value);

        if (!providerName) {
            throw new InvalidArgumentError(`environment provider name: ${value}: unknown`);
        }

        return providerName;
    }

    readonly providerName: EnvironmentProviderName;
    readonly platform: Platform;
    readonly applications: ApplicationList;
    readonly createdAt: Date;

    private readonly _id: EnvironmentId;
    private readonly _accountId: AccountId;
    private _endpoint: EnvironmentEndpoint | null;

    private constructor(params: EnvironmentConstructorParams) {
        this._id = params.id ?? EnvironmentId.create();
        this._accountId = params.accountId;
        this.providerName = params.providerName;
        this.platform = params.platform;
        this.applications = params.applications;
        this._endpoint = params.endpoint ?? null;
        this.createdAt = params.createdAt ?? new Date();
    }

    get id(): string {
        return this._id.getValue();
    }

    get accountId(): AccountId {
        return this._accountId;
    }

    get endpoint(): string | null {
        return this._endpoint?.getValue() ?? null;
    }

    supports(application: Application): boolean {
        return this.applications.has(application);
    }

    assignEndpoint(endpoint: EnvironmentEndpoint): void {
        this._endpoint = endpoint;
    }

    toObject(): EnvironmentData {
        return {
            id: this.id,
            accountId: this._accountId.getValue(),
            providerName: this.providerName,
            platform: this.platform.toObject(),
            applications: this.applications.toArray(),
            endpoint: this.endpoint,
            createdAt: this.createdAt,
        };
    }
}
