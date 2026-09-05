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
        environmentApplication.appKey = source?.appKey ?? null;
        environmentApplication.webdriverKey = source?.webdriverKey ?? null;

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

    // Where the application comes from: `provided` (the service's catalog / preinstalled) or `custom`
    // (the user's artifact in the project's delegated bucket, by object key).
    @Column({ default: "provided" })
    sourceType: string;

    @Column({ type: "varchar", nullable: true })
    appKey: string | null;

    @Column({ type: "varchar", nullable: true })
    webdriverKey: string | null;

    toSourceData(): ApplicationSourceData {
        return {
            type: this.sourceType === "custom" ? "custom" : "provided",
            ...(this.appKey !== null ? { appKey: this.appKey } : {}),
            ...(this.webdriverKey !== null ? { webdriverKey: this.webdriverKey } : {}),
        };
    }

    private constructor() {}
}
