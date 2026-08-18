import { Column, Entity, ManyToOne, PrimaryColumn } from "typeorm";

import { Project as ProjectEntity } from "../../../../../../../domain/entities/project/project";
import { DateColumn } from "../../columns-extra/date-column";
import { User } from "../user/user";

@Entity()
export class Project {
    static from(entity: ProjectEntity): Project {
        const project = new Project();

        project.id = entity.id;
        project.name = entity.name;
        project.createdAt = entity.createdAt;
        project.createdById = entity.createdBy.id;
        project.updatedAt = entity.updatedAt;

        return project;
    }

    @PrimaryColumn("uuid")
    id: string;

    @Column()
    name: string;

    @DateColumn()
    createdAt: Date;

    @ManyToOne(() => User, user => user.id, { eager: true })
    createdBy: User;

    @Column()
    createdById: string;

    @DateColumn()
    updatedAt: Date;

    private constructor() {}
}
