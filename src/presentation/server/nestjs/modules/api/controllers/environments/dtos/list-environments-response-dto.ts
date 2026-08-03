import { Environment } from "../../../../../../../../domain/entities/environment/environment";
import { ResponseDto } from "../../../../../dtos/response-dto";

import { EnvironmentDto } from "./environment-dto";

export class ListEnvironmentsResponseDto implements ResponseDto {
    constructor(private readonly environments: Array<Environment>) {}

    toObject(): object {
        return {
            environments: this.environments.map((environment) => new EnvironmentDto(environment).toObject()),
        };
    }
}
