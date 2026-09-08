import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, ValidateNested } from "class-validator";

import { ProvidedStereotypeRequestModel } from "./attach-machine-request-model";

// Re-declare what an attached machine serves. Whether the platforms are bound on the cloud is the use
// case's judgement; this checks transport format only.
export class UpdateMachineRequestModel {
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ProvidedStereotypeRequestModel)
    provides: Array<ProvidedStereotypeRequestModel>;
}
