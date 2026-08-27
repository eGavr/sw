import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { CloudAccount } from "./cloud-account";
import { CloudAccountList } from "./cloud-account-list";
import { Stereotype } from "./stereotype";

describe("CloudAccountList", () => {
    const projectId = ProjectId.create();

    const cloud = (type: string, provides: Array<Stereotype>): CloudAccount =>
        CloudAccount.create({ projectId, type, provides });

    const yandexCloud = (): CloudAccount =>
        cloud("yandex-cloud", [
            new Stereotype("android", Execution.Container),
            new Stereotype("android", Execution.Emulator),
        ]);

    const docker = (): CloudAccount => cloud("docker", [new Stereotype("linux", Execution.Container)]);

    describe("resolveActiveFor", () => {
        test("returns the active cloud that supports the substrate", () => {
            const list = CloudAccountList.of([yandexCloud(), docker()]);

            expect(list.resolveActiveFor("linux", Execution.Container)?.type).toBe("docker");
            expect(list.resolveActiveFor("android", Execution.Emulator)?.type).toBe("yandex-cloud");
        });

        test("skips a disabled cloud and returns null", () => {
            const disabled = docker();
            disabled.disable();

            expect(CloudAccountList.of([disabled]).resolveActiveFor("linux", Execution.Container)).toBeNull();
        });

        test("returns null when nothing supports it", () => {
            expect(CloudAccountList.of([docker()]).resolveActiveFor("android", Execution.Container)).toBeNull();
        });
    });

    describe("activeConflictWith", () => {
        test("finds an active cloud whose substrates overlap the candidate", () => {
            const list = CloudAccountList.of([yandexCloud()]);
            const candidate = cloud("yandex-cloud-2", [new Stereotype("android", Execution.Container)]);

            expect(list.activeConflictWith(candidate)?.type).toBe("yandex-cloud");
        });

        test("returns null when the candidate is disjoint", () => {
            const list = CloudAccountList.of([yandexCloud()]);

            expect(list.activeConflictWith(docker())).toBeNull();
        });

        test("ignores a disabled overlapping cloud", () => {
            const disabled = yandexCloud();
            disabled.disable();
            const candidate = cloud("yandex-cloud-2", [new Stereotype("android", Execution.Container)]);

            expect(CloudAccountList.of([disabled]).activeConflictWith(candidate)).toBeNull();
        });
    });
});
