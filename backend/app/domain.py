"""Shared clinical-workflow vocabulary and demonstration rules (NOT clinically validated)."""
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

CARE_UNITS = ["Coronary Care Unit", "Cardiac Step-Down", "Telemetry Ward A", "Telemetry Ward B", "Post-Op Cardiac"]
CARE_TEAMS = ["Team Red", "Team Blue", "Team Green", "Team Gold"]
DEVICE_TYPES = {"Bedside monitor": "BED", "Telemetry pack": "TEL", "Wearable patch": "WPT"}

# Synthetic staff, 3 nurses per unit.
NURSES = {
    "Coronary Care Unit": ["RN A. Moreau", "RN B. Okafor", "RN C. Lindqvist"],
    "Cardiac Step-Down": ["RN D. Tremblay", "RN E. Haddad", "RN F. Nakamura"],
    "Telemetry Ward A": ["RN G. Silva", "RN H. Kowalski", "RN I. Mensah"],
    "Telemetry Ward B": ["RN J. Dubois", "RN K. Petrov", "RN L. Osei"],
    "Post-Op Cardiac": ["RN M. Rossi", "RN N. Park", "RN O. Gauthier"],
}
DOCTORS = ["Dr. P. Laurent", "Dr. Q. Adeyemi", "Dr. R. Chen", "Dr. S. Novak"]

MEASUREMENT_UNITS = {"heart_rate": "bpm", "systolic_bp": "mmHg", "diastolic_bp": "mmHg", "spo2": "%"}

SEVERITIES = ["critical", "warning", "advisory"]
SEVERITY_RANK = {"critical": 3, "warning": 2, "advisory": 1}

ALARM_TYPES = [
    "HR high",
    "HR low",
    "SpO2 low",
    "BP high",
    "BP low",
    "Irregular rhythm",
    "Signal loss",
]
# Which measurement best describes the "current value" for an alarm type.
ALARM_MEASUREMENT = {
    "HR high": "heart_rate",
    "HR low": "heart_rate",
    "Irregular rhythm": "heart_rate",
    "SpO2 low": "spo2",
    "BP high": "systolic_bp",
    "BP low": "systolic_bp",
    "Signal loss": None,
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
