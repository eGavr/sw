import { Entity, PrimaryColumn } from "typeorm";

import { DateColumn } from "../../columns-extra/date-column";

// One (project, role, member) grant of an IAM policy. A member holding several roles, or a role held
// by several members, is several rows; the data source groups them back into `{role, members[]}`
// bindings. The member is stored as its external-identity string, so it needs no user row to exist.
@Entity()
export class ProjectIamBinding {
    static make(projectId: string, role: string, member: string, createdAt: Date, updatedAt: Date): ProjectIamBinding {
        const binding = new ProjectIamBinding();

        binding.projectId = projectId;
        binding.role = role;
        binding.member = member;
        binding.createdAt = createdAt;
        binding.updatedAt = updatedAt;

        return binding;
    }

    @PrimaryColumn("uuid")
    projectId: string;

    @PrimaryColumn()
    role: string;

    @PrimaryColumn()
    member: string;

    @DateColumn()
    createdAt: Date;

    @DateColumn()
    updatedAt: Date;

    private constructor() {}
}
