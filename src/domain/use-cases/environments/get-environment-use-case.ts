import { Injectable } from "@nestjs/common";

import { EnvironmentRepository } from "../../../data/repositories/environment-repository";

type GetEnvironmentParams = {
    environmentId: string;
}

export type GetEnvironmentResult = { id: string };

@Injectable()
export class GetEnvironmentUseCase {
    constructor(private readonly environmentRepository: EnvironmentRepository) {}

    async execute(params: GetEnvironmentParams): Promise<GetEnvironmentResult> {
        return this.environmentRepository.get(params.environmentId);
    }
}
