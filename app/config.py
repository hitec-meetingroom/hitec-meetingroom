"""환경변수에서 설정 로드."""
import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Settings:
    mock_mode: bool
    tenant_id: str
    client_id: str
    client_secret: str
    room_email: str
    room_display_name: str
    poll_interval_sec: int
    host: str
    port: int


def _env_bool(key: str, default: bool) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return val.lower() in ("true", "1", "yes")


settings = Settings(
    mock_mode=_env_bool("MOCK_MODE", True),
    tenant_id=os.getenv("TENANT_ID", ""),
    client_id=os.getenv("CLIENT_ID", ""),
    client_secret=os.getenv("CLIENT_SECRET", ""),
    room_email=os.getenv("ROOM_EMAIL", "room1@company.com"),
    room_display_name=os.getenv("ROOM_DISPLAY_NAME", "회의실 A"),
    poll_interval_sec=int(os.getenv("POLL_INTERVAL_SEC", "300")),
    host=os.getenv("HOST", "0.0.0.0"),
    port=int(os.getenv("PORT", "8000")),
)
