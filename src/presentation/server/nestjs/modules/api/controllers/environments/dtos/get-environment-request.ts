import { IsString } from "class-validator";

export class GetEnvironmentRequest {
    @IsString()
    environmentId: string;
}
