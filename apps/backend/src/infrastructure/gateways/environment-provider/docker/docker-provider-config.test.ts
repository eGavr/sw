import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";

import { dockerProvisioningOverrides } from "./docker-provider-config";

describe("dockerProvisioningOverrides", () => {
    test("returns no overrides for an absent or empty config", () => {
        expect(dockerProvisioningOverrides(undefined)).toEqual({});
        expect(dockerProvisioningOverrides({})).toEqual({});
    });

    test("reads the provisioning keys it understands", () => {
        expect(dockerProvisioningOverrides({
            image: "registry/chrome:{version}",
            baseImage: "sw/base:1",
            platform: "linux/amd64",
            port: 4444,
        })).toEqual({
            image: "registry/chrome:{version}",
            baseImage: "sw/base:1",
            platform: "linux/amd64",
            internalPort: 4444,
        });
    });

    test("ignores keys other adapters own", () => {
        expect(dockerProvisioningOverrides({ folderId: "b1g", zone: "ru-central1-a" })).toEqual({});
    });

    test("rejects a wrong-typed key", () => {
        expect(() => dockerProvisioningOverrides({ image: 123 })).toThrow(InvalidArgumentError);
        expect(() => dockerProvisioningOverrides({ port: "4444" })).toThrow(InvalidArgumentError);
        expect(() => dockerProvisioningOverrides({ port: 0 })).toThrow(InvalidArgumentError);
    });
});
