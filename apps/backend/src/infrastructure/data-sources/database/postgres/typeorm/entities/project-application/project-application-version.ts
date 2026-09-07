import { Column, Entity, ManyToOne, PrimaryColumn, Unique } from "typeorm";

import {
    ProjectApplicationVersionData,
} from "../../../../../../../domain/entities/project-application/project-application-version";
import { DateColumn } from "../../columns-extra/date-column";

import { ProjectApplication } from "./project-application";

@Entity()
@Unique(["projectApplicationId", "versionAlias"])
export class ProjectApplicationVersion {
    static from(projectApplicationId: string, data: ProjectApplicationVersionData): ProjectApplicationVersion {
        const version = new ProjectApplicationVersion();

        version.id = data.id;
        version.projectApplicationId = projectApplicationId;
        version.versionAlias = data.versionAlias;
        version.appRef = data.appRef ?? null;
        version.webdriverRef = data.webdriverRef ?? null;
        version.createdAt = data.createdAt;

        return version;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => ProjectApplication, application => application.versions, { onDelete: "CASCADE" })
    projectApplication: ProjectApplication;

    @Column()
    projectApplicationId: string;

    // The owner's free-form label — the build's id; nobody declares a version, it is detected.
    @Column()
    versionAlias: string;

    @Column({ type: "varchar", nullable: true })
    appRef: string | null;

    @Column({ type: "varchar", nullable: true })
    webdriverRef: string | null;

    @DateColumn()
    createdAt: Date;

    toObject(): ProjectApplicationVersionData {
        return {
            id: this.id,
            versionAlias: this.versionAlias,
            appRef: this.appRef,
            webdriverRef: this.webdriverRef,
            createdAt: this.createdAt,
        };
    }

    private constructor() {}
}
