import { Column, Entity, ManyToOne, PrimaryColumn, Unique } from "typeorm";

import { ApplicationData } from "../../../../../../../domain/entities/environment/application/application";
import { Uuid } from "../../../../../../../domain/types/uuid/uuid";

import { Environment } from "./environment";

@Entity()
@Unique(["environmentId", "applicationName", "applicationVersion"])
export class EnvironmentApplication {
    static from(environmentId: string, application: ApplicationData): EnvironmentApplication {
        const environmentApplication = new EnvironmentApplication();

        environmentApplication.id = Uuid.create().getValue();
        environmentApplication.environmentId = environmentId;
        environmentApplication.applicationName = application.name;
        environmentApplication.applicationVersion = application.version;

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

    private constructor() {}
}
