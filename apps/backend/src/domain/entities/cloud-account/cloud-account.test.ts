import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { CloudAccount } from "./cloud-account";
import { CloudAccountState } from "./cloud-account-state";
import { Stereotype } from "./stereotype";

describe("CloudAccount", () => {
    const projectId = ProjectId.create();

    const yandex = (): CloudAccount =>
        CloudAccount.create({
            projectId,
            type: "yandex",
            provides: [
                new Stereotype("android", Execution.Container),
                new Stereotype("android", Execution.Emulator),
            ],
        });

    const docker = (): CloudAccount =>
        CloudAccount.create({
            projectId,
            type: "docker",
            provides: [new Stereotype("linux", Execution.Container)],
        });

    test("is created active with an empty config by default", () => {
        const account = yandex();

        expect(account.isActive()).toBe(true);
        expect(account.state).toBe(CloudAccountState.Active);
        expect(account.config).toEqual({});
        expect(account.credentialRef).toBeNull();
    });

    test("supports exactly the substrates it provides", () => {
        const account = yandex();

        expect(account.supports("android", Execution.Container)).toBe(true);
        expect(account.supports("android", Execution.Emulator)).toBe(true);
        expect(account.supports("linux", Execution.Container)).toBe(false);
    });

    test("overlaps another cloud that shares a substrate; not one that is disjoint", () => {
        const other = CloudAccount.create({
            projectId,
            type: "yandex-2",
            provides: [new Stereotype("android", Execution.Container)],
        });

        expect(yandex().overlaps(other)).toBe(true);
        expect(yandex().overlaps(docker())).toBe(false);
    });

    test("disable is a soft-delete: no longer active", () => {
        const account = yandex();
        account.disable();

        expect(account.isActive()).toBe(false);
        expect(account.isDisabled()).toBe(true);
    });

    test("belongsTo its project only", () => {
        const account = yandex();

        expect(account.belongsTo(projectId)).toBe(true);
        expect(account.belongsTo(ProjectId.create())).toBe(false);
    });

    test("round-trips through toObject/fromObject", () => {
        const account = yandex();
        const restored = CloudAccount.fromObject(account.toObject());

        expect(restored.id).toBe(account.id);
        expect(restored.type).toBe("yandex");
        expect(restored.supports("android", Execution.Emulator)).toBe(true);
    });

    test("fromObject rejects an unknown state", () => {
        const data = yandex().toObject();

        expect(() => CloudAccount.fromObject({ ...data, state: "bogus" })).toThrow();
    });
});
