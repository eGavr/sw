import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { CloudAccount } from "./cloud-account";
import { CloudAccountList } from "./cloud-account-list";

const account = (type: string): CloudAccount =>
    CloudAccount.create({ projectId: ProjectId.create(), type });

describe("CloudAccountList", () => {
    test("resolves the connection and binding serving a substrate", () => {
        const yandex = account("yandex-cloud");
        const binding = yandex.bindCompute({ platformName: "linux", execution: Execution.Container, kind: "vm" });

        const resolved = CloudAccountList.of([account("local"), yandex])
            .resolveFor("linux", Execution.Container);

        expect(resolved?.cloudAccount.id).toBe(yandex.id);
        expect(resolved?.binding.id).toBe(binding.id);
    });

    test("resolves to nothing when no connection binds the substrate", () => {
        expect(CloudAccountList.of([account("yandex-cloud")]).resolveFor("linux", Execution.Container)).toBeNull();
        expect(CloudAccountList.of([]).isBound("linux", Execution.Container)).toBe(false);
    });

    test("reports a substrate bound anywhere in the project", () => {
        const local = account("local");

        local.bindCompute({ platformName: "linux", execution: Execution.Container, kind: "docker" });

        expect(CloudAccountList.of([local]).isBound("linux", Execution.Container)).toBe(true);
        expect(CloudAccountList.of([local]).isBound("android", Execution.Container)).toBe(false);
    });
});
