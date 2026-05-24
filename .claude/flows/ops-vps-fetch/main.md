<!-- size-justification: 150L — VPS recon flow; SSH probe commands, anti-bot classification table, recon doc schema pointer, and signal drop spec are all mandatory; mirrors ops-mainserver-fetch intentionally — same structure, different execution environment -->
# ops-vps-fetch — Main Flow

**Tools:** `.claude/tools/package/ops.md`

> Error boundary + boundary rules → `.claude/skills/cowork-boundary/SKILL.md`

---

## Input

Signal file `docs/signals/ops-vps-fetch-<ts>.json` OR direct user request naming a source URL.

## Output

`docs/vps-sources/<source-name>/recon.md` written | `docs/signals/dev-vps-crawls-<ts>.json` dropped | WORK channel notification.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `ops-vps-fetch`)

---

## Step 1 — Parse Trigger

Read inbound signal or user message. Extract:
- `source_name` — kebab-case identifier (e.g. `vietstock-prices`)
- `source_url` — full URL to probe
- `trigger` — `fetch_broken` or `new_source_needed`

If signal file: read `docs/signals/ops-vps-fetch-<ts>.json` (drain it — move to `docs/signals/processed/`).

---

## Step 2 — VPS Connection Check

```bash
ssh root@$VINAHOST_IP "echo ok"
```

If timeout after 3 attempts:
```
send_telegram(channel="bug", message="[ops-vps-fetch] SSH timeout — cannot reach VPS for <source_name> recon")
```
EXIT.

---

## Step 3 — HTTP Probe (on VPS via SSH)

Run probe on VPS (not local — geo-block applies locally):

```bash
ssh root@$VINAHOST_IP "curl -s -o /tmp/recon-body.html -D /tmp/recon-headers.txt \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7' \
  -H 'Accept-Encoding: gzip, deflate, br' \
  -H 'Connection: keep-alive' \
  -L -w '%{http_code}|%{url_effective}|%{redirect_url}' \
  '<source_url>'"
```

Capture and fetch:
```bash
ssh root@$VINAHOST_IP "cat /tmp/recon-headers.txt"
ssh root@$VINAHOST_IP "head -c 2000 /tmp/recon-body.html"
```

For JSON APIs — add `-H 'Accept: application/json'` and remove HTML Accept.

---

## Step 4 — Analyze Results

From probe output, determine:

| Signal | Conclusion |
|--------|-----------|
| HTTP 200, clean HTML/JSON | No anti-bot |
| `cf-ray` header + `Checking your browser` body | Cloudflare JS challenge |
| `__cf_bm` cookie + 403 managed_challenge body | Cloudflare Managed |
| 403 with no Cloudflare headers | IP block |
| CAPTCHA iframe in body | Captcha gate |
| Redirect to /login or HTTP 401 | Login required |
| Non-CF JS that sets cookie via computation | JS mini challenge |

Extract DOM selectors (grep `<table`, `<div class=`, key `id=` attrs) or JSON paths from body excerpt.

---

## Step 5 — Write Recon Doc

Create `docs/vps-sources/<source-name>/` directory if needed.

Write `docs/vps-sources/<source-name>/recon.md` using schema from `docs/agents/ops-vps-fetch/knowledge.md § Recon Doc Schema`.

Required fields (none optional):
- Source URL
- Working request recipe (exact curl command that worked, or closest that gave most info)
- HTTP probe results (status, final URL, redirect chain)
- Anti-bot assessment (type + evidence + recommendation)
- Page structure (selectors or JSON paths)
- Sample response excerpt (≤500 chars)

---

## Step 6 — Drop Signal to dev-vps-crawls

Write `docs/signals/dev-vps-crawls-<ISO-timestamp>.json` using payload spec from `docs/agents/ops-vps-fetch/knowledge.md § Signal Payload Spec`.

---

## Step 7 — Notify WORK Channel

```
[ops-vps-fetch] Recon complete — <source_name>
Anti-bot: <type> | Technique rec: <technique or none>
Recon: docs/vps-sources/<source-name>/recon.md
Signal: docs/signals/dev-vps-crawls-<ts>.json → dev-vps-crawls queued
```

---

**End of cycle** → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `ops-vps-fetch`)

**Commit notebook:**
```bash
git add docs/agent-memory/notebooks/ops-vps-fetch.md docs/vps-sources/<source-name>/recon.md
git commit -m "chore(memory/ops-vps-fetch): recon <source-name> YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

---

## RETURN Block

```
PIPELINE: continue
NEXT: dev-vps-crawls
CONTEXT: recon complete for <source_name> — signal at docs/signals/dev-vps-crawls-<ts>.json
```

If SSH failed or recon blocked:
```
PIPELINE: blocked
BLOCKER: <reason>
NOTIFY: bug channel — message sent
```
