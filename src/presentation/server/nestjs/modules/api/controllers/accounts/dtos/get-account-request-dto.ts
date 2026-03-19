import { IsString } from "class-validator";

export class GetAccountRequestDto {
    @IsString()
    accountId: string;
}
