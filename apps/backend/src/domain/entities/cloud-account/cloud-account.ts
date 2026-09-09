import { ResourceId } from "../../types/resource-id/resource-id";
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
    // The human-readable id the connection is addressed by, when one was chosen; else the uid addresses it.
    resourceId?: string | null;
    // A free label for people (AIP-148): mutable, not unique, never an address.
    displayName?: string | null;
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
    resourceId?: string;
    displayName?: string;
    credentialRef?: string | null;
};

type CloudAccountConstructorParams = {
    id?: CloudAccountId;
    resourceId?: string | null;
    displayName?: string | null;
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
            resourceId: data.resourceId,
            displayName: data.displayName,
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
    private readonly _resourceId: ResourceId | null;
    private _displayName: string | null;
    private readonly _projectId: ProjectId;
    private _computeBindings: Array<ComputeBinding>;
    private _updatedAt: Date;

    private constructor(params: CloudAccountConstructorParams) {
        this._id = params.id ?? CloudAccountId.create();
        this._resourceId = params.resourceId ? new ResourceId(params.resourceId) : null;
        this._displayName = params.displayName ?? null;
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

    // The human-readable id chosen at connect, else null (then the uid addresses the connection).
    get resourceId(): string | null {
        return this._resourceId ? this._resourceId.getValue() : null;
    }

    // What people call it ("prod folder"). A label, never an address.
    get displayName(): string | null {
        return this._displayName;
    }

    // Either address answers for this connection: the word its owner chose, or its uid.
    isAddressedBy(handle: string): boolean {
        return this.id === handle || this.resourceId === handle;
    }

    rename(displayName: string | null): void {
        this._displayName = displayName;
        this.touch();
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
            resourceId: this.resourceId,
            displayName: this._displayName,
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
