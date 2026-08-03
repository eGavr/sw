import { IsInt, IsPositive } from "class-validator";

import { Value } from "../../types/value/value";

export class SessionIdleTimeout extends Value<number> {
    static fromMilliseconds(milliseconds: number): SessionIdleTimeout {
        return new SessionIdleTimeout(milliseconds);
    }

    @IsInt()
    @IsPositive()
    declare protected value: number;

    get milliseconds(): number {
        return this.getValue();
    }
}
