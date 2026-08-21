import { IsObject, IsOptional } from "class-validator";

// Only the non-secret provisioning config is mutable here; provider/platform/execution identify the
// binding (create a new one to change them), and credentials go through the secret store, not this API.
export class UpdateProviderAccountRequestModel {
    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;
}
