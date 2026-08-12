import { Type } from "class-transformer";
import { IsDefined, IsString, ValidateNested } from "class-validator";

class ComputeModel {
    @IsString()
    provider: string;

    @IsString()
    externalRef: string;
}

export class CreateAccountRequestModel {
    @IsString()
    displayName: string;

    @IsDefined()
    @ValidateNested()
    @Type(() => ComputeModel)
    compute: ComputeModel;
}
