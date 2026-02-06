import { ValidationError } from "class-validator";

export class ClassValidatorError {
    static stringifyConstraints(error: ValidationError): string {
        return Object.values(error.constraints || {}).join(", ");
    }
}
