import { Column, Entity, ManyToOne, PrimaryColumn, Unique } from "typeorm";

import {
    ProjectApplicationVersionData,
} from "../../../../../../../domain/entities/project-application/project-application-version";
import { Uuid } from "../../../../../../../domain/types/uuid/uuid";

import { ProjectApplication } from "./project-application";

@Entity()
@Unique(["projectApplicationId", "version"])
export class ProjectApplicationVersion {
    static from(projectApplicationId: string, data: ProjectApplicationVersionData): ProjectApplicationVersion {
        const version = new ProjectApplicationVersion();

        version.id = Uuid.create().getValue();
        version.projectApplicationId = projectApplicationId;
        version.version = data.version;
        version.appRef = data.appRef ?? null;
        version.webdriverRef = data.webdriverRef ?? null;

        return version;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => ProjectApplication, application => application.versions, { onDelete: "CASCADE" })
    projectApplication: ProjectApplication;

    @Column()
    projectApplicationId: string;

    @Column()
    version: string;

    @Column({ type: "varchar", nullable: true })
    appRef: string | null;

    @Column({ type: "varchar", nullable: true })
    webdriverRef: string | null;

    toObject(): ProjectApplicationVersionData {
        return {
            version: this.version,
            appRef: this.appRef,
            webdriverRef: this.webdriverRef,
        };
    }

    private constructor() {}
}
