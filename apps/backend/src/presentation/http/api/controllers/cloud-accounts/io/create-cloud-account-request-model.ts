import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

// Connect a cloud to the project. `type` is validated against the cloud catalogue in the use case; the
// supported substrates (`provides`) are derived from it, not supplied here. `config` is the non-secret
// connection blob. `credential` is the cloud's own secret (e.g. a service-account key): accepted here only
// to hand straight to the secret store — the use case persists a reference, never the secret, and it is
// kept out of logs.
export class CreateCloudAccountRequestModel {
    @IsString()
    type: string;

    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    credential?: string;
}
