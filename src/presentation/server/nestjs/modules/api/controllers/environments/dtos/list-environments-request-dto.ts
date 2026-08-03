import { IsString } from "class-validator";

export class ListEnvironmentsRequestDto {
    @IsString()
    accountId: string;
}
