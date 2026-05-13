# Technique — js-mini-challenge

**Problem:** Target sets a non-Cloudflare JS cookie challenge: the server returns a small JS snippet or an HTML page with an embedded script that computes a value (e.g. hash, timestamp XOR, math puzzle) and sets a cookie or redirects with the computed token appended. Plain requests cannot execute JS so the cookie/token is never set and subsequent requests are blocked.
**Anti-bot type:** js_mini
**Date documented:** 2026-05-13

## Solution Approach

Extract the JS challenge snippet from the initial response using regex. Execute it using either:
- `node -e "<js_code>"` (Node.js subprocess) — preferred (Node is available on VPS, fast, reliable)
- `execjs` Python library — fallback if Node not available; slower

Capture the computed cookie/token value and inject it into the session for subsequent requests. For most VN portal JS challenges, the computation is a simple arithmetic or hash operation on a server-provided seed. Full JS execution (DOM, `document`, `window`) is NOT needed — these challenges only use pure computation.

This is distinct from Cloudflare IUAM: CF has a full challenge with multiple rounds and cookie signing. Mini-challenge targets use simpler scripts that can be parsed and executed without a browser.

## Libraries Required

- `PyExecJS >= 1.5.1` (install: `pip install PyExecJS`) — Python JS runner
- OR: `node` system binary (available on VPS — `node --version` to verify)
- `requests >= 2.28` for session management

## Code Snippet

```python
import subprocess
import re
import requests
import datetime

def solve_js_challenge_node(js_code: str) -> str | None:
    """
    Execute a JS snippet using Node.js subprocess.
    Returns the computed value (string) or None on error.
    The js_code must end with a console.log() of the result.
    """
    try:
        result = subprocess.run(
            ["node", "-e", js_code],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None

def solve_with_execjs(js_code: str, call_expr: str) -> str | None:
    """
    Execute a JS snippet using execjs (fallback when node unavailable).
    call_expr: the JS expression to evaluate (e.g. "computeToken('seed123')")
    """
    try:
        import execjs
        ctx = execjs.compile(js_code)
        # execjs.eval requires a valid expression, not a statement
        return str(ctx.eval(call_expr))
    except Exception:
        return None

def fetch_with_js_challenge(
    url: str,
    challenge_pattern: re.Pattern,
    js_template: str,
    cookie_name: str,
    headers: dict | None = None,
) -> dict:
    """
    Generic mini-challenge solver.
    
    Args:
        challenge_pattern: regex to extract seed from challenge page
        js_template: JS code template with {seed} placeholder
        cookie_name: name of the cookie to set with computed value
    """
    session = requests.Session()
    h = headers or {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    }

    # Step 1: Get challenge page
    resp = session.get(url, headers=h, timeout=20)
    m = challenge_pattern.search(resp.text)
    if not m:
        # No challenge present — return directly
        return {"status": "ok", "data": resp.text, "fetched_at": datetime.datetime.utcnow().isoformat()}

    seed = m.group(1)

    # Step 2: Execute JS to compute cookie value
    js_code = js_template.format(seed=seed)
    token = solve_js_challenge_node(js_code)
    if not token:
        return {"status": "error", "reason": "js_challenge_solve_failed"}

    # Step 3: Set cookie and re-request
    session.cookies.set(cookie_name, token)
    resp2 = session.get(url, headers=h, timeout=20)
    if resp2.status_code != 200:
        return {"status": "error", "reason": f"post_challenge http={resp2.status_code}"}
    return {
        "status": "ok",
        "data": resp2.text,
        "fetched_at": datetime.datetime.utcnow().isoformat(),
    }

# Example usage pattern (hypothetical VN portal):
# CHALLENGE_RE = re.compile(r'var seed\s*=\s*["\']([^"\']+)["\']')
# JS_TMPL = "var seed = '{seed}'; var token = btoa(seed + ':ok'); console.log(token);"
# result = fetch_with_js_challenge(url, CHALLENGE_RE, JS_TMPL, "portal_token")
```

## RAM Cost

- `node -e` subprocess: ~15–30 MB per invocation (Node process spawned, then exits)
- `execjs`: ~5–10 MB (uses Node subprocess internally, same cost)
- Session: ~2 MB
- Total per-cycle cost: ~20–35 MB peak (Node exits after solve)

## Applicability to VN Sources

No current VN financial data source (as of 2026-05-13) uses a mini-challenge. The technique is documented for:

- Future VietStock login-gated insider trading data
- Any VN portal that adds a non-CF token gate
- HNX if they add a CSRF token to the BCTC POST endpoint (currently no token required)

The Oracle ADF SSC portal uses a full SPA state mechanism that is NOT solvable with execjs alone — it requires full browser rendering or XHR reverse-engineering.

## Known Limits

- Only works for pure-computation JS (no `document`, `window`, `XMLHttpRequest` calls)
- node subprocess adds latency (~200–500ms). Cache computed tokens where server allows it.
- JS code evolves: challenge scripts may change server-side at any time. Monitor for changes.
- execjs requires Node.js or another JS runtime — `node --version` on VPS to confirm availability
- Complex challenges (Cloudflare IUAM v2+, Kasada) cannot be solved with this approach

## References

- [PyExecJS GitHub](https://github.com/doloopwhile/PyExecJS)
- [Node.js subprocess in Python](https://docs.python.org/3/library/subprocess.html)
- [hsx-bctc recon — SSC ADF SPA note](docs/vps-sources/hsx-bctc/recon.md)
- [Anti-Bot Bypass Guide 2026](https://asadfix.github.io/scraping-guide/)
