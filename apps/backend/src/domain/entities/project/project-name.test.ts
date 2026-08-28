import { InvalidArgumentError } from "../error/invalid-argument-error";

import { ProjectName } from "./project-name";

describe("ProjectName", () => {
    describe(".constructor", () => {
        test("accepts free text: spaces, unicode, punctuation", () => {
            expect(new ProjectName("Alice demo").getValue()).toBe("Alice demo");
            expect(new ProjectName("какое-то название").getValue()).toBe("какое-то название");
            expect(new ProjectName("R&D (browsers)!").getValue()).toBe("R&D (browsers)!");
        });

        test("should throw when the name is blank", () => {
            expect(() => new ProjectName("")).toThrow(InvalidArgumentError);
            expect(() => new ProjectName("   ")).toThrow("project name: value must not be blank");
        });

        test("should throw when the name is longer than the limit", () => {
            const tooLong = (): ProjectName => new ProjectName(new Array(65).fill("w").join(""));

            expect(tooLong).toThrow(InvalidArgumentError);
            expect(tooLong).toThrow("project name: value must be shorter than or equal to 64 characters");
        });
    });

    describe(".getValue", () => {
        test("should return project name", () => {
            const name = "AwEsOmE-project-NAME-100500";
            const projectName = new ProjectName(name);

            expect(projectName.getValue()).toBe(name);
        });
    });
});
