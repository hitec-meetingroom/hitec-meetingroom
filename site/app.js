/* =================================================================
   Teams Room Display - Kiosk Client
   ================================================================= */

const rootEl = document.documentElement;
const API_STATUS = rootEl.dataset.statusUrl || "/api/status";
const HEALTH_URL = rootEl.dataset.healthUrl || "";
const REFRESH_INTERVAL_MS = 30 * 1000;   // 서버 캐시 폴링: 30초
const TIMELINE_START_HOUR = 9;            // 타임라인 표시 범위 (업무시간)
const TIMELINE_END_HOUR = 18;

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

    // 사용 가능 상태에서 다음 회의가 가까울수록 색상이 초록 → 노랑 → 빨강으로 변함
    applyAccentColor(computeAccentT(current, next));

    // 현재 회의 카드
    const meetingEl = document.getElementById("currentMeeting");
    const emptyEl = document.getElementById("emptyMessage");

    if (current) {
        meetingEl.hidden = false;
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
        document.getElementById("nextSubject").textContent = displaySubject(next);
        document.getElementById("nextOrganizer").textContent = next.organizer || "";
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

    track.querySelectorAll(".timeline__block").forEach(el => el.remove());

    const totalMin = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;

    meetings.forEach(m => {
        const start = new Date(m.start);
        const end = new Date(m.end);
        const startMin = (start.getHours() - TIMELINE_START_HOUR) * 60 + start.getMinutes();
        const endMin = (end.getHours() - TIMELINE_START_HOUR) * 60 + end.getMinutes();

        if (endMin <= 0 || startMin >= totalMin) return;

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
        attachTimelineTooltip(block, m, top + height / 2);
        track.appendChild(block);
    });

    const now = new Date();
    const nowMin = (now.getHours() - TIMELINE_START_HOUR) * 60 + now.getMinutes();
    const nowEl = document.getElementById("timelineNow");
    if (nowMin >= 0 && nowMin <= totalMin) {
        nowEl.style.display = "block";
        nowEl.style.top = `${(nowMin / totalMin) * 100}%`;
    } else {
        nowEl.style.display = "none";
    }

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

/* ===== 타임라인 호버 툴팁 ===== */

function attachTimelineTooltip(block, meeting, centerPercent) {
    block.addEventListener("mouseenter", () => {
        const tip = document.getElementById("timelineTooltip");
        if (!tip) return;
        document.getElementById("tooltipTime").textContent =
            `${fmtTime(meeting.start)} — ${fmtTime(meeting.end)}`;
        document.getElementById("tooltipSubject").textContent =
            displaySubject(meeting);
        const orgEl = document.getElementById("tooltipOrganizer");
        const org = meeting.organizer || "";
        orgEl.textContent = org ? `주최: ${org}` : "";
        orgEl.hidden = !org;
        const attEl = document.getElementById("tooltipAttendees");
        const att = meeting.attendees || [];
        if (att.length > 0) {
            attEl.textContent = `참석자: ${formatAttendees(att)}`;
            attEl.hidden = false;
        } else {
            attEl.hidden = true;
        }
        const clamped = Math.max(8, Math.min(92, centerPercent));
        tip.style.top = `${clamped}%`;
        tip.hidden = false;
    });
    block.addEventListener("mouseleave", () => {
        const tip = document.getElementById("timelineTooltip");
        if (tip) tip.hidden = true;
    });
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
const ACCENT_LEAD_MIN = 60;

function computeAccentT(current, next) {
    if (current) return 1;
    if (!next) return 0;
    const minutes = (new Date(next.start) - new Date()) / 60000;
    if (minutes >= ACCENT_LEAD_MIN) return 0;
    if (minutes <= 0) return 1;
    return (ACCENT_LEAD_MIN - minutes) / ACCENT_LEAD_MIN;
}

function accentRgb(t) {
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
