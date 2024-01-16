/// <reference types="vitest" />

import { defineConfig } from "vitest/config";

// Vitest Configuration (https://vitest.dev/config/)
export default defineConfig({
    test: {
        globals: true,
        include: ["tests/**/*.test.ts"],
    },
});
