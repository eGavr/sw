import { Matches, MaxLength } from "class-validator";

import { Value } from "../../types/value/value";

// The human display name (AIP display_name): free text, only non-blank and length are enforced.
// Machine addressing goes through the separate resource id / uid, never through this name.
export class ProjectName extends Value<string> {
    @MaxLength(64)
    @Matches(/\S/, { message: "value must not be blank" })
    declare protected value: string;
}
