import { ResponseDto } from "./response-dto";

export class EmptyResponseDto implements ResponseDto {
    toObject(): object {
        return {};
    }
}
