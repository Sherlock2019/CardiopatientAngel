import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Devices from "../pages/Devices";
import { USER, mockFetch, renderPage } from "./utils";

const META = {
  care_units: ["Remote Monitoring"], device_types: ["ECG patch", "Biosensor ring"],
  device_info: { "ECG patch": { model: "EP-7", connectivity: "BLE", signals: ["heart_rate"], alarms: [], offline_after_min: 60 } },
};
const FLEET = {
  total: 2, summary: { online: 1, offline: 1, low_battery: 0 },
  by_type: [{ device_type: "ECG patch", total: 2, online: 1, offline: 1, low_battery: 0, firmware: { "1.5.0": 2 } }],
  items: [
    { device_id: "ECG-0007", device_type: "ECG patch", model: "EP-7", firmware_version: "1.5.0", connectivity: "BLE", battery_pct: 64,
      last_sync_at: new Date(Date.now() - 3 * 3600_000).toISOString(), minutes_since_sync: 180, offline_after_min: 60, health: "offline",
      patient_id: "P00007", synthetic_name: "Wren Kaur", care_unit: "Remote Monitoring", signals: ["heart_rate"], wearable: true },
    { device_id: "ECG-0008", device_type: "ECG patch", model: "EP-7", firmware_version: "1.5.0", connectivity: "BLE", battery_pct: 90,
      last_sync_at: new Date().toISOString(), minutes_since_sync: 1, offline_after_min: 60, health: "online",
      patient_id: "P00008", synthetic_name: "Lee Sato", care_unit: "Remote Monitoring", signals: ["heart_rate"], wearable: true },
  ],
};
const EVENTS = { pending: 1, target: "virtual-care-platform", items: [
  { event_id: 3, event_type: "consult.requested", occurred_at: new Date().toISOString(), payload: { alarm_id: 9, patient_id: "P00007", urgency: "urgent" }, status: "pending", delivered_at: null },
] };

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it("shows fleet health, the device list and the integration outbox", async () => {
  const spy = mockFetch({ "/api/auth/me": USER, "/api/meta": META, "/api/devices": FLEET, "/api/integration/events": EVENTS, "/api/device-profiles": [] });
  renderPage(<Devices />);
  expect(await screen.findByText("ECG-0007")).toBeInTheDocument();
  expect(screen.getByText("Offline", { selector: "span" })).toBeInTheDocument(); // health is text + icon, not colour alone
  expect(screen.getByLabelText("Battery 64%")).toBeInTheDocument();
  expect(await screen.findByText("consult.requested")).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Health"), "offline");
  await waitFor(() => expect(spy.mock.calls.some(([u]) => String(u).includes("health=offline"))).toBe(true));
});
