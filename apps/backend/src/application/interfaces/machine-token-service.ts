// Identity carried by a machine agent's token — which machine it was issued for.
export type MachineIdentity = {
    machineId: string;
};

// Mints and verifies the per-machine credential the machine agent presents on every sync. Obtained once
// by spending a registration token; long-lived (rotation is a follow-up), revoked by detaching the
// machine (its row is gone, the agent self-fences on 404). A separate audience from the environment
// agent tokens: the two are mutually unusable.
export abstract class MachineTokenService {
    abstract issue(machineId: string): Promise<string>;

    abstract verify(token: string): Promise<MachineIdentity>;
}
