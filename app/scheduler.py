"""주기적으로 Graph API를 호출해서 회의실 상태를 캐시한다.

회의실마다 별도의 `RoomStatusStore`가 있고, `stores`에 room_id로 등록.
프론트는 30초마다 캐시(JSON)만 받아오므로 Graph 호출은 회의실당 5분에 한 번.
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional

from .config import Room, settings
from .graph_client import GraphClient
from .models import Meeting, RoomStatus

log = logging.getLogger(__name__)


class RoomStatusStore:
    def __init__(self, room: Room, client: GraphClient):
        self._room = room
        self._client = client
        self._status: Optional[RoomStatus] = None
        self._task: Optional[asyncio.Task] = None

    @property
    def room(self) -> Room:
        return self._room

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
            log.info("[%s] 스케줄러 정상 종료", self._room.room_id)

    async def _refresh(self):
        try:
            meetings = await asyncio.to_thread(
                self._client.fetch_today_events, self._room.email
            )
            self._status = self._compose(meetings)
            log.info(
                "[%s] 갱신 완료: 오늘 회의 %d건", self._room.room_id, len(meetings)
            )
        except Exception:
            log.exception(
                "[%s] Graph 호출 실패 (기존 캐시 유지)", self._room.room_id
            )

    def _compose(self, meetings: List[Meeting]) -> RoomStatus:
        now = datetime.now()
        current = next(
            (m for m in meetings if m.start <= now < m.end),
            None,
        )
        upcoming = [m for m in meetings if m.start > now]
        nxt = upcoming[0] if upcoming else None

        return RoomStatus(
            room_name=self._room.display_name,
            is_occupied=current is not None,
            current_meeting=current,
            next_meeting=nxt,
            today_meetings=meetings,
            last_updated=now,
        )


# 모듈 전역 — config.settings.rooms 기준으로 초기화
_client = GraphClient()
stores: Dict[str, RoomStatusStore] = {
    r.room_id: RoomStatusStore(r, _client) for r in settings.rooms
}


def get_store(room_id: str) -> Optional[RoomStatusStore]:
    return stores.get(room_id)
