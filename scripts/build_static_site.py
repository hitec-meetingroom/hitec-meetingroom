#!/usr/bin/env python3
"""Build GitHub Pages static files from the FastAPI static template."""
from __future__ import annotations

import re
import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
APP_STATIC = REPO_ROOT / "app" / "static"
SITE_DIR = REPO_ROOT / "site"
ROOM_IDS = ("201", "202", "203", "301", "302", "303")
STYLE_VERSION = "guide-smaller-kst-20260512"
APP_VERSION = "status-cache-bust-20260512"


def with_asset_paths(html: str, css_href: str, js_src: str, status_url: str) -> str:
    html = re.sub(
        r'<html lang="ko"[^>]*>',
        f'<html lang="ko" data-status-url="{status_url}">',
        html,
        count=1,
    )
    html = re.sub(
        r'href="/static/style\.css\?v=[^"]+"',
        f'href="{css_href}"',
        html,
        count=1,
    )
    html = re.sub(
        r'src="/static/app\.js\?v=[^"]+"',
        f'src="{js_src}"',
        html,
        count=1,
    )
    return html


def main() -> None:
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(APP_STATIC / "app.js", SITE_DIR / "app.js")
    shutil.copy2(APP_STATIC / "style.css", SITE_DIR / "style.css")

    template = (APP_STATIC / "index.html").read_text(encoding="utf-8")
    root_html = with_asset_paths(
        template,
        css_href=f"./style.css?v={STYLE_VERSION}",
        js_src=f"./app.js?v={APP_VERSION}",
        status_url="./status-201.json",
    )
    (SITE_DIR / "index.html").write_text(root_html, encoding="utf-8")

    for room_id in ROOM_IDS:
        room_dir = SITE_DIR / room_id
        room_dir.mkdir(parents=True, exist_ok=True)
        room_html = with_asset_paths(
            template,
            css_href=f"../style.css?v={STYLE_VERSION}",
            js_src=f"../app.js?v={APP_VERSION}",
            status_url=f"../status-{room_id}.json",
        )
        (room_dir / "index.html").write_text(room_html, encoding="utf-8")


if __name__ == "__main__":
    main()
