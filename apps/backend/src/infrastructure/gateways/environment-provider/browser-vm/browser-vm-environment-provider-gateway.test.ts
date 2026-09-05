import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import { CloudReachability } from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { CloudAccount } from "../../../../domain/entities/cloud-account/cloud-account";
import { ApplicationList } from "../../../../domain/entities/environment/application/application-list";
import { Environment } from "../../../../domain/entities/environment/environment";
import { Execution } from "../../../../domain/entities/environment/execution";
import { Platform } from "../../../../domain/entities/environment/platform/platform";
import { ProjectId } from "../../../../domain/entities/project/project-id";
import { VmInstanceOptions, VmProvisioner } from "../vm/vm-provisioner";

import { BrowserVmEnvironmentProviderGateway } from "./browser-vm-environment-provider-gateway";

// The VM-per-environment half is pure sync assembly (merge overrides, build metadata) around the external
// compute client — the one thing the testing policy allows faking. This pins the adapter's contract with
// the golden image (metadata keys) and the delegation contract (the binding's folder on every verb).
class RecordingVmProvisioner extends VmProvisioner {
    created: Array<VmInstanceOptions> = [];
    deleted: Array<{ name: string; folderId?: string }> = [];
    probedFolders: Array<string | undefined> = [];
    labelsByFolder: Record<string, Record<string, string>> = {};

    async createInstance(options: VmInstanceOptions): Promise<void> {
        this.created.push(options);
    }

    async deleteInstance(name: string, folderId?: string): Promise<void> {
        this.deleted.push({ name, folderId });
    }

    async checkAccess(folderId?: string): Promise<CloudReachability> {
        this.probedFolders.push(folderId);

        return { reachable: true };
    }

    async folderLabels(folderId: string): Promise<Record<string, string>> {
        return this.labelsByFolder[folderId] ?? {};
    }
}

const agentTokens: AgentTokenService = {
    issue: async (environmentId: string) => `token-${environmentId}`,
    verify: async () => null,
} as unknown as AgentTokenService;

const config = {
    imageId: "fd8golden",
    zone: "ru-central1-a",
    subnetId: "e9bdefault",
    cores: 2,
    memoryGb: 4,
    diskSizeGb: 30,
    nodeImage: "cr.yandex/reg/selenium-standalone-chrome:latest",
    sessionTimeoutSeconds: 300,
    internalUrl: "http://10.0.0.1:3002",
};

const environment = Environment.create({
    projectId: ProjectId.create(),
    platform: Platform.fromObject({ name: "ubuntu", version: "1" }),
    applications: ApplicationList.fromObject([{ name: "chrome", version: "128" }]),
    cloudType: "yandex-cloud",
});

// The linux substrate bound to the vm kind with the user's folder/network — the delegation lives on the
// binding, not on the account.
const delegatedAccount = CloudAccount.create({ projectId: ProjectId.create(), type: "yandex-cloud" });
const binding = delegatedAccount.bindCompute({
    platformName: "ubuntu",
    execution: Execution.Container,
    kind: "vm",
    config: { folderId: "b1guser", subnetId: "e9buser" },
});

describe("BrowserVmEnvironmentProviderGateway", () => {
    test("provisions the VM in the binding's folder/network with the node metadata", async () => {
        const compute = new RecordingVmProvisioner();
        const gateway = new BrowserVmEnvironmentProviderGateway(compute, config, agentTokens);

        await gateway.provision(environment, delegatedAccount);

        const [created] = compute.created;
        expect(created.name).toBe(`sw-env-${environment.id}`);
        expect(created.folderId).toBe("b1guser");
        expect(created.subnetId).toBe("e9buser");
        expect(created.imageId).toBe("fd8golden");
        expect(created.metadata).toEqual({
            "sw-environment-id": environment.id,
            "sw-node-image": config.nodeImage,
            "sw-session-timeout": "300",
            "sw-internal-url": config.internalUrl,
            "sw-internal-token": `token-${environment.id}`,
        });
    });

    test("falls back to the install defaults without a bound account", async () => {
        const compute = new RecordingVmProvisioner();
        const gateway = new BrowserVmEnvironmentProviderGateway(compute, config, agentTokens);

        await gateway.provision(environment, null);

        expect(compute.created[0].folderId).toBeUndefined();
        expect(compute.created[0].subnetId).toBe("e9bdefault");
    });

    test("deprovisions and probes in the binding's folder", async () => {
        const compute = new RecordingVmProvisioner();
        const gateway = new BrowserVmEnvironmentProviderGateway(compute, config, agentTokens);

        await gateway.deprovision(environment, delegatedAccount);
        await gateway.checkAccess(delegatedAccount, binding);

        expect(compute.deleted).toEqual([{ name: `sw-env-${environment.id}`, folderId: "b1guser" }]);
        expect(compute.probedFolders).toEqual(["b1guser"]);
    });

    test("verifies ownership only when the folder carries THIS project's marker", async () => {
        const compute = new RecordingVmProvisioner();
        const gateway = new BrowserVmEnvironmentProviderGateway(compute, config, agentTokens);
        const projectId = delegatedAccount.projectId.getValue();

        // No marker → not verified.
        expect((await gateway.verifyOwnership(delegatedAccount, binding)).verified).toBe(false);

        // Another project's marker on the folder does NOT authorise this project.
        compute.labelsByFolder["b1guser"] = { "sw-verify-00000000-0000-0000-0000-000000000000": "" };
        expect((await gateway.verifyOwnership(delegatedAccount, binding)).verified).toBe(false);

        // This project's marker → verified.
        compute.labelsByFolder["b1guser"] = { [`sw-verify-${projectId}`]: "" };
        expect((await gateway.verifyOwnership(delegatedAccount, binding)).verified).toBe(true);
    });
});
