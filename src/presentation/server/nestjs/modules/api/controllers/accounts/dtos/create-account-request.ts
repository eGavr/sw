import { IsString } from "class-validator";

export class CreateAccountRequest {
    @IsString()
    name: string;
}
