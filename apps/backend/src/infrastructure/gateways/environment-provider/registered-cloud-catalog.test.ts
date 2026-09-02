import { SubstrateOffer } from "../../../application/interfaces/cloud-catalog";
import { Execution } from "../../../domain/entities/environment/execution";
import { InternalError } from "../../../domain/entities/error/internal-error";

import { RegisteredCloudCatalog } from "./registered-cloud-catalog";

describe("RegisteredCloudCatalog", () => {
    const catalog = new RegisteredCloudCatalog();

    const offer = (type: string, platform: string, execution: Execution): SubstrateOffer | undefined =>
        catalog.substrateOffers(type).find((candidate) => candidate.stereotype.matches(platform, execution));

    test("supports the registered cloud types only", () => {
        expect(catalog.supports("yandex-cloud")).toBe(true);
        expect(catalog.supports("local")).toBe(true);
        expect(catalog.supports("unknown")).toBe(false);
    });

    test("yandex-cloud offers android on a VM and linux on a VM or the user's kubernetes cluster", () => {
        expect(offer("yandex-cloud", "android", Execution.Container)?.compute.map((kindOffer) => kindOffer.kind))
            .toEqual(["vm"]);

        const linux = offer("yandex-cloud", "linux", Execution.Container);
        expect(linux?.compute.map((kindOffer) => kindOffer.kind)).toEqual(["vm", "kubernetes"]);
        // The kubernetes kind must name the user's cluster; the vm kind lives off the account's folder.
        expect(linux?.compute.find((kindOffer) => kindOffer.kind === "kubernetes")?.requiredConfig)
            .toEqual(["clusterId"]);
        expect(linux?.compute.find((kindOffer) => kindOffer.kind === "vm")?.requiredConfig).toEqual([]);
    });

    test("local offers linux via its sole configless docker kind", () => {
        expect(offer("local", "linux", Execution.Container)?.compute)
            .toEqual([{ kind: "docker", requiredConfig: [], grants: [] }]);
    });

    test("publishes the kubernetes grant when the install has a compute identity", () => {
        const withIdentity = new RegisteredCloudCatalog(undefined, { computeServiceAccountId: "aje-compute" });

        expect(withIdentity.substrateOffers("yandex-cloud")
            .find((candidate) => candidate.stereotype.matches("linux", Execution.Container))
            ?.compute.find((kindOffer) => kindOffer.kind === "kubernetes")?.grants)
            .toEqual([{ role: "k8s.cluster-api.editor", serviceAccountId: "aje-compute" }]);

        expect(withIdentity.connectRequirementsFor("yandex-cloud")).toEqual({
            requiredConfig: ["folderId"],
            grants: [
                { role: "compute.editor", serviceAccountId: "aje-compute" },
                { role: "vpc.user", serviceAccountId: "aje-compute" },
            ],
        });
    });

    test("the local cloud requires nothing to connect", () => {
        expect(catalog.connectRequirementsFor("local")).toEqual({ requiredConfig: [], grants: [] });
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
