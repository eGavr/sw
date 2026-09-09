import { Uuid } from "../../types/uuid/uuid";
import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { CloudAccount } from "./cloud-account";
import { CloudAccountList } from "./cloud-account-list";

const account = (type: string): CloudAccount =>
    CloudAccount.create({ projectId: ProjectId.create(), type });

// A connection whose one binding was made at a given moment — the order candidates are walked in.
const boundAt = (type: string, kind: string, createdAt: Date): CloudAccount => {
    const cloudAccount = account(type);

    return CloudAccount.fromObject({
        ...cloudAccount.toObject(),
        computeBindings: [{
            id: Uuid.create().getValue(),
            platformName: "ubuntu",
            execution: Execution.Container,
            kind,
            config: {},
            createdAt,
        }],
    });
};

describe("CloudAccountList", () => {
    test("offers every connection serving a substrate, the first one bound leading", () => {
        const own = boundAt("self-hosted", "baremetal", new Date("2026-01-01T00:00:00Z"));
        const cloud = boundAt("yandex-cloud", "vm", new Date("2026-06-01T00:00:00Z"));

        // Listed cloud-first on purpose: the order is the bindings', not the connections'.
        const candidates = CloudAccountList.of([cloud, own]).candidatesFor("ubuntu", Execution.Container);

        expect(candidates.map(({ cloudAccount }) => cloudAccount.type)).toEqual(["self-hosted", "yandex-cloud"]);
        expect(candidates.map(({ binding }) => binding.kind)).toEqual(["baremetal", "vm"]);
    });

    test("offers nothing when no connection binds the substrate", () => {
        expect(CloudAccountList.of([account("yandex-cloud")]).candidatesFor("ubuntu", Execution.Container)).toEqual([]);
        expect(CloudAccountList.of([]).candidatesFor("ubuntu", Execution.Container)).toEqual([]);
    });

    test("pins to a named binding only when it serves what was asked", () => {
        const own = account("self-hosted");
        const binding = own.bindCompute({ platformName: "android", execution: Execution.Emulator, kind: "baremetal" });
        const list = CloudAccountList.of([own]);

        expect(list.pinnedTo(binding.id, "android", Execution.Emulator)?.binding.id).toBe(binding.id);
        expect(list.pinnedTo(binding.id, "ubuntu", Execution.Container)).toBeNull();
        expect(list.pinnedTo("no-such-binding", "android", Execution.Emulator)).toBeNull();
    });
});
