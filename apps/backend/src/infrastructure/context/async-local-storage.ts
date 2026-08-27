
import { AsyncLocalStorage as Als } from "node:async_hooks";

export type Context = { 
    reqId?: string; 
    runId?: string;
}

export class AsyncLocalStorage {
    private static instance?: AsyncLocalStorage

    static getInstance(): AsyncLocalStorage {
        if (!AsyncLocalStorage.instance) {
            AsyncLocalStorage.instance = new AsyncLocalStorage();
        }

        return AsyncLocalStorage.instance;
    }

    private readonly als = new Als<Context>();

    private constructor() {}

    run<T>(context: Context, callback: () => T): T {
        return this.als.run(context, callback);
    }

    getStore(): Context | undefined {
        return this.als.getStore();
    }
}
