import { ProjectId } from "../project/project-id";

import { Application } from "./application/application";
import { ApplicationList } from "./application/application-list";
import { Environment } from "./environment";
import { EnvironmentEndpoint } from "./environment-endpoint";
import { EnvironmentOccupancy } from "./environment-occupancy";
import { EnvironmentState } from "./environment-state";
import { EnvironmentStateReason } from "./environment-state-reason";
import { EnvironmentStatus } from "./environment-status";
import {
    InvalidEnvironmentOccupancyTransitionError,
} from "./error/invalid-environment-occupancy-transition-error";
import { InvalidEnvironmentStateTransitionError } from "./error/invalid-environment-state-transition-error";
import { Platform } from "./platform/platform";

const freshnessMs = 6_000;

function makeEnvironment(): Environment {
    return Environment.create({
        projectId: ProjectId.create(),
        platform: Platform.fromObject({ name: "ubuntu", version: "6" }),
        applications: ApplicationList.create({ applications: [Application.create({ name: "chrome", version: "100" })] }),
    });
}

// enqueued -> starting -> preparing
function makePreparing(): Environment {
    const environment = makeEnvironment();
    environment.claim();
    environment.markDispatched();

    return environment;
}

function makeStuck(state: EnvironmentState, attempts: number): Environment {
    const id = ProjectId.create().getValue();

    return Environment.fromObject({
        id,
        projectId: ProjectId.create().getValue(),
        state,
        platform: { name: "ubuntu", version: "6", deviceModel: "desktop" },
        applications: [{ name: "chrome", version: "100" }],
        occupancy: EnvironmentOccupancy.Free,
        attempts,
        createdAt: new Date(0),
        updatedAt: new Date(0),
    });
}

// enqueued -> ... -> executing with a fresh agent heartbeat
function makeExecuting(): Environment {
    const environment = makePreparing();
    environment.register(new EnvironmentEndpoint("http://host:4444"), new Date());

    return environment;
}

describe("Environment", () => {
    describe(".create", () => {
        test("should start enqueued, free, without endpoint", () => {
            const environment = makeEnvironment();

            expect(environment.state).toBe(EnvironmentState.Enqueued);
            expect(environment.occupancy).toBe(EnvironmentOccupancy.Free);
            expect(environment.endpoint).toBeNull();
            expect(environment.effectiveStatus()).toBe(EnvironmentStatus.Enqueued);
        });
    });

    describe("#supports", () => {
        test("should support an application from its set", () => {
            const environment = makeEnvironment();

            expect(environment.supports(Application.create({ name: "chrome", version: "100" }))).toBe(true);
            expect(environment.supports(Application.create({ name: "firefox", version: "120" }))).toBe(false);
        });
    });

    describe("#shouldBeRunning", () => {
        test("should want a container only while starting/preparing/executing", () => {
            const environment = makeEnvironment();
            expect(environment.shouldBeRunning()).toBe(false); // enqueued

            environment.claim();
            expect(environment.shouldBeRunning()).toBe(true); // starting

            environment.markDispatched();
            expect(environment.shouldBeRunning()).toBe(true); // preparing

            environment.register(new EnvironmentEndpoint("http://host:4444"), new Date());
            expect(environment.shouldBeRunning()).toBe(true); // executing

            environment.startDeletion();
            expect(environment.shouldBeRunning()).toBe(false); // deleting
        });
    });

    describe("#claim", () => {
        test("should move enqueued to starting", () => {
            const environment = makeEnvironment();

            environment.claim();

            expect(environment.state).toBe(EnvironmentState.Starting);
        });

        test("should reject claiming twice", () => {
            const environment = makeEnvironment();
            environment.claim();

            expect(() => environment.claim()).toThrow(InvalidEnvironmentStateTransitionError);
        });
    });

    describe("#markDispatched", () => {
        test("should move starting to preparing once compute accepted", () => {
            const environment = makeEnvironment();
            environment.claim();

            environment.markDispatched();

            expect(environment.state).toBe(EnvironmentState.Preparing);
        });

        test("should reject dispatch before the environment was claimed", () => {
            const environment = makeEnvironment();

            expect(() => environment.markDispatched()).toThrow(InvalidEnvironmentStateTransitionError);
        });
    });

    describe("#register", () => {
        test("should activate a preparing environment with an endpoint and a heartbeat", () => {
            const environment = makePreparing();
            const now = new Date();

            environment.register(new EnvironmentEndpoint("http://host:4444"), now);

            expect(environment.state).toBe(EnvironmentState.Executing);
            expect(environment.endpoint).toBe("http://host:4444");
            expect(environment.effectiveStatus()).toBe(EnvironmentStatus.Active);
        });

        test("should report UNHEALTHY once the heartbeat goes stale", () => {
            const environment = makePreparing();
            const staleRegisteredAt = new Date(Date.now() - freshnessMs - 1_000);
            environment.register(new EnvironmentEndpoint("http://host:4444"), staleRegisteredAt);

            expect(environment.effectiveStatus()).toBe(EnvironmentStatus.Unhealthy);
        });

        test("should reject registering an environment that was not preparing", () => {
            const environment = makeEnvironment();

            expect(() => environment.register(new EnvironmentEndpoint("http://host:4444"), new Date())).toThrow(
                InvalidEnvironmentStateTransitionError,
            );
        });
    });

    describe("#heartbeat", () => {
        test("should record busy while executing", () => {
            const environment = makeExecuting();

            environment.heartbeat(true, new Date());

            expect(environment.occupancy).toBe(EnvironmentOccupancy.Busy);
        });

        test("isBusy is the word of a LIVE agent: true only while busy and fresh", () => {
            const environment = makeExecuting();
            environment.heartbeat(true, new Date());

            expect(environment.isBusy()).toBe(true);
        });

        test("isBusy is false for a free environment", () => {
            const environment = makeExecuting();
            environment.heartbeat(false, new Date());

            expect(environment.isBusy()).toBe(false);
        });

        test("isBusy is false once the heartbeat goes stale — a dead agent's busy does not count", () => {
            const environment = makeExecuting();
            environment.heartbeat(true, new Date(Date.now() - freshnessMs - 1_000));

            expect(environment.isBusy()).toBe(false);
            expect(environment.effectiveOccupancy()).toBe(EnvironmentOccupancy.Free);
        });

        test("busy=false does NOT clear a reservation — the agent cannot know about the session being created", () => {
            const environment = makeExecuting();
            environment.reserve(new Date());

            environment.heartbeat(false, new Date());

            expect(environment.occupancy).toBe(EnvironmentOccupancy.Reserved);
        });

        test("busy=true wins over a reservation — the agent saw the session land", () => {
            const environment = makeExecuting();
            environment.reserve(new Date());
            const now = new Date();

            environment.heartbeat(true, now);

            expect(environment.occupancy).toBe(EnvironmentOccupancy.Busy);
            expect(environment.occupancyLastConfirmedAt).toEqual(now);
        });

        test("busy=false at a reservation does NOT re-confirm it — a dead reserver's hold must go stale", () => {
            const environment = makeExecuting();
            const reservedAt = new Date(Date.now() - 3_000);
            environment.reserve(reservedAt);

            environment.heartbeat(false, new Date());

            expect(environment.occupancyLastConfirmedAt).toEqual(reservedAt);
        });

        test("should reject a heartbeat before the environment is executing", () => {
            const environment = makeEnvironment();

            expect(() => environment.heartbeat(true, new Date())).toThrow(InvalidEnvironmentStateTransitionError);
        });
    });

    describe("reservation protocol (#reserve / #occupy / #releaseReservation)", () => {
        test("reserve takes a live free executing environment and confirms the new occupancy", () => {
            const environment = makeExecuting();
            const now = new Date();

            environment.reserve(now);

            expect(environment.occupancy).toBe(EnvironmentOccupancy.Reserved);
            expect(environment.occupancyLastConfirmedAt).toEqual(now);
        });

        test("reserve loses the race against an existing reservation", () => {
            const environment = makeExecuting();
            environment.reserve(new Date());

            expect(() => environment.reserve(new Date())).toThrow(InvalidEnvironmentOccupancyTransitionError);
        });

        test("reserve refuses a busy environment", () => {
            const environment = makeExecuting();
            environment.heartbeat(true, new Date());

            expect(() => environment.reserve(new Date())).toThrow(InvalidEnvironmentOccupancyTransitionError);
        });

        test("reserve refuses an environment whose agent heartbeat went stale", () => {
            const environment = makePreparing();
            environment.register(new EnvironmentEndpoint("http://host:4444"), new Date(Date.now() - freshnessMs - 1_000));

            expect(() => environment.reserve(new Date())).toThrow(InvalidEnvironmentOccupancyTransitionError);
        });

        test("reserve refuses an environment that is not executing", () => {
            expect(() => makeEnvironment().reserve(new Date())).toThrow(InvalidEnvironmentOccupancyTransitionError);
        });

        test("occupy turns the reservation into busy without touching the agent's liveness word", () => {
            const environment = makePreparing();
            const registeredAt = new Date();
            environment.register(new EnvironmentEndpoint("http://host:4444"), registeredAt);
            environment.reserve(new Date());

            environment.occupy();

            expect(environment.occupancy).toBe(EnvironmentOccupancy.Busy);
            expect(environment.lastHeartbeatAt).toEqual(registeredAt);
        });

        test("occupy without a reservation is rejected — the protocol starts with reserve", () => {
            expect(() => makeExecuting().occupy()).toThrow(InvalidEnvironmentOccupancyTransitionError);
        });

        test("occupy is idempotent when the agent's busy heartbeat arrived first — both words mean success", () => {
            const environment = makeExecuting();
            environment.reserve(new Date());
            environment.heartbeat(true, new Date());

            environment.occupy();

            expect(environment.occupancy).toBe(EnvironmentOccupancy.Busy);
        });

        test("releaseReservation returns the environment to the pool", () => {
            const environment = makeExecuting();
            environment.reserve(new Date());

            environment.releaseReservation();

            expect(environment.occupancy).toBe(EnvironmentOccupancy.Free);
        });

        test("releaseReservation is idempotent for an already-free environment", () => {
            const environment = makeExecuting();

            environment.releaseReservation();

            expect(environment.occupancy).toBe(EnvironmentOccupancy.Free);
        });

        test("releaseReservation refuses a busy environment — the session is real", () => {
            const environment = makeExecuting();
            environment.heartbeat(true, new Date());

            expect(() => environment.releaseReservation()).toThrow(InvalidEnvironmentOccupancyTransitionError);
        });

        test("confirmReservation refreshes the reserver's liveness word", () => {
            const environment = makeExecuting();
            environment.reserve(new Date(Date.now() - 3_000));
            const now = new Date();

            environment.confirmReservation(now);

            expect(environment.occupancyLastConfirmedAt).toEqual(now);
        });

        test("confirmReservation is rejected once the reservation is gone", () => {
            const environment = makeExecuting();

            expect(() => environment.confirmReservation(new Date())).toThrow(
                InvalidEnvironmentOccupancyTransitionError,
            );
        });

        test("a reservation reads as reserved — not takeable is the honest answer until the sweep frees it", () => {
            const environment = makeExecuting();
            environment.reserve(new Date());

            expect(environment.effectiveOccupancy()).toBe(EnvironmentOccupancy.Reserved);
            expect(environment.isBusy()).toBe(false);
        });
    });

    describe("#failProvisioning", () => {
        test("should fail from starting with a reason", () => {
            const environment = makeEnvironment();
            environment.claim();

            environment.failProvisioning(EnvironmentStateReason.PermissionDenied);

            expect(environment.state).toBe(EnvironmentState.Failed);
            expect(environment.stateReason).toBe(EnvironmentStateReason.PermissionDenied);
            expect(environment.effectiveStatus()).toBe(EnvironmentStatus.Failed);
        });

        test("should fail from preparing", () => {
            const environment = makePreparing();

            environment.failProvisioning(EnvironmentStateReason.ProviderError);

            expect(environment.state).toBe(EnvironmentState.Failed);
        });
    });

    describe("#retryProvisioning", () => {
        test("should return a provisioning environment to the queue and clear the reason", () => {
            const environment = makePreparing();

            environment.retryProvisioning();

            expect(environment.state).toBe(EnvironmentState.Enqueued);
            expect(environment.stateReason).toBeNull();
        });
    });

    describe("#reclaimStuck", () => {
        test("should return a starting environment to the queue while within the retry budget", () => {
            const environment = makeStuck(EnvironmentState.Starting, 1);

            environment.reclaimStuck(3);

            expect(environment.state).toBe(EnvironmentState.Enqueued);
            expect(environment.stateReason).toBeNull();
        });

        test("should return a preparing environment to the queue while within the retry budget", () => {
            const environment = makeStuck(EnvironmentState.Preparing, 2);

            environment.reclaimStuck(3);

            expect(environment.state).toBe(EnvironmentState.Enqueued);
        });

        test("should fail once the retry budget is spent, with a timeout reason", () => {
            const environment = makeStuck(EnvironmentState.Starting, 3);

            environment.reclaimStuck(3);

            expect(environment.state).toBe(EnvironmentState.Failed);
            expect(environment.stateReason).toBe(EnvironmentStateReason.ProvisioningTimeout);
        });

        test("should reject reclaiming an environment that is not provisioning", () => {
            const environment = makeStuck(EnvironmentState.Enqueued, 0);

            expect(() => environment.reclaimStuck(3)).toThrow(InvalidEnvironmentStateTransitionError);
        });
    });

    describe("#reclaimCrashed", () => {
        test("should move an executing environment to deleting", () => {
            const environment = makePreparing();
            environment.register(new EnvironmentEndpoint("http://host:4444"), new Date());

            environment.reclaimCrashed();

            expect(environment.state).toBe(EnvironmentState.Deleting);
        });

        test("should reject reclaiming an environment that is not executing", () => {
            const environment = makePreparing();

            expect(() => environment.reclaimCrashed()).toThrow(InvalidEnvironmentStateTransitionError);
        });
    });

    describe("#startDeletion", () => {
        test("should move to deleting and be idempotent", () => {
            const environment = makeEnvironment();

            environment.startDeletion();
            environment.startDeletion();

            expect(environment.state).toBe(EnvironmentState.Deleting);
        });

        test("should read as DELETING while the heartbeat is fresh", () => {
            const environment = makePreparing();
            environment.register(new EnvironmentEndpoint("http://host:4444"), new Date());
            environment.startDeletion();

            expect(environment.effectiveStatus()).toBe(EnvironmentStatus.Deleting);
        });

        test("should read as DELETED once the heartbeat goes stale", () => {
            const environment = makePreparing();
            environment.register(new EnvironmentEndpoint("http://host:4444"), new Date(Date.now() - freshnessMs - 1_000));
            environment.startDeletion();

            expect(environment.effectiveStatus()).toBe(EnvironmentStatus.Deleted);
        });

        test("should read as DELETED when it never had a heartbeat", () => {
            const environment = makeEnvironment();

            environment.startDeletion();

            expect(environment.effectiveStatus()).toBe(EnvironmentStatus.Deleted);
        });
    });
});
