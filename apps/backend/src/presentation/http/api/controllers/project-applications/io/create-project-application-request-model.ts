import { IsNotEmpty, IsString } from "class-validator";

export class CreateProjectApplicationRequestModel {
    // The ONE word the application is addressed by (`chrome`, `myapp`); format is the domain's call.
    @IsString()
    @IsNotEmpty()
    nameAlias: string;
}
