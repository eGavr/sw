import { Column, Entity, PrimaryColumn } from "typeorm";

import {
    NetBridgeCredential as NetBridgeCredentialEntity,
    NetBridgeCredentialData,
} from "../../../../../../../domain/entities/net-bridge-credential/net-bridge-credential";
import { DateColumn } from "../../columns-extra/date-column";

// One row per NetBridge access key. Only `secret_hash` is stored — never the plaintext key — so the row
// is useless to an attacker who reads the table.
@Entity()
export class NetBridgeCredential {
    static from(credential: NetBridgeCredentialEntity): NetBridgeCredential {
        const data = credential.toObject();
        const row = new NetBridgeCredential();

        row.id = data.id;
        row.projectId = data.projectId;
        row.name = data.name;
        row.secretHash = data.secretHash;
        row.createdAt = data.createdAt;
        row.expiresAt = data.expiresAt;
        row.lastUsedAt = data.lastUsedAt;

        return row;
    }

    @PrimaryColumn("uuid")
    id: string;

    @Column("uuid")
    projectId: string;

    @Column({ type: "varchar", nullable: true })
    name: string | null;

    @Column()
    secretHash: string;

    @DateColumn()
    createdAt: Date;

    @Column({ type: "timestamptz", nullable: true })
    expiresAt: Date | null;

    @Column({ type: "timestamptz", nullable: true })
    lastUsedAt: Date | null;

    private constructor() {}

    toObject(): NetBridgeCredentialData {
        return {
            id: this.id,
            projectId: this.projectId,
            name: this.name,
            secretHash: this.secretHash,
            createdAt: this.createdAt,
            expiresAt: this.expiresAt,
            lastUsedAt: this.lastUsedAt,
        };
    }
}
