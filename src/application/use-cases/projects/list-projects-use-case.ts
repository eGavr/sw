import { Injectable } from "@nestjs/common";

import { Project } from "../../../domain/entities/project/project";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type ListAccountsInput = {
    creds: {
        token: string;
    },
}

@Injectable()
export class ListAccountsUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
    ) {}

    async execute({ creds }: ListAccountsInput): Promise<Array<Project>> {
        const user = await this.accessControl.authenticate(creds);

        return this.projectRepository.listByUser(user);
    }
}
