import { defineConfig } from "@playwright/test";

// Expects the app running (docker compose up, or API on :8010 + `npm run dev`).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5180",
    viewport: { width: 1600, height: 1000 },
  },
});
