// Driven port for operational logging: the application logs scenario outcomes through this abstraction,
// infrastructure binds it to the concrete logger (double as DI token and type, like the other ports).
export abstract class Logger {
    abstract log(message: string): void;
    abstract warn(message: string): void;
    abstract error(message: string): void;
}
