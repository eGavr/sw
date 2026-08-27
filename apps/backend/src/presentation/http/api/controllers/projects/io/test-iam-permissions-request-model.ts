import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class TestIamPermissionsRequestModel {
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    permissions: string[];
}
