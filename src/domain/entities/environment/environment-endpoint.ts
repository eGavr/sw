import { IsNotEmpty } from "class-validator";

import { Value } from "../../types/value/value";

export class EnvironmentEndpoint extends Value<string> {
    @IsNotEmpty()
    declare protected value: string;
}
