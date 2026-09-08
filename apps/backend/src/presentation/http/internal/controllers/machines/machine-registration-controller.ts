import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";

import { MachineTokenService } from "../../../../../application/interfaces/machine-token-service";
import { RegisterMachineUseCase } from "../../../../../application/use-cases/machines/register-machine-use-case";
import { MachineId } from "../../../../../domain/entities/machine/machine-id";

import { factsOf } from "./io/machine-facts-request-model";
import { MachineRegistrationPresenter } from "./io/machine-registration-presenter";
import { RegisterMachineRequestModel } from "./io/register-machine-request-model";

// The unauthenticated edge of the machine protocol: what a box runs BEFORE it has a machine token.
//   - the installer script (static, secret-free — the install command pipes it to bash);
//   - registration: the one-time registration token from the install command is spent here for the
//     long-lived machine token every later call carries.
@Controller("internal")
export class InternalMachineRegistrationController {
    private readonly installerScript = readFileSync(join(__dirname, "machine-installer.sh"), "utf8");

    constructor(
        private readonly registerMachineUseCase: RegisterMachineUseCase,
        private readonly machineTokens: MachineTokenService,
    ) {}

    @Get("machines/installer\\::download")
    downloadInstaller(@Res() response: Response): void {
        response.setHeader("content-type", "text/x-shellscript");
        response.send(this.installerScript);
    }

    @Post("machines/:machine\\:register")
    @HttpCode(HttpStatus.OK)
    async register(
        @Param("machine") machineId: string,
        @Body() body: RegisterMachineRequestModel,
    ): Promise<MachineRegistrationPresenter> {
        const machine = await this.registerMachineUseCase.execute({
            machineId: MachineId.fromString(machineId),
            registrationToken: body.registrationToken,
            facts: factsOf(body.facts),
        });

        return new MachineRegistrationPresenter(machine, await this.machineTokens.issue(machine.id));
    }
}
