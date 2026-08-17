import { Injectable } from "@nestjs/common";

import { Project } from "../../../domain/entities/project/project";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type ListProjectsInput = {
    creds: {
        token: string;
    },
}

@Injectable()
export class ListProjectsUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
    ) {}

    async execute({ creds }: ListProjectsInput): Promise<Array<Project>> {
        const user = await this.accessControl.authenticate(creds);

        return this.projectRepository.listByUser(user);
    }
}
