import { Column, Entity, ManyToOne, PrimaryColumn, Unique } from "typeorm";

import { ApplicationData } from "../../../../../../../domain/entities/environment/application/application";
import { ApplicationSourceData } from "../../../../../../../domain/entities/environment/application/application-source";
import { Uuid } from "../../../../../../../domain/types/uuid/uuid";

import { Environment } from "./environment";

@Entity()
@Unique(["environmentId", "applicationName", "applicationVersion"])
export class EnvironmentApplication {
    static from(environmentId: string, application: ApplicationData): EnvironmentApplication {
        const environmentApplication = new EnvironmentApplication();
        const source = application.source;

        environmentApplication.id = Uuid.create().getValue();
        environmentApplication.environmentId = environmentId;
        environmentApplication.applicationName = application.name;
        environmentApplication.applicationVersion = application.version;
        environmentApplication.sourceType = source?.type ?? "provided";
        environmentApplication.appRef = source?.appRef ?? null;
        environmentApplication.webdriverRef = source?.webdriverRef ?? null;

        return environmentApplication;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => Environment, environment => environment.applications, { onDelete: "CASCADE" })
    environment: Environment;

    @Column()
    environmentId: string;

    @Column()
    applicationName: string;

    @Column()
    applicationVersion: string;

    // Where the application comes from and the snapshotted artifact refs of the exact build installed:
    // `provided` — the install catalog's build (refs into the install's store; none = preinstalled),
    // `custom` — the user's registered build (refs are keys in the project's delegated bucket).
    @Column({ default: "provided" })
    sourceType: string;

    @Column({ type: "varchar", nullable: true })
    appRef: string | null;

    @Column({ type: "varchar", nullable: true })
    webdriverRef: string | null;

    toSourceData(): ApplicationSourceData {
        return {
            type: this.sourceType === "custom" ? "custom" : "provided",
            ...(this.appRef !== null ? { appRef: this.appRef } : {}),
            ...(this.webdriverRef !== null ? { webdriverRef: this.webdriverRef } : {}),
        };
    }

    private constructor() {}
}
