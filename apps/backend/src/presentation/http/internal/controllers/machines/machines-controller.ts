import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Res,
    UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { AgentTokenService } from "../../../../../application/interfaces/agent-token-service";
import { SyncMachineUseCase } from "../../../../../application/use-cases/machines/sync-machine-use-case";
import { MachineId } from "../../../../../domain/entities/machine/machine-id";
import { InternalMachineTokenGuard } from "../../guards/internal-machine-token-guard";

import { factsOf } from "./io/machine-facts-request-model";
import { DesiredSlot, MachineSyncPresenter } from "./io/machine-sync-presenter";
import { SyncMachineRequestModel } from "./io/sync-machine-request-model";

// The machine agent's door, once registered: custom method (AIP-136) POST /internal/machines/{id}:sync
// every few seconds. A two-way exchange — the agent reports facts and what it runs, the answer is what
// its lease wants running (the reconcile-agent canon, kubelet-style) — so one call covers liveness,
// fitness and convergence.
@Controller("internal/machines")
@UseGuards(InternalMachineTokenGuard)
export class InternalMachinesController {
    private readonly agentScript = readFileSync(join(__dirname, "machine-agent.sh"), "utf8");

    constructor(
        private readonly syncMachineUseCase: SyncMachineUseCase,
        private readonly agentTokens: AgentTokenService,
    ) {}

    // The agent itself is fetched from the control plane (never baked into an image or a machine), so
    // every sync generation runs the current protocol. Any valid machine token may download it — the
    // route acts on no specific machine.
    @Get("agent\\::download")
    downloadAgent(@Res() response: Response): void {
        response.setHeader("content-type", "text/x-shellscript");
        response.send(this.agentScript);
    }

    // Custom method (AIP-136), spelled out rather than multiplexed: the unauthenticated `:register`
    // lives on another controller, and a catch-all `{id}:{verb}` here would swallow it behind the guard.
    @Post(":machine\\:sync")
    @HttpCode(HttpStatus.OK)
    async sync(
        @Param("machine") machineId: string,
        @Body() body: SyncMachineRequestModel,
    ): Promise<MachineSyncPresenter> {
        const { machine, assignments } = await this.syncMachineUseCase.execute({
            machineId: MachineId.fromString(machineId),
            facts: factsOf(body.facts),
        });
        // Per-environment agent tokens are minted into the response and never stored — the slot
        // launcher hands each one to its in-slot agent.
        const slots: Array<DesiredSlot> = await Promise.all(assignments.map(async (assignment) => ({
            assignment,
            agentToken: await this.agentTokens.issue(assignment.environmentId),
        })));

        return new MachineSyncPresenter(machine, slots);
    }
}
