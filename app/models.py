"""회의실 상태 및 회의 데이터 모델."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class Meeting(BaseModel):
    subject: str
    organizer: str
    start: datetime
    end: datetime
    is_cancelled: bool = False


class RoomStatus(BaseModel):
    room_name: str
    is_occupied: bool
    current_meeting: Optional[Meeting] = None
    next_meeting: Optional[Meeting] = None
    today_meetings: List[Meeting] = []
    last_updated: datetime
