import { Injectable } from "@nestjs/common";

import { IamPolicy } from "../../../domain/entities/project/iam/iam-policy";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type GetProjectIamPolicyInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
    }
}

// google.iam.v1 GetIamPolicy: read the project's access policy. Requires the getIamPolicy permission
// (held by the admin role), consistent with Google IAM guarding policy reads.
@Injectable()
export class GetProjectIamPolicyUseCase {
    private readonly permissionName = UserPermissionName.Project.GetIamPolicy;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
    ) {}

    async execute({ creds, params }: GetProjectIamPolicyInput): Promise<IamPolicy> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.get(ProjectId.fromString(params.projectId));

        await this.accessControl.authorize(user, project, this.permissionName);

        return project.iamPolicy();
    }
}
