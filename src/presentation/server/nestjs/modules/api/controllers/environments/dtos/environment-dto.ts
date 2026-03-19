import { ResponseDto } from "../../../../../dtos/response-dto";

export class EnvironmentDto implements ResponseDto {
    constructor(private readonly environment: unknown) {}

    toObject(): object {
        return {};
    }
}
