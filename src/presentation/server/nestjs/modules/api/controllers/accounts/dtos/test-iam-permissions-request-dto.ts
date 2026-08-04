import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class TestIamPermissionsRequestDto {
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    permissions: string[];
}
