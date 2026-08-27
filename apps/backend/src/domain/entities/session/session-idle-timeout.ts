import { InvalidArgumentError } from "../error/invalid-argument-error";

// The single source of the session idle timeout. How long a session may sit idle on its node before the
// node ends it (reset on every command — the "smart" idle timeout, delegated to the browser node). This
// is a session-lifecycle policy, identical across compute backends, so it lives in the domain; a gateway
// only translates it into the node's SE_NODE_SESSION_TIMEOUT, never owns a copy of the default.
export const defaultSessionIdleTimeoutSeconds = 300;

export class SessionIdleTimeout {
    static default(): SessionIdleTimeout {
        return new SessionIdleTimeout(defaultSessionIdleTimeoutSeconds);
    }

    static ofSeconds(seconds: number): SessionIdleTimeout {
        if (!Number.isInteger(seconds) || seconds <= 0) {
            throw new InvalidArgumentError(`session idle timeout: value must be a positive integer of seconds: ${seconds}`);
        }

        return new SessionIdleTimeout(seconds);
    }

    private constructor(private readonly seconds: number) {}

    toSeconds(): number {
        return this.seconds;
    }
}
