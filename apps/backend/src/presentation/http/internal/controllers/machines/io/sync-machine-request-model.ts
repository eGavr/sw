import { Type } from "class-transformer";
import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";

import { MachineFactsRequestModel } from "./machine-facts-request-model";

// One slot the agent observes running — reported for the record; the desired set in the answer is
// what the agent converges to.
export class ObservedSlotRequestModel {
    @IsString()
    environmentId: string;

    @IsString()
    state: string;
}

export class SyncMachineRequestModel {
    @ValidateNested()
    @Type(() => MachineFactsRequestModel)
    facts: MachineFactsRequestModel;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ObservedSlotRequestModel)
    slots?: Array<ObservedSlotRequestModel>;
}
