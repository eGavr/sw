import { Environment } from "../../../domain/entities/environment/environment";

// An environment as one caller sees it: the entity plus caller-dependent capability flags (the Google
// Drive files.capabilities pattern). `canAccessCurrentSession` — the caller created the environment's
// current session, so recovering/killing it is open to them.
export type EnvironmentView = {
    readonly environment: Environment;
    readonly canAccessCurrentSession: boolean;
};
