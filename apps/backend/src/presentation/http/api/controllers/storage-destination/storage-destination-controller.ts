import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post } from "@nestjs/common";

import {
    DeleteProjectStorageDestinationUseCase,
} from "../../../../../application/use-cases/storage-destinations/delete-project-storage-destination-use-case";
import {
    GetProjectStorageDestinationUseCase,
} from "../../../../../application/use-cases/storage-destinations/get-project-storage-destination-use-case";
import {
    SetProjectStorageDestinationUseCase,
} from "../../../../../application/use-cases/storage-destinations/set-project-storage-destination-use-case";
import {
    StorageDestinationProbe,
    TestProjectStorageDestinationUseCase,
} from "../../../../../application/use-cases/storage-destinations/test-project-storage-destination-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { SetStorageDestinationRequestModel } from "./io/set-storage-destination-request-model";
import { StorageDestinationPresenter } from "./io/storage-destination-presenter";

// AIP-156 singleton sub-resource: projects/{project}/storageDestination. It has no id and no Create/List
// — Get reads it, Update (PATCH) registers or replaces it (the first PATCH configures it), and Delete
// clears it (back to unconfigured). The controller is mounted at the project scope so the AIP-136 custom
// method can carry its `:verb` on the singleton name in one segment (`storageDestination:test`); express
// matches that segment and the verb is split off the last colon, exactly like the other custom methods.
@Controller("projects/:project")
export class StorageDestinationController {
    constructor(
        private readonly getUseCase: GetProjectStorageDestinationUseCase,
        private readonly setUseCase: SetProjectStorageDestinationUseCase,
        private readonly deleteUseCase: DeleteProjectStorageDestinationUseCase,
        private readonly testUseCase: TestProjectStorageDestinationUseCase,
    ) {}

    @Get("storageDestination")
    async get(@Param("project") project: string, @BearerToken() token: string): Promise<StorageDestinationPresenter> {
        const destination = await this.getUseCase.execute({ creds: { token }, params: { projectId: project } });

        return new StorageDestinationPresenter(destination, project);
    }

    @Patch("storageDestination")
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

    @Delete("storageDestination")
    @HttpCode(HttpStatus.NO_CONTENT)
    async clear(@Param("project") project: string, @BearerToken() token: string): Promise<void> {
        await this.deleteUseCase.execute({ creds: { token }, params: { projectId: project } });
    }

    // AIP-136 custom method: POST projects/{project}/storageDestination:test. A connectivity check the
    // user runs after configuring — a real write under our identity, so a bad bucket or a missing bucket
    // policy is caught here, not silently at the next session's upload. The whole `storageDestination:verb`
    // segment is captured and the verb split off the last colon (same dispatch as the internal methods).
    @Post("storageDestination\\::verb")
    @HttpCode(HttpStatus.OK)
    async custom(
        @Param("project") project: string,
        @Param("verb") verb: string,
        @BearerToken() token: string,
    ): Promise<StorageDestinationProbe> {
        if (verb !== "test") {
            throw new NotFoundException(`unknown custom method on storageDestination: ${verb}`);
        }

        return this.testUseCase.execute({ creds: { token }, params: { projectId: project } });
    }
}
