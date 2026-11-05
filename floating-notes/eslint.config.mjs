import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
import { defineConfig } from "eslint/config";
export default defineConfig([
    {
        ignores: [
            "node_modules/**",
            "build/**",
            "dist/**",
            "output/**",
            "raycast-extension/**",
            "legacy/**",
        ],
    },
    {
        files: ["**/*.{ts,js,mjs,cjs}"],
        extends: [js.configs.recommended, ts.configs.recommended],
        languageOptions: { globals: { ...globals.browser, ...globals.node } },
    },
]);
