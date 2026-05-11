"""FastAPI 진입점.

엔드포인트:
  GET /                      → 기본 회의실(/201)로 리다이렉트
  GET /{room_id}             → 키오스크 HTML
  GET /api/status/{room_id}  → 회의실 상태 JSON
  GET /healthz               → 헬스체크 + 회의실 목록
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .models import RoomStatus
from .scheduler import get_store, stores

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("teams-room-display")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(
        "기동: mock=%s rooms=%s default=%s poll=%ds",
        settings.mock_mode,
        [r.room_id for r in settings.rooms],
        settings.default_room_id,
        settings.poll_interval_sec,
    )
    for store in stores.values():
        await store.start()
    yield
    for store in stores.values():
        await store.stop()


app = FastAPI(title="Teams Room Display", lifespan=lifespan)

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url=f"/{settings.default_room_id}", status_code=307)


@app.get("/healthz", include_in_schema=False)
async def healthz():
    return {
        "ok": True,
        "mock_mode": settings.mock_mode,
        "default_room_id": settings.default_room_id,
        "rooms": [
            {"room_id": r.room_id, "display_name": r.display_name}
            for r in settings.rooms
        ],
    }


@app.get("/api/status", response_model=RoomStatus)
async def api_status_default():
    return await api_status(settings.default_room_id)


@app.get("/api/status/{room_id}", response_model=RoomStatus)
async def api_status(room_id: str):
    store = get_store(room_id)
    if store is None:
        raise HTTPException(status_code=404, detail=f"unknown room: {room_id}")
    s = store.status
    if s is None:
        raise HTTPException(status_code=503, detail="초기화 중")
    return s


@app.get("/{room_id}", include_in_schema=False)
async def room_page(room_id: str):
    if get_store(room_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown room: {room_id}")
    return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
