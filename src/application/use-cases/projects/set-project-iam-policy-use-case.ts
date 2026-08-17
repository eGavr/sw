import { Injectable } from "@nestjs/common";

import { IamBinding } from "../../../domain/entities/project/iam/iam-binding";
import { IamPolicy } from "../../../domain/entities/project/iam/iam-policy";
import { Member } from "../../../domain/entities/project/iam/member";
import { Role } from "../../../domain/entities/project/iam/role";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type SetProjectIamPolicyInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        bindings: ReadonlyArray<{
            role: string;
            members: ReadonlyArray<string>;
        }>;
    }
}

// google.iam.v1 SetIamPolicy: replace the project's access policy with the given role bindings.
// Requires the setIamPolicy permission (held by the admin role). Unknown roles or malformed members
// are rejected as invalid arguments by the domain value objects.
@Injectable()
export class SetProjectIamPolicyUseCase {
    private readonly permissionName = UserPermissionName.Project.SetIamPolicy;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
    ) {}

    async execute({ creds, params }: SetProjectIamPolicyInput): Promise<IamPolicy> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.get(ProjectId.fromString(params.projectId));

        await this.accessControl.authorize(user, project, this.permissionName);

        project.setIamPolicy(this.toPolicy(params.bindings));
        await this.projectRepository.save(project);

        return project.iamPolicy();
    }

    private toPolicy(bindings: SetProjectIamPolicyInput["params"]["bindings"]): IamPolicy {
        return IamPolicy.fromBindings(bindings.map((binding) => IamBinding.create(
            Role.fromName(binding.role).name,
            binding.members.map((member) => Member.fromString(member)),
        )));
    }
}
