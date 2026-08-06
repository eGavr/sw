import { IsInt, IsPositive } from "class-validator";

import { Value } from "../../types/value/value";

// FIXME: source the default idle timeout from configuration.
const defaultMilliseconds = 60_000;

export class SessionIdleTimeout extends Value<number> {
    static fromMilliseconds(milliseconds: number): SessionIdleTimeout {
        return new SessionIdleTimeout(milliseconds);
    }

    static default(): SessionIdleTimeout {
        return new SessionIdleTimeout(defaultMilliseconds);
    }

    @IsInt()
    @IsPositive()
    declare protected value: number;

    get milliseconds(): number {
        return this.getValue();
    }
}
