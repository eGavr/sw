import { Column, Entity, ManyToOne, PrimaryColumn, Unique } from "typeorm";

import {
    ProjectApplicationVersionData,
} from "../../../../../../../domain/entities/project-application/project-application-version";
import { Uuid } from "../../../../../../../domain/types/uuid/uuid";
import { DateColumn } from "../../columns-extra/date-column";

import { ProjectApplication } from "./project-application";

@Entity()
@Unique(["projectApplicationId", "alias"])
export class ProjectApplicationVersion {
    static from(projectApplicationId: string, data: ProjectApplicationVersionData): ProjectApplicationVersion {
        const version = new ProjectApplicationVersion();

        version.id = Uuid.create().getValue();
        version.projectApplicationId = projectApplicationId;
        version.alias = data.alias;
        version.version = data.version ?? null;
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

    // The owner's free-form label — the build's id; only a catalog build also declares `version`.
    @Column()
    alias: string;

    @Column({ type: "varchar", nullable: true })
    version: string | null;

    @Column({ type: "varchar", nullable: true })
    appRef: string | null;

    @Column({ type: "varchar", nullable: true })
    webdriverRef: string | null;

    @DateColumn()
    createdAt: Date;

    toObject(): ProjectApplicationVersionData {
        return {
            alias: this.alias,
            version: this.version,
            appRef: this.appRef,
            webdriverRef: this.webdriverRef,
            createdAt: this.createdAt,
        };
    }

    private constructor() {}
}
