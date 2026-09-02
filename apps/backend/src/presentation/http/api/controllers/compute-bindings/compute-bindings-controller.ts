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
} from "@nestjs/common";

import {
    GetCloudAccountUseCase,
} from "../../../../../application/use-cases/cloud-accounts/get-cloud-account-use-case";
import {
    CreateComputeBindingUseCase,
} from "../../../../../application/use-cases/compute-bindings/create-compute-binding-use-case";
import {
    DeleteComputeBindingUseCase,
} from "../../../../../application/use-cases/compute-bindings/delete-compute-binding-use-case";
import {
    ComputeBindingAccessProbe,
    TestComputeBindingAccessUseCase,
} from "../../../../../application/use-cases/compute-bindings/test-compute-binding-access-use-case";
import {
    UpdateComputeBindingUseCase,
} from "../../../../../application/use-cases/compute-bindings/update-compute-binding-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";
import { ComputeBindingPresenter } from "../cloud-accounts/io/compute-binding-presenter";

import { CreateComputeBindingRequestModel } from "./io/create-compute-binding-request-model";
import { UpdateComputeBindingRequestModel } from "./io/update-compute-binding-request-model";

// The compute bindings of a cloud connection: per substrate, WHICH kind runs it (vm / kubernetes / …)
// with that kind's own settings. Changing a binding affects newly created environments only.
@Controller("projects/:project/cloudAccounts/:cloudAccount/computeBindings")
export class ComputeBindingsController {
    constructor(
        private readonly createComputeBindingUseCase: CreateComputeBindingUseCase,
        private readonly updateComputeBindingUseCase: UpdateComputeBindingUseCase,
        private readonly deleteComputeBindingUseCase: DeleteComputeBindingUseCase,
        private readonly testComputeBindingAccessUseCase: TestComputeBindingAccessUseCase,
        private readonly getCloudAccountUseCase: GetCloudAccountUseCase,
    ) {}

    @Post()
    async createComputeBinding(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @Body() body: CreateComputeBindingRequestModel,
        @BearerToken() token: string,
    ): Promise<object> {
        const { binding, account } = await this.createComputeBindingUseCase.execute({
            creds: { token },
            params: {
                projectId: project,
                cloudAccountId: cloudAccount,
                platformName: body.platform,
                execution: body.execution,
                kind: body.kind,
                config: body.config,
            },
        });

        return new ComputeBindingPresenter(binding, account).present();
    }

    @Get()
    async listComputeBindings(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @BearerToken() token: string,
    ): Promise<object> {
        const account = await this.getCloudAccountUseCase.execute({
            creds: { token },
            params: { projectId: project, cloudAccountId: cloudAccount },
        });

        return {
            computeBindings: account.computeBindings().map(
                (binding) => new ComputeBindingPresenter(binding, account).present(),
            ),
        };
    }

    @Patch(":binding")
    async updateComputeBinding(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @Param("binding") bindingId: string,
        @Body() body: UpdateComputeBindingRequestModel,
        @BearerToken() token: string,
    ): Promise<object> {
        const { binding, account } = await this.updateComputeBindingUseCase.execute({
            creds: { token },
            params: {
                projectId: project,
                cloudAccountId: cloudAccount,
                bindingId,
                kind: body.kind,
                config: body.config,
            },
        });

        return new ComputeBindingPresenter(binding, account).present();
    }

    @Delete(":binding")
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteComputeBinding(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @Param("binding") bindingId: string,
        @BearerToken() token: string,
    ): Promise<void> {
        await this.deleteComputeBindingUseCase.execute({
            creds: { token },
            params: { projectId: project, cloudAccountId: cloudAccount, bindingId },
        });
    }

    // AIP-136 custom method: POST …/computeBindings/{binding}:test — the per-platform "available" probe
    // the UI runs on each binding row (a read-only access check of what the binding names, under our
    // identity). The id and verb share the last segment ("<id>:test") and both are dynamic, so the verb
    // is split off the last colon in the handler rather than by the route pattern.
    @Post(":target")
    @HttpCode(HttpStatus.OK)
    async custom(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @Param("target") target: string,
        @BearerToken() token: string,
    ): Promise<ComputeBindingAccessProbe> {
        const separator = target.lastIndexOf(":");
        const verb = separator < 0 ? "" : target.slice(separator + 1);

        if (verb !== "test") {
            throw new NotFoundException(`unknown custom method on computeBinding: ${target}`);
        }

        return this.testComputeBindingAccessUseCase.execute({
            creds: { token },
            params: { projectId: project, cloudAccountId: cloudAccount, bindingId: target.slice(0, separator) },
        });
    }
}
