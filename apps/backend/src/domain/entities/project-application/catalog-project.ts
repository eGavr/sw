import { InvalidArgumentError } from "../error/invalid-argument-error";
import { Project } from "../project/project";

// The reserved project whose applications ARE the install's provided catalog (the GCE vendor-project
// model: a peer, not a parent — `projects/ubuntu-os-cloud/global/images`). Its words are reserved
// install-wide, its applications are readable by every authenticated caller, and it hosts nothing but
// the delivery catalog.
export const catalogProjectHandle = "catalog";

export function isCatalogProject(project: Project): boolean {
    return project.resourceId === catalogProjectHandle;
}

export class CatalogProjectPurposeError extends InvalidArgumentError {
    constructor(action: string) {
        super(`the catalog project only hosts the install's applications — ${action} is not available in it`);
    }
}

// The single-purpose rule: the catalog project carries the install's delivery catalog and nothing
// else, so every other resource-creating scenario refuses it up front.
export function ensureNotCatalogProject(project: Project, action: string): void {
    if (isCatalogProject(project)) {
        throw new CatalogProjectPurposeError(action);
    }
}
