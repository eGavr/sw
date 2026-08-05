import { Column, Entity, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

import { Environment as EnvironmentEntity, EnvironmentData } from "../../../../../../../domain/entities/environment/environment";
import { DateColumn } from "../../columns-extra/date-column";
import { Account } from "../account/account";

import { EnvironmentApplication } from "./environment-application";

@Entity()
export class Environment {
    static from(entity: EnvironmentEntity): Environment {
        const data = entity.toObject();
        const environment = new Environment();

        environment.id = data.id;
        environment.accountId = data.accountId;
        environment.state = data.state;
        environment.stateReason = data.stateReason ?? null;
        environment.platformName = data.platform.name;
        environment.platformVersion = data.platform.version;
        environment.deviceName = data.platform.deviceModel;
        environment.endpoint = data.endpoint ?? null;
        environment.busy = data.busy;
        environment.lastHeartbeatAt = data.lastHeartbeatAt ?? null;
        environment.createdAt = data.createdAt;
        environment.updatedAt = data.updatedAt;
        environment.applications = data.applications.map((application) => EnvironmentApplication.from(data.id, application));

        return environment;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => Account, account => account.id)
    account: Account;

    @Column()
    accountId: string;

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

    @Column({ type: "varchar", nullable: true })
    endpoint: string | null;

    @Column({ default: false })
    busy: boolean;

    @Column({ type: "timestamptz", nullable: true })
    lastHeartbeatAt: Date | null;

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
            accountId: this.accountId,
            state: this.state,
            stateReason: this.stateReason,
            platform: {
                name: this.platformName,
                version: this.platformVersion,
                deviceModel: this.deviceName,
            },
            applications: (this.applications ?? []).map((application) => ({
                name: application.applicationName,
                version: application.applicationVersion,
            })),
            endpoint: this.endpoint,
            busy: this.busy,
            lastHeartbeatAt: this.lastHeartbeatAt,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
