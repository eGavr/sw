import { InvalidArgumentError } from "../../error/invalid-argument-error";

// The docker rule: a word the install's catalog answers to (canonical name or alias) means the same
// thing in every project, so a custom application may not take it — full predictability over
// convenience; a custom build lives under its own canonical name.
export class ReservedApplicationWordError extends InvalidArgumentError {
    constructor(platformName: string, word: string) {
        super(`application word "${word}" on ${platformName} is reserved by the install catalog`);
    }
}
