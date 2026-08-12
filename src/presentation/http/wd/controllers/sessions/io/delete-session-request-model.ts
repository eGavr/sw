import { IsString } from "class-validator";

export class DeleteSessionRequestModel {
    @IsString()
    sessionId: string;
}
