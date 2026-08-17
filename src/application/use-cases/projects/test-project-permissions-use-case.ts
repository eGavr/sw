import { Injectable } from "@nestjs/common";

import { Member } from "../../../domain/entities/project/iam/member";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type TestAccountPermissionsInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        permissions: ReadonlyArray<string>;
    }
}

// google.iam.v1 TestIamPermissions: returns the subset of the requested permissions that the
// caller holds on the project. Any authenticated caller may test their own permissions, so no
// permission is required to call it. A non-existent project yields an empty set (not NOT_FOUND).
@Injectable()
export class TestAccountPermissionsUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
    ) {}

    async execute({ creds, params }: TestAccountPermissionsInput): Promise<Array<UserPermissionName>> {
        const user = await this.accessControl.authenticate(creds);
        const requested = params.permissions.map((permission) => UserPermissionName.fromString(permission));

        const project = await this.projectRepository.find(ProjectId.fromString(params.projectId));

        if (!project) {
            return [];
        }

        return project.testPermissions(Member.user(user.externalId), requested);
    }
}
