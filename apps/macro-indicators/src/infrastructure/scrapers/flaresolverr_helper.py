#!/usr/bin/env python3
"""
flaresolverr_helper.py — FlareSolverr v3 HTTP client with cf_clearance cache

Technique: flaresolverr-bypass
RAM: ~10MB (requests only; FlareSolverr itself runs in its own container)
Used by: investing_calendar_fetch.py (and any future CF-Turnstile-blocked scraper)

Architecture:
  - FlareSolverr lives at http://flaresolverr:8191/v1 (compose-network DNS)
  - It runs headless Chromium internally (~96MB observed for the container)
  - This helper makes a plain HTTP POST to FlareSolverr and parses the envelope
  - cf_clearance cookie is cached in-process (TTL ~30min per investing.com policy)
  - Fast path: if we have a cached cf_clearance, try direct curl_cffi first;
    fall back to FlareSolverr only on 403/challenge response

FlareSolverr response envelope:
  {
    "status": "ok" | "warning" | "error",
    "message": "...",
    "solution": {
      "url": "...",
      "status": 200,           # HTTP status code of the target
      "headers": {...},
      "response": "<html>...", # rendered HTML body
      "cookies": [{"name": "cf_clearance", "value": "...", ...}, ...],
      "userAgent": "..."
    },
    "startTimestamp": ...,
    "endTimestamp": ...,
    "version": "3.4.6"
  }

Usage:
    from flaresolverr_helper import fetch_via_flaresolverr, get_cached_cf_cookies
"""

import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

try:
    import requests as stdlib_requests
except ImportError:
    raise ImportError("requests not installed — run: pip install requests")

try:
    from curl_cffi import requests as cffi_requests
    HAS_CURL_CFFI = True
except ImportError:
    HAS_CURL_CFFI = False

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

FLARESOLVERR_URL = "http://flaresolverr:8191/v1"
FLARESOLVERR_TIMEOUT = 70       # seconds — FlareSolverr maxTimeout=60s + 10s network buffer
DEFAULT_MAX_TIMEOUT = 60_000    # ms sent inside JSON-RPC body

# cf_clearance cache: { domain -> { "value": str, "expires_at": float } }
_cf_clearance_cache: dict[str, dict] = {}
CF_CLEARANCE_TTL = 25 * 60      # 25 minutes (investing.com TTL is ~30min — use 25 to be safe)

# ── FlareSolverr types ────────────────────────────────────────────────────────

class FlareSolverrError(Exception):
    """Raised when FlareSolverr returns status != 'ok' or solution.status != 200."""
    pass


class FlareSolverrSolution:
    """Parsed solution from FlareSolverr response."""
    def __init__(self, raw: dict):
        self.url: str         = raw.get("url", "")
        self.http_status: int = raw.get("status", 0)
        self.response: str    = raw.get("response", "")
        self.headers: dict    = raw.get("headers", {})
        self.user_agent: str  = raw.get("userAgent", "")
        self.cookies: list    = raw.get("cookies", [])

    def cookie_dict(self) -> dict[str, str]:
        return {c["name"]: c["value"] for c in self.cookies if "name" in c and "value" in c}

    def cf_clearance(self) -> Optional[str]:
        for c in self.cookies:
            if c.get("name") == "cf_clearance":
                return c.get("value")
        return None


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _domain_from_url(url: str) -> str:
    """Extract bare domain (e.g. 'www.investing.com') from a URL."""
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc
    except Exception:
        return url


def cache_cf_clearance(url: str, value: str) -> None:
    """Store cf_clearance cookie for domain. Redacted in logs."""
    domain = _domain_from_url(url)
    _cf_clearance_cache[domain] = {
        "value": value,
        "expires_at": time.time() + CF_CLEARANCE_TTL,
    }
    logger.info("[flaresolverr] cf_clearance cached for %s (TTL %ds)", domain, CF_CLEARANCE_TTL)


def get_cached_cf_clearance(url: str) -> Optional[str]:
    """Return cached cf_clearance if still valid, else None."""
    domain = _domain_from_url(url)
    entry = _cf_clearance_cache.get(domain)
    if not entry:
        return None
    if time.time() > entry["expires_at"]:
        del _cf_clearance_cache[domain]
        logger.info("[flaresolverr] cf_clearance cache expired for %s", domain)
        return None
    return entry["value"]


# ── Core FlareSolverr call ────────────────────────────────────────────────────

def fetch_via_flaresolverr(
    target_url: str,
    *,
    max_timeout: int = DEFAULT_MAX_TIMEOUT,
    flaresolverr_endpoint: str = FLARESOLVERR_URL,
) -> FlareSolverrSolution:
    """
    POST to FlareSolverr and return parsed solution.

    Raises FlareSolverrError on:
      - HTTP error connecting to FlareSolverr container
      - FlareSolverr status != 'ok'
      - solution.status != 200
    """
    payload = {
        "cmd": "request.get",
        "url": target_url,
        "maxTimeout": max_timeout,
    }

    try:
        resp = stdlib_requests.post(
            flaresolverr_endpoint,
            json=payload,
            timeout=FLARESOLVERR_TIMEOUT,
        )
        resp.raise_for_status()
    except stdlib_requests.exceptions.ConnectionError as exc:
        raise FlareSolverrError(
            f"Cannot reach FlareSolverr at {flaresolverr_endpoint}: {exc}"
        ) from exc
    except stdlib_requests.exceptions.Timeout as exc:
        raise FlareSolverrError(
            f"FlareSolverr timed out after {FLARESOLVERR_TIMEOUT}s: {exc}"
        ) from exc
    except stdlib_requests.exceptions.HTTPError as exc:
        raise FlareSolverrError(
            f"FlareSolverr HTTP error: {exc}"
        ) from exc

    try:
        data = resp.json()
    except ValueError as exc:
        raise FlareSolverrError(f"FlareSolverr returned non-JSON: {exc}") from exc

    if data.get("status") != "ok":
        raise FlareSolverrError(
            f"FlareSolverr status={data.get('status')!r}: {data.get('message', '')}"
        )

    solution_raw = data.get("solution", {})
    solution = FlareSolverrSolution(solution_raw)

    if solution.http_status != 200:
        raise FlareSolverrError(
            f"FlareSolverr solved but target returned HTTP {solution.http_status}"
        )

    # Cache cf_clearance if present
    cf = solution.cf_clearance()
    if cf:
        cache_cf_clearance(target_url, cf)

    return solution


# ── Fast-path with curl_cffi fallback ─────────────────────────────────────────

def fetch_with_fast_path(
    target_url: str,
    *,
    extra_headers: Optional[dict] = None,
    impersonate: str = "chrome136",
    flaresolverr_endpoint: str = FLARESOLVERR_URL,
    max_timeout: int = DEFAULT_MAX_TIMEOUT,
) -> tuple[str, dict[str, str]]:
    """
    Try fast path (curl_cffi with cached cf_clearance) first.
    Fall back to FlareSolverr if no cache, 403, or challenge detected.

    Returns: (html_body, cookie_dict)
    Raises: FlareSolverrError if FlareSolverr also fails.
    """
    cached_clearance = get_cached_cf_clearance(target_url)

    # Fast path — only if curl_cffi available AND we have a cached cookie
    if HAS_CURL_CFFI and cached_clearance:
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/136.0.0.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
            }
            if extra_headers:
                headers.update(extra_headers)

            session = cffi_requests.Session(impersonate=impersonate)
            # Inject cached cf_clearance cookie
            session.cookies.set("cf_clearance", cached_clearance)

            resp = session.get(target_url, headers=headers, timeout=20)

            is_challenge = (
                resp.status_code in (403, 503)
                or "Checking your browser" in (resp.text or "")
                or "cf_chl_" in (resp.text or "")
            )

            if not is_challenge and resp.status_code == 200:
                logger.info("[flaresolverr] fast-path hit for %s", target_url)
                return resp.text, {"cf_clearance": cached_clearance}

            logger.info(
                "[flaresolverr] fast-path miss (status=%d, challenge=%s) — falling back to FlareSolverr",
                resp.status_code, is_challenge,
            )
        except Exception as exc:
            logger.warning("[flaresolverr] fast-path error (%s) — falling back", exc)

    # FlareSolverr path
    logger.info("[flaresolverr] solving via FlareSolverr: %s", target_url)
    solution = fetch_via_flaresolverr(
        target_url,
        max_timeout=max_timeout,
        flaresolverr_endpoint=flaresolverr_endpoint,
    )
    return solution.response, solution.cookie_dict()


# ── CLI smoke (used in integration smoke only, not unit tests) ────────────────

if __name__ == "__main__":
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else "https://www.investing.com/economic-calendar/"
    print(f"Fetching via FlareSolverr: {url}", file=sys.stderr)
    try:
        html, cookies = fetch_with_fast_path(url)
        # Redact cookie values in output
        safe_cookies = {k: "[REDACTED]" for k in cookies}
        print(json.dumps({
            "status": "ok",
            "html_length": len(html),
            "cookies_obtained": list(safe_cookies.keys()),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }))
    except FlareSolverrError as exc:
        print(json.dumps({"status": "error", "reason": str(exc)}))
        sys.exit(1)
