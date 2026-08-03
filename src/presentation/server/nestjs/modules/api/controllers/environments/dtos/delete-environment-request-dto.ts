import { IsString } from "class-validator";

export class DeleteEnvironmentRequestDto {
    @IsString()
    environmentId: string;
}
