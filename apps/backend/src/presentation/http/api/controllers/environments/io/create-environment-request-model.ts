import { Type } from "class-transformer";
import { ArrayNotEmpty, IsDefined, IsEnum, IsOptional, IsString, ValidateNested } from "class-validator";

import { Execution } from "../../../../../../domain/entities/environment/execution";

class PlatformModel {
    @IsString()
    name: string;

    @IsString()
    version: string;

    @IsOptional()
    @IsString()
    deviceModel?: string;
}

class ApplicationModel {
    // The word a registered application is addressed by — a catalog word (`chrome`) or one of the
    // project's own; the same field the environment then carries beside the detected `name`.
    @IsString()
    nameAlias: string;

    // A registered build's alias; omitted resolves to the last registered build.
    @IsOptional()
    @IsString()
    versionAlias?: string;
}

export class CreateEnvironmentRequestModel {
    // Optional client-chosen human-readable id (AIP-133), unique within the project; format enforced by
    // the domain ResourceId. When omitted, the environment is addressed by its uid.
    @IsOptional()
    @IsString()
    environmentId?: string;

    @IsDefined()
    @ValidateNested()
    @Type(() => PlatformModel)
    platform: PlatformModel;

    // The execution substrate (container | emulator | device); defaults to container when omitted.
    @IsOptional()
    @IsEnum(Execution)
    execution?: Execution;

    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ApplicationModel)
    applications: Array<ApplicationModel>;

    // Where to run it, when the caller cares: a binding of one of the project's clouds, by uid or by
    // resource name. Omitted = the project's bindings for this substrate are walked in order.
    @IsOptional()
    @IsString()
    computeBinding?: string;
}

// The uid a placement is pinned to; a resource name (…/computeBindings/{uid}) is accepted for symmetry
// with what the API hands out, and reduced to its id here — the transport's business. A function, not a
// method: the validation pipe does not transform, so the body arrives as a plain object.
export function computeBindingIdOf(body: CreateEnvironmentRequestModel): string | undefined {
    return body.computeBinding?.split("/").pop() || undefined;
}
