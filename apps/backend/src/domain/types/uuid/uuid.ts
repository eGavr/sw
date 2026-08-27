import { IsUUID } from "class-validator";
import { v4 as uuidv4 } from "uuid";

import { Value } from "../value/value";

export class Uuid extends Value<string> {
    static create(): Uuid {
        return new this();
    }

    static fromString(value: string): Uuid {
        return new this(value);
    }

    @IsUUID()
    declare value: string;

    protected constructor(value?: string) {
        super(value || uuidv4())
    }
}
