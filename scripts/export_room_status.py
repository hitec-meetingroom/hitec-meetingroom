#!/usr/bin/env python3
"""GitHub Actions에서 실행: Graph로 오늘 일정 조회 후 site/status.json 저장.

환경변수는 로컬 .env 또는 Actions Secrets에서 주입한다.
MOCK_MODE=false 일 때만 실제 Graph 호출 (Actions에서는 필수).
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import List

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.config import settings  # noqa: E402
from app.graph_client import GraphClient  # noqa: E402
from app.models import Meeting, RoomStatus  # noqa: E402


def compose_room_status(meetings: List[Meeting]) -> RoomStatus:
    """scheduler.RoomStatusStore._compose 와 동일 (모듈 부작용 피하기)."""
    now = datetime.now()
    current = next((m for m in meetings if m.start <= now < m.end), None)
    upcoming = [m for m in meetings if m.start > now]
    nxt = upcoming[0] if upcoming else None
    return RoomStatus(
        room_name=settings.room_display_name,
        is_occupied=current is not None,
        current_meeting=current,
        next_meeting=nxt,
        today_meetings=meetings,
        last_updated=now,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Room status JSON for GitHub Pages")
    parser.add_argument(
        "--output",
        default="site/status.json",
        help="출력 경로 (기본: site/status.json)",
    )
    args = parser.parse_args()

    if settings.mock_mode:
        print(
            "MOCK_MODE=true 입니다. Actions에서는 MOCK_MODE=false 로 실행하세요.",
            file=sys.stderr,
        )
        sys.exit(1)

    client = GraphClient()
    meetings = client.fetch_today_events()
    status = compose_room_status(meetings)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        status.model_dump_json(indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {out} ({len(meetings)} meetings)")


if __name__ == "__main__":
    main()
