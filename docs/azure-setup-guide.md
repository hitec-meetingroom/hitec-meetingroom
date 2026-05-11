# Azure Entra ID 앱 등록 및 권한 설정 가이드

> **대상**: 정보보안/IT 인프라 담당자
> **목적**: TeamsRoomDisplay 시스템(라즈베리파이 회의실 디스플레이)이 Microsoft Graph API를 통해 **지정된 회의실 사서함의 캘린더만** 읽을 수 있도록 권한을 구성합니다.
> **소요 시간**: 약 30~60분 (정책 전파 시간 포함 최대 90분)

---

## 0. 사전 준비

다음 권한을 가진 계정이 필요합니다.

- **Entra ID Application Administrator** 이상 (앱 등록, admin consent)
- **Exchange Administrator** (Application Access Policy 설정)

PowerShell 모듈 설치(관리자 PowerShell):

```powershell
Install-Module -Name ExchangeOnlineManagement -Scope AllUsers -Force
```

---

## 1. Entra ID 앱 등록

1. [Entra admin center](https://entra.microsoft.com) → **Applications → App registrations → New registration**
2. 입력값
   - **Name**: `TeamsRoomDisplay` (조직 명명 규칙에 맞춰 변경 가능)
   - **Supported account types**: `Accounts in this organizational directory only (Single tenant)`
   - **Redirect URI**: **비워둠** (백엔드 데몬이라 redirect 불필요)
3. **Register** 클릭
4. 생성된 앱의 **Overview** 페이지에서 다음 두 값을 복사·기록:
   - `Application (client) ID`
   - `Directory (tenant) ID`

---

## 2. API 권한 부여

1. 좌측 메뉴 → **API permissions → Add a permission**
2. **Microsoft Graph → Application permissions** 선택 (Delegated 아님)
3. 다음 권한 추가:

| 권한 | 필수 여부 | 용도 |
|------|----------|------|
| `Calendars.Read` | 필수 | 회의실 캘린더 이벤트 조회 |
| `Place.Read.All` | 선택 | 회의실 메타데이터(층, 수용인원) 조회 |

4. **Grant admin consent for [조직명]** 클릭 → 모든 권한 상태가 **녹색 체크**로 바뀌는지 확인

> ⚠️ `Calendars.Read` (Application 권한)는 **기본적으로 테넌트 내 모든 사서함에 접근 가능합니다.** 반드시 다음 4단계의 Application Access Policy로 범위를 제한해야 합니다.

---

## 3. Client Secret 발급

1. 좌측 메뉴 → **Certificates & secrets → Client secrets → New client secret**
2. **Description**: `TeamsRoomDisplay-prod`
3. **Expires**: `24 months` (만료 1개월 전 갱신 알림 캘린더 등록 권장)
4. **Add** 클릭 → 생성된 **Value** 값을 **즉시 복사**
   > ⚠️ 이 값은 페이지를 떠나면 다시 볼 수 없습니다. 안전한 비밀 저장소(예: 사내 KeyVault, 1Password)에 즉시 보관.

---

## 4. Application Access Policy 설정 (가장 중요)

`Calendars.Read` Application 권한은 테넌트 전체에 적용됩니다. **회의실 사서함에만 접근**하도록 제한하지 않으면 정보보안상 심각한 위험입니다.

### 4-1. 회의실 그룹 생성 및 사서함 추가

```powershell
# Exchange Online 연결
Connect-ExchangeOnline

# 메일 활성화 보안 그룹 생성
New-DistributionGroup `
    -Name "TeamsRoomDisplay-Rooms" `
    -Alias "TeamsRoomDisplayRooms" `
    -Type "Security" `
    -PrimarySmtpAddress "teamsroomdisplay-rooms@<도메인>.com"

# 대상 회의실 사서함을 그룹에 추가 (회의실 수만큼 반복)
Add-DistributionGroupMember -Identity "TeamsRoomDisplay-Rooms" `
    -Member "room1@<도메인>.com"
Add-DistributionGroupMember -Identity "TeamsRoomDisplay-Rooms" `
    -Member "room2@<도메인>.com"
# ...
```

### 4-2. 접근 제한 정책 생성

```powershell
New-ApplicationAccessPolicy `
    -AppId "<1단계에서 복사한 Application (client) ID>" `
    -PolicyScopeGroupId "teamsroomdisplay-rooms@<도메인>.com" `
    -AccessRight RestrictAccess `
    -Description "Restrict TeamsRoomDisplay app to room mailboxes only"
```

> 💡 `AccessRight RestrictAccess`: 이 그룹 멤버에만 접근 허용, 나머지는 모두 차단

### 4-3. 정책 검증

```powershell
# 허용되어야 할 사서함 (회의실)
Test-ApplicationAccessPolicy `
    -Identity "room1@<도메인>.com" `
    -AppId "<Application (client) ID>"
# 기대 결과: AccessCheckResult = Granted

# 차단되어야 할 사서함 (일반 직원)
Test-ApplicationAccessPolicy `
    -Identity "<일반직원>@<도메인>.com" `
    -AppId "<Application (client) ID>"
# 기대 결과: AccessCheckResult = Denied
```

> ⚠️ Application Access Policy는 적용까지 **최대 30분~1시간**이 걸릴 수 있습니다. 정책 직후 테스트가 실패해도 시간을 두고 재시도하세요.

---

## 5. 회의실 사서함 캘린더 처리 설정

기본적으로 Exchange Online은 회의실 캘린더의 회의 제목을 **주최자 이름**으로 치환합니다 (프라이버시 보호 목적). 디스플레이에 **회의 제목 원문**을 표시하려면 다음 설정을 변경합니다.

```powershell
# 대상 회의실마다 실행
Set-CalendarProcessing -Identity "room1@<도메인>.com" `
    -AddOrganizerToSubject $false `
    -DeleteSubject $false `
    -DeleteComments $false
```

| 옵션 | 기본값 | 변경 후 | 효과 |
|------|--------|---------|------|
| `AddOrganizerToSubject` | `$true` | `$false` | 제목 앞에 주최자명 자동 삽입 안 함 |
| `DeleteSubject` | `$true` | `$false` | 원래 제목 유지 |
| `DeleteComments` | `$true` | `$false` | 회의 본문 유지 (디스플레이에는 미사용이지만 일관성) |

> 💡 회사 정책상 회의 제목을 노출하면 안 되는 경우, 이 단계를 **건너뛰고** 디스플레이에 "주최자명만" 표시하는 방식으로 운영 가능합니다. 개발팀과 협의 필요.

---

## 6. 개발팀에 전달할 정보

다음 4개 값을 **안전한 채널**(평문 이메일 ❌, 사내 비밀 관리 시스템 ✅)로 전달합니다.

| 항목 | 비고 |
|------|------|
| `TENANT_ID` | 1단계 Directory (tenant) ID |
| `CLIENT_ID` | 1단계 Application (client) ID |
| `CLIENT_SECRET` | 3단계에서 발급한 Value |
| 회의실 사서함 이메일 목록 | 예: `room1@..., room2@...` |

---

## 7. 최종 검증 체크리스트

- [ ] Graph Explorer에서 `client_credentials` 토큰 발급 성공
- [ ] 허용된 회의실 사서함의 `calendarView` 호출 성공 (HTTP 200)
- [ ] 정책 외 사서함(일반 직원) 호출 시 HTTP 403 반환
- [ ] 회의 제목이 의도한 형식으로 표시됨 (원문 / 주최자명)
- [ ] Client Secret 만료일 캘린더 알림 등록 완료

### 토큰 발급 테스트 (curl)

```bash
curl -X POST "https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=<CLIENT_ID>" \
  -d "client_secret=<CLIENT_SECRET>" \
  -d "scope=https://graph.microsoft.com/.default"
```

응답에 `access_token` 필드가 포함되면 성공.

### 캘린더 조회 테스트

```bash
TOKEN="<위에서 받은 access_token>"
curl -H "Authorization: Bearer $TOKEN" \
  "https://graph.microsoft.com/v1.0/users/room1@<도메인>.com/calendar/calendarView?startDateTime=2026-05-11T00:00:00&endDateTime=2026-05-12T00:00:00"
```

---

## 부록 A. 자주 발생하는 오류

| 증상 | 원인 | 해결 |
|------|------|------|
| `AADSTS7000215: Invalid client secret` | Secret 만료 또는 오타 | 새 Secret 발급 |
| `Access is denied. Check credentials and try again.` | Application Access Policy 미설정 또는 그룹 멤버 누락 | 4-3 검증 명령으로 확인 |
| `ErrorAccessDenied` (HTTP 403) | 정책 전파 미완료 | 30~60분 대기 후 재시도 |
| 회의 제목이 주최자명으로 보임 | 5단계 미실행 | `Set-CalendarProcessing` 적용 |
| Place.Read.All 권한 거부 | admin consent 누락 | 2단계 admin consent 재실행 |

## 부록 B. 회의실 추가 시 절차

신규 회의실을 시스템에 편입하려면:

```powershell
Connect-ExchangeOnline

# 그룹에 추가만 하면 됨 (정책은 그룹 단위로 적용됨)
Add-DistributionGroupMember -Identity "TeamsRoomDisplay-Rooms" `
    -Member "<신규회의실>@<도메인>.com"

# 캘린더 제목 설정
Set-CalendarProcessing -Identity "<신규회의실>@<도메인>.com" `
    -AddOrganizerToSubject $false `
    -DeleteSubject $false `
    -DeleteComments $false

# 검증
Test-ApplicationAccessPolicy `
    -Identity "<신규회의실>@<도메인>.com" `
    -AppId "<CLIENT_ID>"
```

전파 후 라즈베리파이 측 `.env`의 `ROOM_EMAIL`만 신규 회의실로 설정하면 자동 동작합니다.

---

**문서 버전**: 1.0
**작성일**: 2026-05-11
