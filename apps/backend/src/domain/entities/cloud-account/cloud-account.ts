import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { CloudAccountId } from "./cloud-account-id";
import {
    ComputeBinding,
    ComputeBindingConfig,
    ComputeBindingCreateParams,
    ComputeBindingData,
} from "./compute-binding";
import { ComputeBindingConflictError } from "./error/compute-binding-conflict-error";

export type CloudAccountData = {
    id: string;
    projectId: string;
    type: string;
    credentialRef?: string | null;
    computeBindings: ReadonlyArray<ComputeBindingData>;
    createdAt: Date;
    updatedAt: Date;
};

export type CloudAccountCreateParams = {
    projectId: ProjectId;
    type: string;
    credentialRef?: string | null;
};

type CloudAccountConstructorParams = {
    id?: CloudAccountId;
    projectId: ProjectId;
    type: string;
    computeBindings?: ReadonlyArray<ComputeBinding>;
    credentialRef?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
};

// A project's connection to a cloud plus its compute bindings — per substrate, WHICH kind runs it and
// with what settings (the user's folder for a vm kind, their cluster for kubernetes). The bindings are
// what the connection actually serves: no binding, no environments of that substrate.
export class CloudAccount {
    static create(params: CloudAccountCreateParams): CloudAccount {
        return new CloudAccount(params);
    }

    static fromObject(data: CloudAccountData): CloudAccount {
        return new CloudAccount({
            id: CloudAccountId.fromString(data.id),
            projectId: ProjectId.fromString(data.projectId),
            type: data.type,
            credentialRef: data.credentialRef ?? null,
            computeBindings: (data.computeBindings ?? []).map(ComputeBinding.fromObject),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        });
    }

    readonly type: string;
    readonly credentialRef: string | null;
    readonly createdAt: Date;

    private readonly _id: CloudAccountId;
    private readonly _projectId: ProjectId;
    private _computeBindings: Array<ComputeBinding>;
    private _updatedAt: Date;

    private constructor(params: CloudAccountConstructorParams) {
        this._id = params.id ?? CloudAccountId.create();
        this._projectId = params.projectId;
        this.type = params.type;
        this._computeBindings = [...(params.computeBindings ?? [])];
        this.credentialRef = params.credentialRef ?? null;
        this.createdAt = params.createdAt ?? new Date();
        this._updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }

    get projectId(): ProjectId {
        return this._projectId;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    computeBindings(): ReadonlyArray<ComputeBinding> {
        return [...this._computeBindings];
    }

    // The binding serving the requested substrate — the routing anchor: environment creation stamps its
    // kind from here, provisioning follows it.
    computeBindingFor(platformName: string, execution: Execution): ComputeBinding | null {
        return this._computeBindings.find((binding) => binding.serves(platformName, execution)) ?? null;
    }

    computeBinding(bindingId: string): ComputeBinding | null {
        return this._computeBindings.find((binding) => binding.id === bindingId) ?? null;
    }

    // Whether this connection runs the requested substrate (a binding exists for it).
    supports(platformName: string, execution: Execution): boolean {
        return this.computeBindingFor(platformName, execution) !== null;
    }

    // One binding per substrate — a second would make provisioning ambiguous.
    bindCompute(params: ComputeBindingCreateParams): ComputeBinding {
        if (this.supports(params.platformName, params.execution)) {
            throw new ComputeBindingConflictError(params.platformName, params.execution);
        }

        const binding = ComputeBinding.create(params);

        this._computeBindings.push(binding);
        this.touch();

        return binding;
    }

    // Re-points the substrate at another kind; existing environments keep what they were provisioned with.
    rebindCompute(bindingId: string, kind: string, config?: ComputeBindingConfig): ComputeBinding | null {
        const binding = this.computeBinding(bindingId);

        binding?.rebind(kind, config);

        if (binding) {
            this.touch();
        }

        return binding;
    }

    unbindCompute(bindingId: string): boolean {
        const remaining = this._computeBindings.filter((binding) => binding.id !== bindingId);
        const removed = remaining.length !== this._computeBindings.length;

        this._computeBindings = remaining;

        if (removed) {
            this.touch();
        }

        return removed;
    }

    belongsTo(projectId: ProjectId): boolean {
        return this._projectId.getValue() === projectId.getValue();
    }

    toObject(): CloudAccountData {
        return {
            id: this.id,
            projectId: this._projectId.getValue(),
            type: this.type,
            credentialRef: this.credentialRef,
            computeBindings: this._computeBindings.map((binding) => binding.toObject()),
            createdAt: this.createdAt,
            updatedAt: this._updatedAt,
        };
    }

    private touch(): void {
        this._updatedAt = new Date();
    }
}
