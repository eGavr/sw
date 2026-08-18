import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { ProviderAccount } from "./provider-account";
import { ProviderAccountList } from "./provider-account-list";
import { ProviderAccountState } from "./provider-account-state";

describe("ProviderAccountList", () => {
    const projectId = ProjectId.create();

    const providerAccount = (
        provider: string,
        platformName: string,
        execution: Execution,
        state: ProviderAccountState = ProviderAccountState.Active,
    ): ProviderAccount =>
        ProviderAccount.fromObject({
            id: "00000000-0000-0000-0000-000000000000",
            projectId: projectId.getValue(),
            provider,
            platformName,
            execution,
            state,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

    describe("#resolveFor", () => {
        const kubernetes = providerAccount("kubernetes", "linux", Execution.Container);
        const redroid = providerAccount("android-redroid", "android", Execution.Container);
        const emulator = providerAccount("android-emulator", "android", Execution.Emulator);
        const list = ProviderAccountList.of([kubernetes, redroid, emulator]);

        test("should resolve the connection serving the requested substrate", () => {
            expect(list.resolveFor("android", Execution.Container)).toBe(redroid);
            expect(list.resolveFor("linux", Execution.Container)).toBe(kubernetes);
        });

        test("should distinguish substrates that share a platform", () => {
            expect(list.resolveFor("android", Execution.Emulator)).toBe(emulator);
        });

        test("should return null when no active connection serves the substrate", () => {
            expect(list.resolveFor("ios", Execution.Device)).toBeNull();
        });

        test("should ignore an inactive connection that would otherwise match", () => {
            const invalid = providerAccount("android-redroid", "android", Execution.Container, ProviderAccountState.Invalid);

            expect(ProviderAccountList.of([invalid]).resolveFor("android", Execution.Container)).toBeNull();
        });
    });
});
