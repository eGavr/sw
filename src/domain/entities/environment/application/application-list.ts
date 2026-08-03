import { Application, ApplicationData } from "./application";

export class ApplicationList {
    static create({ applications }: { applications: Array<Application> }): ApplicationList {
        return new ApplicationList(applications);
    }

    static fromObject(data: Array<ApplicationData>): ApplicationList {
        return new ApplicationList(data.map(Application.fromObject));
    }

    private constructor(private readonly applications: Array<Application>) {}

    isEmpty(): boolean {
        return this.applications.length === 0;
    }

    has(application: Application): boolean {
        return this.applications.some((candidate) => candidate.equals(application));
    }

    find(name: string, version: string): Application | null {
        return this.applications.find((candidate) => candidate.name === name && candidate.version === version) ?? null;
    }

    map<T>(cb: (application: Application) => T): Array<T> {
        return this.applications.map(cb);
    }

    toArray(): Array<ApplicationData> {
        return this.applications.map((application) => application.toObject());
    }
}
