// Render the delivery-pack roadmap figure:  node e2e/shot-delivery.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
await page.goto("file://" + path.join(root, "docs/delivery/delivery-pack.html"));
await page.locator("figure").first().screenshot({ path: path.join(root, "docs/screenshots/delivery-roadmap.png") });
await page.screenshot({ path: path.join(root, "docs/screenshots/delivery-pack-top.png") });
await browser.close();
