import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class ListEnvironmentsRequestDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    pageSize?: number;

    @IsOptional()
    @IsString()
    pageToken?: string;
}
