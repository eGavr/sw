import { v4 as uuidv4 } from "uuid";

import { InvalidArgumentError } from "../error/invalid-argument-error";
import { User } from "../user/user";
import { UserPermissionName } from "../user/user-permission-name";

import { IamBinding } from "./iam/iam-binding";
import { IamPolicy } from "./iam/iam-policy";
import { Member } from "./iam/member";
import { RoleName } from "./iam/role";
import { Project, ProjectData } from "./project";

describe("Project", () => {
    const createDefaults = {
        name: "default",
        createdBy: User.create({ externalId: "alice", providerType: "local" }),
    };

    const projectData = (overrides: Partial<ProjectData> = {}): ProjectData => ({
        id: uuidv4(),
        name: "default",
        createdAt: new Date(0),
        createdBy: { id: uuidv4(), externalId: "alice", providerType: "local", createdAt: new Date(0), updatedAt: new Date(0) },
        updatedAt: new Date(0),
        bindings: [],
        ...overrides,
    });

    describe("#fromObject", () => {
        test("should throw InvalidArgumentError for an invalid id", () => {
            const fromObject = (): Project => Project.fromObject(projectData({ id: "not-uuid" }));

            expect(fromObject).toThrow(InvalidArgumentError);
            expect(fromObject).toThrow("project id: value must be a UUID");
        });

        test("should reconstitute the policy from bindings", () => {
            const project = Project.fromObject(projectData({ bindings: [{ role: "roles/viewer", members: ["user:bob"] }] }));

            expect(project.grants(Member.user("bob"), UserPermissionName.Environment.Read)).toBe(true);
            expect(project.grants(Member.user("bob"), UserPermissionName.Environment.Create)).toBe(false);
        });
    });

    describe("#create", () => {
        test("should throw InvalidArgumentError for an invalid name", () => {
            const createAccount = (): Project => Project.create({ ...createDefaults, name: "<invalid-name>" });

            expect(createAccount).toThrow(InvalidArgumentError);
            expect(createAccount).toThrow(/project name: value must match .+ regular expression/);
        });

        test("should throw InvalidArgumentError when name exceeds the limit", () => {
            const createAccount = (): Project => Project.create({ ...createDefaults, name: new Array(65).fill("a").join("") });

            expect(createAccount).toThrow(InvalidArgumentError);
            expect(createAccount).toThrow("project name: value must be shorter than or equal to 64 characters");
        });

        test("should grant the creator the admin role (every permission)", () => {
            const project = Project.create(createDefaults);
            const owner = Member.user("alice");

            expect(project.grants(owner, UserPermissionName.Environment.Create)).toBe(true);
            expect(project.grants(owner, UserPermissionName.Project.SetIamPolicy)).toBe(true);
        });
    });

    describe("#grants / #testPermissions", () => {
        test("should deny a non-member and report no held permissions", () => {
            const project = Project.create(createDefaults);
            const stranger = Member.user("mallory");

            expect(project.grants(stranger, UserPermissionName.Environment.Read)).toBe(false);
            expect(project.testPermissions(stranger, [UserPermissionName.Project.Read])).toEqual([]);
        });
    });

    describe("#setIamPolicy", () => {
        test("should replace the whole policy", () => {
            const project = Project.create(createDefaults);

            project.setIamPolicy(IamPolicy.fromBindings([IamBinding.create(RoleName.Developer, [Member.user("bob")])]));

            expect(project.grants(Member.user("alice"), UserPermissionName.Project.SetIamPolicy)).toBe(false);
            expect(project.grants(Member.user("bob"), UserPermissionName.Environment.Create)).toBe(true);
        });
    });

    describe(".id / .name getters", () => {
        test("should return the id and name", () => {
            const id = uuidv4();
            const project = Project.fromObject(projectData({ id, name: "team-a" }));

            expect(project.id).toBe(id);
            expect(project.name).toBe("team-a");
        });
    });
});
