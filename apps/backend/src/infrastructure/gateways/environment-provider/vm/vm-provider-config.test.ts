import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";

import { vmProvisioningOverrides } from "./vm-provider-config";

describe("vmProvisioningOverrides", () => {
    test("returns nothing for an absent config", () => {
        expect(vmProvisioningOverrides(undefined)).toEqual({});
    });

    test("reads the per-account folder, network and image", () => {
        const overrides = vmProvisioningOverrides({
            folderId: "b1gfolder",
            imageId: "fd8image",
            zone: "ru-central1-b",
            subnetId: "e9bsubnet",
            securityGroupId: "enpsg",
        });

        expect(overrides).toEqual({
            folderId: "b1gfolder",
            imageId: "fd8image",
            zone: "ru-central1-b",
            subnetId: "e9bsubnet",
            securityGroupId: "enpsg",
        });
    });

    test("leaves unknown keys out and absent keys undefined", () => {
        const overrides = vmProvisioningOverrides({ folderId: "b1gfolder", cores: 8 });

        expect(overrides.folderId).toBe("b1gfolder");
        expect(overrides.zone).toBeUndefined();
        expect(overrides).not.toHaveProperty("cores");
    });

    test("rejects a non-string or empty value", () => {
        expect(() => vmProvisioningOverrides({ folderId: 42 })).toThrow(InvalidArgumentError);
        expect(() => vmProvisioningOverrides({ zone: "" })).toThrow(InvalidArgumentError);
    });
});
