import { Injectable } from "@nestjs/common";

import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { EnvironmentId } from "../../entities/environment/environment-id";
import { NotFoundError } from "../../entities/error/not-found-error";

type GetEnvironmentParams = {
    environmentId: string;
}

type GetEnvironmentResult = { id: string };

@Injectable()
export class GetEnvironmentUseCase {
    constructor(private readonly _environmentRepository: EnvironmentRepository) {}

    async execute(params: GetEnvironmentParams): Promise<GetEnvironmentResult> {
        throw new NotFoundError(`resource: ${EnvironmentId.fromString(params.environmentId)}: not found`);
    }
}
