import { test } from "@playwright/test";

// Reproducible screenshots:  SCREENSHOTS=1 npx playwright test screenshots
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture docs/screenshots");

const PAGES = [
  ["/", "01-command-center"],
  ["/alarms", "02-live-alarms"],
  ["/patients", "03-patients"],
  ["/analytics", "05-risk-analytics"],
  ["/cohorts", "06-cohort-explorer"],
  ["/staffing", "07-staffing"],
  ["/simulator", "08-simulator"],
  ["/settings", "09-settings"],
];

test("capture screenshots", async ({ page }) => {
  // The main panel scrolls internally, so use a tall viewport to capture whole pages.
  await page.setViewportSize({ width: 1600, height: 3200 });
  await page.goto("/");
  await page.getByRole("button", { name: /Dr\. R\. Chen/ }).click();
  for (const [path, name] of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `../docs/screenshots/${name}.png`, fullPage: true });
  }
  await page.goto("/patients/P00119");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "../docs/screenshots/04-patient-detail.png", fullPage: true });
});
