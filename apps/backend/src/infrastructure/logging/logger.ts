import { ConsoleLogger } from "@nestjs/common";
import { kebabCase } from "lodash";

import { AsyncLocalStorage } from "../context/async-local-storage";

export class Logger extends ConsoleLogger {
    error(message: string): void {
        super.error(this.format(message));
    }

    warn(message: string): void {
        super.warn(this.format(message));
    }

    log(message: string): void {
        super.log(this.format(message));
    }

    debug(message: string): void {
        super.debug(this.format(message));
    }

    verbose(message: string): void {
        super.verbose(this.format(message));
    }

    fatal(message: string): void {
        super.fatal(this.format(message));
    }

    private format(message: string): string {
        const prefix = this.formatPrefix();

        return prefix !== "" ? `${prefix} ${message}` : message;
    }

    private formatPrefix(): string {
        const store = (AsyncLocalStorage.getInstance().getStore() || {}) as Record<string, unknown>;

        return Object.keys(store || {}).map((key) => `[${kebabCase(key).toUpperCase()}: ${store[key]}]`).join(" ");
    }
}
