import { validateSync } from "class-validator";

import { InvalidArgumentError } from "../../entities/error/invalid-argument-error";
import { ClassValidatorError } from "../../utils/class-validator/class-validator-error";

export abstract class Value<T> {
    constructor(protected value: T) {
        this.validate();
    }

    protected validate(): void {
        const [error] = validateSync(this, { stopAtFirstError: true, forbidUnknownValues: false });

        if (error) {
            throw new InvalidArgumentError(
                `${this.lowerCaseClassName}: ${ClassValidatorError.stringifyConstraints(error)}`,
            );
        }
    }

    private get lowerCaseClassName(): string {
        return this.constructor.name.replace(/([a-z\d])([A-Z])/g, "$1 $2").toLowerCase();
    }

    getValue(): T {
        return this.value;
    }
}
