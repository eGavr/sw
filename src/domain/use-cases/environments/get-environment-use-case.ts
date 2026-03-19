import { Injectable } from "@nestjs/common";

import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { PermissionRepository } from "../../../data/repositories/permission-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { NotFoundResourceError } from "../../entities/error/not-found/not-found-resource-error";
import { PermissionDeniedError } from "../../entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../entities/error/unauthenticated-error";
import { PermissionName } from "../../entities/permission/permission-name";
import { UserCredentials } from "../../entities/user/user-credentials";

type GetEnvironmentInput = {
    creds: {
        token: string;
    },
    params: {
        environmentId: string;
    }
}

type GetEnvironmentResult = { id: string };

@Injectable()
export class GetEnvironmentUseCase {
    private readonly permissionName = PermissionName.Environment.Read;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly permissionRepository: PermissionRepository,
        private readonly environmentRepository: EnvironmentRepository, 
    ) {}

    async execute({ creds, params }: GetEnvironmentInput): Promise<GetEnvironmentResult> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        const environment = await this.environmentRepository.get(params.environmentId);
        const permissions = await this.permissionRepository.findAll({ filter: { user, account: environment.account } });

        if (!permissions.find(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        throw new NotFoundResourceError(params.environmentId);
    }
}

