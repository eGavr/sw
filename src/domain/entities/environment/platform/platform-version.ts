import { Matches } from "class-validator";

import { Value } from "../../../types/value/value";

export class PlatformVersion extends Value<string> {
    @Matches(/^[a-zA-Z0-9.\-_]+$/)
    declare protected value: string;
}
