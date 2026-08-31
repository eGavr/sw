import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch } from "@nestjs/common";

import {
    DeleteProjectStorageDestinationUseCase,
} from "../../../../../application/use-cases/storage-destinations/delete-project-storage-destination-use-case";
import {
    GetProjectStorageDestinationUseCase,
} from "../../../../../application/use-cases/storage-destinations/get-project-storage-destination-use-case";
import {
    SetProjectStorageDestinationUseCase,
} from "../../../../../application/use-cases/storage-destinations/set-project-storage-destination-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { SetStorageDestinationRequestModel } from "./io/set-storage-destination-request-model";
import { StorageDestinationPresenter } from "./io/storage-destination-presenter";

// AIP-156 singleton sub-resource: projects/{project}/storageDestination. It has no id and no Create/List
// — Get reads it, Update (PATCH) registers or replaces it (the first PATCH configures it), and Delete
// clears it (back to unconfigured — nothing written until set again).
@Controller("projects/:project/storageDestination")
export class StorageDestinationController {
    constructor(
        private readonly getUseCase: GetProjectStorageDestinationUseCase,
        private readonly setUseCase: SetProjectStorageDestinationUseCase,
        private readonly deleteUseCase: DeleteProjectStorageDestinationUseCase,
    ) {}

    @Get()
    async get(@Param("project") project: string, @BearerToken() token: string): Promise<StorageDestinationPresenter> {
        const destination = await this.getUseCase.execute({ creds: { token }, params: { projectId: project } });

        return new StorageDestinationPresenter(destination, project);
    }

    @Patch()
    async set(
        @Param("project") project: string,
        @Body() body: SetStorageDestinationRequestModel,
        @BearerToken() token: string,
    ): Promise<StorageDestinationPresenter> {
        const destination = await this.setUseCase.execute({
            creds: { token },
            params: {
                projectId: project,
                endpoint: body.endpoint,
                region: body.region,
                bucket: body.bucket,
                prefix: body.prefix,
            },
        });

        return new StorageDestinationPresenter(destination, project);
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    async clear(@Param("project") project: string, @BearerToken() token: string): Promise<void> {
        await this.deleteUseCase.execute({ creds: { token }, params: { projectId: project } });
    }
}
