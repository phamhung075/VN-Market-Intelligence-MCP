<!-- size-justification: 217L — 7-step VPS scraper orchestration (signal drain, recon, technique select+research, implement, wire, verify, signal QA) plus mandatory decision-journal step; Steps 3b/4/5 carry inline scaffolding that cannot be extracted without losing the self-contained VPS-only pattern -->
# dev-vps-crawls — Main Flow

**Tools:** `docs/agents/tools/package/developer.md`

> Error boundary + boundary rules → `.claude/skills/cowork-boundary/SKILL.md`

---

## Input

Signal file `docs/signals/dev-vps-crawls-<ts>.json` with pointer to `docs/vps-sources/<source-name>/recon.md`.

## Output

Scraper deployed on VPS | `docs/vps-crawl-techniques/<technique>.md` written (if new technique) | qa signaled.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `dev-vps-crawls`)

---

## Step 1 — Drain Signal

Read `docs/signals/dev-vps-crawls-<ts>.json`. Extract:
- `source_name`
- `recon_doc` path
- `anti_bot_type`
- `suggested_technique`

Move signal to `docs/signals/processed/`.

---

## Step 2 — Read Recon Doc (MANDATORY)

Read full `docs/vps-sources/<source-name>/recon.md`.

STOP and return to ops-vps-fetch if:
- File missing or <100 chars
- Anti-bot type is `unknown` with no evidence
- No working request recipe documented

Signal back:
```json
{ "from": "dev-vps-crawls", "to": "ops-vps-fetch", "type": "recon-insufficient", ... }
```
EXIT.

---

## Step 3 — Select Technique

Match `anti_bot_type` to technique using decision tree in `docs/agents/dev-vps-crawls/knowledge.md § Anti-Bot Decision Tree`.

If technique doc already exists in `docs/vps-crawl-techniques/`: read it.
If new technique needed: proceed to Step 3b (research).

### Step 3b — Research (if new technique)

1. WebSearch: `"<anti_bot_type> python bypass 2024 <library>"` — look for PoC code, library docs, GitHub issues.
2. WebFetch: Read 2-3 highest-signal results.
3. Synthesize approach: library + code pattern + known limits.
4. Write `docs/vps-crawl-techniques/<technique-name>.md` using template:

```markdown
# Technique — <technique-name>

**Problem:** <what anti-bot mechanism this bypasses>
**Anti-bot type:** <cloudflare_js | cloudflare_managed | ip_block | captcha | login_required | js_mini>
**Date documented:** YYYY-MM-DD

## Solution Approach
<1-paragraph description of the bypass strategy>

## Libraries Required
- <library> == <version> (install: pip install <library>)

## Code Snippet
```python
# <minimal working example>
```

## Known Limits
- <limit 1>
- <limit 2>

## References
- <URL 1>
```
```

---

## Step 4 — Implement Scraper on VPS

### 4a — VPS Connection Check
```bash
ssh root@$VINAHOST_IP "echo ok"
```
Timeout × 3 → `send_telegram(channel="bug", message="[dev-vps-crawls] VPS SSH connection failed after 3 attempts — EXIT")` + EXIT.

### 4b — Write Scraper Script
Deploy `/root/scrapers/<source-name>.py` on VPS:

```bash
ssh root@$VINAHOST_IP "cat > /root/scrapers/<source-name>.py << 'EOF'
<scraper code>
EOF"
```

Scraper must:
- Accept `--url` or env var for target URL
- Return JSON: `{"status": "ok", "data": [...], "fetched_at": "<ISO>"}`
- Handle errors gracefully (return `{"status": "error", "reason": "..."}`)
- Use ONLY: requests, httpx, curl_cffi, cloudscraper, beautifulsoup4, lxml
- NEVER import playwright, puppeteer, selenium, chromium

### 4c — Install Dependencies (if new)
```bash
ssh root@$VINAHOST_IP "pip install <library>==<version>"
```

### 4d — Verify Script Runs
```bash
ssh root@$VINAHOST_IP "python /root/scrapers/<source-name>.py"
```
Must return `{"status": "ok", ...}`. If error — debug on VPS, iterate.

---

## Step 5 — Wire into VPS Router

Add route to VPS endpoint router (port 8765) so local MCP server can PULL:

```bash
ssh root@$VINAHOST_IP "cat /root/vps-router.py"  # examine current router
```

Add endpoint `/vps-crawls/<source-name>` that calls the scraper script. Follow existing pattern.

Restart router:
```bash
ssh root@$VINAHOST_IP "systemctl restart vn-router.service || python /root/vps-router.py &"
```

---

## Step 6 — Verify Endpoint

From VPS (simulates local MCP server pull):
```bash
ssh root@$VINAHOST_IP "curl -s http://localhost:8765/<endpoint-path> | head -c 500"
```
Must return JSON with `"status": "ok"`.

If endpoint returns error: debug scraper → Step 4d.

---

## Step 7 — Signal QA

**Decision journal** (mandatory — before REVIEW):
→ skill: `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<active task_id from task_board>"]
Write at minimum ONE entry per task stamped with its task-id (record WHY this technique was chosen, not on terminal). Routine: `what-considered: "only path: <reason>"`, `why-change: "no change from plan"`.

Update `docs/data/orch/orch-state.json .task_board` task status for QA review (standard dev chain: atomic write per §2.3).

WORK channel notification:
```
[dev-vps-crawls] Scraper operational — <source_name>
Endpoint: VPS:8765/<endpoint-path>
Technique: <technique-name>
Technique doc: docs/vps-crawl-techniques/<technique>.md
Recon doc: docs/vps-sources/<source-name>/recon.md
Verified: curl → 200 OK
Next: qa validation
```

---

**End of cycle** → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `dev-vps-crawls`; APPEND class — AC-3 settled-write + AC-5 wc gate apply)

**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`:
```bash
# own_paths: [docs/agent-memory/notebooks/dev-vps-crawls.md, docs/vps-crawl-techniques/<technique>.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/dev-vps-crawls.md docs/vps-crawl-techniques/<technique>.md
git commit -m "feat(vps-crawls): <source-name> scraper — <technique-name> bypass"
```
Convention: `docs/policies/commit-convention.md`

---

## RETURN Block

```
PIPELINE: continue
NEXT: qa
CONTEXT: <source_name> scraper operational — endpoint VPS:8765/<endpoint> — technique <technique>
```

If recon insufficient:
```
PIPELINE: continue
NEXT: ops-vps-fetch
CONTEXT: recon insufficient for <source_name> — signal dropped for updated probe
```

If implementation blocked (technique dead-end):
```
PIPELINE: blocked
BLOCKER: <reason — e.g. all known bypass techniques rate-limited>
NOTIFY: bug channel — message sent
```
