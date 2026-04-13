#!/usr/bin/env python3
"""
Headless browser fetcher — bypasses Cloudflare/bot-guard on Vietnamese news sites.
Uses Playwright with real Chromium to behave like a human browser.

Usage: python3 fetch-browser.py <source_name> <url> [max_items]
Output: JSON array of {title, url, publishedAt, content, source} on stdout
Errors: logged to stderr only

Supports:
  - RSS feeds behind JS challenge (vneconomy.vn/tai-chinh.rss)
  - HTML pages that need scraping (future)
"""

import sys
import json
import time
import random
import xml.etree.ElementTree as ET
import html as html_lib

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

SOURCE  = sys.argv[1] if len(sys.argv) > 1 else "unknown"
URL     = sys.argv[2] if len(sys.argv) > 2 else ""
MAX     = int(sys.argv[3]) if len(sys.argv) > 3 else 20

# Realistic browser viewport + locale
VIEWPORT   = {"width": 1366, "height": 768}
LOCALE     = "vi-VN"
TIMEZONE   = "Asia/Ho_Chi_Minh"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

def parse_rss(content: str, source: str, max_items: int) -> list:
    """Parse RSS XML into item list."""
    try:
        tree = ET.fromstring(content)
    except ET.ParseError as e:
        print(f"[browser-fetch] RSS parse error: {e}", file=sys.stderr)
        return []
    items = []
    for item in tree.iter("item"):
        title   = (item.findtext("title") or "").strip()
        link    = (item.findtext("link")  or "").strip()
        pub     = (item.findtext("pubDate") or "").strip()
        desc    = (item.findtext("description")
                   or item.findtext("{http://purl.org/rss/1.0/modules/content/}encoded")
                   or "")
        desc    = html_lib.unescape(desc).strip()
        if title or link:
            items.append({
                "title":       title,
                "url":         link,
                "publishedAt": pub,
                "content":     desc[:500],
                "source":      source,
            })
    return items[:max_items]


def fetch_with_browser(url: str, source: str, max_items: int) -> list:
    raw_body = None

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
                "--single-process",
            ],
        )
        context = browser.new_context(
            user_agent=USER_AGENT,
            viewport=VIEWPORT,
            locale=LOCALE,
            timezone_id=TIMEZONE,
            extra_http_headers={
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        page = context.new_page()

        # Intercept the raw network response body before Chrome renders it
        def handle_response(response):
            nonlocal raw_body
            if url in response.url and raw_body is None:
                try:
                    raw_body = response.body().decode("utf-8", errors="replace")
                except Exception:
                    pass

        page.on("response", handle_response)

        # Human-like pause before navigation
        time.sleep(random.uniform(1.0, 2.5))

        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
        except PlaywrightTimeout:
            print(f"[browser-fetch] timeout navigating {url}", file=sys.stderr)
            browser.close()
            return []

        # If interception missed the body, fall back to Chrome's XML viewer source element
        if not raw_body:
            try:
                raw_body = page.evaluate(
                    "document.getElementById('webkit-xml-viewer-source-xml')?.textContent || ''"
                )
            except Exception:
                pass

        time.sleep(random.uniform(0.5, 1.5))
        browser.close()

    if not raw_body:
        print(f"[browser-fetch] WARN: empty body from {url}", file=sys.stderr)
        return []

    # Detect bot-guard HTML (no RSS structure)
    if "<item>" not in raw_body and "<channel>" not in raw_body:
        snippet = raw_body[:200].replace("\n", " ")
        print(f"[browser-fetch] WARN: no RSS structure in response from {url} — snippet: {snippet}", file=sys.stderr)
        return []

    # Strip any HTML wrapper Chrome may have added
    for marker in ("<?xml", "<rss", "<channel>"):
        start = raw_body.find(marker)
        if start > 0:
            raw_body = raw_body[start:]
            break

    return parse_rss(raw_body, source, max_items)


if not URL:
    print("[]")
    sys.exit(0)

try:
    items = fetch_with_browser(URL, SOURCE, MAX)
    print(json.dumps(items, ensure_ascii=False))
except Exception as e:
    print(f"[browser-fetch] ERROR: {e}", file=sys.stderr)
    print("[]")
