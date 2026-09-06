import {
    ApplicationCatalogView,
} from "../../../../../../application/use-cases/application-catalog/get-application-catalog-use-case";
import { Presenter } from "../../../../presenters/presenter";

// What the install can put onto an environment, folded for pickers: the platform base-image lines
// (name + supported versions) and one offering per (platform, application) — canonical name, the wire
// aliases it answers to, versions newest-first. Artifact locations are the delivery layer's internals
// and are not published.
export class ApplicationCatalogPresenter implements Presenter {
    constructor(private readonly catalog: ApplicationCatalogView) {}

    present(): object {
        return {
            name: "applicationCatalog",
            platforms: this.catalog.platforms.map(({ name, versions }) => ({ name, versions: [...versions] })),
            applications: this.catalog.applications.map((offering) => ({
                platform: offering.platform,
                name: offering.name,
                aliases: [...offering.aliases],
                versions: [...offering.versions],
            })),
        };
    }
}
