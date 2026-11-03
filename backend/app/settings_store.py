"""Runtime-tunable analytics/demo settings (in memory; reset on restart)."""
from copy import deepcopy

from .config import HOSPITAL_TZ

DEFAULTS = {
    "display_timezone": HOSPITAL_TZ,
    "repeat_window_minutes": 120,
    "small_cohort_patients": 20,  # flag cohorts smaller than this
    "suppress_cohort_patients": 10,  # hide rates for cohorts smaller than this
    "attention": {  # Operational Attention Indicator — Demo Only
        "severity_points": {"critical": 40, "warning": 20, "advisory": 5},
        "recent_window_hours": 6,
        "points_per_recent_alarm": 5,
        "recent_cap": 25,
        "points_per_minute_unacknowledged": 1,
        "unacknowledged_cap": 20,
        "points_per_repeat": 5,
        "repeat_cap": 15,
    },
}

_settings = deepcopy(DEFAULTS)


def get() -> dict:
    return _settings


def update(patch: dict) -> dict:
    for k, v in patch.items():
        if k == "attention" and isinstance(v, dict):
            for ak, av in v.items():
                if ak == "severity_points" and isinstance(av, dict):
                    _settings["attention"]["severity_points"].update(av)
                elif ak in _settings["attention"]:
                    _settings["attention"][ak] = av
        elif k in _settings:
            _settings[k] = v
    return _settings


def reset():
    global _settings
    _settings.clear()
    _settings.update(deepcopy(DEFAULTS))
