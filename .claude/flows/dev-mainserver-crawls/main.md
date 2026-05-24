<!-- size-justification: 202L — technique research (Step 3b) and inline code scaffolding extracted to technique-research.md; remaining content is the 8-step scraper orchestration (drain signal, recon check, technique select, implement, wire, verify, RAM check, signal QA) which is atomic sequential flow with no further factoring seam -->
# dev-mainserver-crawls — Main Flow

**Tools:** `.claude/tools/package/developer.md`

> Error boundary + boundary rules → `.claude/skills/cowork-boundary/SKILL.md`

---

## Input

Signal file `docs/signals/dev-mainserver-crawls-<ts>.json` with pointer to `docs/mainserver-sources/<source-name>/recon.md`.

## Output

Scraper wired into microservice | `docs/mainserver-crawl-techniques/<technique>.md` written (if new technique) | qa signaled.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `dev-mainserver-crawls`)

---

## Step 1 — Drain Signal

Read `docs/signals/dev-mainserver-crawls-<ts>.json`. Extract:
- `source_name`
- `recon_doc` path
- `anti_bot_type`
- `suggested_technique`
- `headless_likely_needed`

Move signal to `docs/signals/processed/`.

---

## Step 2 — Read Recon Doc (MANDATORY)

Read full `docs/mainserver-sources/<source-name>/recon.md`.

STOP and return to ops-mainserver-fetch if:
- File missing or <100 chars
- Anti-bot type is `unknown` with no evidence
- No working request recipe documented

Signal back:
```json
{ "from": "dev-mainserver-crawls", "to": "ops-mainserver-fetch", "type": "recon-insufficient", ... }
```
EXIT.

---

## Step 3 — Select Technique

Match `anti_bot_type` to technique using decision tree in `docs/agents/dev-mainserver-crawls/knowledge.md § Anti-Bot Decision Tree`.

**Escalation order (lightest first):**
1. requests / httpx — if `none` or simple IP block
2. curl_cffi — if TLS fingerprint or CF JS
3. cloudscraper — if Cloudflare Managed
4. playwright-stealth — if DataDome, PerimeterX, or complex CF (headless permitted)
5. Botasaurus / hrequests — if Akamai Bot or advanced fingerprint detection

If technique doc already exists in `docs/mainserver-crawl-techniques/`: read it.
If new technique needed: → run sub-flow: `.claude/flows/dev-mainserver-crawls/technique-research.md`

---

## Step 4 — Implement Scraper

### 4a — Determine target microservice

Use zone-detect skill (`.claude/skills/zone-detect/SKILL.md`) to identify which microservice handles this data type:
- International macro (GDP, CPI, rates, PMI) → `apps/macro-indicators/`
- International price feeds → `apps/stock-price/`
- International news → news-related microservice

### 4b — Write Scraper Module

Place scraper in `apps/<service>/src/infrastructure/scrapers/<source-name>.py`:

Scraper must:
- Accept source URL from config or env var
- Return structured dict/JSON: `{"status": "ok", "data": [...], "fetched_at": "<ISO>"}`
- Handle errors gracefully (return `{"status": "error", "reason": "..."}`)
- For headless scrapers: close browser context after each fetch to free RAM

Code patterns → `.claude/flows/dev-mainserver-crawls/technique-research.md § Code Pattern`

### 4c — Install Dependencies (if new)

Install commands → `.claude/flows/dev-mainserver-crawls/technique-research.md § Install Dependencies`

### 4d — Verify Scraper Runs

```bash
python apps/<service>/src/infrastructure/scrapers/<source-name>.py
```
Must return `{"status": "ok", ...}`. If error — debug, iterate.

### 4e — RAM Profiling (headless only)

RAM profiling command → `.claude/flows/dev-mainserver-crawls/technique-research.md § RAM Profiling`
Record in technique doc and notebook. Check container budget rule from knowledge.md.

---

## Step 5 — Wire into Microservice

Wire the scraper into the use-case and scheduler layers following DDD pattern:

```
apps/<service>/src/infrastructure/scrapers/<source-name>.py  (scraper — DONE)
apps/<service>/src/application/usecases/fetch<Source>.ts     (use-case wrapper — add method)
apps/<service>/src/interface/scheduler/<source-name>Job.ts   (cron job — create if needed)
```

Follow existing patterns in the target microservice. Run tests:
```bash
cd apps/<service> && npm test  # or pytest for Python service
```

---

## Step 6 — Verify Output

```bash
python apps/<service>/src/infrastructure/scrapers/<source-name>.py
```
Must return JSON with `"status": "ok"` and non-empty `data`. If error — debug scraper → Step 4d.

---

## Step 7 — RAM Budget Check

Sum headless browser RAM across all scrapers in the target container. If total > 80% of container memory limit:
```
send_telegram(channel="work", message="[dev-mainserver-crawls] RAM budget flag — <service> container at >80% memory with <source-name> headless scraper (~<N>MB). Ops: compose memory tuning needed.")
```
Do NOT modify docker-compose.yml — flag only.

---

## Step 8 — Signal QA

Write `docs/TASKS.md` entry for QA review (standard dev chain format).

WORK channel notification:
```
[dev-mainserver-crawls] Scraper operational — <source_name>
Microservice: apps/<service>/
Technique: <technique-name>
Technique doc: docs/mainserver-crawl-techniques/<technique>.md
Recon doc: docs/mainserver-sources/<source-name>/recon.md
RAM cost: ~<N>MB (headless: <yes|no>)
Verified: local run → 200 OK / data present
Next: qa validation
```

---

**End of cycle** → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `dev-mainserver-crawls`)

**Commit:**
```bash
git add docs/agent-memory/notebooks/dev-mainserver-crawls.md docs/mainserver-crawl-techniques/<technique>.md
git commit -m "feat(mainserver-crawls): <source-name> scraper — <technique-name> bypass"
```
Convention: `docs/policies/commit-convention.md`

---

## RETURN Block

```
PIPELINE: continue
NEXT: qa
CONTEXT: <source_name> scraper operational — microservice apps/<service>/ — technique <technique> — RAM ~<N>MB
```

If recon insufficient:
```
PIPELINE: continue
NEXT: ops-mainserver-fetch
CONTEXT: recon insufficient for <source_name> — signal dropped for updated probe
```

If RAM budget exceeded (flagged ops, not blocked):
```
PIPELINE: continue
NEXT: qa
CONTEXT: <source_name> scraper operational BUT container RAM flag sent to ops — review compose limits before next headless scraper addition
```

If implementation blocked (technique dead-end):
```
PIPELINE: blocked
BLOCKER: <reason — e.g. all known bypass techniques rate-limited for this source>
NOTIFY: bug channel — message sent
```
