import { IsString } from "class-validator";

export class GetEnvironmentRequestDto {
    @IsString()
    environmentId: string;
}
