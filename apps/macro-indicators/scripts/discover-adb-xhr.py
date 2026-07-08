"""
Phase 1 Discovery Script — ADB Key Indicators Database (kidb.adb.org)

Technique: spa-xhr-intercept
Purpose:   Run ONCE to intercept all XHR/fetch calls made by the ADB KIDB SPA.
           Records URL, method, request headers, and response samples.
Output:    docs/mainserver-sources/adb-kidb/xhr-contract.md (human doc)
           /tmp/adb_endpoints_raw.json (raw machine output)

RAM cost:  ~400MB during run (Playwright + Chromium SPA rendering).
           Browser is closed immediately after, freeing RAM.

After discovery:
  - Review docs/mainserver-sources/adb-kidb/xhr-contract.md
  - Wire discovered endpoint into a Go pkg/infrastructure adapter (the TS
    scraper this script originally targeted, src/infrastructure/scrapers/
    adb-kidb.ts, was deleted 2026-07-08 — FACTORY-MACRO-delete-dead-ts-tree;
    ADB KIDB has no Go adapter yet, so this is a fresh Go implementation)
  - Phase 2 production adapter needs NO headless browser (~15MB ongoing)

Usage:
  python3 apps/macro-indicators/scripts/discover-adb-xhr.py
  python3 apps/macro-indicators/scripts/discover-adb-xhr.py --url https://kidb.adb.org/kidb --timeout 45
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Constants ─────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent
CONTRACT_DOC_PATH = REPO_ROOT / "docs/mainserver-sources/adb-kidb/xhr-contract.md"
RAW_JSON_PATH = Path("/tmp/adb_endpoints_raw.json")

ADB_KIDB_URLS = [
    "https://kidb.adb.org",
    "https://kidb.adb.org/kidb",
    "https://kidb.adb.org/kidb/countries",
    "https://kidb.adb.org/kidb/indicators",
]

# Match anything from adb.org that is XHR/fetch (not static assets)
ASSET_EXTENSIONS = re.compile(r"\.(js|css|png|jpg|svg|ico|woff2?|ttf|map)(\?.*)?$")
API_PATTERN = re.compile(r"(kidb\.adb\.org|data\.adb\.org)")

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


# ── Discovery logic ───────────────────────────────────────────────────────────

def is_api_request(url: str, resource_type: str) -> bool:
    """Return True if this request looks like an API/data call (not a static asset)."""
    if ASSET_EXTENSIONS.search(url):
        return False
    if not API_PATTERN.search(url):
        return False
    # Accept XHR, fetch, and document/other for full coverage
    return resource_type in ("xhr", "fetch", "other", "document")


def run_discovery(start_url: str, timeout_s: int, interact: bool) -> dict:
    """
    Launch Playwright, navigate to ADB KIDB SPA, intercept all network requests.
    Returns structured discovery result dict.
    """
    from playwright.sync_api import sync_playwright

    discovered: list[dict] = []
    seen_urls: set[str] = set()

    def on_request(request) -> None:  # type: ignore[no-untyped-def]
        url = request.url
        rtype = request.resource_type
        if is_api_request(url, rtype) and url not in seen_urls:
            seen_urls.add(url)
            discovered.append({
                "url": url,
                "method": request.method,
                "resource_type": rtype,
                "headers": {k: v for k, v in request.headers.items()
                            if k.lower() not in ("cookie", "authorization")},
                "post_data": request.post_data,
                "response_status": None,
                "response_content_type": None,
                "response_sample": None,
            })

    def on_response(response) -> None:  # type: ignore[no-untyped-def]
        url = response.url
        for entry in discovered:
            if entry["url"] == url:
                entry["response_status"] = response.status
                entry["response_content_type"] = response.headers.get("content-type", "")
                try:
                    body = response.json()
                    entry["response_sample"] = json.dumps(body)[:800]
                except Exception:
                    try:
                        text = response.text()
                        entry["response_sample"] = text[:400] if text else None
                    except Exception:
                        pass

    print(f"[discover-adb-xhr] Launching Playwright Chromium (headless)...")
    print(f"[discover-adb-xhr] Target URL: {start_url}")
    print(f"[discover-adb-xhr] Timeout: {timeout_s}s")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent=BROWSER_UA,
                locale="en-US",
                timezone_id="America/New_York",
            )
            page = context.new_page()
            page.on("request", on_request)
            page.on("response", on_response)

            # Phase 1a: Load homepage
            print(f"[discover-adb-xhr] Loading {start_url} ...")
            try:
                page.goto(start_url, wait_until="networkidle", timeout=timeout_s * 1000)
            except Exception as e:
                print(f"[discover-adb-xhr] networkidle timeout (non-fatal): {e}")

            # Phase 1b: Probe additional SPA routes
            probe_urls = [u for u in ADB_KIDB_URLS if u != start_url]
            for probe_url in probe_urls:
                print(f"[discover-adb-xhr] Probing: {probe_url}")
                try:
                    page.goto(probe_url, wait_until="networkidle", timeout=20_000)
                except Exception as e:
                    print(f"[discover-adb-xhr] probe timeout (non-fatal): {e}")

            # Phase 1c: Attempt to interact with Vietnam selector
            if interact:
                print("[discover-adb-xhr] Attempting Vietnam interaction...")
                for selector in [
                    "text=Vietnam",
                    "[data-country='VNM']",
                    "[data-iso='VNM']",
                    "option[value='VNM']",
                ]:
                    try:
                        page.click(selector, timeout=4_000)
                        page.wait_for_load_state("networkidle", timeout=10_000)
                        print(f"[discover-adb-xhr] Clicked: {selector}")
                        break
                    except Exception:
                        pass

            # Phase 1d: Look for any JavaScript state objects
            js_state: dict = {}
            for prop in ["window.__APP_DATA__", "window.__NEXT_DATA__",
                         "window.__NUXT__", "window.kidbData", "window.appConfig"]:
                try:
                    val = page.evaluate(f"() => JSON.stringify({prop})")
                    if val and val != "undefined":
                        js_state[prop] = val[:500]
                except Exception:
                    pass

        finally:
            browser.close()
            print("[discover-adb-xhr] Browser closed — RAM released.")

    return {
        "discovered_at": datetime.now(timezone.utc).isoformat(),
        "start_url": start_url,
        "endpoints_found": len(discovered),
        "endpoints": discovered,
        "js_state_objects": js_state,
    }


# ── Contract doc generation ───────────────────────────────────────────────────

def write_contract_doc(result: dict, output_path: Path) -> None:
    """Write a human-readable XHR contract markdown from discovery result."""
    endpoints = result.get("endpoints", [])
    now = result.get("discovered_at", datetime.now(timezone.utc).isoformat())

    api_endpoints = [e for e in endpoints if e.get("response_status") == 200]
    other_endpoints = [e for e in endpoints if e not in api_endpoints]

    lines = [
        "# ADB KIDB — XHR Contract (Phase 1 Discovery)",
        "",
        f"**Discovered:** {now}",
        f"**Discovery script:** `apps/macro-indicators/scripts/discover-adb-xhr.py`",
        f"**Source URL:** {result.get('start_url', 'https://kidb.adb.org')}",
        f"**Total XHR/fetch calls captured:** {len(endpoints)}",
        f"**Endpoints returning 200:** {len(api_endpoints)}",
        "",
        "---",
        "",
    ]

    if api_endpoints:
        lines += [
            "## Working API Endpoints (HTTP 200)",
            "",
            "These endpoints can be called directly in Phase 2 (no headless browser needed).",
            "",
        ]
        for ep in api_endpoints:
            lines += [
                f"### `{ep['method']} {ep['url']}`",
                "",
                f"- **Resource type:** `{ep.get('resource_type', 'unknown')}`",
                f"- **Content-Type:** `{ep.get('response_content_type', 'unknown')}`",
            ]
            if ep.get("post_data"):
                lines += [f"- **Request body:** `{ep['post_data'][:200]}`"]

            req_hdrs = ep.get("headers", {})
            notable = {k: v for k, v in req_hdrs.items()
                       if k.lower() in ("accept", "referer", "origin", "x-requested-with",
                                        "x-api-key", "x-client-version", "content-type")}
            if notable:
                lines += ["- **Notable request headers:**"]
                for k, v in notable.items():
                    lines += [f"  - `{k}: {v}`"]

            if ep.get("response_sample"):
                lines += [
                    "- **Response sample:**",
                    "  ```json",
                    f"  {ep['response_sample'][:500]}",
                    "  ```",
                ]
            lines += [""]

    else:
        lines += [
            "## Working API Endpoints",
            "",
            "> No 200-status XHR/fetch calls captured. Possible reasons:",
            "> - SPA loads data lazily after user interaction (add `--interact` flag and retry)",
            "> - API calls use GraphQL POST or WebSocket (check post_data below)",
            "> - ADB KIDB serves data embedded in page HTML (check JS state objects)",
            "",
        ]

    if other_endpoints:
        lines += [
            "## Other Captured Requests (non-200 or status unknown)",
            "",
        ]
        for ep in other_endpoints[:10]:
            status = ep.get("response_status", "?")
            lines += [f"- `{ep['method']} {ep['url']}` — status {status}"]
        lines += [""]

    js_state = result.get("js_state_objects", {})
    if js_state:
        lines += [
            "## JavaScript State Objects Found",
            "",
            "These objects were embedded in the SPA's global scope:",
            "",
        ]
        for prop, val in js_state.items():
            lines += [
                f"### `{prop}`",
                "```json",
                val[:600],
                "```",
                "",
            ]

    lines += [
        "---",
        "",
        "## Phase 2 — Direct API Adapter",
        "",
        "Once working endpoints are confirmed above, implement the Phase 2 adapter:",
        "",
        "- Target: a new Go adapter under `apps/macro-indicators/pkg/infrastructure/`",
        "  (the original TS target, src/infrastructure/scrapers/adb-kidb.ts, was",
        "  deleted 2026-07-08 — FACTORY-MACRO-delete-dead-ts-tree; no Go ADB KIDB",
        "  adapter exists yet, so this is greenfield in Go, not a port)",
        "- Use the discovered URL as the endpoint constant",
        "- Match request headers to the captured headers above",
        "- Gate on API-key/availability the same way other adapters do (see",
        "  pkg/infrastructure/adapters_vmt_sjc_fx.go for the pattern)",
        "",
        "RAM cost in Phase 2: ~15MB (direct fetch, no headless browser).",
        "",
        "---",
        "",
        "## Re-Run Instructions",
        "",
        "If ADB KIDB updates its SPA (stale API contract):",
        "",
        "```bash",
        "python3 apps/macro-indicators/scripts/discover-adb-xhr.py --interact",
        "```",
        "",
        "Expected RAM during re-discovery: ~400MB. Browser closes when done.",
    ]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"[discover-adb-xhr] Contract doc written: {output_path}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        description="ADB KIDB Phase 1 XHR discovery via Playwright"
    )
    parser.add_argument(
        "--url", default="https://kidb.adb.org",
        help="ADB KIDB start URL (default: https://kidb.adb.org)"
    )
    parser.add_argument(
        "--timeout", type=int, default=45,
        help="Page load timeout in seconds (default: 45)"
    )
    parser.add_argument(
        "--interact", action="store_true",
        help="Attempt to click Vietnam selector to trigger data-load API calls"
    )
    parser.add_argument(
        "--raw-out", default=str(RAW_JSON_PATH),
        help=f"Raw JSON output path (default: {RAW_JSON_PATH})"
    )
    parser.add_argument(
        "--contract-out", default=str(CONTRACT_DOC_PATH),
        help=f"Contract doc path (default: {CONTRACT_DOC_PATH})"
    )
    args = parser.parse_args()

    result = run_discovery(
        start_url=args.url,
        timeout_s=args.timeout,
        interact=args.interact,
    )

    # Write raw JSON
    raw_path = Path(args.raw_out)
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    raw_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[discover-adb-xhr] Raw JSON saved: {raw_path}")
    print(f"[discover-adb-xhr] Endpoints found: {result['endpoints_found']}")

    # Write contract doc
    write_contract_doc(result, Path(args.contract_out))

    # Print summary to stdout
    working = [e for e in result["endpoints"] if e.get("response_status") == 200]
    print(f"[discover-adb-xhr] Summary: {len(working)} working endpoints (200 OK)")
    for ep in working:
        print(f"  {ep['method']} {ep['url']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
