import { IsString } from "class-validator";

export class DeleteSessionRequestDto {
    @IsString()
    sessionId: string;
}
