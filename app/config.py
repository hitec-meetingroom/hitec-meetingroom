"""환경변수에서 설정 로드.

회의실은 `.env`에서 ROOM_EMAIL_<id> / ROOM_DISPLAY_NAME_<id> 쌍으로 자동 발견.
예) ROOM_EMAIL_201, ROOM_DISPLAY_NAME_201 → /201 경로
"""
import os
import re
from dataclasses import dataclass, field
from typing import List

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Room:
    room_id: str
    email: str
    display_name: str


@dataclass
class Settings:
    mock_mode: bool
    tenant_id: str
    client_id: str
    client_secret: str
    rooms: List[Room]
    default_room_id: str
    poll_interval_sec: int
    host: str
    port: int


def _env_bool(key: str, default: bool) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return val.lower() in ("true", "1", "yes")


_ROOM_EMAIL_RE = re.compile(r"^ROOM_EMAIL_(.+)$")


def _discover_rooms() -> List[Room]:
    rooms: List[Room] = []
    for key, value in os.environ.items():
        m = _ROOM_EMAIL_RE.match(key)
        if not m:
            continue
        email = (value or "").strip()
        if not email:
            continue
        room_id = m.group(1).strip()
        display_raw = os.getenv(f"ROOM_DISPLAY_NAME_{room_id}")
        display = (display_raw or f"회의실 {room_id}").strip()
        rooms.append(Room(room_id=room_id, email=email, display_name=display))
    rooms.sort(key=lambda r: r.room_id)
    return rooms


def _build_settings() -> Settings:
    rooms = _discover_rooms()
    if not rooms:
        # 기본값(개발/mock용): /201 한 개
        rooms = [Room(room_id="201", email="room1@company.com", display_name="회의실 201")]
    default_id = os.getenv("DEFAULT_ROOM_ID", "201")
    if default_id not in {r.room_id for r in rooms}:
        default_id = rooms[0].room_id
    return Settings(
        mock_mode=_env_bool("MOCK_MODE", True),
        tenant_id=os.getenv("TENANT_ID", ""),
        client_id=os.getenv("CLIENT_ID", ""),
        client_secret=os.getenv("CLIENT_SECRET", ""),
        rooms=rooms,
        default_room_id=default_id,
        poll_interval_sec=int(os.getenv("POLL_INTERVAL_SEC", "300")),
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
    )


settings = _build_settings()
