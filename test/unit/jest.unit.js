export default {
    moduleFileExtensions: ["js", "json", "ts"],
    rootDir: "../../",
    testEnvironment: "node",
    testRegex: ".test.ts$",
    transform: {
        "^.+\\.(t|j)s$": ["ts-jest"],
    },
    transformIgnorePatterns: [
        "node_modules/(?!(uuid/.*))",
    ],
};
