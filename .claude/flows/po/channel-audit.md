# PO — Channel Audit

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/TASKS.md                          # why: cross-check issues against existing tasks / fix-history grep
- docs/handoffs/tnb-audit-latest.md      # why: TNB findings to carry into audit (conditional: only if file exists)

## Step 0-TNB — Read TNB audit findings (MANDATORY)

Check if `docs/handoffs/tnb-audit-latest.md` exists. If it does:

1. Read the file completely
2. Note Overall status, direction, findings table, persisting blockers, and positive signals
3. Each finding with severity `high` → must become a sprint task (Step 1)
4. Each finding with severity `med` → evaluate during sprint planning, include if capacity allows
5. Persisting blockers → check against existing TASKS.md to avoid duplicates
6. Positive signals → acknowledge in notebook (track what's working)
7. **ACK the handoff** — append to the file:
   ```markdown

   ---
   ## PO ACK
   - Read by: po
   - At: {ISO timestamp — get via `date -u +"%Y-%m-%dT%H:%M:%SZ"`, use verbatim}
   - Tasks created: {list of task IDs, or "none — all GOOD"}
   - Skipped findings: {list of finding #s skipped with reason, or "none"}
   ```

If the file does not exist: log `"[po] No TNB handoff file found — skipping Step 0-TNB"` in notebook and proceed normally.

## Step 1: Channel Audit

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
| **Content mismatch** | Message topic doesn't match the channel | Flag in notebook, spawn `claude-manager-helper` if pattern is recurring |
| **Cowork doing wrong thing** | Agent reports completing work that contradicts sprint goal | Open correction task → `ba` for re-spec |
| **Silent period** | A channel has had 0 messages in >2h during market hours | Flag as potential pipeline failure → `ops` |
| **Strategy error** | Agent applies wrong methodology, incorrect thresholds, flawed logic | Open fix task → `developer` |
| **Logic error** | Calculation wrong, condition inverted, comparison backward | Open fix task → `developer` |
| **UX / display issue** | Bad formatting, missing Vietnamese diacritics, truncated text | Open UX task → `developer` |
| **Incomplete information** | Alert missing key data user needs | Open UX task → `developer` |

**Evaluate from the user's perspective:**
- Would the user understand this message?
- Does the output reflect what was actually asked?
- Are signals actionable or just noise?
- Are agents reporting progress on the right tasks?
- Is the strategy/logic sound? (not just error-free, but *correct*)
- Would the user find this message *useful*? (not just valid but actually helpful)

### Step 1a — Chat group review

```
read_telegram_reports(channel="market-group", limit=10)
```

Scan user messages for:
- Complaints about message quality, formatting, or missing details
- Questions that reveal the alerts are confusing or incomplete
- Requests for features or changes (implicit or explicit)
- User pointing out wrong data, bad analysis, or misleading signals

Each finding → task in TASKS.md with category `ux` or `bug`.

### Step 1b — Cross-check issues against fix history (MANDATORY if any issue found)

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
| No | — | New bug — open task → `developer` |
| Yes | Yes | Regression — open task, tag `regression`, priority HIGH |
| Yes | No | Deploy gap — open task → `ops`: rebuild container (`docker compose up -d --build`) |
| Done task exists, no git fix | — | Task was closed prematurely — reopen it, priority HIGH |

**Never open a duplicate bug task.** Always resolve the root cause (regression vs deploy gap) first.

---

**If 1+ issues found**: create bug/correction tasks in docs/TASKS.md (with correct root-cause label) before proceeding to sprint planning.

**If clean**: proceed to No-Task Guard.

**Append to notebook** (`docs/agent-memory/notebooks/po.md`):
```
Channel audit: MARKET(N msgs, X issues) | WORK(N msgs, X issues) | BUG(N msgs, X issues)
Issues: [list with root-cause: new/regression/deploy-gap/premature-close] | CLEAN
```

## Step 2: No-Task Guard

Before doing anything, check:
1. docs/TASKS.md — any pending/in-progress tasks? → handle those first
2. `read_telegram_reports(status="new")` — any user requests? → handle those first
3. Channel audit (Step 1) found issues? → self-initiate sprint from those findings
4. All empty AND channels clean → return:
```
## RETURN
DONE: No tasks, no user requests, channels clean
NEXT: user | provide session goal or priority to initiate next sprint
PIPELINE: idle
```

**PO CAN self-initiate** when channel audit found bugs, strategy errors, UX issues, or logic problems — these are the sprint backlog.

## RETURN

```
DONE: Channel audit complete — N issues found
ISSUES: [list or CLEAN]
PIPELINE: continue → sprint-plan | idle
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → flows/po/bug-triage.md        # when: BUG channel has unclassified bug messages not yet in TASKS.md
- → flows/po/sprint-plan.md       # when: channels clean (or bugs filed) AND no critical blockers AND sprint capacity available
- → STOP                          # when: No-Task Guard triggered — no tasks, no requests, channels clean
