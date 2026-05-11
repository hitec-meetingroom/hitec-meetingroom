"""주기적으로 Graph API를 호출해서 회의실 상태를 캐시한다.

5분마다 호출 → 메모리에 RoomStatus 저장 → API 엔드포인트(/api/status)는 캐시만 반환.
이렇게 하면 프론트는 30초마다 폴링해도 Graph 호출은 5분에 한 번뿐.
"""
import asyncio
import logging
from datetime import datetime
from typing import List, Optional

from .config import settings
from .graph_client import GraphClient
from .models import Meeting, RoomStatus

log = logging.getLogger(__name__)


class RoomStatusStore:
    def __init__(self):
        self._client = GraphClient()
        self._status: Optional[RoomStatus] = None
        self._task: Optional[asyncio.Task] = None

    @property
    def status(self) -> Optional[RoomStatus]:
        if self._status is None:
            return None
        # 캐시된 데이터를 기반으로 '현재 회의'를 매 호출 시 재계산
        # (5분 사이에 회의 시작/종료 경계를 넘어갈 수 있으므로)
        return self._compose(self._status.today_meetings)

    async def start(self):
        await self._refresh()
        self._task = asyncio.create_task(self._loop())

    async def stop(self):
        if self._task:
            self._task.cancel()

    async def _loop(self):
        try:
            while True:
                await asyncio.sleep(settings.poll_interval_sec)
                await self._refresh()
        except asyncio.CancelledError:
            log.info("스케줄러 정상 종료")

    async def _refresh(self):
        try:
            # 동기 httpx/msal 호출은 별도 스레드에서
            meetings = await asyncio.to_thread(self._client.fetch_today_events)
            self._status = self._compose(meetings)
            log.info("갱신 완료: 오늘 회의 %d건", len(meetings))
        except Exception:
            log.exception("Graph 호출 실패 (기존 캐시 유지)")

    @staticmethod
    def _compose(meetings: List[Meeting]) -> RoomStatus:
        now = datetime.now()
        current = next(
            (m for m in meetings if m.start <= now < m.end),
            None,
        )
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


# 모듈 전역 싱글톤
store = RoomStatusStore()
