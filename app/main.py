"""FastAPI 진입점.

엔드포인트:
  GET /             → 키오스크 HTML
  GET /api/status   → 현재 회의실 상태 JSON
  GET /healthz      → 헬스체크
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .models import RoomStatus
from .scheduler import store

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("teams-room-display")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(
        "기동: mock=%s room=%s poll=%ds",
        settings.mock_mode,
        settings.room_email,
        settings.poll_interval_sec,
    )
    await store.start()
    yield
    await store.stop()


app = FastAPI(title="Teams Room Display", lifespan=lifespan)

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def root():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status", response_model=RoomStatus)
async def api_status():
    s = store.status
    if s is None:
        raise HTTPException(status_code=503, detail="초기화 중")
    return s


@app.get("/healthz", include_in_schema=False)
async def healthz():
    return {"ok": True, "mock_mode": settings.mock_mode}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
