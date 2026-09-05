import { Column, Entity, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

import { Environment as EnvironmentEntity, EnvironmentData } from "../../../../../../../domain/entities/environment/environment";
import { defaultExecution } from "../../../../../../../domain/entities/environment/execution";
import { DateColumn } from "../../columns-extra/date-column";
import { CloudAccount } from "../cloud-account/cloud-account";
import { Project } from "../project/project";

import { EnvironmentApplication } from "./environment-application";

@Entity()
export class Environment {
    static from(entity: EnvironmentEntity): Environment {
        const data = entity.toObject();
        const environment = new Environment();

        environment.id = data.id;
        environment.resourceId = data.resourceId ?? null;
        environment.projectId = data.projectId;
        environment.cloudAccountId = data.cloudAccountId ?? null;
        environment.cloudType = data.cloudType ?? null;
        environment.computeKind = data.computeKind ?? null;
        environment.state = data.state;
        environment.stateReason = data.stateReason ?? null;
        environment.platformName = data.platform.name;
        environment.platformVersion = data.platform.version;
        environment.deviceName = data.platform.deviceModel;
        environment.execution = data.execution ?? defaultExecution;
        environment.endpoint = data.endpoint ?? null;
        environment.occupancy = data.occupancy;
        environment.lastHeartbeatAt = data.lastHeartbeatAt ?? null;
        environment.occupancyLastConfirmedAt = data.occupancyLastConfirmedAt ?? null;
        environment.createdAt = data.createdAt;
        environment.updatedAt = data.updatedAt;
        environment.applications = data.applications.map((application) => EnvironmentApplication.from(data.id, application));

        return environment;
    }

    @PrimaryColumn("uuid")
    id: string;

    // Client-chosen human-readable id (unique per project when set); null when addressed by uid.
    @Column({ type: "varchar", nullable: true })
    resourceId: string | null;

    @ManyToOne(() => Project, project => project.id)
    project: Project;

    @Column()
    projectId: string;

    @ManyToOne(() => CloudAccount, cloudAccount => cloudAccount.id)
    cloudAccount: CloudAccount;

    @Column({ type: "uuid", nullable: true })
    cloudAccountId: string | null;

    @Column({ type: "varchar", nullable: true })
    cloudType: string | null;

    @Column({ type: "varchar", nullable: true })
    computeKind: string | null;

    @Column()
    state: string;

    @Column({ type: "varchar", nullable: true })
    stateReason: string | null;

    @Column()
    platformName: string;

    @Column()
    platformVersion: string;

    @Column()
    deviceName: string;

    @Column({ default: "container" })
    execution: string;

    @Column({ type: "varchar", nullable: true })
    endpoint: string | null;

    @Column({ default: "free" })
    occupancy: string;

    // Provisioning attempts, incremented by the worker's claim; the reaper caps retries with it.
    @Column({ type: "int", default: 0 })
    attempts: number;

    // The agent's liveness word (the node is alive), refreshed by every agent heartbeat.
    @Column({ type: "timestamptz", nullable: true })
    lastHeartbeatAt: Date | null;

    // The reserving wd's liveness word (still creating a session), present only while reserved.
    @Column({ type: "timestamptz", nullable: true })
    occupancyLastConfirmedAt: Date | null;

    @DateColumn()
    createdAt: Date;

    @DateColumn()
    updatedAt: Date;

    @OneToMany(() => EnvironmentApplication, application => application.environment, { eager: true })
    applications: Array<EnvironmentApplication>;

    private constructor() {}

    toObject(): EnvironmentData {
        return {
            id: this.id,
            resourceId: this.resourceId,
            projectId: this.projectId,
            cloudAccountId: this.cloudAccountId,
            cloudType: this.cloudType,
            computeKind: this.computeKind,
            state: this.state,
            stateReason: this.stateReason,
            platform: {
                name: this.platformName,
                version: this.platformVersion,
                deviceModel: this.deviceName,
            },
            execution: this.execution,
            applications: (this.applications ?? []).map((application) => ({
                name: application.applicationName,
                version: application.applicationVersion,
                source: application.toSourceData(),
            })),
            endpoint: this.endpoint,
            occupancy: this.occupancy,
            attempts: this.attempts,
            lastHeartbeatAt: this.lastHeartbeatAt,
            occupancyLastConfirmedAt: this.occupancyLastConfirmedAt,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
