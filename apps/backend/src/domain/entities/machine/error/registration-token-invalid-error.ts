import { UnauthenticatedError } from "../../error/unauthenticated-error";

export class RegistrationTokenInvalidError extends UnauthenticatedError {
    constructor() {
        super("machine registration: the registration token is unknown, spent or expired");
    }
}
