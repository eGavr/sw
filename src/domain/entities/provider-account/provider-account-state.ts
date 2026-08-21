export enum ProviderAccountState {
    Active = "active",
    // Turned off by an owner (soft delete) — kept for referential integrity, excluded from active routing.
    Disabled = "disabled",
    Invalid = "invalid",
}
