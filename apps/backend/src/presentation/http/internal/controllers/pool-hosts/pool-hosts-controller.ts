import {
    BadRequestException,
    Controller,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Post,
    Req,
    UseGuards,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { Request } from "express";

import { AgentTokenService } from "../../../../../application/interfaces/agent-token-service";
import {
    RecordHostHeartbeatUseCase,
} from "../../../../../application/use-cases/host-pool/record-host-heartbeat-use-case";
import { PoolHostId } from "../../../../../domain/entities/host-pool/pool-host-id";
import { ClassValidatorError } from "../../../../../domain/utils/class-validator/class-validator-error";
import { InternalHostTokenGuard } from "../../guards/internal-host-token-guard";

import { DesiredSlot, HostHeartbeatPresenter } from "./io/host-heartbeat-presenter";
import { HostHeartbeatRequestModel } from "./io/host-heartbeat-request-model";

const heartbeatVerb = "heartbeat";

// The host agent's check-in door, mirroring the environment agent's heartbeat: custom method (AIP-136)
// POST /internal/poolHosts/{id}:heartbeat. The response carries the machine's desired seats — a check-in
// that returns desired state is the reconcile-agent canon (kubelet-style), so one exchange covers
// registration, liveness and convergence.
@Controller("internal/poolHosts")
@UseGuards(InternalHostTokenGuard)
export class InternalPoolHostsController {
    constructor(
        private readonly recordHostHeartbeatUseCase: RecordHostHeartbeatUseCase,
        private readonly agentTokens: AgentTokenService,
    ) {}

    @Post(":resource")
    @HttpCode(HttpStatus.OK)
    async customMethod(
        @Param("resource") resource: string,
        @Req() request: Request,
    ): Promise<HostHeartbeatPresenter> {
        const separatorIndex = resource.lastIndexOf(":");
        const hostId = resource.slice(0, separatorIndex);
        const verb = separatorIndex === -1 ? "" : resource.slice(separatorIndex + 1);

        switch (verb) {
            case heartbeatVerb:
                return this.heartbeat(hostId, request);
            default:
                throw new NotFoundException(`unknown custom method on host: ${verb || "(none)"}`);
        }
    }

    private async heartbeat(hostId: string, request: Request): Promise<HostHeartbeatPresenter> {
        const body = this.parse(HostHeartbeatRequestModel, request.body);

        const host = await this.recordHostHeartbeatUseCase.execute({
            hostId: PoolHostId.fromString(hostId),
            hostIp: body.hostIp,
        });

        // Per-environment agent tokens are minted into the response and never stored — the slot
        // launcher hands each one to its in-slot agent.
        const slots: Array<DesiredSlot> = await Promise.all(host.placements().map(async (placement) => ({
            placement,
            agentToken: await this.agentTokens.issue(placement.environmentId),
        })));

        return new HostHeartbeatPresenter(host, slots);
    }

    // Same validation rules and error shape as the module's global ValidationPipe (the multiplexed
    // custom-method handler reads the raw request).
    private parse<T extends object>(model: new () => T, body: unknown): T {
        const request = plainToInstance(model, body ?? {});
        const errors = validateSync(request, { whitelist: true, forbidNonWhitelisted: true });

        if (errors.length > 0) {
            throw new BadRequestException(ClassValidatorError.stringifyConstraints(errors[0]));
        }

        return request;
    }
}
