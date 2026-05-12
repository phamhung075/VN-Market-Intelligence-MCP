# PO — Step 0: Channel Audit + Cross-Check

**Parent flow:** `.claude/flows/po/main.md` (Step 0 dispatcher — MANDATORY, runs before sprint planning)

---

## Step 0 — Channel Audit

Read the last 10 messages from each channel and evaluate as the **user** (not as an agent):

```
read_telegram_reports(channel="market", limit=10)
read_telegram_reports(channel="work",   limit=10)
read_telegram_reports(channel="bug",    limit=10)
```

For each message, scan for these failure signals:

| Signal | Description | Action |
|--------|-------------|--------|
| **N/A values** | Any field showing `N/A`, `null`, `undefined`, `—`, or `0.0` where real data is expected | Open bug task → `ops` |
| **Bug / error** | Stack traces, `ERROR`, `FAILED`, tool call errors, MCP exceptions | Open bug task → `ops` or `developer` |
| **Content mismatch** | Message topic doesn't match the channel (e.g. market alert in WORK, build output in MARKET) | Flag in notebook, spawn `claude-manager-helper` if pattern is recurring |
| **Cowork doing wrong thing** | Agent reports completing work that contradicts the sprint goal or doesn't match what was asked | Open correction task → `ba` for re-spec |
| **Silent period** | A channel has had 0 messages in >2h during market hours | Flag as potential pipeline failure → `ops` |
| **Strategy error** | Agent applies wrong methodology, incorrect thresholds, flawed logic (e.g. bullish signal during bearish regime, wrong sector classification, inverted comparison) | Open fix task → `developer` |
| **Logic error** | Calculation wrong, condition inverted, comparison backward, data aggregation incorrect | Open fix task → `developer` |
| **UX / display issue** | Bad formatting, missing Vietnamese diacritics, truncated text, unreadable numbers, ugly layout, missing context in alert | Open UX task → `developer` |
| **Incomplete information** | Alert missing key data user needs (no %, no direction, no comparison period, no context) | Open UX task → `developer` |

**Evaluate from the user's perspective:**
- Would the user understand this message?
- Does the output reflect what was actually asked?
- Are signals actionable or just noise?
- Are agents reporting progress on the right tasks?
- Is the strategy/logic sound? (not just error-free, but *correct*)
- Would the user find this message *useful*? (not just valid but actually helpful)

## Step 0-a2 — Chat Group Review

```
read_telegram_reports(channel="market-group", limit=10)
```

Scan user messages for:
- Complaints about message quality, formatting, or missing details
- Questions that reveal the alerts are confusing or incomplete
- Requests for features or changes (implicit or explicit)
- User pointing out wrong data, bad analysis, or misleading signals

Each finding → task in TASKS.md with category `ux` or `bug`.

## Step 0-b — Cross-Check Issues Against Fix History (MANDATORY if any issue found)

Before opening a new bug task, verify the issue wasn't already fixed:

**1. Check docs/TASKS.md** — search for the same module/ticker/tool name in Done tasks:
```
grep -i "<keyword>" docs/TASKS.md
```
If a matching Done task exists → the fix was merged. Suspect **deploy gap** (see below).

**2. Check git log** — last 20 commits for a fix on the same module:
```
git log --oneline -20 -- <affected file or path>
```
If a fix commit exists but the bug still shows in channel → **container not rebuilt**.

**3. Check container state** — is the running server actually on the latest code?
```
get_system_status()   ← compare reported version/build-time vs latest git commit timestamp
get_recent_fixes()    ← last N fixes logged by ops — was this one applied?
```

**Decision matrix:**

| Git has fix? | Container current? | Action |
|---|---|---|
| No | — | New bug — open task → `developer` (include `zone:` from affected file path) |
| Yes | Yes | Regression — open task, tag `regression`, priority HIGH (include `zone:`) |
| Yes | No | Deploy gap — open task → `ops`: rebuild container (`docker compose up -d --build`) |
| Done task exists, no git fix | — | Task was closed prematurely — reopen it, priority HIGH |

**Never open a duplicate bug task.** Always resolve the root cause (regression vs deploy gap) first.

## Step 0-c — Zone Inference (MANDATORY before emitting any FIX)

Resolve `zone:` for every FIX/SPRINT entry using this table before writing the task:

| Hint in BUG message / affected file | Zone | dev-* specialist |
|---|---|---|
| MCP tool / cron / market orchestration / `apps/mcp-server/` path | `apps/mcp-server/` | dev-mcp-server |
| HTTP routing / gateway / health agg / `apps/api-gateway/` | `apps/api-gateway/` | dev-api-gateway |
| price fallback / VPS bridge / quote agg / `apps/stock-price/` | `apps/stock-price/` | dev-stock-price |
| RSI / MACD / BB / indicator math / `apps/technical-analysis/` | `apps/technical-analysis/` | dev-technical-analysis |
| SBV FX / commodity / macro trend / `apps/macro-indicators/` | `apps/macro-indicators/` | dev-macro-indicators |
| hexagram / I-Ching / kinh dich / `apps/kinh-dich-service/` | `apps/kinh-dich-service/` | dev-kinh-dich |
| dedup / cooldown / Telegram dispatch / `apps/alert-engine/` | `apps/alert-engine/` | dev-alert-engine |
| BCTC / OCR / Vietnamese parse / `apps/pdf-extractor/` | `apps/pdf-extractor/` | dev-pdf-extractor |
| embeddings / LanceDB / semantic search / `apps/rag-service/` | `apps/rag-service/` | dev-rag-service |
| cross-service / root / scripts/ / Docker / shared infra | `cross-service/` | generic developer |
| affects 2+ apps/ subtrees | `multi` | architect must split |

Rule: every emitted FIX/SPRINT entry MUST resolve to exactly one row. If unclear → escalate to architect (don't guess).

---

**If 1+ issues found**: create bug/correction tasks in docs/TASKS.md (with correct root-cause label + zone) before proceeding to sprint planning.

**If clean**: proceed to No-Task Guard (back in main.md).

**Append to notebook** (`docs/agent-memory/notebooks/po.md`):
```
Channel audit: MARKET(N msgs, X issues) | WORK(N msgs, X issues) | BUG(N msgs, X issues)
Issues: [list with root-cause: new/regression/deploy-gap/premature-close + zone] | CLEAN
```
