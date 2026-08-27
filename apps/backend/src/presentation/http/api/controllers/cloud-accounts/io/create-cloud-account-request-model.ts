import { IsObject, IsOptional, IsString } from "class-validator";

// Connect a cloud to the project. `type` is validated against the cloud catalogue in the use case; the
// supported substrates (`provides`) are derived from it, not supplied here. `config` is the non-secret
// connection blob; credentials go through a secret store, never here.
export class CreateCloudAccountRequestModel {
    @IsString()
    type: string;

    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;
}
