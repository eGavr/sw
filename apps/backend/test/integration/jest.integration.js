export default {
    moduleFileExtensions: ["js", "json", "ts"],
    rootDir: ".",
    testEnvironment: "node",
    testRegex: ".test.integration.ts$",
    // All suites share one Postgres and TRUNCATE between cases, so they must run serially —
    // parallel workers would wipe each other's rows mid-test.
    maxWorkers: 1,
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
