import { Type } from "class-transformer";
import { IsDefined, IsString, ValidateNested } from "class-validator";

class ResourcesModel {
    @IsString()
    providerId: string;

    @IsString()
    providerType: string;
}

export class CreateAccountRequestModel {
    @IsString()
    displayName: string;

    @IsDefined()
    @ValidateNested()
    @Type(() => ResourcesModel)
    resources: ResourcesModel;
}
