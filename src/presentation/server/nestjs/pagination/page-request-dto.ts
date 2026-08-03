import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

// Shared AIP-158 pagination query fields.
export class PageRequestDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    pageSize?: number;

    @IsOptional()
    @IsString()
    pageToken?: string;
}
