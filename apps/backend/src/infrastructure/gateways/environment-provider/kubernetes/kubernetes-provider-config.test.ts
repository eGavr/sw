import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";

import { kubernetesProvisioningOverrides } from "./kubernetes-provider-config";

describe("kubernetesProvisioningOverrides", () => {
    const resources = {
        requests: { cpu: "500m", memory: "1Gi" },
        limits: { cpu: "2", memory: "2Gi" },
    };

    test("returns no overrides for an absent or empty config", () => {
        expect(kubernetesProvisioningOverrides(undefined)).toEqual({});
        expect(kubernetesProvisioningOverrides({})).toEqual({});
    });

    test("reads the provisioning keys it understands", () => {
        expect(kubernetesProvisioningOverrides({
            image: "registry/chrome:141",
            port: 4444,
            resources,
        })).toEqual({
            image: "registry/chrome:141",
            containerPort: 4444,
            resources,
        });
    });

    test("ignores keys other adapters own", () => {
        expect(kubernetesProvisioningOverrides({ baseImage: "sw/base:1", platform: "linux/amd64" })).toEqual({});
    });

    test("rejects a wrong-typed image or port", () => {
        expect(() => kubernetesProvisioningOverrides({ image: 123 })).toThrow(InvalidArgumentError);
        expect(() => kubernetesProvisioningOverrides({ port: "4444" })).toThrow(InvalidArgumentError);
        expect(() => kubernetesProvisioningOverrides({ port: 0 })).toThrow(InvalidArgumentError);
    });

    test("rejects a malformed resources block", () => {
        expect(() => kubernetesProvisioningOverrides({ resources: "big" })).toThrow(InvalidArgumentError);
        expect(() => kubernetesProvisioningOverrides({ resources: { requests: resources.requests } }))
            .toThrow(InvalidArgumentError);
        expect(() => kubernetesProvisioningOverrides({
            resources: { requests: { cpu: "500m" }, limits: resources.limits },
        })).toThrow(InvalidArgumentError);
        expect(() => kubernetesProvisioningOverrides({
            resources: { requests: { cpu: 500, memory: "1Gi" }, limits: resources.limits },
        })).toThrow(InvalidArgumentError);
    });
});
