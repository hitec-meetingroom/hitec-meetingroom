# Teams Room Display

Microsoft Teams(Exchange) 회의실 사서함 정보를 가져와 라즈베리파이로 디스플레이하는 키오스크 시스템.

## 빠른 시작 (로컬 개발 - mock 데이터)

```bash
# 1. 가상환경
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# 2. 의존성
pip install -r requirements.txt

# 3. 환경변수 (mock 모드는 기본값이라 그대로 둬도 됨)
cp .env.example .env

# 4. 실행
python -m app.main
# 또는: uvicorn app.main:app --host 0.0.0.0 --port 8000
```

브라우저로 `http://localhost:8000` 접속하면 회의실 디스플레이 화면이 보입니다.

## 모드

`.env`의 `MOCK_MODE`:
- `true` (기본): 현재 시각 기준 가짜 회의 일정 생성 — 화면 디자인 개발/검증용
- `false`: 실제 Microsoft Graph API 호출 — 운영 모드

## 운영 모드 전환

1. Azure Entra ID 앱 등록 및 권한 설정 — `docs/azure-setup-guide.md` 참고
2. `.env`에 발급받은 값 입력:
   ```
   MOCK_MODE=false
   TENANT_ID=...
   CLIENT_ID=...
   CLIENT_SECRET=...
   ROOM_EMAIL=room1@회사도메인
   ROOM_DISPLAY_NAME=회의실 A
   ```
3. 재실행

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 키오스크 HTML |
| GET | `/api/status` | 현재 회의실 상태 JSON |
| GET | `/healthz` | 헬스체크 + mock 여부 |

## 디렉토리 구조

```
teams-room-display/
├── app/
│   ├── main.py            # FastAPI 진입점
│   ├── config.py          # .env 로딩
│   ├── graph_client.py    # Graph API + Mock 데이터
│   ├── scheduler.py       # 백그라운드 폴링
│   ├── models.py          # Pydantic 모델
│   └── static/            # 키오스크 프론트엔드
├── docs/
│   └── azure-setup-guide.md
├── requirements.txt
├── .env.example
└── README.md
```

## 라즈베리파이 키오스크 배포

(다음 단계에서 `install.sh` + systemd 유닛 추가 예정)

대략적 흐름:
1. Pi에 git clone
2. `./install.sh` 실행 (Python 가상환경, Chromium kiosk, systemd 등록)
3. `.env` 회의실별 설정
4. 재부팅 시 자동 시작
