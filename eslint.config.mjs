import eslint from "@eslint/js";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

export default defineConfig(
    {
        files: ["**/*.{ts,mjs,js}"],
        ignores: ["build/**"],
        extends: [
            eslint.configs.recommended,
            tseslint.configs.recommended,
        ],
        plugins: {
            import: importPlugin,
        },
        // TODO: rule for class properties order
        rules: {
            "indent": ["error", 4, { 
                "SwitchCase": 1, 
                "ignoredNodes": ["PropertyDefinition"], // FIXME: get rid of "PropertyDefinition" in "ignoredNodes"
            }],
            "no-tabs": "error",
            "keyword-spacing": "error",
            "curly": ["error", "all"],
            "array-bracket-spacing": ["error", "never"],
            "object-curly-spacing": ["error", "always"],
            "object-curly-newline": ["error", { multiline: true, consistent: true }],
            "comma-dangle": ["error", "always-multiline"],
            "quotes": ["error", "double"],
            "eol-last": ["error", "always"],
            "padding-line-between-statements": [
                "error",
                { "blankLine": "always", "prev": "*", "next": "return" },
            ],
            "max-len": ["error", { "code": 140 }],
            "@typescript-eslint/explicit-function-return-type": "error",
            "no-multiple-empty-lines": ["error", { "max": 1 }],
            "@typescript-eslint/naming-convention": [
                "error",
                {
                    selector: ["typeAlias", "interface", "class"],
                    format: ["StrictPascalCase"],
                    leadingUnderscore: "forbid",
                },
                {
                    selector: ["variable", "function"],
                    format: ["camelCase", "PascalCase"],
                    leadingUnderscore: "forbid",
                },
            ],
            "import/order": [
                "error", 
                { 
                    groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
                    alphabetize: {
                        order: "asc",
                        caseInsensitive: true,
                    },
                    "newlines-between": "always",
                },
            ],
        },
    },
    {
        files: ["**/*.json"],
        ignores: ["package-lock.json"],
        plugins: { json },
        language: "json/json",
        extends: [
            json.configs.recommended,
        ],
    },
);
