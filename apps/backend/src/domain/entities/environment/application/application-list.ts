import { Application, ApplicationData } from "./application";
import { ApplicationMatch } from "./application-match";

export class ApplicationList {
    static create({ applications }: { applications: Array<Application> }): ApplicationList {
        return new ApplicationList(applications);
    }

    static fromObject(data: Array<ApplicationData>): ApplicationList {
        return new ApplicationList(data.map(Application.fromObject));
    }

    private constructor(private readonly applications: Array<Application>) {}

    has(application: Application): boolean {
        return this.applications.some((candidate) => candidate.equals(application));
    }

    find(name: string): Application | null {
        return this.applications.find((application) => application.name === name) ?? null;
    }

    // The newest installed application satisfying the match — the one a session on this environment
    // would actually target.
    bestMatch(match: ApplicationMatch): Application | null {
        const matching = this.applications.filter((application) => match.matches(application));

        if (matching.length === 0) {
            return null;
        }

        return matching.reduce((best, candidate) => (candidate.compareVersion(best) > 0 ? candidate : best));
    }

    toArray(): Array<ApplicationData> {
        return this.applications.map((application) => application.toObject());
    }
}
