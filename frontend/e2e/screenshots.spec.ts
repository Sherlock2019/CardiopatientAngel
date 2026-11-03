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
  ["/devices", "07b-devices"],
  ["/simulator", "08-simulator"],
  ["/settings", "09-settings"],
];

test("capture screenshots", async ({ page }) => {
  test.setTimeout(240_000);
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

  // Engineering leadership experience, as the engineering lead
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: /Engineering Lead/ }).click();
  await page.getByRole("heading", { name: "Engineering Hub" }).waitFor();
  for (const [path, name] of [["/engineering#team", "10-eng-hub-team"], ["/engineering#quality", "11-eng-hub-quality"],
    ["/engineering#operations", "12-eng-hub-operations"], ["/lifecycle", "13-lifecycle"]]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `../docs/screenshots/${name}.png`, fullPage: true });
  }
  await page.goto("/knowledge?id=INC-2026-014");
  await page.getByRole("button", { name: "How did we resolve duplicated cardiac monitoring alarms?" }).click();
  await page.getByText(/confidence:/).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "../docs/screenshots/14-knowledge-hub.png", fullPage: true });
});
