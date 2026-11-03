import { expect, test } from "@playwright/test";

const MOBILE = process.env.MOBILE_URL ?? "http://localhost:8081";

/** Patient app (React Native web build): sign in, view trends, submit a daily check-in; the care team sees it. */
test("patient submits a daily check-in that the care team can see", async ({ page, request }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto(MOBILE);
  await page.getByRole("button", { name: "Sign in as demo patient" }).click();
  await expect(page.getByText(/^Hello, /)).toBeVisible();
  await expect(page.getByText("Latest readings")).toBeVisible();
  if (process.env.SCREENSHOTS) await page.screenshot({ path: "../docs/screenshots/15-mobile-today.png", fullPage: true });

  await page.getByRole("tab", { name: "Trends" }).click();
  await expect(page.getByText("Last 7 days")).toBeVisible();

  await page.getByRole("tab", { name: "Check-in" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Palpitations", exact: true }).click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByRole("button", { name: "Send check-in" }).click();
  await expect(page.getByText(/Your care team can see this check-in/)).toBeVisible();
  if (process.env.SCREENSHOTS) await page.screenshot({ path: "../docs/screenshots/16-mobile-checkin.png", fullPage: true });

  // The doctor sees it in Patient 360
  const api = process.env.API_URL ?? "http://localhost:8010";
  const pat = await (await request.post(`${api}/api/auth/login`, { data: { username: "patient.demo" } })).json();
  const doc = await (await request.post(`${api}/api/auth/login`, { data: { username: "dr.chen" } })).json();
  const detail = await (await request.get(`${api}/api/patients/${pat.user.patient_id}`, { headers: { Authorization: `Bearer ${doc.access_token}` } })).json();
  expect(detail.checkins[0].symptoms).toContain("Palpitations");
  expect(detail.checkins[0].source).toBe("mobile");
});
