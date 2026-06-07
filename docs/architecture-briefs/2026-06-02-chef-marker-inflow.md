---
brief_id: FU-CHEF-MARKER-INFLOW
date: 2026-06-02
author: architect
zone: docs/agents/unified-agent/flow/
status: READY-FOR-IMPL
severity: HIGH
prior_fix_commits: [de5d6d1b, b5296672]
recurring_bug_escalation: true
---

# FU-CHEF-MARKER-INFLOW — Chef Flow Published-Marker Self-Ownership Contract

## 1. Defect Summary (PO-verified, two coupled defects)

### Defect A — Marker lives outside the flow (externally injected, bypassable)

The `published:<slot_id>:<VN-date>` dedup marker is today injected by the cowork
dispatcher prompt (main.md §Step 5 comment block). It is NOT inside chef.md.

Consequence: any spawn that arrives via a path other than the canonical cowork
dispatcher (direct `run chef.md slot=...`, refactored trigger, future RemoteTrigger)
executes chef.md start-to-finish, hits `send_telegram(channel="market", ...)` in Step 7
with zero marker check, and publishes. This is how the 2026-06-02 07:19Z dry-run duplicate
intraday dish was triggered (see `feedback_chef_dryrun_publishes`). The MARKET Telegram
channel has no delete capability — the duplicate is irreversible.

### Defect B — Marker released immediately after publish (per-execution-lock semantics, not dup-guard semantics)

Confirmed from signal `cowork-team-20260601T171828Z.json` (chef-eod 2026-06-02):
the marker for `chef-eod` was claimed, `send_telegram` was called, and then
`task_release` was called on the marker key — returning it to unclaimed state.

A second execution arriving within the same ~28h window (cron + legacy RemoteTrigger
parallel-run, retry under transport lag, or any near-simultaneous dispatch) re-acquires
the freed marker and double-publishes.

The cowork dispatcher had to manually probe-claim the freed marker and restore it with
a 28h TTL (ops intervention, 2026-06-02) to protect AC-6. This is not a stable fix —
every released marker re-opens the window until it expires naturally.

---

## 2. Recurring-Bug Escalation Analysis

This is the THIRD fix on the chef dedup / dispatch-reliability family:
- `de5d6d1b` — COWORK-CHEF-ROLE: dispatcher prompt-injection approach introduced
- `b5296672` — COWORK-LEADER-SELFLOCK: leader-lock self-blocking (sibling defect)
- **This brief** — marker not in flow; marker released after publish (TTL semantics wrong)

Per `feedback_recurring_bug_escalation` (≥2 fix commits on same module): root-cause
contract review, not another prompt-injection patch.

**Root cause of the recurrence class:**

The design split responsibility: dispatcher owns when-to-spawn, agent-flow owns
what-to-publish, but the *published-marker lifecycle* was assigned to the dispatcher
side (as prompt injection). This split has two structural problems:

1. The marker is not co-located with the guarded operation (`send_telegram`). Any
   path that reaches `send_telegram` without running the dispatcher's preamble bypasses
   the dedup entirely. Defense must be co-located with the resource it protects.

2. The intent of the marker is a CONTENT dup-guard (one MARKET publish per slot per
   VN calendar day), but it was being claimed/released like an execution token (short
   TTL, released after the operation). These are semantically opposite:
   - Execution token: claim→execute→release (short TTL, re-entrant is OK)
   - Content dup-guard: claim→execute→HOLD until content expires (~28h)

   The dispatcher comment block (main.md §Step 5) correctly specifies `ttl_seconds:
   100800` (28h) with NO release, but the running flow was releasing the marker anyway,
   contradicting the contract.

---

## 3. Correct Contract (Design Decision)

### 3a. Marker must be claimed INSIDE chef.md, immediately before send_telegram

The claim step belongs in chef.md Step 7, between the message assembly and the
`send_telegram(channel="market", ...)` call. It must NOT be in the dispatcher prompt.

The dispatcher prompt instruction is supplementary documentation and may remain as a
comment for discoverability, but it is NOT the enforcement mechanism.

### 3b. Marker must NEVER be released — let it expire on its 28h TTL

The marker key is `published:<slot_id>:<YYYY-MM-DD>` (VN date, GMT+7). Its TTL of
100800s (28h) is the content-cycle guard. Releasing it converts a content-dup-guard
into an execution-token — a category error that re-opens the double-publish window.

**Silent-exit semantics on claimed=false:** when the marker is already held (same
slot + same VN date), chef.md MUST exit silently without:
- emitting a FAILED telemetry
- sending any WORK error message
- logging an error to WORK channel

Silent-exit here is correct behavior (not an error) because the slot was already
served today. The LOG step (Step 8) should record `dish_published: BLOCKED_DUP` in the
notebook.

### 3c. Key format and TTL (no change from current dispatcher spec)

```
key     = "published:" + $SLOT_ID + ":" + <VN_DATE>
VN_DATE = TZ="Asia/Ho_Chi_Minh" date +%Y-%m-%d   (GMT+7, daily boundary)
ttl     = 100800   (28h — ARCH-DECIDE-D, covers full 24h cycle + 4h drift buffer)
task_kind = "cowork-slot"
owner_agent = "unified-agent"
```

Weekly slots (digest-sunday, tnb-audit): `VN_DATE = YYYY-WW` format, `ttl = 691200`
(~8 days). Chef slots are all daily — `YYYY-MM-DD` only.

### 3d. Interaction with dispatcher-injected instruction

The dispatcher prompt in main.md §Step 5 currently contains an instruction block
telling the spawned agent to claim the marker. After this fix:

- The instruction block in main.md becomes a comment/documentation-only block.
  It must NOT attempt to claim the marker itself (double-claim risk if the agent
  is spawned via a dispatcher path AND chef.md also claims it).
- `task_claim` is idempotent in "same caller re-claims an active key" only when
  `owner_agent` matches AND the server's `owner_session` matches. From two different
  Claude sessions, a second `task_claim` on an already-held key returns `claimed:false`
  regardless of `owner_agent`. There is NO double-claim correctness problem if the
  dispatcher does NOT claim the marker — the whole point of this fix is to move
  the claim into chef.md and REMOVE it from the dispatcher's responsibility.

The dispatcher comment block must be updated to say: "Published-marker claim lives
inside each agent flow. Dispatcher does NOT claim it. This comment documents the
contract only."

---

## 4. Precise Step 7 Change (pseudocode — both Block A and Block B)

Insert between "Assemble Block A message text" and `send_telegram(channel="market", ...)`:

```
## Step 7 — WRITE DISH (before send_telegram MARKET)

# 7a. Published-marker self-ownership guard (FU-CHEF-MARKER-INFLOW)
# Must run BEFORE send_telegram(channel="market"). NOT before WORK send.
WORK_DATE=$(TZ="Asia/Ho_Chi_Minh" date +%Y-%m-%d)   # VN date (GMT+7)
PUBLISHED_KEY="published:${SLOT_ID}:${WORK_DATE}"

MARKER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     PUBLISHED_KEY,
  task_kind:   "cowork-slot",
  owner_agent: "unified-agent",
  ttl_seconds: 100800    # 28h — ARCH-DECIDE-D; do NOT release; let TTL expire
}))

if MARKER_CLAIM.claimed != true:
  log "[chef] publish blocked — already published slot=" + SLOT_ID + " date=" + WORK_DATE
  # Append to notebook: dish_published=BLOCKED_DUP (Step 8b)
  goto Step8_LogOnly   # Write notebook + commit; skip send_telegram entirely
  # Do NOT emit FAILED telemetry — BLOCKED_DUP is correct behavior, not an error

# Marker claimed — proceed with send_telegram
# Do NOT call task_release on PUBLISHED_KEY at any point in this flow.
```

`$SLOT_ID` is received as the `slot=<slot_id>` parameter in the spawn prompt
(e.g. `slot=chef-morning`). It is available to the flow from the invocation context.

The WORK message (Block B) is sent AFTER the MARKET send. The marker gates only
the MARKET publish — Block B is audit-only and may always be sent.

---

## 5. Step 8 Change (LOG step)

Add a `BLOCKED_DUP` branch to Step 8b notebook append:

```
# When Step 7a exited with BLOCKED_DUP:
## Session: <YYYY-MM-DD> (<DISH_TYPE>)
### Chef Dish — <DISH_TYPE> HH:MM UTC
- Clusters qualified: N/A (blocked before analysis, OR analysis complete but publish blocked)
- Dish published: BLOCKED_DUP (marker key=<PUBLISHED_KEY> already held)
```

Step 8c/8d/8e (prune guards) and Step 8f (commit) still run — notebook must be committed
even on BLOCKED_DUP to record the guard fired.

---

## 6. What Stays Unchanged

- `send_telegram(channel="work", ...)` — no marker on WORK channel (audit-only, idempotent
  by design; TNB audit expects to see all attempts).
- The dispatcher `task_claim/task_release` on `cowork-slot:<slot_id>` (execution token) —
  this is a DIFFERENT key from the published marker. Per-slot execution token is still
  claimed+released by the dispatcher as before.
- The marker TTL value (100800 = 28h) — no change.
- Key format `published:<slot_id>:<VN_DATE>` — no change.
- All other chef.md Steps 0–6, 6.5 — no change.

---

## 7. Dispatcher main.md Change (documentation update only)

In `docs/agents/cowork-team/flow/main.md` §Step 5, the current comment block:
```
Pattern each spawned agent MUST follow (in its own flow, before send_telegram):
  1. Compute work_date = ...
  2. Claim the published marker: ...
  3. if publish_claim.claimed == false: EXIT
  4. if publish_claim.claimed == true: proceed with send_telegram
```

Must be updated to:
```
Published-marker contract (FR-P2-7, FU-CHEF-MARKER-INFLOW):
  The marker claim is INSIDE each publishing agent's flow (e.g. chef.md Step 7a).
  The dispatcher does NOT claim or release published markers.
  This block documents the contract; it is NOT the enforcement mechanism.
  key = "published:<slot_id>:<YYYY-MM-DD>" (VN date, GMT+7)
  ttl = 100800 (28h, daily slots) — never released; let expire naturally.
```

The long pseudocode block in the dispatcher is REMOVED to avoid confusion with the
authoritative implementation in chef.md.

---

## 8. Implementation DoD for agent-father

### Files to modify

1. `docs/agents/unified-agent/flow/chef.md`
   - Add Step 7a marker-guard block (Section 4 above) — before send_telegram MARKET only.
   - Add BLOCKED_DUP notebook-append path in Step 8b (Section 5 above).
   - Update size-justification comment on line 1 (+~15L for the new block).

2. `docs/agents/cowork-team/flow/main.md`
   - §Step 5 comment block: replace long pseudocode with documentation-only text (Section 7).
   - Keep the `Important — Published marker gate (FR-P2-7)` prose paragraph but remove
     the code block (it is now in chef.md where it belongs).

### Verification recipe (no test suite — raw-diff + dry-run)

**V-1 (raw-diff read):**
After the edit, `Read` chef.md and verify:
- Line immediately before `send_telegram(channel="market", ...)` contains `task_claim`
  with `task_id` matching `published:${SLOT_ID}:...`.
- NO `task_release` is called on `PUBLISHED_KEY` anywhere in the file.
- The `if MARKER_CLAIM.claimed != true` branch leads to notebook-append and commit,
  NOT to FAILED telemetry.

**V-2 (preamble guard in dry-run):**
Spawn chef.md with `slot=chef-eod` and an explicit preamble:
  "You MUST NOT call send_telegram under any circumstances in this run."
Verify MARKET channel receives zero messages (read last 5 msgs via Telegram bot).
Verify BLOCKED_DUP or SILENT notebook entry was committed.

**V-3 (dispatcher comment is doc-only):**
`grep -n "task_claim\|task_release" docs/agents/cowork-team/flow/main.md`
Confirm: zero `task_claim` calls reference `published:` in the dispatcher flow.
(The dispatcher may still have the prose comment, but no executable claim call.)

**V-4 (TTL-expiry no-release):**
`grep -n "task_release" docs/agents/unified-agent/flow/chef.md`
Confirm: NO `task_release` call appears in chef.md for any key containing `published:`.

**V-5 (BLOCKED_DUP is silent, not FAILED):**
Read chef.md Step 8 block; confirm `BLOCKED_DUP` path does NOT call
`send_telegram(channel="work", "FAILED ...")` or emit FAILED telemetry.

### Acceptance criteria

**AC-MI-1:** chef.md Step 7a calls `task_claim` on `published:${SLOT_ID}:${WORK_DATE}`
immediately before `send_telegram(channel="market", ...)`. No code path reaches the
MARKET send without first passing through the marker claim.

**AC-MI-2:** chef.md contains zero `task_release` calls on any key beginning with
`published:`.

**AC-MI-3:** When `MARKER_CLAIM.claimed == false`, the flow exits at Step 7a without
calling `send_telegram(channel="market", ...)`. The WORK Block B message is still sent
(if it had already been assembled) — WORK is audit-only.

**AC-MI-4:** BLOCKED_DUP path records in the notebook (Step 8b) and commits (Step 8f).
No FAILED telemetry is emitted for BLOCKED_DUP.

**AC-MI-5:** Dispatcher main.md §Step 5 contains no executable `task_claim` or
`task_release` call for a key beginning with `published:`.

**AC-MI-6 (non-regression):** A freshly-spawned chef run with no prior marker for the
slot+date proceeds past Step 7a normally (marker claimed → MARKET sent).

### Commit message template

```
fix(chef): FU-CHEF-MARKER-INFLOW — move published-marker into chef.md, no-release contract

Defect A: marker was dispatcher-prompt-injected → bypassable by any direct spawn.
Defect B: marker released after publish → per-execution-lock not dup-guard → same-window
          re-spawn re-acquires freed marker and double-publishes to MARKET channel.

Fix: move task_claim(published:SLOT_ID:VN_DATE) into chef.md Step 7a immediately before
send_telegram(channel=market). Remove task_release on published-marker — let 28h TTL
expire naturally (ARCH-DECIDE-D). BLOCKED_DUP is a silent-exit, not an error.
Dispatcher §Step 5 comment updated to doc-only; no executable claim in dispatcher.

Zone: docs/agents/unified-agent/flow/
AC: AC-MI-1..6
```

---

## 9. Open Items (non-blocking, flag for PO backlog)

1. **Other publishing agents:** The dispatcher §Step 5 comment lists "each spawned agent"
   as responsible for the marker pattern. If any slot other than unified-agent publishes
   to MARKET channel, it inherits the same Defect A/B vulnerability. Audit all
   `send_telegram(channel="market", ...)` calls in all agent flows.

2. **Intraday silent-exit vs BLOCKED_DUP:** chef-intraday can already exit silently
   (0 clusters). The notebook-append format for BLOCKED_DUP must be distinguishable
   from an intraday silent-exit for ops diagnosis. Recommend adding a `reason` field:
   `dish_published: SILENT | BLOCKED_DUP | YES`.

*Brownfield scan complete. Zero new MCP tools proposed — fix reuses existing
`task_claim` call (pattern already in dispatcher). One-file-primary edit in chef.md;
one documentation-only update in main.md.*
