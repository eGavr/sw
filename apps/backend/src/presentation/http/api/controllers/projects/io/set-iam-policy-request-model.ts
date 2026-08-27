import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDefined, IsOptional, IsString, ValidateNested } from "class-validator";

class IamBindingModel {
    @IsString()
    role: string;

    @IsArray()
    @ArrayMaxSize(1000)
    @IsString({ each: true })
    members: string[];
}

class IamPolicyModel {
    @IsOptional()
    @IsString()
    etag?: string;

    @IsArray()
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => IamBindingModel)
    bindings: IamBindingModel[];
}

export class SetIamPolicyRequestModel {
    @IsDefined()
    @ValidateNested()
    @Type(() => IamPolicyModel)
    policy: IamPolicyModel;
}
