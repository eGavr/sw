import { Matches, MaxLength } from "class-validator";

import { Value } from "../../../types/value/value";

export class ApplicationName extends Value<string> {
    @MaxLength(64)
    @Matches(/^[a-z0-9][a-z0-9-]*$/)
    declare protected value: string;
}
