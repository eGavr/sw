import { Execution, toExecution } from "../environment/execution";

export type StereotypeData = { platformName: string; execution: string };

// A (platform, execution) pair — the routing key. A cloud account "provides" a set of these; an
// environment requests one; matching the two picks where the environment runs. Opaque to which cloud
// backend serves it — that lives in infrastructure, not here.
export class Stereotype {
    constructor(
        readonly platformName: string,
        readonly execution: Execution,
    ) {}

    static fromObject(data: StereotypeData): Stereotype {
        return new Stereotype(data.platformName, toExecution(data.execution));
    }

    matches(platformName: string, execution: Execution): boolean {
        return this.platformName === platformName && this.execution === execution;
    }

    equals(other: Stereotype): boolean {
        return this.matches(other.platformName, other.execution);
    }

    toObject(): StereotypeData {
        return { platformName: this.platformName, execution: this.execution };
    }
}
