import { IsString } from "class-validator";

export class ListAccountPermissionsRequestDto {
    @IsString()
    accountId: string;
}
