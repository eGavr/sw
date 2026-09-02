import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { CloudAccount } from "./cloud-account";
import { ComputeBindingConflictError } from "./error/compute-binding-conflict-error";

const account = (): CloudAccount =>
    CloudAccount.create({ projectId: ProjectId.create(), type: "yandex-cloud", config: { folderId: "b1g" } });

describe("CloudAccount", () => {
    test("starts with no bindings, no credential, and its config", () => {
        const cloudAccount = account();

        expect(cloudAccount.computeBindings()).toEqual([]);
        expect(cloudAccount.credentialRef).toBeNull();
        expect(cloudAccount.config).toEqual({ folderId: "b1g" });
        expect(cloudAccount.supports("linux", Execution.Container)).toBe(false);
    });

    test("binds a substrate to a kind and serves it", () => {
        const cloudAccount = account();

        const binding = cloudAccount.bindCompute({
            platformName: "linux",
            execution: Execution.Container,
            kind: "kubernetes",
            config: { clusterId: "cat9" },
        });

        expect(cloudAccount.supports("linux", Execution.Container)).toBe(true);
        expect(cloudAccount.computeBindingFor("linux", Execution.Container)?.id).toBe(binding.id);
        expect(binding.kind).toBe("kubernetes");
        expect(binding.config).toEqual({ clusterId: "cat9" });
    });

    test("refuses a second binding for the same substrate", () => {
        const cloudAccount = account();

        cloudAccount.bindCompute({ platformName: "linux", execution: Execution.Container, kind: "vm" });

        expect(() =>
            cloudAccount.bindCompute({ platformName: "linux", execution: Execution.Container, kind: "kubernetes" }),
        ).toThrow(ComputeBindingConflictError);
    });

    test("rebinds a substrate to another kind, replacing the kind's config", () => {
        const cloudAccount = account();
        const binding = cloudAccount.bindCompute({
            platformName: "linux", execution: Execution.Container, kind: "kubernetes", config: { clusterId: "cat9" },
        });

        const rebound = cloudAccount.rebindCompute(binding.id, "vm");

        expect(rebound?.kind).toBe("vm");
        expect(rebound?.config).toEqual({});
        expect(cloudAccount.rebindCompute("missing", "vm")).toBeNull();
    });

    test("unbinds a substrate; new environments of it can no longer land here", () => {
        const cloudAccount = account();
        const binding = cloudAccount.bindCompute({
            platformName: "linux", execution: Execution.Container, kind: "vm",
        });

        expect(cloudAccount.unbindCompute(binding.id)).toBe(true);
        expect(cloudAccount.supports("linux", Execution.Container)).toBe(false);
        expect(cloudAccount.unbindCompute(binding.id)).toBe(false);
    });

    test("round-trips through toObject/fromObject with its bindings", () => {
        const cloudAccount = account();

        cloudAccount.bindCompute({
            platformName: "linux", execution: Execution.Container, kind: "kubernetes", config: { clusterId: "cat9" },
        });

        const revived = CloudAccount.fromObject(cloudAccount.toObject());

        expect(revived.computeBindings().map((binding) => binding.toObject()))
            .toEqual(cloudAccount.computeBindings().map((binding) => binding.toObject()));
    });
});
