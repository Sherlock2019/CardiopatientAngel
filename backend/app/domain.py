"""Shared clinical-workflow vocabulary and demonstration rules (NOT clinically validated)."""
import zlib
from datetime import date, datetime

AGE_GROUPS = ["<50", "50-59", "60-69", "70-79", "80-89", "90+"]

PATHOLOGIES = {
    "Atrial fibrillation": "I48.91",
    "Heart failure": "I50.9",
    "Coronary artery disease": "I25.10",
    "Bradycardia": "R00.1",
    "Tachyarrhythmia": "I47.9",
    "Hypertension": "I10",
}

MEDICATIONS = {
    "Beta blockers": [("Metoprolol", "25 mg BID", "PO"), ("Bisoprolol", "5 mg daily", "PO"), ("Carvedilol", "6.25 mg BID", "PO")],
    "Anticoagulants": [("Apixaban", "5 mg BID", "PO"), ("Warfarin", "5 mg daily", "PO"), ("Heparin", "18 U/kg/h", "IV")],
    "Antiarrhythmics": [("Amiodarone", "200 mg daily", "PO"), ("Sotalol", "80 mg BID", "PO"), ("Amiodarone", "1 mg/min", "IV")],
    "ACE inhibitors": [("Lisinopril", "10 mg daily", "PO"), ("Ramipril", "5 mg daily", "PO")],
    "Diuretics": [("Furosemide", "40 mg IV BID", "IV"), ("Furosemide", "40 mg daily", "PO"), ("Hydrochlorothiazide", "25 mg daily", "PO")],
}
MEDICATION_CLASSES = list(MEDICATIONS)

TREATMENTS = [
    "Medication management",
    "Pacemaker monitoring",
    "Post-operative cardiac monitoring",
    "Cardiac rehabilitation",
    "Rhythm monitoring",
]

CARE_UNITS = ["Coronary Care Unit", "Cardiac Step-Down", "Telemetry Ward A", "Telemetry Ward B", "Post-Op Cardiac",
              "Remote Monitoring"]
REMOTE_UNIT = "Remote Monitoring"  # retirement homes, remote clinics and home care, monitored by a virtual-care team
CARE_TEAMS = ["Team Red", "Team Blue", "Team Green", "Team Gold"]
DEVICE_TYPES = {"Bedside monitor": "BED", "Telemetry pack": "TEL", "ECG patch": "ECG", "Cuffless BP monitor": "CBP",
                "Biosensor ring": "RNG"}
WEARABLES = {"ECG patch", "Cuffless BP monitor", "Biosensor ring"}

# Device profiles = product templates. The whole pipeline (ingest, de-duplication, quality flags, alarm rules,
# fleet health, analytics, audit, integration events) reads this registry, so supporting a new health IoT product
# means adding a profile (+ an adapter for its cloud/SDK), not changing the core. See docs/ADDING_A_DEVICE.md.
DEVICE_INFO = {
    "Bedside monitor": dict(model="BM-500", connectivity="Wired / Wi-Fi", firmware=["4.2.1", "4.3.0"], battery=False,
                            signals=["heart_rate", "systolic_bp", "diastolic_bp", "spo2"],
                            alarms=["HR high", "HR low", "SpO2 low", "BP high", "BP low", "Irregular rhythm", "Signal loss"],
                            offline_after_min=10),
    "Telemetry pack": dict(model="TX-12", connectivity="Wi-Fi", firmware=["2.8.4", "2.9.0"], battery=True,
                           signals=["heart_rate", "systolic_bp", "diastolic_bp", "spo2"],
                           alarms=["HR high", "HR low", "SpO2 low", "BP high", "BP low", "Irregular rhythm", "Signal loss", "Low battery"],
                           offline_after_min=15),
    "ECG patch": dict(model="EP-7 (7-day)", connectivity="BLE → phone gateway", firmware=["1.4.2", "1.5.0", "1.5.1"], battery=True,
                      signals=["heart_rate"],
                      alarms=["HR high", "HR low", "Irregular rhythm", "Signal loss", "Low battery"],
                      offline_after_min=60),
    "Cuffless BP monitor": dict(model="CB-2 wrist", connectivity="BLE / LTE", firmware=["3.0.7", "3.1.0"], battery=True,
                                signals=["heart_rate", "systolic_bp", "diastolic_bp", "spo2"],
                                alarms=["HR high", "HR low", "SpO2 low", "BP high", "BP low", "Fall detected", "Signal loss", "Low battery"],
                                offline_after_min=60),
    "Biosensor ring": dict(model="SR-1", connectivity="BLE → phone gateway", firmware=["0.9.8", "1.0.2"], battery=True,
                           signals=["heart_rate", "spo2", "sleep_hours"],
                           alarms=["HR high", "HR low", "SpO2 low", "Signal loss", "Low battery"],
                           offline_after_min=120),
}

# Synthetic staff, 3 nurses per unit.
NURSES = {
    "Coronary Care Unit": ["RN A. Moreau", "RN B. Okafor", "RN C. Lindqvist"],
    "Cardiac Step-Down": ["RN D. Tremblay", "RN E. Haddad", "RN F. Nakamura"],
    "Telemetry Ward A": ["RN G. Silva", "RN H. Kowalski", "RN I. Mensah"],
    "Telemetry Ward B": ["RN J. Dubois", "RN K. Petrov", "RN L. Osei"],
    "Post-Op Cardiac": ["RN M. Rossi", "RN N. Park", "RN O. Gauthier"],
    "Remote Monitoring": ["RN P. Tran", "RN Q. Whitehorse", "RN R. Nguyen"],
}
DOCTORS = ["Dr. P. Laurent", "Dr. Q. Adeyemi", "Dr. R. Chen", "Dr. S. Novak"]

# Signal catalogue shared by every device profile: display label, UCUM unit and LOINC code for FHIR Observations.
SIGNALS = {
    "heart_rate": {"label": "Heart rate", "ucum": "/min", "loinc": "8867-4", "range": (20, 300)},
    "systolic_bp": {"label": "Systolic blood pressure", "ucum": "mm[Hg]", "loinc": "8480-6", "range": (40, 300)},
    "diastolic_bp": {"label": "Diastolic blood pressure", "ucum": "mm[Hg]", "loinc": "8462-4", "range": (20, 200)},
    "spo2": {"label": "Oxygen saturation (pulse oximetry)", "ucum": "%", "loinc": "59408-5", "range": (50, 100)},
    "sleep_hours": {"label": "Sleep duration", "ucum": "h", "loinc": "93832-4", "range": (0, 24)},
}

def in_range(signal: str, value: float | None) -> bool:
    lo, hi = SIGNALS[signal]["range"]
    return value is not None and lo <= value <= hi


MEASUREMENT_UNITS = {"heart_rate": "bpm", "systolic_bp": "mmHg", "diastolic_bp": "mmHg", "spo2": "%", "sleep_hours": "h"}

SEVERITIES = ["critical", "warning", "advisory"]
SEVERITY_RANK = {"critical": 3, "warning": 2, "advisory": 1}

ALARM_TYPES = [
    "HR high",
    "HR low",
    "SpO2 low",
    "BP high",
    "BP low",
    "Irregular rhythm",
    "Fall detected",
    "Signal loss",
    "Low battery",
]
TECHNICAL_ALARMS = {"Signal loss", "Low battery"}
# Which measurement best describes the "current value" for an alarm type.
ALARM_MEASUREMENT = {
    "HR high": "heart_rate",
    "HR low": "heart_rate",
    "Irregular rhythm": "heart_rate",
    "SpO2 low": "spo2",
    "BP high": "systolic_bp",
    "BP low": "systolic_bp",
    "Fall detected": None,
    "Signal loss": None,
    "Low battery": None,
}

DISPOSITIONS = [
    "Clinically actionable",
    "Transient / self-resolved",
    "Technical / artifact",
    "Escalated to physician",
]

# Shifts in hospital local time.
SHIFTS = [("Day", 7, 15), ("Evening", 15, 23), ("Night", 23, 7)]


def shift_of(hour: int) -> str:
    if 7 <= hour < 15:
        return "Day"
    if 15 <= hour < 23:
        return "Evening"
    return "Night"


def demo_offline(device_id: str) -> bool:
    """Deterministic ~8% of devices that stay out of contact in the demo (so fleet views always show problems)."""
    return zlib.crc32(device_id.encode()) % 12 == 0


def assigned_nurse(unit: str, local_time: datetime) -> str:
    """Demo rota: one of the unit's three nurses per shift, rotating daily."""
    shift_idx = ["Day", "Evening", "Night"].index(shift_of(local_time.hour))
    return NURSES[unit][(shift_idx + local_time.toordinal()) % 3]


def age_on(dob: date, when: datetime | date) -> int:
    d = when.date() if isinstance(when, datetime) else when
    return d.year - dob.year - ((d.month, d.day) < (dob.month, dob.day))


def age_group(age: int) -> str:
    if age < 50:
        return "<50"
    if age >= 90:
        return "90+"
    lo = (age // 10) * 10
    return f"{lo}-{lo + 9}"


def evaluate_threshold(measurement_type: str, value: float | None) -> tuple[str, str] | None:
    """Approved demonstration alarm rules -> (alarm_type, severity) or None.

    Fixed thresholds for the demo only; real monitors use per-patient, clinician-set limits.
    """
    if value is None:
        return None
    for alarm_type, bands in THRESHOLD_BANDS.items():
        if ALARM_MEASUREMENT[alarm_type] != measurement_type:
            continue
        for severity in SEVERITIES:
            band = bands.get(severity)
            if band and band[0] <= value <= band[1]:
                return alarm_type, severity
    return None


# Demo threshold bands per alarm type and severity (inclusive value ranges).
THRESHOLD_BANDS: dict[str, dict[str, tuple[float, float]]] = {
    "HR high": {"critical": (140, 250), "warning": (120, 139.9), "advisory": (110, 119.9)},
    "HR low": {"critical": (0, 40), "warning": (40.1, 48), "advisory": (48.1, 50)},
    "SpO2 low": {"critical": (0, 84.9), "warning": (85, 89.9), "advisory": (90, 91.9)},
    "BP high": {"warning": (190, 300), "advisory": (175, 189.9)},
    "BP low": {"critical": (0, 79.9), "warning": (80, 89.9), "advisory": (90, 94)},
}
