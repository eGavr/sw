import { Uuid } from "../../types/uuid/uuid";
import { Execution, toExecution } from "../environment/execution";

import { Stereotype } from "./stereotype";

// The non-secret, kind-specific settings of one binding (e.g. the user's clusterId for kubernetes).
// Opaque to the domain — the kind's adapter interprets it.
export type ComputeBindingConfig = Record<string, unknown>;

export type ComputeBindingData = {
    id: string;
    platformName: string;
    execution: string;
    kind: string;
    config: ComputeBindingConfig;
};

export type ComputeBindingCreateParams = {
    platformName: string;
    execution: Execution;
    kind: string;
    config?: ComputeBindingConfig;
};

// How environments of one substrate run on this cloud connection: the compute kind (per-env VM, a
// kubernetes cluster, the local docker …) plus that kind's own settings. One binding per substrate —
// the aggregate enforces it, so provisioning always routes unambiguously.
export class ComputeBinding {
    readonly id: string;
    readonly stereotype: Stereotype;
    private _kind: string;
    private _config: ComputeBindingConfig;

    private constructor(id: string, stereotype: Stereotype, kind: string, config: ComputeBindingConfig) {
        this.id = id;
        this.stereotype = stereotype;
        this._kind = kind;
        this._config = config;
    }

    static create(params: ComputeBindingCreateParams): ComputeBinding {
        return new ComputeBinding(
            Uuid.create().getValue(),
            new Stereotype(params.platformName, params.execution),
            params.kind,
            params.config ?? {},
        );
    }

    static fromObject(data: ComputeBindingData): ComputeBinding {
        return new ComputeBinding(
            data.id,
            new Stereotype(data.platformName, toExecution(data.execution)),
            data.kind,
            data.config ?? {},
        );
    }

    get kind(): string {
        return this._kind;
    }

    get config(): ComputeBindingConfig {
        return { ...this._config };
    }

    // Re-pointing the substrate at another kind (vm -> kubernetes) affects newly created environments
    // only; live ones keep running on what they were provisioned with.
    rebind(kind: string, config?: ComputeBindingConfig): void {
        this._kind = kind;
        this._config = config ?? {};
    }

    serves(platformName: string, execution: Execution): boolean {
        return this.stereotype.matches(platformName, execution);
    }

    toObject(): ComputeBindingData {
        return {
            id: this.id,
            platformName: this.stereotype.platformName,
            execution: this.stereotype.execution,
            kind: this._kind,
            config: { ...this._config },
        };
    }
}
