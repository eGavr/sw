import { RegistrationTokenService } from "../../application/interfaces/registration-token-service";

import { Sha256RegistrationTokenService } from "./sha256-registration-token-service";

export const RegistrationTokenServiceProvider = {
    provide: RegistrationTokenService,
    useClass: Sha256RegistrationTokenService,
};
