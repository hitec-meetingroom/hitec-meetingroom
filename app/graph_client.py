"""Microsoft Graph API 클라이언트.

MOCK_MODE=true: 실시간 기준 상대시간으로 가짜 일정 생성 (Azure 설정 없이 개발 가능)
MOCK_MODE=false: 실제 Graph /calendarView 호출
"""
import logging
from datetime import datetime, timedelta
from typing import List

import httpx
import msal

from .config import settings
from .models import Meeting

log = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
TOKEN_SCOPES = ["https://graph.microsoft.com/.default"]


class GraphClient:
    def __init__(self):
        self._msal_app = None
        if not settings.mock_mode:
            if not all([settings.tenant_id, settings.client_id, settings.client_secret]):
                raise RuntimeError(
                    "실제 모드 실행에는 TENANT_ID/CLIENT_ID/CLIENT_SECRET이 모두 필요합니다."
                )
            self._msal_app = msal.ConfidentialClientApplication(
                client_id=settings.client_id,
                client_credential=settings.client_secret,
                authority=f"https://login.microsoftonline.com/{settings.tenant_id}",
            )

    def _get_token(self) -> str:
        """msal이 토큰 캐시·재발급 자동 처리. 1시간 유효."""
        result = self._msal_app.acquire_token_for_client(scopes=TOKEN_SCOPES)
        if "access_token" not in result:
            err = result.get("error_description", result.get("error", "unknown"))
            raise RuntimeError(f"토큰 발급 실패: {err}")
        return result["access_token"]

    def fetch_today_events(self) -> List[Meeting]:
        if settings.mock_mode:
            return self._mock_events()
        return self._real_events()

    def _real_events(self) -> List[Meeting]:
        token = self._get_token()
        now = datetime.now().astimezone()
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)

        url = f"{GRAPH_BASE}/users/{settings.room_email}/calendar/calendarView"
        params = {
            "startDateTime": start.isoformat(),
            "endDateTime": end.isoformat(),
            "$orderby": "start/dateTime",
            "$select": "subject,start,end,organizer,isCancelled",
            "$top": "50",
        }
        headers = {
            "Authorization": f"Bearer {token}",
            "Prefer": 'outlook.timezone="Asia/Seoul"',
        }

        resp = httpx.get(url, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        events = resp.json().get("value", [])

        return [
            self._parse_event(e)
            for e in events
            if not e.get("isCancelled", False)
        ]

    @staticmethod
    def _parse_event(e: dict) -> Meeting:
        return Meeting(
            subject=e.get("subject") or "(제목 없음)",
            organizer=(
                e.get("organizer", {})
                .get("emailAddress", {})
                .get("name", "")
            ),
            start=datetime.fromisoformat(e["start"]["dateTime"]),
            end=datetime.fromisoformat(e["end"]["dateTime"]),
            is_cancelled=e.get("isCancelled", False),
        )

    @staticmethod
    def _mock_events() -> List[Meeting]:
        """현재 시각 기준 상대 시간으로 회의 생성 — 항상 '진행 중' 회의가 보이도록."""
        now = datetime.now()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        hour_start = now.replace(minute=0, second=0, microsecond=0)

        return [
            Meeting(
                subject="주간 업무 회의",
                organizer="김철수 차장",
                start=today.replace(hour=9, minute=0),
                end=today.replace(hour=10, minute=0),
            ),
            Meeting(
                subject="설계 검토 회의",
                organizer="이영희 부장",
                start=hour_start - timedelta(minutes=20),
                end=hour_start + timedelta(minutes=40),
            ),
            Meeting(
                subject="고객사 미팅 - HITECNSOL",
                organizer="박민수 과장",
                start=hour_start + timedelta(hours=1, minutes=30),
                end=hour_start + timedelta(hours=2, minutes=30),
            ),
            Meeting(
                subject="협력업체 협의",
                organizer="최지원 팀장",
                start=hour_start + timedelta(hours=4),
                end=hour_start + timedelta(hours=5),
            ),
        ]
