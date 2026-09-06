import {
    ApplicationOffering,
} from "../../../../../../domain/entities/application-catalog/application-catalog";
import { Presenter } from "../../../../presenters/presenter";

// One application the install delivers onto a platform: the canonical reverse-DNS id (the resource
// id) and the wire aliases it answers to (`browserName: chrome`). Its versions are the child
// collection (.../versions), not a field; artifact locations are the delivery layer's internals and
// are not published.
export class PlatformApplicationPresenter implements Presenter {
    constructor(private readonly offering: ApplicationOffering) {}

    present(): object {
        return {
            name: `platforms/${this.offering.platform}/applications/${this.offering.name}`,
            application: this.offering.name,
            aliases: [...this.offering.aliases],
        };
    }
}

export class ListPlatformApplicationsPresenter implements Presenter {
    constructor(private readonly offerings: ReadonlyArray<ApplicationOffering>) {}

    present(): object {
        return {
            applications: this.offerings.map((offering) => new PlatformApplicationPresenter(offering).present()),
        };
    }
}
