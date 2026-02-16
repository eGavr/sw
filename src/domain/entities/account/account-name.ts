import { Matches, MaxLength } from "class-validator";

import { Value } from "../../types/value/value";

export class AccountName extends Value<string> {
    @MaxLength(64)
    @Matches(/^[a-zA-Z0-9-]+$/)
    declare protected value: string;
}
