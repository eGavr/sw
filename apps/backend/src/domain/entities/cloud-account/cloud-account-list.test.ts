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

    const local = (): CloudAccount => cloud("local", [new Stereotype("linux", Execution.Container)]);

    describe("resolveFor", () => {
        test("returns the cloud that supports the substrate", () => {
            const list = CloudAccountList.of([yandexCloud(), local()]);

            expect(list.resolveFor("linux", Execution.Container)?.type).toBe("local");
            expect(list.resolveFor("android", Execution.Emulator)?.type).toBe("yandex-cloud");
        });

        test("returns null when nothing supports it", () => {
            expect(CloudAccountList.of([local()]).resolveFor("android", Execution.Container)).toBeNull();
        });
    });

    describe("conflictWith", () => {
        test("finds a cloud whose substrates overlap the candidate", () => {
            const list = CloudAccountList.of([yandexCloud()]);
            const candidate = cloud("yandex-cloud-2", [new Stereotype("android", Execution.Container)]);

            expect(list.conflictWith(candidate)?.type).toBe("yandex-cloud");
        });

        test("returns null when the candidate is disjoint", () => {
            const list = CloudAccountList.of([yandexCloud()]);

            expect(list.conflictWith(local())).toBeNull();
        });
    });
});
