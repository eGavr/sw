import { CloudCatalog } from "../../../application/interfaces/cloud-catalog";
import { Stereotype } from "../../../domain/entities/cloud-account/stereotype";
import { Execution } from "../../../domain/entities/environment/execution";
import { InternalError } from "../../../domain/entities/error/internal-error";

// The one place that knows cloud-type → the (platform, execution) substrates it provisions. Adding a cloud
// backend means adding an entry here (and its adapter/routing). The domain stays cloud-agnostic: a
// CloudAccount only stores the `provides` materialised from this catalogue at connect time.
const allSubstratesByType = new Map<string, ReadonlyArray<Stereotype>>([
    // The machine sw itself runs on, driven through its docker daemon.
    ["local", [new Stereotype("linux", Execution.Container)]],
    // android/emulator has an adapter but is not offered until verified on real KVM hardware. Note local
    // and yandex-cloud both provide linux/container, so one project cannot connect both — installs never
    // offer both anyway (dev = local only, hosted = real clouds only; see CLOUD_CATALOG).
    ["yandex-cloud", [
        new Stereotype("android", Execution.Container),
        new Stereotype("linux", Execution.Container),
    ]],
]);

// A cloud is offered per installation: local dev exposes only `local` (the operator's docker), a hosted
// install only the real clouds it runs on. `enabledTypes` (from CLOUD_CATALOG) narrows the known set to
// what this install offers; omitted means all known types (tests and back-compat). An enabled type that is
// not a known backend is a misconfiguration and fails fast at startup, not silently as an empty catalogue.
export class RegisteredCloudCatalog extends CloudCatalog {
    private readonly substratesByType: Map<string, ReadonlyArray<Stereotype>>;

    constructor(enabledTypes?: ReadonlyArray<string>) {
        super();

        if (!enabledTypes) {
            this.substratesByType = allSubstratesByType;

            return;
        }

        const unknown = enabledTypes.filter((type) => !allSubstratesByType.has(type));

        if (unknown.length > 0) {
            throw new InternalError(
                `cloud catalog: unknown type(s): ${unknown.join(", ")} (known: ${[...allSubstratesByType.keys()].join(", ")})`,
            );
        }

        this.substratesByType = new Map(
            [...allSubstratesByType].filter(([type]) => enabledTypes.includes(type)),
        );
    }

    supports(type: string): boolean {
        return this.substratesByType.has(type);
    }

    providesFor(type: string): ReadonlyArray<Stereotype> {
        return this.substratesByType.get(type) ?? [];
    }

    types(): ReadonlyArray<string> {
        return [...this.substratesByType.keys()];
    }
}
