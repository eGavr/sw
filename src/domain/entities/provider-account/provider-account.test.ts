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
            config: { host: "unix:///var/run/docker.sock" },
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

    describe("#disable", () => {
        test("should move to disabled and stop being active", () => {
            const providerAccount = build();

            providerAccount.disable();

            expect(providerAccount.state).toBe(ProviderAccountState.Disabled);
            expect(providerAccount.isDisabled()).toBe(true);
            expect(providerAccount.isActive()).toBe(false);
        });
    });

    describe("#updateConfig", () => {
        test("should replace the provisioning config", () => {
            const providerAccount = build();

            providerAccount.updateConfig({ image: "registry/chrome:141" });

            expect(providerAccount.config).toEqual({ image: "registry/chrome:141" });
        });
    });

    describe("#belongsTo", () => {
        test("should hold only for its own project", () => {
            const projectId = ProjectId.create();
            const providerAccount = ProviderAccount.create({
                projectId,
                provider: "docker",
                platformName: "linux",
                execution: Execution.Container,
            });

            expect(providerAccount.belongsTo(projectId)).toBe(true);
            expect(providerAccount.belongsTo(ProjectId.create())).toBe(false);
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
