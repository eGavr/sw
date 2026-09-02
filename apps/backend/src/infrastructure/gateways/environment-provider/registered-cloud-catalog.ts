import {
    CloudCatalog,
    CloudConnectRequirements,
    CloudGrant,
    SubstrateOffer,
} from "../../../application/interfaces/cloud-catalog";
import { Stereotype } from "../../../domain/entities/cloud-account/stereotype";
import { Execution } from "../../../domain/entities/environment/execution";
import { InternalError } from "../../../domain/entities/error/internal-error";

// The install's published compute identity the user grants roles to on their own cloud (delegated BYOC).
// Optional: a dev/local install has none and its catalogue simply lists no grants. The storage identity is
// a separate surface (GET /v1/storageDelegation) — it belongs to the bucket setup, not to cloud connect.
export type DelegationIdentities = {
    readonly computeServiceAccountId?: string;
};

const noRequirements: CloudConnectRequirements = { requiredConfig: [], grants: [] };

// The one place that knows cloud-type → the substrates it offers and the compute kinds that run each.
// Adding a cloud backend or kind means adding an entry here (and its adapter/routing). The domain stays
// cloud-agnostic: a CloudAccount only stores the bindings the user made against this catalogue.
function offersByType(identities: DelegationIdentities): Map<string, ReadonlyArray<SubstrateOffer>> {
    const kubernetesGrants: Array<CloudGrant> = identities.computeServiceAccountId
        ? [{ role: "k8s.cluster-api.editor", serviceAccountId: identities.computeServiceAccountId }]
        : [];

    return new Map<string, ReadonlyArray<SubstrateOffer>>([
        // The machine sw itself runs on, driven through its docker daemon — one configless kind.
        ["local", [
            {
                stereotype: new Stereotype("linux", Execution.Container),
                compute: [{ kind: "docker", requiredConfig: [], grants: [] }],
            },
        ]],
        // android/emulator has an adapter but is not offered until verified on real KVM hardware.
        ["yandex-cloud", [
            {
                stereotype: new Stereotype("android", Execution.Container),
                compute: [{ kind: "vm", requiredConfig: [], grants: [] }],
            },
            {
                stereotype: new Stereotype("linux", Execution.Container),
                compute: [
                    // Per-env VM: pay-per-use, start ~minutes. The account's folder is all it needs.
                    { kind: "vm", requiredConfig: [], grants: [] },
                    // The user's managed cluster: always-on fee, pod start ~seconds.
                    { kind: "kubernetes", requiredConfig: ["clusterId"], grants: kubernetesGrants },
                ],
            },
        ]],
    ]);
}

// A cloud is offered per installation: local dev exposes only `local` (the operator's docker), a hosted
// install only the real clouds it runs on. `enabledTypes` (from CLOUD_CATALOG) narrows the known set to
// what this install offers; omitted means all known types (tests and back-compat). An enabled type that is
// not a known backend is a misconfiguration and fails fast at startup, not silently as an empty catalogue.
export class RegisteredCloudCatalog extends CloudCatalog {
    private readonly offers: Map<string, ReadonlyArray<SubstrateOffer>>;

    constructor(
        enabledTypes?: ReadonlyArray<string>,
        private readonly identities: DelegationIdentities = {},
    ) {
        super();

        const all = offersByType(identities);

        if (!enabledTypes) {
            this.offers = all;

            return;
        }

        const unknown = enabledTypes.filter((type) => !all.has(type));

        if (unknown.length > 0) {
            throw new InternalError(
                `cloud catalog: unknown type(s): ${unknown.join(", ")} (known: ${[...all.keys()].join(", ")})`,
            );
        }

        this.offers = new Map([...all].filter(([type]) => enabledTypes.includes(type)));
    }

    supports(type: string): boolean {
        return this.offers.has(type);
    }

    types(): ReadonlyArray<string> {
        return [...this.offers.keys()];
    }

    substrateOffers(type: string): ReadonlyArray<SubstrateOffer> {
        return this.offers.get(type) ?? [];
    }

    // yandex-cloud is delegated BYOC: the connection MUST name the user's folder (or provisioning would
    // silently fall back to the operator's folder and bill the operator) and the user pre-grants our
    // published identity. `local` is the operator's own machine — nothing to require.
    connectRequirementsFor(type: string): CloudConnectRequirements {
        if (type !== "yandex-cloud" || !this.supports(type)) {
            return noRequirements;
        }

        const grants: Array<CloudGrant> = this.identities.computeServiceAccountId
            ? [
                { role: "compute.editor", serviceAccountId: this.identities.computeServiceAccountId },
                { role: "vpc.user", serviceAccountId: this.identities.computeServiceAccountId },
            ]
            : [];

        return { requiredConfig: ["folderId"], grants };
    }
}
