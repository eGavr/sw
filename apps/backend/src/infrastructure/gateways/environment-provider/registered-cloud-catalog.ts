import {
    CloudCatalog,
    CloudGrant,
    ConfigRequirement,
    SubstrateOffer,
} from "../../../application/interfaces/cloud-catalog";
import { Stereotype } from "../../../domain/entities/cloud-account/stereotype";
import { Execution } from "../../../domain/entities/environment/execution";
import { InternalError } from "../../../domain/entities/error/internal-error";

// The install's published compute identity the user grants roles to on their own cloud (delegated BYOC).
// Optional: a dev/local install has none and its catalogue simply lists no grants. The storage identity is
// a separate surface (GET /v1/storageDelegation) — it belongs to the bucket setup, not to compute.
export type DelegationIdentities = {
    readonly computeServiceAccountId?: string;
};

// Every YC resource id (folder, cluster) is a 20-character lowercase base32 string; anything else is a
// typo worth refusing at the input instead of burning a probe on it.
const yandexCloudIdPattern = "^[a-z0-9]{20}$";

const folderIdRequirement: ConfigRequirement = { key: "folderId", pattern: yandexCloudIdPattern };
const clusterIdRequirement: ConfigRequirement = { key: "clusterId", pattern: yandexCloudIdPattern };

// The one place that knows cloud-type → the substrates it offers and the compute kinds that run each.
// Adding a cloud backend or kind means adding an entry here (and its adapter/routing). Each kind carries
// everything the user must name (config) and pre-grant for it — access is checked per binding, and the
// domain stays cloud-agnostic: a CloudAccount only stores the bindings the user made against this
// catalogue.
function offersByType(identities: DelegationIdentities): Map<string, ReadonlyArray<SubstrateOffer>> {
    const identity = identities.computeServiceAccountId;

    // The vm kind provisions Compute VMs in the user's folder (and reads a folder label to verify
    // ownership); the kubernetes kind drives the API of the user's managed cluster and reads a cluster
    // label. resource-manager.viewer is the read-only role that lets us read the folder's labels — it
    // does NOT let us WRITE them, which is exactly what keeps the ownership marker unforgeable.
    const vmGrants: Array<CloudGrant> = identity
        ? [
            { role: "compute.editor", serviceAccountId: identity },
            { role: "vpc.user", serviceAccountId: identity },
            { role: "resource-manager.viewer", serviceAccountId: identity },
        ]
        : [];
    const kubernetesGrants: Array<CloudGrant> = identity
        ? [{ role: "k8s.cluster-api.editor", serviceAccountId: identity }]
        : [];
    // The baremetal kind leases whole physical servers in the user's folder and slices them into
    // emulator slots. TODO(s4-verify): confirm the exact editor role name against a real BareMetal
    // order before the live run.
    const baremetalGrants: Array<CloudGrant> = identity
        ? [
            { role: "baremetal.editor", serviceAccountId: identity },
            { role: "vpc.user", serviceAccountId: identity },
            { role: "resource-manager.viewer", serviceAccountId: identity },
        ]
        : [];

    return new Map<string, ReadonlyArray<SubstrateOffer>>([
        // The machine sw itself runs on — the operator's own hardware, so no config and no ownership
        // proof for either kind: browsers run through its docker daemon, android emulators as slots of
        // the machine itself (a dev Mac IS bare metal; the operator starts the host agent by hand).
        ["local", [
            {
                stereotype: new Stereotype("ubuntu", Execution.Container),
                compute: [{ kind: "docker", requiredConfig: [], grants: [], ownershipProof: "none" }],
            },
            {
                stereotype: new Stereotype("android", Execution.Emulator),
                compute: [{ kind: "baremetal", requiredConfig: [], grants: [], ownershipProof: "none" }],
            },
        ]],
        ["yandex-cloud", [
            {
                stereotype: new Stereotype("android", Execution.Container),
                compute: [{
                    kind: "vm", requiredConfig: [folderIdRequirement], grants: vmGrants,
                    ownershipProof: "folder-label",
                }],
            },
            {
                stereotype: new Stereotype("android", Execution.Emulator),
                // QEMU needs /dev/kvm and standard YC VMs expose no nested virt, so the emulator runs
                // on leased bare-metal servers sliced into slots (the pool is our internals — the kind
                // names the substrate).
                compute: [{
                    kind: "baremetal", requiredConfig: [folderIdRequirement], grants: baremetalGrants,
                    ownershipProof: "folder-label",
                }],
            },
            {
                stereotype: new Stereotype("ubuntu", Execution.Container),
                compute: [
                    // Per-env VM: pay-per-use, start ~minutes, lives off the binding's folder.
                    {
                        kind: "vm", requiredConfig: [folderIdRequirement], grants: vmGrants,
                        ownershipProof: "folder-label",
                    },
                    // The user's managed cluster: always-on fee, pod start ~seconds.
                    {
                        kind: "kubernetes", requiredConfig: [clusterIdRequirement], grants: kubernetesGrants,
                        ownershipProof: "cluster-label",
                    },
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
        identities: DelegationIdentities = {},
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
}
