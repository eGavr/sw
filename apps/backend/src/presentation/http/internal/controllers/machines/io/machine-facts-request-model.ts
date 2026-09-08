import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

import type { MachineFactsData, Virtualization } from "../../../../../../domain/entities/machine/machine-facts";

const virtualizations: ReadonlyArray<Virtualization> = ["kvm", "hvf", "none"];

// What the agent found on the box — transport format only; the domain judges what it means.
export class MachineFactsRequestModel {
    @IsInt()
    @Min(1)
    cores: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    memoryMb?: number;

    @IsIn(virtualizations)
    virtualization: Virtualization;

    @IsBoolean()
    emulator: boolean;

    @IsArray()
    @IsString({ each: true })
    avds: Array<string>;

    @IsBoolean()
    docker: boolean;

    @IsBoolean()
    vncStack: boolean;

    @IsString()
    agentVersion: string;

    @IsOptional()
    @IsString()
    address?: string;
}

// The validated body is a plain object (the module's pipe validates without transforming), so the
// facts are read off it here rather than by a method on the model.
export function factsOf(model: MachineFactsRequestModel): MachineFactsData {
    return {
        cores: model.cores,
        memoryMb: model.memoryMb ?? null,
        virtualization: model.virtualization,
        emulator: model.emulator,
        avds: model.avds,
        docker: model.docker,
        vncStack: model.vncStack,
        agentVersion: model.agentVersion,
        address: model.address ?? null,
    };
}
