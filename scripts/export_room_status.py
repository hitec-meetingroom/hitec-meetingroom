#!/usr/bin/env python3
"""GitHub Actions에서 실행: Graph로 오늘 일정 조회 후 site/status-<room_id>.json 저장.

환경변수는 로컬 .env 또는 Actions Secrets에서 주입한다.
MOCK_MODE=false 일 때만 실제 Graph 호출 (Actions에서는 필수).
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import List
from zoneinfo import ZoneInfo

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.config import Room, settings  # noqa: E402
from app.graph_client import GraphClient  # noqa: E402
from app.models import Meeting, RoomStatus  # noqa: E402

KST = ZoneInfo("Asia/Seoul")


def _as_kst_wall_time(dt: datetime) -> datetime:
    """Return a naive Asia/Seoul wall-clock datetime for meeting comparisons."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(KST).replace(tzinfo=None)


def compose_room_status(room: Room, meetings: List[Meeting]) -> RoomStatus:
    """scheduler.RoomStatusStore._compose 와 동일 (모듈 부작용 피하기)."""
    now = datetime.now(KST)
    now_wall_time = now.replace(tzinfo=None)
    current = next(
        (
            m
            for m in meetings
            if _as_kst_wall_time(m.start) <= now_wall_time < _as_kst_wall_time(m.end)
        ),
        None,
    )
    upcoming = [m for m in meetings if _as_kst_wall_time(m.start) > now_wall_time]
    nxt = upcoming[0] if upcoming else None
    return RoomStatus(
        room_name=room.display_name,
        is_occupied=current is not None,
        current_meeting=current,
        next_meeting=nxt,
        today_meetings=meetings,
        last_updated=now,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Room status JSON for GitHub Pages")
    parser.add_argument(
        "--output-dir",
        default="site",
        help="출력 디렉터리 (기본: site)",
    )
    args = parser.parse_args()

    if settings.mock_mode:
        print(
            "MOCK_MODE=true 입니다. Actions에서는 MOCK_MODE=false 로 실행하세요.",
            file=sys.stderr,
        )
        sys.exit(1)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    client = GraphClient()
    default_status_text = None
    for room in settings.rooms:
        meetings = client.fetch_today_events(room.email)
        status = compose_room_status(room, meetings)
        status_text = status.model_dump_json(indent=2)

        out = out_dir / f"status-{room.room_id}.json"
        out.write_text(status_text, encoding="utf-8")
        print(f"Wrote {out} ({len(meetings)} meetings)")

        if room.room_id == settings.default_room_id:
            default_status_text = status_text

    if default_status_text is not None:
        default_out = out_dir / "status.json"
        default_out.write_text(default_status_text, encoding="utf-8")
        print(f"Wrote {default_out} (default room {settings.default_room_id})")


if __name__ == "__main__":
    main()
