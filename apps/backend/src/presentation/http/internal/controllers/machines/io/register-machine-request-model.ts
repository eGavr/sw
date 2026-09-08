import { Type } from "class-transformer";
import { IsNotEmpty, IsString, ValidateNested } from "class-validator";

import { MachineFactsRequestModel } from "./machine-facts-request-model";

export class RegisterMachineRequestModel {
    @IsString()
    @IsNotEmpty()
    registrationToken: string;

    @ValidateNested()
    @Type(() => MachineFactsRequestModel)
    facts: MachineFactsRequestModel;
}
