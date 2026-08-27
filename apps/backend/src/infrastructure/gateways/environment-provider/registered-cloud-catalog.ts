import { CloudCatalog } from "../../../application/interfaces/cloud-catalog";
import { Stereotype } from "../../../domain/entities/cloud-account/stereotype";
import { Execution } from "../../../domain/entities/environment/execution";

// The one place that knows cloud-type → the (platform, execution) substrates it provisions. Adding a cloud
// backend means adding an entry here (and its adapter/routing). The domain stays cloud-agnostic: a
// CloudAccount only stores the `provides` materialised from this catalogue at connect time.
const substratesByType = new Map<string, ReadonlyArray<Stereotype>>([
    // The machine sw itself runs on, driven through its docker daemon.
    ["local", [new Stereotype("linux", Execution.Container)]],
    [
        "yandex-cloud",
        [new Stereotype("android", Execution.Container), new Stereotype("android", Execution.Emulator)],
    ],
]);

export class RegisteredCloudCatalog extends CloudCatalog {
    supports(type: string): boolean {
        return substratesByType.has(type);
    }

    providesFor(type: string): ReadonlyArray<Stereotype> {
        return substratesByType.get(type) ?? [];
    }

    types(): ReadonlyArray<string> {
        return [...substratesByType.keys()];
    }
}
