/* =================================================================
   Teams Room Display - Kiosk Client
   ================================================================= */

const rootEl = document.documentElement;
const API_STATUS = rootEl.dataset.statusUrl || "/api/status";
const HEALTH_URL = rootEl.dataset.healthUrl || "";
const REFRESH_INTERVAL_MS = 30 * 1000;   // 서버 캐시 폴링: 30초
const TIMELINE_START_HOUR = 8;            // 타임라인 표시 범위
const TIMELINE_END_HOUR = 20;

let latestStatus = null;

/* ===== 시계 ===== */

function updateClock() {
    const now = new Date();
    const dateStr = `${now.getFullYear()} / ${pad(now.getMonth() + 1)} / ${pad(now.getDate())}`;
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const weekday = weekdays[now.getDay()] + "요일";
    document.getElementById("clockDate").textContent = `${dateStr} · ${weekday}`;
    document.getElementById("clockTime").textContent =
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function pad(n) {
    return String(n).padStart(2, "0");
}

/* ===== 상태 페치 ===== */

async function fetchStatus() {
    try {
        const r = await fetch(API_STATUS, { cache: "no-store" });
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

    // 현재 회의 카드
    const meetingEl = document.getElementById("currentMeeting");
    const emptyEl = document.getElementById("emptyMessage");

    if (current) {
        meetingEl.hidden = false;
        emptyEl.hidden = true;
        document.getElementById("meetingSubject").textContent = current.subject;
        document.getElementById("meetingOrganizer").textContent = current.organizer || "—";
        document.getElementById("meetingTime").textContent =
            `${fmtTime(current.start)} — ${fmtTime(current.end)}`;
        document.getElementById("meetingRemaining").textContent =
            `${remainingMinutes(current.end)}분 남음`;
    } else {
        meetingEl.hidden = true;
        if (s.today_meetings.length === 0) {
            emptyEl.hidden = false;
        } else {
            emptyEl.hidden = true;
        }
    }

    // 다음 회의
    const nextEl = document.getElementById("nextSection");
    if (next) {
        nextEl.hidden = false;
        document.getElementById("nextTime").textContent =
            `${fmtTime(next.start)} — ${fmtTime(next.end)}`;
        document.getElementById("nextSubject").textContent = next.subject;
        document.getElementById("nextOrganizer").textContent = next.organizer || "—";
    } else {
        nextEl.hidden = true;
    }

    // 타임라인
    renderTimeline(s.today_meetings, current);

    // 푸터
    document.getElementById("lastUpdated").textContent =
        `최근 동기화: ${fmtTime(s.last_updated)}`;
}

function renderTimeline(meetings, currentMeeting) {
    const track = document.getElementById("timelineTrack");
    const hoursEl = document.getElementById("timelineHours");

    // 기존 블록 제거 ( __now 라인은 유지)
    track.querySelectorAll(".timeline__block").forEach(el => el.remove());

    const totalMin = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;

    meetings.forEach(m => {
        const start = new Date(m.start);
        const end = new Date(m.end);
        const startMin = (start.getHours() - TIMELINE_START_HOUR) * 60 + start.getMinutes();
        const endMin = (end.getHours() - TIMELINE_START_HOUR) * 60 + end.getMinutes();

        if (endMin <= 0 || startMin >= totalMin) return;

        const left = Math.max(0, startMin / totalMin) * 100;
        const right = Math.min(totalMin, endMin) / totalMin * 100;
        const width = right - left;

        const block = document.createElement("div");
        block.className = "timeline__block";
        if (currentMeeting && currentMeeting.subject === m.subject &&
            currentMeeting.start === m.start) {
            block.classList.add("timeline__block--current");
        }
        block.style.left = `${left}%`;
        block.style.width = `${width}%`;
        block.title = `${m.subject} (${fmtTime(m.start)}-${fmtTime(m.end)})`;
        track.appendChild(block);
    });

    // 현재 시각 마커
    const now = new Date();
    const nowMin = (now.getHours() - TIMELINE_START_HOUR) * 60 + now.getMinutes();
    const nowEl = document.getElementById("timelineNow");
    if (nowMin >= 0 && nowMin <= totalMin) {
        nowEl.style.display = "block";
        nowEl.style.left = `${(nowMin / totalMin) * 100}%`;
    } else {
        nowEl.style.display = "none";
    }

    // 시간 라벨 (한 번만 그리면 됨)
    if (hoursEl.children.length === 0) {
        for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h += 2) {
            const span = document.createElement("span");
            span.textContent = pad(h);
            hoursEl.appendChild(span);
        }
    }
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

/* ===== 초기화 ===== */

async function init() {
    updateClock();
    setInterval(updateClock, 1000);

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
