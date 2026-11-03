"""Demo authentication: pick a synthetic staff account, receive a signed JWT.

There are no passwords — this is a demo identity switcher, NOT production authentication.
Authorization is enforced server-side on every route via `require(...)`.
"""
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel

from .config import SECRET_KEY, TOKEN_TTL_HOURS

DEMO_USERS = {
    "nurse.moreau": {"display_name": "RN A. Moreau", "role": "nurse", "unit": "Coronary Care Unit"},
    "nurse.silva": {"display_name": "RN G. Silva", "role": "nurse", "unit": "Telemetry Ward A"},
    "dr.chen": {"display_name": "Dr. R. Chen", "role": "doctor", "unit": None},
    "admin": {"display_name": "Admin (Clinical Informatics)", "role": "admin", "unit": None},
}

# Permission matrix (server-side source of truth).
PERMISSIONS = {
    "view_clinical": {"nurse", "doctor", "admin"},
    "acknowledge_alarm": {"nurse", "doctor"},
    "review_alarm": {"nurse", "doctor"},
    "view_analytics": {"nurse", "doctor", "admin"},
    "control_simulator": {"admin"},
    "manage_settings": {"admin"},
    "view_audit": {"admin", "doctor"},
}


class User(BaseModel):
    username: str
    display_name: str
    role: str
    unit: str | None = None


def issue_token(username: str) -> str:
    u = DEMO_USERS[username]
    payload = {
        "sub": username,
        "role": u["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def _decode(token: str) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    u = DEMO_USERS.get(payload.get("sub"))
    if not u:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    return User(username=payload["sub"], **u)


def current_user(request: Request) -> User:
    header = request.headers.get("authorization", "")
    token = header[7:] if header.lower().startswith("bearer ") else request.query_params.get("token")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    return _decode(token)


def require(permission: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in PERMISSIONS[permission]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role is not permitted to perform this action")
        return user

    return dep
