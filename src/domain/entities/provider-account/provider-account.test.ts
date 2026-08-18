import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { ProviderAccount } from "./provider-account";
import { ProviderAccountState } from "./provider-account-state";

describe("ProviderAccount", () => {
    const build = (): ProviderAccount =>
        ProviderAccount.create({
            projectId: ProjectId.create(),
            provider: "docker",
            platformName: "linux",
            execution: Execution.Container,
            externalRef: "project-1",
        });

    describe(".create", () => {
        test("should start active", () => {
            const providerAccount = build();

            expect(providerAccount.state).toBe(ProviderAccountState.Active);
            expect(providerAccount.isActive()).toBe(true);
            expect(providerAccount.credentialRef).toBeNull();
        });
    });

    describe("#markInvalid / #markActive", () => {
        test("should flip the active flag", () => {
            const providerAccount = build();

            providerAccount.markInvalid();
            expect(providerAccount.isActive()).toBe(false);

            providerAccount.markActive();
            expect(providerAccount.isActive()).toBe(true);
        });
    });

    describe(".fromObject", () => {
        test("should round-trip through toObject", () => {
            const providerAccount = build();

            const restored = ProviderAccount.fromObject(providerAccount.toObject());

            expect(restored.toObject()).toEqual(providerAccount.toObject());
        });
    });
});
