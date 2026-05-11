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

## GitHub Pages + Actions (정적 사이트)

백엔드 없이 Pages만 쓰려면, **GitHub Actions가 주기적으로 Graph를 호출**해 `site/status.json`을 갱신하고 커밋합니다. 브라우저는 같은 폴더의 `./status.json`만 읽습니다. 비밀값은 **저장소 Secrets**에만 넣고 `.env`는 올리지 않습니다.

### 1) 저장소 Secrets 설정

GitHub → Settings → Secrets and variables → Actions → Repository secrets:

| Secret 이름 | 설명 |
|-------------|------|
| `TENANT_ID` | Azure 테넌트 ID |
| `CLIENT_ID` | 앱 등록 Client ID |
| `CLIENT_SECRET` | 클라이언트 시크릿 |
| `ROOM_EMAIL` | 회의실 리소스 메일 |
| `ROOM_DISPLAY_NAME` | 화면에 보일 회의실 이름 |

### 2) Pages 소스

저장소 Settings → Pages → **Deploy from a branch**, Branch **main**, folder **`/site`** (또는 사용 중인 기본 브랜치와 `/site`).

### 3) 워크플로 실행

`.github/workflows/sync-room-status.yml`이 **5분마다** + **수동 실행(workflow_dispatch)** 으로 동작합니다. 첫 반영은 Actions 탭에서 **Sync room status** 워크플로를 한 번 실행하면 됩니다.

- 일정 데이터 갱신 주기는 크론으로 조절합니다 (너무 짧으면 [Graph throttling](https://learn.microsoft.com/en-us/graph/throttling) 위험).
- 프론트는 최대 30초마다 `status.json`을 다시 받아오므로, **표시 갱신과 데이터 원천 갱신은 별개**입니다.

### 4) 로컬 FastAPI와의 차이

- 로컬: `app/static/index.html` → `data-status-url="/api/status"` 로 FastAPI 사용.
- Pages: `site/index.html` → `data-status-url="./status.json"` Actions가 생성한 파일 사용.

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
├── site/                  # GitHub Pages용 (Actions가 status.json 갱신)
├── scripts/
│   └── export_room_status.py
├── .github/workflows/
│   └── sync-room-status.yml
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
