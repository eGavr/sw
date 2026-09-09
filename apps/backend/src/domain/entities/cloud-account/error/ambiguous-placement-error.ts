import { InvalidArgumentError } from "../../error/invalid-argument-error";

// Several clouds of the project run this substrate, so where the environment goes is the caller's to
// say: the request must name one instead of the platform picking behind their back. The refusal lists
// what there is to choose from.
export class AmbiguousPlacementError extends InvalidArgumentError {
    constructor(platformName: string, execution: string, clouds: ReadonlyArray<{ type: string; id: string }>) {
        super(
            `cloud account: ${platformName}/${execution} is served by several clouds of this project`
                + ` — name the one to run on (cloudAccount): ${clouds.map((c) => `${c.type} (${c.id})`).join(", ")}`,
        );
    }
}
