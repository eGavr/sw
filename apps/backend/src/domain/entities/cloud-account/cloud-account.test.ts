import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { CloudAccount } from "./cloud-account";
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

    const local = (): CloudAccount =>
        CloudAccount.create({
            projectId,
            type: "local",
            provides: [new Stereotype("linux", Execution.Container)],
        });

    test("is created with an empty config by default", () => {
        const account = yandexCloud();

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
        expect(yandexCloud().overlaps(local())).toBe(false);
    });

    test("belongsTo its project only", () => {
        const account = yandexCloud();

        expect(account.belongsTo(projectId)).toBe(true);
        expect(account.belongsTo(ProjectId.create())).toBe(false);
    });

    test("the config getter returns a copy — mutating it does not change the aggregate", () => {
        const account = CloudAccount.create({
            projectId,
            type: "local",
            provides: [new Stereotype("linux", Execution.Container)],
            config: { image: "selenium:128" },
        });

        account.config.image = "tampered";

        expect(account.config).toEqual({ image: "selenium:128" });
    });

    test("updateConfig replaces the config", () => {
        const account = local();

        account.updateConfig({ image: "selenium:129" });

        expect(account.config).toEqual({ image: "selenium:129" });
    });

    test("round-trips through toObject/fromObject", () => {
        const account = yandexCloud();

        const restored = CloudAccount.fromObject(account.toObject());

        expect(restored.toObject()).toEqual(account.toObject());
    });
});
