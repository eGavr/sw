import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

// Re-point the binding's substrate at another kind (and its config). The substrate itself is immutable —
// that is the binding's identity.
export class UpdateComputeBindingRequestModel {
    @IsString()
    @IsNotEmpty()
    kind: string;

    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;
}
