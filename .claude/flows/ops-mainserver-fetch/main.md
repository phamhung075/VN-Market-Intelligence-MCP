<!-- size-justification: 178L — single fetch-and-recon flow; probe commands, geo-block decision table, anti-bot classification table, and recon doc schema are all mandatory operational content with no factoring seam -->
# ops-mainserver-fetch — Main Flow

**Tools:** `.claude/tools/package/ops.md`

> Error boundary + boundary rules → `.claude/skills/cowork-boundary/SKILL.md`

---

## Input

Signal file `docs/signals/ops-mainserver-fetch-<ts>.json` OR direct user request naming a source URL.

## Output

`docs/mainserver-sources/<source-name>/recon.md` written | `docs/signals/dev-mainserver-crawls-<ts>.json` dropped (or `docs/signals/ops-vps-fetch-<ts>.json` if geo-blocked) | WORK channel notification.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `ops-mainserver-fetch`)

---

## Step 1 — Parse Trigger

Read inbound signal or user message. Extract:
- `source_name` — kebab-case identifier (e.g. `trading-economics-gdp`, `yahoo-finance-vn`)
- `source_url` — full URL to probe
- `trigger` — `fetch_broken` or `new_source_needed`

If signal file: read `docs/signals/ops-mainserver-fetch-<ts>.json` (drain it — move to `docs/signals/processed/`).

---

## Step 2 — HTTP Probe (local, no SSH)

Run probe directly from main server (international sources do not require VPS proxy):

```bash
curl -s -o /tmp/mainserver-recon-body.html -D /tmp/mainserver-recon-headers.txt \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Accept-Encoding: gzip, deflate, br' \
  -H 'Connection: keep-alive' \
  -H 'Upgrade-Insecure-Requests: 1' \
  -L -w '%{http_code}|%{url_effective}|%{redirect_url}' \
  '<source_url>'
```

Fetch headers and body excerpt:
```bash
cat /tmp/mainserver-recon-headers.txt
head -c 3000 /tmp/mainserver-recon-body.html
```

For JSON APIs — add `-H 'Accept: application/json'` and adjust Accept.

If probe hard-fails (connection refused, DNS error) after 3 attempts:
```
send_telegram(channel="bug", message="[ops-mainserver-fetch] Probe hard-fail — cannot reach <source_name> from main server")
```
EXIT.

---

## Step 3 — Geo-Block Check (MANDATORY before continuing)

From probe output, check for geo-block signals:

| Signal | Conclusion |
|--------|-----------|
| HTTP 451 | Legal geo-fence — re-route to ops-vps-fetch |
| Redirect to `geo.*` or `region.*` subdomain | Geo-gate — re-route to ops-vps-fetch |
| Body contains VN-only language gate ("available only in Vietnam", "chỉ dành cho") | Geo-block — re-route to ops-vps-fetch |
| `X-Country-Block` or equivalent header | Geo-block — re-route to ops-vps-fetch |

**If geo-blocked:**
1. Drop signal to ops-vps-fetch: `docs/signals/ops-vps-fetch-<ISO>.json` (type: `geo-block-reroute` — payload spec in `docs/agents/ops-mainserver-fetch/knowledge.md § Signal Payload Spec`)
2. Notify WORK: `[ops-mainserver-fetch] Geo-block detected — <source_name> re-routed to ops-vps-fetch`
3. Write notebook entry.
4. EXIT with RETURN block (NEXT: ops-vps-fetch).

---

## Step 4 — Analyze Anti-Bot Results

From probe output, determine anti-bot type:

| Signal | Conclusion |
|--------|-----------|
| HTTP 200, clean HTML/JSON | None |
| `cf-ray` header + `Checking your browser` body | Cloudflare JS challenge |
| `__cf_bm` cookie + 403 managed_challenge body | Cloudflare Managed |
| `datadome` cookie OR redirect to `geo.captcha-delivery.com` | DataDome |
| `_pxhd` / `_pxvid` cookies OR `/_Incapsula_Resource` pattern | PerimeterX |
| `_abck` cookie OR Akamai sensor data challenge | Akamai Bot Manager |
| 403 with no recognized bot-manager headers | IP block |
| CAPTCHA iframe or `g-recaptcha` / `h-captcha` in body | Captcha gate |
| Redirect to /login or HTTP 401 | Login required |
| Non-recognized JS setting cookie via computation | JS mini challenge |

Use WebFetch as second vantage if needed to confirm result.

Extract DOM selectors (grep `<table`, `<div class=`, key `id=` attrs) or JSON paths from body excerpt.

---

## Step 5 — Write Recon Doc

Create `docs/mainserver-sources/<source-name>/` directory if needed.

Write `docs/mainserver-sources/<source-name>/recon.md` using schema from `docs/agents/ops-mainserver-fetch/knowledge.md § Recon Doc Schema`.

Required fields (none optional):
- Source URL + probe origin (main server)
- Working request recipe (exact curl command that worked, or closest)
- HTTP probe results (status, final URL, redirect chain)
- Anti-bot assessment (type + evidence + recommendation)
- Geo-blocked flag (no — confirmed safe for main server)
- Page structure (selectors or JSON paths)
- Sample response excerpt (≤500 chars)

---

## Step 6 — Drop Signal to dev-mainserver-crawls

Write `docs/signals/dev-mainserver-crawls-<ISO-timestamp>.json` using payload spec from `docs/agents/ops-mainserver-fetch/knowledge.md § Signal Payload Spec`.

Include `headless_likely_needed: true` if anti-bot type is `datadome`, `perimeterx`, or `akamai_bot`.

---

## Step 7 — Notify WORK Channel

```
[ops-mainserver-fetch] Recon complete — <source_name>
Anti-bot: <type> | Headless likely: <yes|no> | Technique rec: <technique or none>
Recon: docs/mainserver-sources/<source-name>/recon.md
Signal: docs/signals/dev-mainserver-crawls-<ts>.json → dev-mainserver-crawls queued
```

---

**End of cycle** → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `ops-mainserver-fetch`)

**Commit notebook** (mutex-guarded) → skill: `.claude/skills/commit-mutex/SKILL.md`:
```bash
# own_paths: [docs/agent-memory/notebooks/ops-mainserver-fetch.md, docs/mainserver-sources/<source-name>/recon.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/ops-mainserver-fetch.md docs/mainserver-sources/<source-name>/recon.md
git commit -m "chore(memory/ops-mainserver-fetch): recon <source-name> YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

---

## RETURN Block

Normal completion:
```
PIPELINE: continue
NEXT: dev-mainserver-crawls
CONTEXT: recon complete for <source_name> — signal at docs/signals/dev-mainserver-crawls-<ts>.json
```

If geo-blocked and re-routed:
```
PIPELINE: continue
NEXT: ops-vps-fetch
CONTEXT: geo-block detected for <source_name> from main server — signal at docs/signals/ops-vps-fetch-<ts>.json
```

If probe hard-failed or recon blocked:
```
PIPELINE: blocked
BLOCKER: <reason>
NOTIFY: bug channel — message sent
```
