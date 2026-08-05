import { AccountId } from "../account/account-id";

import { Application } from "./application/application";
import { ApplicationList } from "./application/application-list";
import { Environment } from "./environment";
import { EnvironmentEndpoint } from "./environment-endpoint";
import { EnvironmentState } from "./environment-state";
import { EnvironmentStateReason } from "./environment-state-reason";
import { EnvironmentStatus } from "./environment-status";
import { InvalidEnvironmentStateTransitionError } from "./error/invalid-environment-state-transition-error";
import { Platform } from "./platform/platform";

const freshnessMs = 6_000;

function makeEnvironment(): Environment {
    return Environment.create({
        accountId: AccountId.create(),
        platform: Platform.fromObject({ name: "linux", version: "6" }),
        applications: ApplicationList.create({ applications: [Application.create({ name: "chrome", version: "100" })] }),
    });
}

describe("Environment", () => {
    describe(".create", () => {
        test("should start enqueued, free, without endpoint", () => {
            const environment = makeEnvironment();

            expect(environment.state).toBe(EnvironmentState.Enqueued);
            expect(environment.busy).toBe(false);
            expect(environment.endpoint).toBeNull();
            expect(environment.effectiveStatus(new Date(), freshnessMs)).toBe(EnvironmentStatus.Enqueued);
        });
    });

    describe("#supports", () => {
        test("should support an application from its set", () => {
            const environment = makeEnvironment();

            expect(environment.supports(Application.create({ name: "chrome", version: "100" }))).toBe(true);
            expect(environment.supports(Application.create({ name: "firefox", version: "120" }))).toBe(false);
        });
    });

    describe("#claim", () => {
        test("should move enqueued to preparing", () => {
            const environment = makeEnvironment();

            environment.claim();

            expect(environment.state).toBe(EnvironmentState.Preparing);
        });

        test("should reject claiming twice", () => {
            const environment = makeEnvironment();
            environment.claim();

            expect(() => environment.claim()).toThrow(InvalidEnvironmentStateTransitionError);
        });
    });

    describe("#register", () => {
        test("should activate a preparing environment with an endpoint and a heartbeat", () => {
            const environment = makeEnvironment();
            const now = new Date();
            environment.claim();

            environment.register(new EnvironmentEndpoint("http://host:4444"), now);

            expect(environment.state).toBe(EnvironmentState.Executing);
            expect(environment.endpoint).toBe("http://host:4444");
            expect(environment.effectiveStatus(now, freshnessMs)).toBe(EnvironmentStatus.Active);
        });

        test("should report UNHEALTHY once the heartbeat goes stale", () => {
            const environment = makeEnvironment();
            const registeredAt = new Date(0);
            environment.claim();
            environment.register(new EnvironmentEndpoint("http://host:4444"), registeredAt);

            const later = new Date(registeredAt.getTime() + freshnessMs + 1);

            expect(environment.effectiveStatus(later, freshnessMs)).toBe(EnvironmentStatus.Unhealthy);
        });

        test("should reject registering an environment that was not preparing", () => {
            const environment = makeEnvironment();

            expect(() => environment.register(new EnvironmentEndpoint("http://host:4444"), new Date())).toThrow(
                InvalidEnvironmentStateTransitionError,
            );
        });
    });

    describe("#heartbeat", () => {
        test("should update busy while executing", () => {
            const environment = makeEnvironment();
            const now = new Date();
            environment.claim();
            environment.register(new EnvironmentEndpoint("http://host:4444"), now);

            environment.heartbeat(true, now);

            expect(environment.busy).toBe(true);
        });

        test("should reject a heartbeat before the environment is executing", () => {
            const environment = makeEnvironment();

            expect(() => environment.heartbeat(true, new Date())).toThrow(InvalidEnvironmentStateTransitionError);
        });
    });

    describe("#failProvisioning", () => {
        test("should fail a preparing environment with a reason", () => {
            const environment = makeEnvironment();
            environment.claim();

            environment.failProvisioning(EnvironmentStateReason.PermissionDenied);

            expect(environment.state).toBe(EnvironmentState.Failed);
            expect(environment.stateReason).toBe(EnvironmentStateReason.PermissionDenied);
            expect(environment.effectiveStatus(new Date(), freshnessMs)).toBe(EnvironmentStatus.Failed);
        });
    });

    describe("#retryProvisioning", () => {
        test("should return a preparing environment to the queue and clear the reason", () => {
            const environment = makeEnvironment();
            environment.claim();

            environment.retryProvisioning();

            expect(environment.state).toBe(EnvironmentState.Enqueued);
            expect(environment.stateReason).toBeNull();
        });
    });

    describe("#startDeletion", () => {
        test("should move to deleting and be idempotent", () => {
            const environment = makeEnvironment();

            environment.startDeletion();
            environment.startDeletion();

            expect(environment.state).toBe(EnvironmentState.Deleting);
        });

        test("should read as DELETING while fresh and DELETED once stale", () => {
            const environment = makeEnvironment();
            const registeredAt = new Date(0);
            environment.claim();
            environment.register(new EnvironmentEndpoint("http://host:4444"), registeredAt);
            environment.startDeletion();

            expect(environment.effectiveStatus(registeredAt, freshnessMs)).toBe(EnvironmentStatus.Deleting);

            const later = new Date(registeredAt.getTime() + freshnessMs + 1);

            expect(environment.effectiveStatus(later, freshnessMs)).toBe(EnvironmentStatus.Deleted);
        });

        test("should read as DELETED when it never had a heartbeat", () => {
            const environment = makeEnvironment();

            environment.startDeletion();

            expect(environment.effectiveStatus(new Date(), freshnessMs)).toBe(EnvironmentStatus.Deleted);
        });
    });
});
