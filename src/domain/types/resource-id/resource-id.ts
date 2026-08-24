import { Matches, MaxLength } from "class-validator";

import { InvalidArgumentError } from "../../entities/error/invalid-argument-error";
import { Value } from "../value/value";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A human-readable, client-chosen resource id (AIP-133 `{resource}_id`): lowercase, starts with a letter,
// then letters/digits/hyphens. It addresses a resource in its URL (`projects/my-team`) alongside the
// system uuid. A uuid-shaped value is rejected so the human-id and uid namespaces never collide (a lookup
// resolves the resource id first, then falls back to the uid).
export class ResourceId extends Value<string> {
    @Matches(/^[a-z][a-z0-9-]*$/, { message: "must match ^[a-z][a-z0-9-]*$" })
    @MaxLength(63)
    declare protected value: string;

    protected validate(): void {
        super.validate();

        if (uuidPattern.test(this.value)) {
            throw new InvalidArgumentError("resource id: must not be a uuid");
        }
    }
}
