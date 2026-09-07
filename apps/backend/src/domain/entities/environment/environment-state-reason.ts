export enum EnvironmentStateReason {
    PermissionDenied = "PERMISSION_DENIED",
    QuotaExceeded = "QUOTA_EXCEEDED",
    InvalidCaps = "INVALID_CAPS",
    ProviderError = "PROVIDER_ERROR",
    ProvisioningTimeout = "PROVISIONING_TIMEOUT",
    // The delegated resource does not carry this project's ownership marker — the project is not
    // authorised to provision into it (or the owner has not placed the marker yet).
    OwnershipNotVerified = "OWNERSHIP_NOT_VERIFIED",
    // What the agent measured on the device contradicts a catalog build's declared identity — the
    // delivered artifact is not what the catalog claims it is.
    MeasurementMismatch = "MEASUREMENT_MISMATCH",
}
