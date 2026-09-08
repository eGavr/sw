import { Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min, ValidateNested } from "class-validator";

import { Execution } from "../../../../../../domain/entities/environment/execution";

export class ProvidedStereotypeRequestModel {
    @IsString()
    @IsNotEmpty()
    platform: string;

    @IsEnum(Execution)
    execution: Execution;
}

// Attach one of the user's machines: where it is reachable and what it serves. Whether the platforms are
// bound on the cloud is the use case's judgement; this checks transport format only.
export class AttachMachineRequestModel {
    @IsString()
    @Matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i, {
        message: "fqdn must be a hostname or an IPv4 address",
    })
    fqdn: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProvidedStereotypeRequestModel)
    provides?: Array<ProvidedStereotypeRequestModel>;

    @IsOptional()
    @IsInt()
    @Min(1)
    slotCapacity?: number;
}
