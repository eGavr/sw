import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { AgentTokenService } from "../../interfaces/agent-token-service";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";

type AuthenticateNetBridgeForwarderInput = {
    creds: {
        environmentToken: string;
    },
}

// Authenticates an in-environment forwarder by its per-environment agent token and resolves the project
// its environment belongs to — so the rendezvous can attach it to that project's tunnel client. Verifying
// the token or loading the environment throws, and the caller refuses the upgrade.
@Injectable()
export class AuthenticateNetBridgeForwarderUseCase {
    constructor(
        private readonly agentTokens: AgentTokenService,
        private readonly environmentRepository: EnvironmentRepository,
    ) {}

    async execute({ creds }: AuthenticateNetBridgeForwarderInput): Promise<ProjectId> {
        const { environmentId } = await this.agentTokens.verify(creds.environmentToken);
        const environment = await this.environmentRepository.get(EnvironmentId.fromString(environmentId));

        return environment.projectId;
    }
}
