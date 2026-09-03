import { Injectable } from "@nestjs/common";

import { UnauthenticatedError } from "../../../domain/entities/error/unauthenticated-error";
import { NetBridgeSecret } from "../../../domain/entities/net-bridge-credential/net-bridge-secret";
import { ProjectId } from "../../../domain/entities/project/project-id";
import {
    NetBridgeCredentialRepository,
} from "../../interfaces/repositories/net-bridge-credential-repository";

type AuthenticateNetBridgeClientInput = {
    creds: {
        secret: string;
    },
}

// Authenticates a tunnel client by its access key and resolves the project it may attach to. The presented
// key is fingerprinted and looked up by hash; an unknown or expired key is rejected. A successful attach
// stamps last-used (an audit signal for spotting leaked keys).
@Injectable()
export class AuthenticateNetBridgeClientUseCase {
    constructor(private readonly netBridgeCredentialRepository: NetBridgeCredentialRepository) {}

    async execute({ creds }: AuthenticateNetBridgeClientInput): Promise<ProjectId> {
        const fingerprint = NetBridgeSecret.fromString(creds.secret).fingerprint();
        const credential = await this.netBridgeCredentialRepository.findBySecretHash(fingerprint);
        const now = new Date();

        if (!credential || credential.isExpired(now)) {
            throw new UnauthenticatedError();
        }

        credential.recordUse(now);
        await this.netBridgeCredentialRepository.save(credential);

        return credential.projectId;
    }
}
