export default {
    moduleFileExtensions: ["js", "json", "ts"],
    rootDir: ".",
    testEnvironment: "node",
    testRegex: ".test.integration.ts$",
    transform: {
        "^.+\\.(t|j)s$": ["ts-jest"],
    },
    transformIgnorePatterns: [
        "node_modules/(?!(uuid/.*))",
    ],
    setupFilesAfterEnv: [
        "./setup/index.ts",
    ],
};
