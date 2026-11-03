// Render docs/architecture.html figures to PNG:  node e2e/shot-architecture.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
await page.goto("file://" + path.join(root, "docs/architecture.html"));
const figures = page.locator("figure");
const names = ["ecosystem", "integration", "aws", "pipeline"];
for (let i = 0; i < (await figures.count()); i++) {
  await figures.nth(i).screenshot({ path: path.join(root, `docs/screenshots/arch-${i + 1}-${names[i] ?? "figure"}.png`) });
}
await browser.close();
