import { InvalidArgumentError } from "../error/invalid-argument-error";

import { ProjectName } from "./project-name";

describe("ProjectName", () => {
    describe(".constructor", () => {
        test("should throw when project name contains special symbols", () => {
            const nameWithSpecialSymbols = (): ProjectName => new ProjectName("???");

            expect(nameWithSpecialSymbols).toThrow(InvalidArgumentError);
            expect(nameWithSpecialSymbols).toThrow(/project name: value must match .+ regular expression/);
        });

        test("should throw when project name contains non-latin symbols", () => {
            const nameWithSpecialSymbols = (): ProjectName => new ProjectName("какое-то название");

            expect(nameWithSpecialSymbols).toThrow(InvalidArgumentError);
            expect(nameWithSpecialSymbols).toThrow(/project name: value must match .+ regular expression/);
        });

        test("should throw when project name is longer than the limit values", () => {
            const nameWithSpecialSymbols = (): ProjectName => new ProjectName(new Array(65).fill("w").join(""));

            expect(nameWithSpecialSymbols).toThrow(InvalidArgumentError);
            expect(nameWithSpecialSymbols).toThrow("project name: value must be shorter than or equal to 64 characters");
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
