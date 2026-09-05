import { Matches, MaxLength } from "class-validator";

import { Value } from "../../../types/value/value";

// Canonical application names are reverse-DNS ids (`com.android.chrome`) — the honest identity of an
// android package and the flatpak-style id of a desktop app. Short vocabulary words (`chrome`) are
// catalog ALIASES resolved at the boundary, but the same shape also admits a single-segment name, so a
// custom app owner is free to name theirs plainly.
export class ApplicationName extends Value<string> {
    @MaxLength(128)
    @Matches(/^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$/)
    declare protected value: string;
}
