import { Column, Entity, ManyToOne, OneToMany, PrimaryColumn, Unique } from "typeorm";

import {
    ProjectApplication as ProjectApplicationEntity,
    ProjectApplicationData,
} from "../../../../../../../domain/entities/project-application/project-application";
import { DateColumn } from "../../columns-extra/date-column";
import { Project } from "../project/project";

import { ProjectApplicationVersion } from "./project-application-version";

@Entity()
@Unique(["projectId", "platformName", "name"])
export class ProjectApplication {
    static from(entity: ProjectApplicationEntity): ProjectApplication {
        const data = entity.toObject();
        const application = new ProjectApplication();

        application.id = data.id;
        application.projectId = data.projectId;
        application.platformName = data.platformName;
        application.name = data.name;
        application.aliases = data.aliases;
        application.createdAt = data.createdAt;
        application.versions = data.versions.map((version) => ProjectApplicationVersion.from(data.id, version));

        return application;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => Project, project => project.id, { onDelete: "CASCADE" })
    project: Project;

    @Column()
    projectId: string;

    @Column()
    platformName: string;

    @Column()
    name: string;

    @Column({ type: "jsonb", default: () => "'[]'" })
    aliases: Array<string>;

    @DateColumn()
    createdAt: Date;

    @OneToMany(() => ProjectApplicationVersion, version => version.projectApplication, { eager: true, cascade: ["insert"] })
    versions: Array<ProjectApplicationVersion>;

    toObject(): ProjectApplicationData {
        return {
            id: this.id,
            projectId: this.projectId,
            platformName: this.platformName,
            name: this.name,
            aliases: this.aliases ?? [],
            versions: (this.versions ?? []).map((version) => version.toObject()),
            createdAt: this.createdAt,
        };
    }

    private constructor() {}
}
