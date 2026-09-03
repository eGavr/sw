import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";

import {
    CreateNetBridgeCredentialUseCase,
} from "../../../../../application/use-cases/net-bridge-credentials/create-net-bridge-credential-use-case";
import {
    DeleteNetBridgeCredentialUseCase,
} from "../../../../../application/use-cases/net-bridge-credentials/delete-net-bridge-credential-use-case";
import {
    GetNetBridgeCredentialUseCase,
} from "../../../../../application/use-cases/net-bridge-credentials/get-net-bridge-credential-use-case";
import {
    ListNetBridgeCredentialsUseCase,
} from "../../../../../application/use-cases/net-bridge-credentials/list-net-bridge-credentials-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { CreateNetBridgeCredentialPresenter } from "./io/create-net-bridge-credential-presenter";
import {
    CreateNetBridgeCredentialRequestModel,
} from "./io/create-net-bridge-credential-request-model";
import { ListNetBridgeCredentialsPresenter } from "./io/list-net-bridge-credentials-presenter";
import { NetBridgeCredentialPresenter } from "./io/net-bridge-credential-presenter";

@Controller("projects/:project/netBridgeCredentials")
export class NetBridgeCredentialsController {
    constructor(
        private readonly createUseCase: CreateNetBridgeCredentialUseCase,
        private readonly listUseCase: ListNetBridgeCredentialsUseCase,
        private readonly getUseCase: GetNetBridgeCredentialUseCase,
        private readonly deleteUseCase: DeleteNetBridgeCredentialUseCase,
    ) {}

    // The plaintext secret is in the response body once — it is never retrievable again.
    @Post()
    async create(
        @Param("project") project: string,
        @Body() body: CreateNetBridgeCredentialRequestModel,
        @BearerToken() token: string,
    ): Promise<CreateNetBridgeCredentialPresenter> {
        return new CreateNetBridgeCredentialPresenter(await this.createUseCase.execute({
            creds: { token },
            params: {
                projectId: project,
                name: body.name,
                expiresAt: body.expireTime ? new Date(body.expireTime) : null,
            },
        }));
    }

    @Get()
    async list(
        @Param("project") project: string,
        @BearerToken() token: string,
    ): Promise<ListNetBridgeCredentialsPresenter> {
        return new ListNetBridgeCredentialsPresenter(
            await this.listUseCase.execute({ creds: { token }, params: { projectId: project } }),
        );
    }

    @Get(":credential")
    async get(
        @Param("project") project: string,
        @Param("credential") credential: string,
        @BearerToken() token: string,
    ): Promise<NetBridgeCredentialPresenter> {
        return new NetBridgeCredentialPresenter(await this.getUseCase.execute({
            creds: { token },
            params: { projectId: project, credentialId: credential },
        }));
    }

    // A real delete (empty response) — this revokes the key.
    @Delete(":credential")
    @HttpCode(HttpStatus.NO_CONTENT)
    async delete(
        @Param("project") project: string,
        @Param("credential") credential: string,
        @BearerToken() token: string,
    ): Promise<void> {
        await this.deleteUseCase.execute({
            creds: { token },
            params: { projectId: project, credentialId: credential },
        });
    }
}
