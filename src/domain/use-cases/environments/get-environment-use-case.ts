import { Injectable } from "@nestjs/common";

import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { EnvironmentId } from "../../entities/environment/environment-id";
import { NotFoundError } from "../../entities/error/not-found-error";
import { UserCredentials } from "../../entities/user/user-credentials";

type GetEnvironmentInput = {
    userCredentials: {
        token?: string;
    },
    params: {
        environmentId: string;
    }
}

type GetEnvironmentResult = { id: string };

@Injectable()
export class GetEnvironmentUseCase {
    constructor(private readonly _environmentRepository: EnvironmentRepository) {}

    async execute({ userCredentials, params }: GetEnvironmentInput): Promise<GetEnvironmentResult> {
        UserCredentials.create(userCredentials);

        throw new NotFoundError(`resource: ${EnvironmentId.fromString(params.environmentId)}: not found`);
    }
}
