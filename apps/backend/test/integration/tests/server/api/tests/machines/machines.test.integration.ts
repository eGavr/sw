import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { InternalModule } from "../../../../../../../src/presentation/http/internal/internal-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };

// A machine agent's fact sheet, as the installer and the agent report it.
const facts = {
    cores: 8,
    memoryMb: 16384,
    virtualization: "hvf",
    emulator: true,
    avds: ["sw-android-14"],
    docker: true,
    vncStack: true,
    agentVersion: "1",
    address: "10.0.0.9",
};

// The self-hosted cloud end to end through the public API and the machine protocol: attach a machine,
// spend its registration token, sync, get leased by an environment, be refused for a second one when
// the inventory is spent (429, not an asynchronous `failed`), and leave gracefully.
describe("/projects/:project/cloudAccounts/:cloudAccount/machines", () => {
    let api: TestingApp;
    let internal: TestingApp;

    beforeEach(async () => {
        process.env.MACHINE_POOL_SLOTS_PER_MACHINE = "1";
        process.env.CLOUD_CATALOG = "local,self-hosted";
        api = await TestingApp.create(ApiModule);
        internal = await TestingApp.create(InternalModule);
    });

    afterEach(async () => {
        delete process.env.MACHINE_POOL_SLOTS_PER_MACHINE;
        delete process.env.CLOUD_CATALOG;
        await api.close();
        await internal.close();
    });

    const seedProject = async (): Promise<{ owner: AuthHeader; uid: string }> => {
        const owner = Authorization.forUser(UserFactory.createId());
        const { body } = await request(api.getHttpServer())
            .post("/projects").set(owner).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);

        return { owner, uid: body.uid };
    };

    // A self-hosted cloud bound to android/emulator with room for `maxEnvironments` environments.
    const seedSelfHostedCloud = async (
        owner: AuthHeader,
        project: string,
        maxEnvironments = 2,
    ): Promise<{ account: string; machines: string }> => {
        const account = (await request(api.getHttpServer())
            .post(`/projects/${project}/cloudAccounts`).set(owner).send({ type: "self-hosted" })
            .expect(HttpStatus.CREATED)).body.uid;

        await request(api.getHttpServer())
            .post(`/projects/${project}/cloudAccounts/${account}/computeBindings`).set(owner)
            .send({ platform: "android", execution: "emulator", kind: "baremetal", config: { maxEnvironments } })
            .expect(HttpStatus.CREATED);

        return { account, machines: `/projects/${project}/cloudAccounts/${account}/machines` };
    };

    const attach = (owner: AuthHeader, machines: string, fqdn: string): request.Test =>
        request(api.getHttpServer()).post(machines).set(owner).send({ fqdn, slotCapacity: 1 });

    // The install command's work, done by hand: spend the registration token, then sync as the agent.
    const registerAndSync = async (
        owner: AuthHeader,
        machines: string,
        machineId: string,
    ): Promise<{ token: string; sync: () => request.Test }> => {
        const grant = (await request(api.getHttpServer())
            .post(`${machines}/${machineId}:generateRegistrationToken`).set(owner).expect(HttpStatus.OK)).body;

        expect(grant.installCommand).toContain(`SW_MACHINE_ID="${machineId}"`);
        expect(grant.installCommand).toContain(`SW_REGISTRATION_TOKEN="${grant.registrationToken}"`);

        const registration = (await request(internal.getHttpServer())
            .post(`/internal/machines/${machineId}:register`)
            .send({ registrationToken: grant.registrationToken, facts })
            .expect(HttpStatus.OK)).body;
        const token = registration.machineToken as string;
        const sync = (): request.Test => request(internal.getHttpServer())
            .post(`/internal/machines/${machineId}:sync`)
            .set({ authorization: `Bearer ${token}` })
            .send({ facts, slots: [] });

        await sync().expect(HttpStatus.OK);

        return { token, sync };
    };

    const createEnvironment = (owner: AuthHeader, project: string): request.Test =>
        request(api.getHttpServer()).post(`/projects/${project}/environments`).set(owner).send({
            platform: { name: "android", version: "13", deviceModel: "pixel-7" },
            execution: "emulator",
            applications: [{ nameAlias: "settings", versionAlias: "13" }],
        });

    test("attaches a machine pending its agent, providing every bound platform by default", async () => {
        const { owner, uid } = await seedProject();
        const { machines } = await seedSelfHostedCloud(owner, uid);

        const machine = (await attach(owner, machines, "box-1.lab").expect(HttpStatus.CREATED)).body;

        expect(machine).toMatchObject({
            name: expect.stringMatching(/\/machines\/[0-9a-f-]{36}$/),
            fqdn: "box-1.lab",
            origin: "attached",
            provides: [{ platform: "android", execution: "emulator" }],
            state: "pending",
            admission: "open",
            ready: false,
            conditions: [],
            facts: null,
            slotCapacity: 1,
            lease: null,
        });

        const listed = (await request(api.getHttpServer()).get(machines).set(owner).expect(HttpStatus.OK)).body;
        expect(listed.machines.map((item: { uid: string }) => item.uid)).toEqual([machine.uid]);
    });

    test("refuses a machine on a cloud that is not self-hosted, or serving an unbound platform", async () => {
        const { owner, uid } = await seedProject();
        const local = (await request(api.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts`).set(owner).send({ type: "local" })
            .expect(HttpStatus.CREATED)).body.uid;

        await request(api.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${local}/machines`).set(owner).send({ fqdn: "box.lab" })
            .expect(HttpStatus.BAD_REQUEST);

        const { machines } = await seedSelfHostedCloud(owner, uid);

        await request(api.getHttpServer()).post(machines).set(owner)
            .send({ fqdn: "box.lab", provides: [{ platform: "ubuntu", execution: "container" }] })
            .expect(HttpStatus.BAD_REQUEST);
    });

    // A box is not bought for one substrate: what it serves is the operator's declaration, editable
    // without detaching (which would mean reinstalling the agent), and still bounded by what the cloud
    // binds.
    test("what a machine serves is editable in place, within the platforms the cloud binds", async () => {
        const { owner, uid } = await seedProject();
        const { account, machines } = await seedSelfHostedCloud(owner, uid);
        const machine = (await attach(owner, machines, "box-1.lab").expect(HttpStatus.CREATED)).body;

        expect(machine.provides).toEqual([{ platform: "android", execution: "emulator" }]);

        await request(api.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${account}/computeBindings`).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "baremetal", config: { maxEnvironments: 2 } })
            .expect(HttpStatus.CREATED);

        const updated = (await request(api.getHttpServer())
            .patch(`${machines}/${machine.uid}`).set(owner)
            .send({ provides: [{ platform: "android", execution: "emulator" }, { platform: "ubuntu", execution: "container" }] })
            .expect(HttpStatus.OK)).body;

        expect(updated.provides).toEqual([
            { platform: "android", execution: "emulator" },
            { platform: "ubuntu", execution: "container" },
        ]);

        await request(api.getHttpServer()).patch(`${machines}/${machine.uid}`).set(owner)
            .send({ provides: [{ platform: "windows", execution: "container" }] })
            .expect(HttpStatus.BAD_REQUEST);
        await request(api.getHttpServer()).patch(`${machines}/${machine.uid}`).set(owner)
            .send({ provides: [] })
            .expect(HttpStatus.BAD_REQUEST);
    });

    test("registration spends the token once and brings the machine online with its facts judged", async () => {
        const { owner, uid } = await seedProject();
        const { machines } = await seedSelfHostedCloud(owner, uid);
        const machineId = (await attach(owner, machines, "box-1.lab").expect(HttpStatus.CREATED)).body.uid;
        const grant = (await request(api.getHttpServer())
            .post(`${machines}/${machineId}:generateRegistrationToken`).set(owner).expect(HttpStatus.OK)).body;

        await request(internal.getHttpServer())
            .post(`/internal/machines/${machineId}:register`)
            .send({ registrationToken: "not-the-token", facts })
            .expect(HttpStatus.UNAUTHORIZED);

        await request(internal.getHttpServer())
            .post(`/internal/machines/${machineId}:register`)
            .send({ registrationToken: grant.registrationToken, facts: { ...facts, virtualization: "none" } })
            .expect(HttpStatus.OK);

        // Spent: the same token buys nothing twice.
        await request(internal.getHttpServer())
            .post(`/internal/machines/${machineId}:register`)
            .send({ registrationToken: grant.registrationToken, facts })
            .expect(HttpStatus.UNAUTHORIZED);

        const machine = (await request(api.getHttpServer())
            .get(`${machines}/${machineId}`).set(owner).expect(HttpStatus.OK)).body;

        expect(machine).toMatchObject({
            state: "online",
            ready: false,
            slotCapacity: 1,
            conditions: [{ type: "VirtualizationMissing", blocking: true }],
            facts: { cores: 8, virtualization: "none" },
        });
    });

    test("a ready machine gets leased by an environment; a spent inventory answers 429", async () => {
        const { owner, uid } = await seedProject();
        const { machines } = await seedSelfHostedCloud(owner, uid);

        // No machine at all: the pool has nowhere to seat anything — refused right at create time.
        await createEnvironment(owner, uid).expect(HttpStatus.TOO_MANY_REQUESTS);

        const machineId = (await attach(owner, machines, "box-1.lab").expect(HttpStatus.CREATED)).body.uid;
        const { sync } = await registerAndSync(owner, machines, machineId);

        const environment = (await createEnvironment(owner, uid).expect(HttpStatus.CREATED)).body;
        // One slot per machine, one machine: the next environment has nowhere to go.
        await createEnvironment(owner, uid).expect(HttpStatus.TOO_MANY_REQUESTS);

        const leased = (await request(api.getHttpServer())
            .get(`${machines}/${machineId}`).set(owner).expect(HttpStatus.OK)).body;
        expect(leased.lease).toBeNull(); // seated, but the worker has not provisioned the lease's machine yet

        // The sync is what the environment's slot rides on once the worker provisions: until then the
        // machine has no lease and the answer is empty.
        const answer = (await sync().expect(HttpStatus.OK)).body;
        expect(answer.assignments).toEqual([]);

        expect(environment.uid).toBeDefined();
    });

    // The inventory is the ACCOUNT's, not one binding's: a machine already spoken for by an environment
    // of another platform is gone from everyone's headroom, so the second platform is refused at create
    // instead of being told yes and failing at provisioning.
    test("two platforms on one cloud draw from the same machines: the second is refused, not queued", async () => {
        const { owner, uid } = await seedProject();
        const { account, machines } = await seedSelfHostedCloud(owner, uid);

        await request(api.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${account}/computeBindings`).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "baremetal", config: { maxEnvironments: 2 } })
            .expect(HttpStatus.CREATED);

        const machineId = (await attach(owner, machines, "box-1.lab").expect(HttpStatus.CREATED)).body.uid;

        await request(api.getHttpServer()).patch(`${machines}/${machineId}`).set(owner)
            .send({ provides: [{ platform: "android", execution: "emulator" }, { platform: "ubuntu", execution: "container" }] })
            .expect(HttpStatus.OK);
        await registerAndSync(owner, machines, machineId);

        // The emulator platform takes the only machine...
        await createEnvironment(owner, uid).expect(HttpStatus.CREATED);

        // ...so the browser platform has none left, even though the machine serves it too.
        await request(api.getHttpServer()).post(`/projects/${uid}/environments`).set(owner).send({
            platform: { name: "ubuntu", version: "24.04", deviceModel: "desktop" },
            execution: "container",
            applications: [{ nameAlias: "chrome", versionAlias: "126" }],
        }).expect(HttpStatus.TOO_MANY_REQUESTS);
    });

    // A platform may be served by several clouds of one project. Which one runs an environment is said in
    // the request — nothing is placed behind the caller's back — so with two clouds bound, a create that
    // names none is refused and told what there is to choose from.
    const seedTwoClouds = async (): Promise<{ owner: AuthHeader; uid: string; machines: string; primary: string; fallback: string }> => {
        const { owner, uid } = await seedProject();
        const account = (await request(api.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts`).set(owner).send({ type: "self-hosted" })
            .expect(HttpStatus.CREATED)).body.uid;
        await request(api.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${account}/computeBindings`).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "baremetal", config: { maxEnvironments: 4 } })
            .expect(HttpStatus.CREATED);

        const machines = `/projects/${uid}/cloudAccounts/${account}/machines`;
        const machineId = (await attach(owner, machines, "box-1.lab").expect(HttpStatus.CREATED)).body.uid;
        await registerAndSync(owner, machines, machineId);

        const local = (await request(api.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts`).set(owner).send({ type: "local" })
            .expect(HttpStatus.CREATED)).body.uid;
        await request(api.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${local}/computeBindings`).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "docker", config: { maxEnvironments: 4 } })
            .expect(HttpStatus.CREATED);

        return { owner, uid, machines, primary: account, fallback: local };
    };

    const createBrowser = (owner: AuthHeader, project: string, cloudAccount?: string): request.Test =>
        request(api.getHttpServer()).post(`/projects/${project}/environments`).set(owner).send({
            platform: { name: "ubuntu", version: "24.04", deviceModel: "desktop" },
            execution: "container",
            applications: [{ nameAlias: "chrome", versionAlias: "126" }],
            ...(cloudAccount ? { cloudAccount } : {}),
        });

    test("with two clouds serving a platform, a create that names none is refused and lists them", async () => {
        const { owner, uid, primary, fallback } = await seedTwoClouds();

        const { body } = await createBrowser(owner, uid).expect(HttpStatus.BAD_REQUEST);

        expect(body.error.message).toContain(primary);
        expect(body.error.message).toContain(fallback);
    });

    test("an environment runs on the cloud it named, and a full one is refused rather than moved", async () => {
        const { owner, uid, primary, fallback } = await seedTwoClouds();

        const onDocker = (await createBrowser(owner, uid, fallback).expect(HttpStatus.CREATED)).body;
        expect(onDocker.cloudType).toBe("local");

        // The machine is still free, but the caller asked for the docker cloud and got it — no drift.
        const onMachines = (await createBrowser(owner, uid, primary).expect(HttpStatus.CREATED)).body;
        expect(onMachines.cloudType).toBe("self-hosted");

        // Its one slot is now taken, and the request is refused instead of quietly moving to the cloud
        // that still has room.
        await createBrowser(owner, uid, primary).expect(HttpStatus.TOO_MANY_REQUESTS);
    });

    test("naming a cloud that does not serve the platform is refused as a bad argument", async () => {
        const { owner, uid } = await seedProject();
        const { account } = await seedSelfHostedCloud(owner, uid);

        // That cloud runs android emulators here, not browsers.
        await createBrowser(owner, uid, account).expect(HttpStatus.BAD_REQUEST);
    });

    test("cordon closes the door, uncordon reopens it, drain of a free machine detaches it", async () => {
        const { owner, uid } = await seedProject();
        const { machines } = await seedSelfHostedCloud(owner, uid);
        const machineId = (await attach(owner, machines, "box-1.lab").expect(HttpStatus.CREATED)).body.uid;
        await registerAndSync(owner, machines, machineId);

        const cordoned = (await request(api.getHttpServer())
            .post(`${machines}/${machineId}:cordon`).set(owner).expect(HttpStatus.OK)).body;
        expect(cordoned).toMatchObject({ admission: "cordoned", ready: false });
        await createEnvironment(owner, uid).expect(HttpStatus.TOO_MANY_REQUESTS);

        const reopened = (await request(api.getHttpServer())
            .post(`${machines}/${machineId}:uncordon`).set(owner).expect(HttpStatus.OK)).body;
        expect(reopened).toMatchObject({ admission: "open", ready: true });

        await request(api.getHttpServer()).post(`${machines}/${machineId}:drain`).set(owner).expect(HttpStatus.OK);
        await request(api.getHttpServer()).get(`${machines}/${machineId}`).set(owner).expect(HttpStatus.NOT_FOUND);
    });

    test("detach removes the machine; its agent's next sync is a 404, its token is worthless", async () => {
        const { owner, uid } = await seedProject();
        const { machines } = await seedSelfHostedCloud(owner, uid);
        const machineId = (await attach(owner, machines, "box-1.lab").expect(HttpStatus.CREATED)).body.uid;
        const { sync } = await registerAndSync(owner, machines, machineId);

        await request(api.getHttpServer()).delete(`${machines}/${machineId}`).set(owner).expect(HttpStatus.NO_CONTENT);
        await sync().expect(HttpStatus.NOT_FOUND);
    });

    test("a stranger to the project is refused outright", async () => {
        const { owner, uid } = await seedProject();
        const { machines } = await seedSelfHostedCloud(owner, uid);
        const machineId = (await attach(owner, machines, "box-1.lab").expect(HttpStatus.CREATED)).body.uid;
        const stranger = await seedProject();

        await request(api.getHttpServer()).get(`${machines}/${machineId}`).set(stranger.owner).expect(HttpStatus.FORBIDDEN);
    });
});
