# Adding a new health IoT product

CardioWatch is the cardiology app **and** a reusable monitoring pipeline. Ingestion, de-duplication, quality flags,
alarm rules, the alarm queue, fleet health, analytics, audit and integration events are shared. A new device
(a smart scale, a glucose meter, a fall pendant, a new ring generation) is added as **configuration plus an adapter**.

## 1. Add any new signals (`backend/app/domain.py` → `SIGNALS`)

```python
"body_weight": {"label": "Body weight", "ucum": "kg", "loinc": "29463-7", "range": (20, 350)},
```

- `ucum` and `loinc` become the FHIR `Observation.valueQuantity.code` and `Observation.code` when mapped.
- `range` is the plausibility check: values outside it are stored as `artifact` and never raise alarms.
- Add the display unit to `MEASUREMENT_UNITS` and the label to `frontend/src/lib/format.ts → MEAS_LABEL`.

## 2. Add the device profile (`DEVICE_TYPES` + `DEVICE_INFO`)

```python
DEVICE_TYPES["Smart scale"] = "SCL"
DEVICE_INFO["Smart scale"] = dict(
    model="SC-1", connectivity="Wi-Fi", firmware=["1.0.0"], battery=True,
    signals=["body_weight"],
    alarms=["Weight gain", "Signal loss", "Low battery"],   # only alarms this product can raise
    offline_after_min=1440,                                  # daily weigh-in: offline only after a day
)
```

The profile drives the fleet view (offline and battery health), the simulator, which alarms a device may raise,
the `/api/device-profiles` catalogue and the Devices page. Nothing else needs to change for those.

## 3. Add alarm rules (if the product needs new ones)

- **Threshold rule** on a signal: add a band to `THRESHOLD_BANDS` and the alarm to `ALARM_TYPES` / `ALARM_MEASUREMENT`.
- **Trend rule** (e.g. weight gain > 2 kg in 3 days for heart failure): implement as a worker job over recent observations.
- **Device event** (fall, button press): the device reports it; map it to an alarm type with `ALARM_MEASUREMENT = None`.

Every rule must be clinician-approved, documented and covered by a test (IEC 62304 / ISO 14971 traceability).

## 4. Write the adapter for the product's cloud or SDK

Translate the vendor payload into `POST /api/ingest/measurements` items (or the SQS message in production):

| Vendor field | Pipeline field | Notes |
|---|---|---|
| device serial | `device_id` via the device registry | resolve to patient through the active assignment |
| reading type | `measurement_type` | from the signal catalogue |
| value + unit | `value` (converted to the catalogue unit) | convert units in the adapter, never downstream |
| device timestamp | `observed_at` (with timezone) | never the server receive time |
| upload time | `received_at` | lets the pipeline flag delayed data |
| model / firmware version | provenance | stored with alarms raised by on-device AI |

Delivery is at-least-once: the idempotency key `device_id + measurement_type + observed_at` makes retries safe.

## 5. Tests and evidence

- Generator: `tests/test_seed.py::test_device_capabilities_respected` checks every alarm is allowed by its profile.
- API: add an ingestion test with a normal, a duplicate, a missing and an implausible reading.
- Update the risk register and the requirements trace in `docs/delivery/`.

## What you get for free

The alarm queue and acknowledgment workflow, attention indicator, patient detail charts, cohort and population
analytics (including burden by device type, clinical vs technical), staffing insights, audit hash chain,
outbox events to the virtual-care platform, role-based access, and the simulator.
