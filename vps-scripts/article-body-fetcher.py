#!/usr/bin/env python3
"""
article-body-fetcher.py — HTTP-only article body extractor for VN finance sites.

Supported sources:
  - cafef.vn   — selector: div.detail-content[data-role="content"] or div#mainContent
  - vneconomy.vn — selector: div.text-justify (gzip — handled via --compressed in curl / requests)

Usage (standalone):
  python3 article-body-fetcher.py --url <article-url>

Output (JSON to stdout):
  {
    "status": "ok",
    "url": "...",
    "source_domain": "cafef.vn" | "vneconomy.vn",
    "title": "...",
    "body_text": "...",
    "published_at": "...",
    "fetched_at": "2026-06-01T09:00:00Z"
  }

On error:
  { "status": "error", "reason": "...", "url": "..." }

Technique: plain requests with realistic browser headers (no anti-bot needed — both sites
return 200 from any IP, no CF managed challenge). See recon docs:
  - docs/vps-sources/cafef-article-body/recon.md
  - docs/vps-sources/vneconomy-article-body/recon.md

Sprint: VPS-NEWS-CAFEF-VNECO / 2026-06-01
"""

import sys
import json
import argparse
import re
import html as html_mod
from datetime import datetime, timezone
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print(json.dumps({"status": "error", "reason": "requests library not available — pip install requests"}))
    sys.exit(1)

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

# ── Config ──────────────────────────────────────────────────────────────────

ALLOWED_DOMAINS = {"cafef.vn", "vneconomy.vn"}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

TIMEOUT = 15  # seconds

# ── Helpers ──────────────────────────────────────────────────────────────────

def strip_tags(html_chunk: str) -> str:
    """Remove HTML tags and collapse whitespace — fallback if BeautifulSoup not available."""
    text = re.sub(r"<[^>]+>", " ", html_chunk)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_cafef(html: str, url: str) -> dict:
    """
    Extract article body from cafef.vn article page.
    Primary: div.detail-content[data-role="content"]
    Fallback: div#mainContent
    """
    title = ""
    body_text = ""
    published_at = ""

    # Title — <h1 class="title"> or og:title meta tag
    title_match = re.search(r'<h1[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)</h1>', html, re.DOTALL | re.IGNORECASE)
    if title_match:
        title = strip_tags(title_match.group(1))
    if not title:
        og_title = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', html, re.IGNORECASE)
        if og_title:
            title = html_mod.unescape(og_title.group(1).strip())

    # Published at — <meta property="article:published_time" content="...">
    pub_match = re.search(r'<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"', html, re.IGNORECASE)
    if pub_match:
        published_at = pub_match.group(1).strip()

    if BeautifulSoup:
        soup = BeautifulSoup(html, "html.parser")
        # Primary selector
        container = soup.find("div", attrs={"data-role": "content"})
        if not container:
            container = soup.find("div", class_=re.compile(r"detail-content"))
        if not container:
            container = soup.find("div", id="mainContent")
        if container:
            # Remove script/style noise
            for tag in container.find_all(["script", "style", "figure", "figcaption"]):
                tag.decompose()
            body_text = container.get_text(separator=" ", strip=True)
            body_text = re.sub(r"\s+", " ", body_text).strip()
    else:
        # Regex fallback
        idx = html.find('data-role="content"')
        if idx < 0:
            idx = html.find('id="mainContent"')
        if idx >= 0:
            chunk = html[max(0, idx - 50):idx + 30000]
            body_text = strip_tags(chunk)[:5000]

    return {"title": title, "body_text": body_text, "published_at": published_at}


def extract_vneconomy(html: str, url: str) -> dict:
    """
    Extract article body from vneconomy.vn article page.
    Primary: div.text-justify
    Fallback: div.main-detail-page
    """
    title = ""
    body_text = ""
    published_at = ""

    # Title — h1.name-detail or og:title (HTML-entity decode both)
    og_title = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', html, re.IGNORECASE)
    if og_title:
        title = html_mod.unescape(og_title.group(1).strip())
    if not title:
        h1_match = re.search(r'<h1[^>]*class="[^"]*name-detail[^"]*"[^>]*>(.*?)</h1>', html, re.DOTALL | re.IGNORECASE)
        if h1_match:
            title = html_mod.unescape(strip_tags(h1_match.group(1)))

    # Published at — meta[name="publish_date"] or span.date-detail text
    pub_meta = re.search(r'<meta[^>]+name="publish_date"[^>]+content="([^"]+)"', html, re.IGNORECASE)
    if pub_meta:
        published_at = pub_meta.group(1).strip()
    if not published_at:
        date_match = re.search(r'<span[^>]*class="[^"]*date-detail[^"]*"[^>]*>(.*?)</span>', html, re.DOTALL | re.IGNORECASE)
        if date_match:
            published_at = strip_tags(date_match.group(1))

    if BeautifulSoup:
        soup = BeautifulSoup(html, "html.parser")
        container = soup.find("div", class_="text-justify")
        if not container:
            container = soup.find("div", class_=re.compile(r"main-detail-page"))
        if container:
            for tag in container.find_all(["script", "style", "figure", "figcaption"]):
                tag.decompose()
            body_text = container.get_text(separator=" ", strip=True)
            body_text = re.sub(r"\s+", " ", body_text).strip()
    else:
        idx = html.find("text-justify")
        if idx < 0:
            idx = html.find("main-detail-page")
        if idx >= 0:
            chunk = html[max(0, idx - 50):idx + 30000]
            body_text = strip_tags(chunk)[:5000]

    return {"title": title, "body_text": body_text, "published_at": published_at}


def fetch_article(url: str) -> dict:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""

    # Normalise: strip www. prefix
    domain = hostname.removeprefix("www.")

    if domain not in ALLOWED_DOMAINS:
        return {
            "status": "error",
            "reason": f"Domain '{domain}' not in allowed list: {sorted(ALLOWED_DOMAINS)}",
            "url": url,
        }

    # Set site-specific Referer
    referer_map = {
        "cafef.vn": "https://cafef.vn/thi-truong-chung-khoan.chn",
        "vneconomy.vn": "https://vneconomy.vn/chung-khoan.htm",
    }
    headers = {**HEADERS, "Referer": referer_map.get(domain, "https://www.google.com/")}

    try:
        resp = requests.get(url, headers=headers, timeout=TIMEOUT, allow_redirects=True)
    except requests.exceptions.Timeout:
        return {"status": "error", "reason": f"Request timed out after {TIMEOUT}s", "url": url}
    except requests.exceptions.RequestException as exc:
        return {"status": "error", "reason": str(exc), "url": url}

    if resp.status_code != 200:
        return {
            "status": "error",
            "reason": f"HTTP {resp.status_code}",
            "url": url,
        }

    html = resp.text

    # Dispatch to site-specific extractor
    if domain == "cafef.vn":
        extracted = extract_cafef(html, url)
    elif domain == "vneconomy.vn":
        extracted = extract_vneconomy(html, url)
    else:
        return {"status": "error", "reason": "No extractor for domain", "url": url}

    if not extracted.get("body_text"):
        return {
            "status": "error",
            "reason": "Body selector returned empty — page structure may have changed",
            "url": url,
            "title": extracted.get("title", ""),
        }

    return {
        "status": "ok",
        "url": url,
        "source_domain": domain,
        "title": extracted["title"],
        "body_text": extracted["body_text"][:8000],  # cap at 8k chars to keep payload sane
        "published_at": extracted["published_at"],
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fetch article body from cafef.vn or vneconomy.vn")
    parser.add_argument("--url", required=True, help="Article URL to fetch")
    args = parser.parse_args()

    result = fetch_article(args.url)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result.get("status") == "ok" else 1)


if __name__ == "__main__":
    main()
