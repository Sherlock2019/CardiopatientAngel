import { expect, test } from "@playwright/test";

/**
 * End-to-end clinical workflow:
 * Command Center → select alarm → view patient → acknowledge alarm → verify status + audit record.
 */
test("nurse acknowledges an alarm from the Command Center and it is audited", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /RN A\. Moreau/ }).click();
  await expect(page.getByRole("heading", { name: "Nurse Command Center" })).toBeVisible();

  // Select the first unacknowledged alarm in the live queue.
  const ackButton = page.getByRole("button", { name: /^Acknowledge alarm \d+$/ }).first();
  await expect(ackButton).toBeVisible({ timeout: 15_000 });
  const alarmId = (await ackButton.getAttribute("aria-label"))!.match(/\d+/)![0];
  const row = page.locator("tr", { has: ackButton });
  const patientLink = row.getByRole("link").first();
  await patientLink.click();

  // Patient detail
  await expect(page.getByText("Vital-sign trends")).toBeVisible();
  const patientId = page.url().split("/").pop()!;
  const ack = page.getByRole("button", { name: `Acknowledge alarm ${alarmId}`, exact: true });
  await ack.click();
  const alarmRow = page.locator("tr", { has: page.getByRole("button", { name: "Review…" }) }).first();
  await expect(ack).toHaveCount(0);
  await expect(alarmRow).toBeVisible();

  // Verify server state and audit trail (audit log is visible to admin/doctor roles).
  const login = await request.post("/api/auth/login", { data: { username: "admin" } });
  const token = (await login.json()).access_token;
  const headers = { Authorization: `Bearer ${token}` };
  const alarms = await (await request.get(`/api/patients/${patientId}/alarms`, { headers })).json();
  const updated = alarms.items.find((a: { alarm_id: number }) => String(a.alarm_id) === alarmId);
  expect(updated.acknowledged_at).not.toBeNull();
  expect(updated.acknowledged_by).toBe("RN A. Moreau");

  const audit = await (await request.get(`/api/audit?resource_id=${alarmId}&action=acknowledge_alarm`, { headers })).json();
  expect(audit[0]).toMatchObject({ username: "nurse.moreau", role: "nurse", action: "acknowledge_alarm", resource_id: alarmId });
  const views = await (await request.get(`/api/audit?resource_id=${patientId}&action=view_patient_record`, { headers })).json();
  expect(views.some((v: { username: string }) => v.username === "nurse.moreau")).toBe(true);
});
