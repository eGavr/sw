import { Type } from "class-transformer";
import { IsDefined, IsString, ValidateNested } from "class-validator";

class ResourcesDto {
    @IsString()
    providerId: string;

    @IsString()
    providerType: string;
}

export class CreateAccountRequestDto {
    @IsString()
    name: string;

    @IsDefined()
    @ValidateNested()
    @Type(() => ResourcesDto)
    resources: ResourcesDto;
}
