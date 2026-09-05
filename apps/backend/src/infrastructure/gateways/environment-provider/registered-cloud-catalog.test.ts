import { SubstrateOffer } from "../../../application/interfaces/cloud-catalog";
import { Execution } from "../../../domain/entities/environment/execution";
import { InternalError } from "../../../domain/entities/error/internal-error";

import { RegisteredCloudCatalog } from "./registered-cloud-catalog";

const yandexCloudIdPattern = "^[a-z0-9]{20}$";

describe("RegisteredCloudCatalog", () => {
    const catalog = new RegisteredCloudCatalog();

    const offer = (type: string, platform: string, execution: Execution): SubstrateOffer | undefined =>
        catalog.substrateOffers(type).find((candidate) => candidate.stereotype.matches(platform, execution));

    test("supports the registered cloud types only", () => {
        expect(catalog.supports("yandex-cloud")).toBe(true);
        expect(catalog.supports("local")).toBe(true);
        expect(catalog.supports("unknown")).toBe(false);
    });

    test("yandex-cloud offers android on a VM and ubuntu on a VM or the user's kubernetes cluster", () => {
        expect(offer("yandex-cloud", "android", Execution.Container)?.compute.map((kindOffer) => kindOffer.kind))
            .toEqual(["vm"]);

        const ubuntu = offer("yandex-cloud", "ubuntu", Execution.Container);
        expect(ubuntu?.compute.map((kindOffer) => kindOffer.kind)).toEqual(["vm", "kubernetes"]);
    });

    test("every yandex kind names what it needs: the vm its folder, kubernetes its cluster", () => {
        const ubuntu = offer("yandex-cloud", "ubuntu", Execution.Container);

        // The format pattern lets both the API and the form refuse obvious garbage before any probe.
        expect(ubuntu?.compute.find((kindOffer) => kindOffer.kind === "vm")?.requiredConfig)
            .toEqual([{ key: "folderId", pattern: yandexCloudIdPattern }]);
        expect(ubuntu?.compute.find((kindOffer) => kindOffer.kind === "kubernetes")?.requiredConfig)
            .toEqual([{ key: "clusterId", pattern: yandexCloudIdPattern }]);
        expect(offer("yandex-cloud", "android", Execution.Container)?.compute[0].requiredConfig)
            .toEqual([{ key: "folderId", pattern: yandexCloudIdPattern }]);
    });

    test("local offers ubuntu via its sole configless kind, with no ownership proof", () => {
        expect(offer("local", "ubuntu", Execution.Container)?.compute)
            .toEqual([{ kind: "docker", requiredConfig: [], grants: [], ownershipProof: "none" }]);
    });

    test("each yandex kind declares how ownership is proven", () => {
        const ubuntu = offer("yandex-cloud", "ubuntu", Execution.Container);

        expect(ubuntu?.compute.find((kindOffer) => kindOffer.kind === "vm")?.ownershipProof).toBe("folder-label");
        expect(ubuntu?.compute.find((kindOffer) => kindOffer.kind === "kubernetes")?.ownershipProof)
            .toBe("cluster-label");
    });

    test("publishes each kind's grants when the install has a compute identity", () => {
        const withIdentity = new RegisteredCloudCatalog(undefined, { computeServiceAccountId: "aje-compute" });
        const ubuntu = withIdentity.substrateOffers("yandex-cloud")
            .find((candidate) => candidate.stereotype.matches("ubuntu", Execution.Container));

        // vm reads a folder label to verify ownership → it also needs resource-manager.viewer (read-only).
        expect(ubuntu?.compute.find((kindOffer) => kindOffer.kind === "vm")?.grants).toEqual([
            { role: "compute.editor", serviceAccountId: "aje-compute" },
            { role: "vpc.user", serviceAccountId: "aje-compute" },
            { role: "resource-manager.viewer", serviceAccountId: "aje-compute" },
        ]);
        expect(ubuntu?.compute.find((kindOffer) => kindOffer.kind === "kubernetes")?.grants)
            .toEqual([{ role: "k8s.cluster-api.editor", serviceAccountId: "aje-compute" }]);
    });

    test("narrows the catalogue to the install's enabled types", () => {
        const localOnly = new RegisteredCloudCatalog(["local"]);

        expect(localOnly.types()).toEqual(["local"]);
        expect(localOnly.supports("yandex-cloud")).toBe(false);
        expect(localOnly.substrateOffers("yandex-cloud")).toHaveLength(0);
    });

    test("fails fast when an enabled type is not a known backend", () => {
        expect(() => new RegisteredCloudCatalog(["local", "sky-cloud"])).toThrow(InternalError);
    });
});
