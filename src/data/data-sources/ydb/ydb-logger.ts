import { Logger } from "../../../infrastructure/logging/logger";

export class YdbLogger {
    constructor(private readonly logger: Logger) {}

    error(message: string): void {
        this.logger.warn(this.format(message));
    }

    debug(message: string): void {
        this.logger.debug(this.format(message));
    }

    private format(message: string): string {
        return `[YDB] ${message}`;
    }
}
