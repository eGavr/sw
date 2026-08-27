import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { CloudAccount } from "./cloud-account";
import { CloudAccountState } from "./cloud-account-state";
import { Stereotype } from "./stereotype";

describe("CloudAccount", () => {
    const projectId = ProjectId.create();

    const yandexCloud = (): CloudAccount =>
        CloudAccount.create({
            projectId,
            type: "yandex-cloud",
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
        const account = yandexCloud();

        expect(account.isActive()).toBe(true);
        expect(account.state).toBe(CloudAccountState.Active);
        expect(account.config).toEqual({});
        expect(account.credentialRef).toBeNull();
    });

    test("supports exactly the substrates it provides", () => {
        const account = yandexCloud();

        expect(account.supports("android", Execution.Container)).toBe(true);
        expect(account.supports("android", Execution.Emulator)).toBe(true);
        expect(account.supports("linux", Execution.Container)).toBe(false);
    });

    test("overlaps another cloud that shares a substrate; not one that is disjoint", () => {
        const other = CloudAccount.create({
            projectId,
            type: "yandex-cloud-2",
            provides: [new Stereotype("android", Execution.Container)],
        });

        expect(yandexCloud().overlaps(other)).toBe(true);
        expect(yandexCloud().overlaps(docker())).toBe(false);
    });

    test("disable is a soft-delete: no longer active", () => {
        const account = yandexCloud();
        account.disable();

        expect(account.isActive()).toBe(false);
        expect(account.isDisabled()).toBe(true);
    });

    test("belongsTo its project only", () => {
        const account = yandexCloud();

        expect(account.belongsTo(projectId)).toBe(true);
        expect(account.belongsTo(ProjectId.create())).toBe(false);
    });

    test("round-trips through toObject/fromObject", () => {
        const account = yandexCloud();
        const restored = CloudAccount.fromObject(account.toObject());

        expect(restored.id).toBe(account.id);
        expect(restored.type).toBe("yandex-cloud");
        expect(restored.supports("android", Execution.Emulator)).toBe(true);
    });

    test("fromObject rejects an unknown state", () => {
        const data = yandexCloud().toObject();

        expect(() => CloudAccount.fromObject({ ...data, state: "bogus" })).toThrow();
    });
});
