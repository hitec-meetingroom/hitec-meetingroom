/* =================================================================
   Teams Room Display - Kiosk Client
   ================================================================= */

const rootEl = document.documentElement;

// URL 경로(`/201`, `/202` 등)에서 회의실 ID를 추출.
// 정적 사이트(`/site/`)나 직접 지정된 값이 있으면 그것을 우선 사용.
function resolveStatusUrl() {
    const explicit = rootEl.dataset.statusUrl;
    if (explicit && explicit !== "auto") return explicit;
    const seg = window.location.pathname.replace(/^\/+/, "").split("/")[0];
    const roomId = seg || "201";
    return `/api/status/${roomId}`;
}

const API_STATUS = resolveStatusUrl();
const HEALTH_URL = rootEl.dataset.healthUrl || "";
const REFRESH_INTERVAL_MS = 30 * 1000;   // 서버 캐시 폴링: 30초
const TIMELINE_START_HOUR = 9;            // 타임라인 표시 범위 (업무시간)
const TIMELINE_END_HOUR = 18;
const PIXEL_SHIFT_INTERVAL_MS = 60 * 1000;   // 번인 방지 픽셀 시프트 주기: 60초
const ROOM_IDS = ["201", "202", "203", "301", "302", "303"];

let latestStatus = null;

/* ===== 시계 ===== */

function updateClock() {
    const now = new Date();
    const dateStr = `${now.getFullYear()} / ${pad(now.getMonth() + 1)} / ${pad(now.getDate())}`;
    document.getElementById("clockDate").textContent = dateStr;
    document.getElementById("clockTime").textContent =
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function pad(n) {
    return String(n).padStart(2, "0");
}

function cacheBustedUrl(url) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}_=${Date.now()}`;
}

/* ===== 상태 페치 ===== */

async function fetchStatus() {
    try {
        const r = await fetch(cacheBustedUrl(API_STATUS), { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        latestStatus = await r.json();
        renderStatus();
    } catch (err) {
        console.warn("API 호출 실패:", err);
        // 기존 캐시 표시 유지 (네트워크 일시 불통 등)
    }
}

/* ===== 렌더링 ===== */

function renderStatus() {
    if (!latestStatus) return;

    const body = document.body;
    const s = latestStatus;

    // 회의실 이름
    document.getElementById("roomName").textContent = s.room_name;

    // 상태 — 매 초 재계산 (start/end 경계 넘어가는 케이스)
    const now = new Date();
    const current = s.today_meetings.find(m => {
        const start = new Date(m.start);
        const end = new Date(m.end);
        return start <= now && now < end;
    });
    const upcoming = s.today_meetings
        .filter(m => new Date(m.start) > now)
        .sort((a, b) => new Date(a.start) - new Date(b.start));
    const next = upcoming[0] || null;
    const isOccupied = !!current;

    body.dataset.status = isOccupied ? "busy" : "free";
    document.getElementById("statusLabel").textContent = isOccupied ? "사용 중" : "사용 가능";

    // 사용 가능 상태에서 다음 회의가 가까울수록 색상이 초록 → 노랑 → 빨강으로 변함
    applyAccentColor(computeAccentT(current, next));

    // 현재 회의 / 다음 회의까지 카운트다운 / 빈 상태 — 셋 중 하나만
    const meetingEl = document.getElementById("currentMeeting");
    const untilEl = document.getElementById("untilNextMessage");
    const emptyEl = document.getElementById("emptyMessage");

    if (current) {
        meetingEl.hidden = false;
        untilEl.hidden = true;
        emptyEl.hidden = true;
        document.getElementById("meetingSubject").textContent = displaySubject(current);
        document.getElementById("meetingOrganizer").textContent = current.organizer || "—";
        document.getElementById("meetingTime").textContent =
            `${fmtTime(current.start)} — ${fmtTime(current.end)}`;
        document.getElementById("meetingRemaining").textContent =
            `${remainingMinutes(current.end)}분 남음`;
        const attEl = document.getElementById("meetingAttendees");
        const att = current.attendees || [];
        if (att.length > 0) {
            attEl.textContent = `참석자: ${formatAttendees(att)}`;
            attEl.hidden = false;
        } else {
            attEl.hidden = true;
        }
    } else if (next) {
        meetingEl.hidden = true;
        untilEl.hidden = false;
        emptyEl.hidden = true;
        document.getElementById("untilNextCountdown").textContent =
            `다음 회의까지 ${untilStartText(next.start)}`;
        document.getElementById("untilNextSubject").textContent =
            `${fmtTime(next.start)} · ${displaySubject(next)}`;
    } else {
        meetingEl.hidden = true;
        untilEl.hidden = true;
        emptyEl.hidden = s.today_meetings.length !== 0;
    }

    // 다음 회의
    const nextEl = document.getElementById("nextSection");
    if (next) {
        nextEl.hidden = false;
        document.getElementById("nextTime").textContent =
            `${fmtTime(next.start)} — ${fmtTime(next.end)}`;
        document.getElementById("nextSubject").textContent = displaySubject(next);
        document.getElementById("nextOrganizer").textContent = next.organizer || "";
    } else {
        nextEl.hidden = true;
    }

    // 타임라인
    renderTimeline(s.today_meetings, current);

    // 푸터
    document.getElementById("lastUpdated").textContent =
        `${fmtTime(s.last_updated)}`;
}

function renderTimeline(meetings, currentMeeting) {
    const track = document.getElementById("timelineTrack");
    const hoursEl = document.getElementById("timelineHours");

    // 기존 블록·툴팁 제거 (__now 만 유지)
    track.querySelectorAll(".timeline__block, .timeline__tooltip").forEach(el => el.remove());

    const totalMin = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;

    meetings.forEach(m => {
        const start = new Date(m.start);
        const end = new Date(m.end);
        const startMin = (start.getHours() - TIMELINE_START_HOUR) * 60 + start.getMinutes();
        const endMin = (end.getHours() - TIMELINE_START_HOUR) * 60 + end.getMinutes();

        if (endMin <= 0 || startMin >= totalMin) return;

        // 세로 타임라인: top/height (시간 진행 = 위 → 아래)
        const top = Math.max(0, startMin / totalMin) * 100;
        const bottom = Math.min(totalMin, endMin) / totalMin * 100;
        const height = bottom - top;

        const block = document.createElement("div");
        block.className = "timeline__block";
        if (currentMeeting && currentMeeting.subject === m.subject &&
            currentMeeting.start === m.start) {
            block.classList.add("timeline__block--current");
        }
        block.style.top = `${top}%`;
        block.style.height = `${height}%`;
        track.appendChild(block);

        // 블록마다 상시 노출 툴팁
        track.appendChild(buildTimelineTooltip(m, top + height / 2));
    });

    // 현재 시각 마커 (가로 스트라이프)
    const now = new Date();
    const nowMin = (now.getHours() - TIMELINE_START_HOUR) * 60 + now.getMinutes();
    const nowEl = document.getElementById("timelineNow");
    if (nowMin >= 0 && nowMin <= totalMin) {
        nowEl.style.display = "block";
        nowEl.style.top = `${(nowMin / totalMin) * 100}%`;
    } else {
        nowEl.style.display = "none";
    }

    // 시간 라벨 — 09(위) → 18(아래)
    const expectedLabels = TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1;
    if (hoursEl.children.length !== expectedLabels) {
        hoursEl.innerHTML = "";
        for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h += 1) {
            const span = document.createElement("span");
            span.textContent = pad(h);
            hoursEl.appendChild(span);
        }
    }
}

/* ===== 타임라인 상시 노출 툴팁 ===== */

function buildTimelineTooltip(meeting, centerPercent) {
    const tip = document.createElement("div");
    tip.className = "timeline__tooltip";
    const clamped = Math.max(8, Math.min(92, centerPercent));
    tip.style.top = `${clamped}%`;

    const time = document.createElement("div");
    time.className = "timeline__tooltip-time";
    time.textContent = `${fmtTime(meeting.start)} — ${fmtTime(meeting.end)}`;
    tip.appendChild(time);

    const subject = document.createElement("div");
    subject.className = "timeline__tooltip-subject";
    subject.textContent = displaySubject(meeting);
    tip.appendChild(subject);

    const org = meeting.organizer || "";
    if (org) {
        const orgEl = document.createElement("div");
        orgEl.className = "timeline__tooltip-organizer";
        orgEl.textContent = `주최: ${org}`;
        tip.appendChild(orgEl);
    }

    const att = meeting.attendees || [];
    if (att.length > 0) {
        const attEl = document.createElement("div");
        attEl.className = "timeline__tooltip-attendees";
        attEl.textContent = `참석자: ${formatAttendees(att)}`;
        tip.appendChild(attEl);
    }
    return tip;
}

function formatAttendees(attendees, max = 8) {
    if (!attendees || attendees.length === 0) return "";
    if (attendees.length <= max) return attendees.join(", ");
    const shown = attendees.slice(0, max).join(", ");
    return `${shown} 외 ${attendees.length - max}명`;
}

function displaySubject(meeting) {
    const fallback = "(제목 없음)";
    const raw = String(meeting?.subject || "").trim();
    const organizer = String(meeting?.organizer || "").trim();
    if (!raw) return fallback;
    if (!organizer || !raw.startsWith(organizer)) return raw;

    const titleOnly = raw
        .slice(organizer.length)
        .replace(/^[\s\-–—_:|·•,./\\]+/, "")
        .trim();
    return titleOnly || fallback;
}

/* ===== 액센트 색상 그라데이션 (시작 1시간 전부터 초록 → 노랑 → 빨강) ===== */

const ACCENT_GREEN = [52, 211, 153];  // #34d399
const ACCENT_AMBER = [251, 191, 36];  // #fbbf24
const ACCENT_RED   = [248, 113, 113]; // #f87171
const ACCENT_LEAD_MIN = 60;            // N분 전부터 보간 시작

function computeAccentT(current, next) {
    if (current) return 1;          // 사용 중 → 빨강
    if (!next) return 0;            // 다음 회의 없음 → 초록
    const minutes = (new Date(next.start) - new Date()) / 60000;
    if (minutes >= ACCENT_LEAD_MIN) return 0;
    if (minutes <= 0) return 1;
    return (ACCENT_LEAD_MIN - minutes) / ACCENT_LEAD_MIN;
}

function accentRgb(t) {
    // 0–0.5: 초록 → 앰버, 0.5–1: 앰버 → 빨강 (중간색이 깔끔하도록 2단 보간)
    const lerp = (a, b, k) => Math.round(a + (b - a) * k);
    const mix = (c1, c2, k) => [lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k)];
    return t <= 0.5
        ? mix(ACCENT_GREEN, ACCENT_AMBER, t * 2)
        : mix(ACCENT_AMBER, ACCENT_RED, (t - 0.5) * 2);
}

function applyAccentColor(t) {
    const [r, g, b] = accentRgb(t);
    const body = document.body.style;
    body.setProperty("--accent", `rgb(${r}, ${g}, ${b})`);
    body.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.13)`);
    body.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.08)`);
}

/* ===== 헬퍼 ===== */

function fmtTime(iso) {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function remainingMinutes(endIso) {
    const diffMs = new Date(endIso) - new Date();
    return Math.max(0, Math.floor(diffMs / 60000));
}

function untilStartText(startIso) {
    const diffMs = new Date(startIso) - new Date();
    if (diffMs <= 0) return "곧 시작";
    const totalMin = Math.floor(diffMs / 60000);
    if (totalMin < 1) return "1분 이내 시작";
    if (totalMin < 10) return "10분 이내 시작";
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m}분`;
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
}

/* ===== 번인 방지: 픽셀 시프트 ===== */
// 화면 전체를 주기적으로 미세 이동시켜 동일 픽셀의 장시간 고정을 막는다.
// CSS에서 --burn-shift-max(6px)만큼 화면을 키워두었으므로 가장자리 빈틈은 없다.
const PIXEL_SHIFT_OFFSETS = [
    [0, 0], [6, 0], [6, 6], [0, 6],
    [-6, 6], [-6, 0], [-6, -6], [0, -6], [6, -6],
];
let pixelShiftIndex = 0;

function applyPixelShift() {
    const screen = document.querySelector(".screen");
    if (!screen) return;
    pixelShiftIndex = (pixelShiftIndex + 1) % PIXEL_SHIFT_OFFSETS.length;
    const [x, y] = PIXEL_SHIFT_OFFSETS[pixelShiftIndex];
    screen.style.setProperty("--shift-x", `${x}px`);
    screen.style.setProperty("--shift-y", `${y}px`);
}

/* ===== 회의실 전환 메뉴 (회의실명 호버/클릭) ===== */

function isApiMode() {
    return API_STATUS.includes("/api/status");
}

// 현재 페이지가 보고 있는 회의실 ID
function currentRoomId() {
    if (isApiMode()) {
        const m = API_STATUS.match(/\/api\/status\/([^/]+)/);
        return m ? m[1] : "";
    }
    const m = API_STATUS.match(/status-([^./]+)\.json/);
    return m ? m[1] : "";
}

// 다른 회의실의 상태 JSON URL을 현재 페이지 기준으로 생성
function roomStatusUrl(id) {
    if (isApiMode()) return API_STATUS.replace(/\/api\/status\/[^/]+/, `/api/status/${id}`);
    return API_STATUS.replace(/status-[^./]+\.json/, `status-${id}.json`);
}

// 다른 회의실 페이지로의 이동 URL (정적: 상대경로 / API: 절대경로)
function roomPageUrl(id) {
    if (isApiMode()) return `/${id}`;
    const prefix = API_STATUS.startsWith("../") ? "../" : "./";
    return `${prefix}${id}/`;
}

function buildRoomSwitcher() {
    const nav = document.getElementById("roomSwitcher");
    if (!nav) return;
    const cur = currentRoomId();
    nav.innerHTML = ROOM_IDS.map((id) => `
        <a class="room-switcher__item" data-room="${id}" href="${roomPageUrl(id)}"${id === cur ? ' aria-current="page"' : ""}>
            <span class="room-switcher__dot"></span>
            <span class="room-switcher__name">회의실 ${id}</span>
            <span class="room-switcher__state">—</span>
        </a>`).join("");

    // 마우스가 없는 키오스크 대응: 회의실명 클릭(터치)으로 토글, 바깥 클릭 시 닫기
    const name = document.getElementById("roomName");
    if (name && !name.dataset.switcherBound) {
        name.dataset.switcherBound = "1";
        name.addEventListener("click", (e) => {
            e.stopPropagation();
            nav.classList.toggle("is-open");
        });
        nav.addEventListener("click", (e) => e.stopPropagation());
        document.addEventListener("click", () => nav.classList.remove("is-open"));
    }
    refreshRoomSwitcherStates();
}

// 각 회의실의 가용 여부를 가져와 색상(data-state)과 이름/라벨 갱신
async function refreshRoomSwitcherStates() {
    const nav = document.getElementById("roomSwitcher");
    if (!nav) return;
    await Promise.all(ROOM_IDS.map(async (id) => {
        const item = nav.querySelector(`.room-switcher__item[data-room="${id}"]`);
        if (!item) return;
        try {
            const r = await fetch(cacheBustedUrl(roomStatusUrl(id)), { cache: "no-store" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const occupied = !!data.is_occupied;
            item.dataset.state = occupied ? "busy" : "free";
            if (data.room_name) item.querySelector(".room-switcher__name").textContent = data.room_name;
            item.querySelector(".room-switcher__state").textContent = occupied ? "사용 중" : "사용 가능";
        } catch (err) {
            item.dataset.state = "unknown";
            item.querySelector(".room-switcher__state").textContent = "—";
        }
    }));
}

/* ===== 초기화 ===== */

async function init() {
    updateClock();
    setInterval(updateClock, 1000);

    // 번인 방지: 60초마다 화면을 미세 이동
    setInterval(applyPixelShift, PIXEL_SHIFT_INTERVAL_MS);

    // 회의실 전환 메뉴: 메뉴 구성 후 주기적으로 가용 상태 갱신
    buildRoomSwitcher();
    setInterval(refreshRoomSwitcherStates, REFRESH_INTERVAL_MS);

    // 매 초 상태 재계산 (남은 시간 카운트다운, 회의 시작/종료 경계)
    setInterval(() => {
        if (latestStatus) renderStatus();
    }, 1000);

    // 서버 동기화는 30초마다
    await fetchStatus();
    setInterval(fetchStatus, REFRESH_INTERVAL_MS);

    if (HEALTH_URL) {
        fetch(HEALTH_URL).then(r => r.json()).then(h => {
            if (h.mock_mode) document.getElementById("mockBadge").hidden = false;
        }).catch(() => {});
    }
}

document.addEventListener("DOMContentLoaded", init);
