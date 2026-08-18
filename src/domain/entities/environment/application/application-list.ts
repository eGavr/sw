import { Application, ApplicationData } from "./application";

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

    toArray(): Array<ApplicationData> {
        return this.applications.map((application) => application.toObject());
    }
}
