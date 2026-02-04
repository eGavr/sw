import { YdbLogger } from "./ydb-logger";

export class YdbClient {
    private initialized = false;

    constructor(private readonly logger: YdbLogger) {}

    async initialize(): Promise<this> {
        this.initialized = true;

        this.logger.debug("INITIALIAZED");

        return this;
    }

    async get(id: string): Promise<{ id: string }> {
        if (!this.initialized) {
            throw new Error("not initialized");
        }

        this.logger.debug("executing some sql query");

        return { id };
    }
}
