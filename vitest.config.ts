import { defineConfig } from "vitest/config";

// The Expo app in app/ runs its own tests with its own dependencies.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
