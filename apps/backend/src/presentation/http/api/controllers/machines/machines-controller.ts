import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Patch,
    Post,
    Query,
} from "@nestjs/common";

import { GetCloudAccountUseCase } from "../../../../../application/use-cases/cloud-accounts/get-cloud-account-use-case";
import { AttachMachineUseCase } from "../../../../../application/use-cases/machines/attach-machine-use-case";
import { DetachMachineUseCase } from "../../../../../application/use-cases/machines/detach-machine-use-case";
import {
    GenerateRegistrationTokenUseCase,
} from "../../../../../application/use-cases/machines/generate-registration-token-use-case";
import { GetMachineUseCase } from "../../../../../application/use-cases/machines/get-machine-use-case";
import { ListMachinesUseCase } from "../../../../../application/use-cases/machines/list-machines-use-case";
import { SetMachineAdmissionUseCase } from "../../../../../application/use-cases/machines/set-machine-admission-use-case";
import { UpdateMachineUseCase } from "../../../../../application/use-cases/machines/update-machine-use-case";
import { MachineAdmission } from "../../../../../domain/entities/machine/machine-admission";
import { MachineInstallConfig } from "../../../../../infrastructure/machines/machine-install-config";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { AttachMachineRequestModel } from "./io/attach-machine-request-model";
import { MachinePresenter } from "./io/machine-presenter";
import { RegistrationTokenPresenter } from "./io/registration-token-presenter";
import { UpdateMachineRequestModel } from "./io/update-machine-request-model";

const generateRegistrationTokenVerb = "generateRegistrationToken";
const cordonVerb = "cordon";
const uncordonVerb = "uncordon";
const drainVerb = "drain";

// The machines of a self-hosted cloud: the user's own boxes, attached here and run by our machine
// agent. Standard methods on the collection; custom methods (AIP-136) for the registration token and
// the operator's intent (cordon / uncordon / drain).
@Controller("projects/:project/cloudAccounts/:cloudAccount/machines")
export class MachinesController {
    constructor(
        private readonly attachMachineUseCase: AttachMachineUseCase,
        private readonly listMachinesUseCase: ListMachinesUseCase,
        private readonly getMachineUseCase: GetMachineUseCase,
        private readonly detachMachineUseCase: DetachMachineUseCase,
        private readonly generateRegistrationTokenUseCase: GenerateRegistrationTokenUseCase,
        private readonly setMachineAdmissionUseCase: SetMachineAdmissionUseCase,
        private readonly updateMachineUseCase: UpdateMachineUseCase,
        private readonly getCloudAccountUseCase: GetCloudAccountUseCase,
        private readonly installConfig: MachineInstallConfig,
    ) {}

    @Post()
    async attachMachine(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @Body() body: AttachMachineRequestModel,
        @BearerToken() token: string,
    ): Promise<object> {
        const machine = await this.attachMachineUseCase.execute({
            creds: { token },
            params: {
                projectId: project,
                cloudAccountId: cloudAccount,
                fqdn: body.fqdn,
                provides: body.provides,
                slotCapacity: body.slotCapacity,
            },
        });
        const account = await this.getCloudAccountUseCase.execute({
            creds: { token },
            params: { projectId: project, cloudAccountId: cloudAccount },
        });

        return new MachinePresenter({ machine, lease: null }, account, project).present();
    }

    @Get()
    async listMachines(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @BearerToken() token: string,
    ): Promise<object> {
        const params = { projectId: project, cloudAccountId: cloudAccount };
        const [views, account] = await Promise.all([
            this.listMachinesUseCase.execute({ creds: { token }, params }),
            this.getCloudAccountUseCase.execute({ creds: { token }, params }),
        ]);

        return { machines: views.map((view) => new MachinePresenter(view, account, project).present()) };
    }

    @Get(":machine")
    async getMachine(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @Param("machine") machine: string,
        @BearerToken() token: string,
    ): Promise<object> {
        const view = await this.getMachineUseCase.execute({
            creds: { token },
            params: { projectId: project, cloudAccountId: cloudAccount, machineId: machine },
        });
        const account = await this.getCloudAccountUseCase.execute({
            creds: { token },
            params: { projectId: project, cloudAccountId: cloudAccount },
        });

        return new MachinePresenter(view, account, project).present();
    }

    // What the machine serves is the operator's declaration, so it is editable in place — detaching a
    // box only to re-attach it would mean reinstalling its agent for a checkbox.
    @Patch(":machine")
    async updateMachine(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @Param("machine") machine: string,
        @Body() body: UpdateMachineRequestModel,
        @BearerToken() token: string,
    ): Promise<object> {
        await this.updateMachineUseCase.execute({
            creds: { token },
            params: {
                projectId: project,
                cloudAccountId: cloudAccount,
                machineId: machine,
                provides: body.provides,
            },
        });

        return this.getMachine(project, cloudAccount, machine, token);
    }

    @Delete(":machine")
    @HttpCode(HttpStatus.NO_CONTENT)
    async detachMachine(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @Param("machine") machine: string,
        @Query("force") force: string | undefined,
        @BearerToken() token: string,
    ): Promise<void> {
        await this.detachMachineUseCase.execute({
            creds: { token },
            params: { projectId: project, cloudAccountId: cloudAccount, machineId: machine, force: force === "true" },
        });
    }

    // Custom methods: POST .../machines/{machine}:{verb}. express matches "{machine}:{verb}" as one
    // path segment, so the verb is split off the last ":" here.
    @Post(":resource")
    @HttpCode(HttpStatus.OK)
    async customMethod(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @Param("resource") resource: string,
        @BearerToken() token: string,
    ): Promise<object> {
        const separatorIndex = resource.lastIndexOf(":");
        const machineId = resource.slice(0, separatorIndex);
        const verb = separatorIndex === -1 ? "" : resource.slice(separatorIndex + 1);
        const params = { projectId: project, cloudAccountId: cloudAccount, machineId };

        switch (verb) {
            case generateRegistrationTokenVerb: {
                const grant = await this.generateRegistrationTokenUseCase.execute({ creds: { token }, params });

                return new RegistrationTokenPresenter(grant, this.installConfig).present();
            }
            case cordonVerb:
                return this.setAdmission(token, params, MachineAdmission.Cordoned);
            case uncordonVerb:
                return this.setAdmission(token, params, MachineAdmission.Open);
            case drainVerb:
                return this.setAdmission(token, params, MachineAdmission.Draining);
            default:
                throw new NotFoundException(`unknown custom method on machine: ${verb || "(none)"}`);
        }
    }

    // A drain that had nothing to wait for detached the machine right away: an empty response says so.
    private async setAdmission(
        token: string,
        params: { projectId: string; cloudAccountId: string; machineId: string },
        admission: MachineAdmission,
    ): Promise<object> {
        const machine = await this.setMachineAdmissionUseCase.execute({ creds: { token }, params: { ...params, admission } });

        if (!machine) {
            return {};
        }

        const view = await this.getMachineUseCase.execute({ creds: { token }, params });
        const account = await this.getCloudAccountUseCase.execute({
            creds: { token },
            params: { projectId: params.projectId, cloudAccountId: params.cloudAccountId },
        });

        return new MachinePresenter(view, account, params.projectId).present();
    }
}
