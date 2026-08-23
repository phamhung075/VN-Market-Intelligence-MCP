# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

## FIX 2026-08-22T19:43Z — FIX-TRIAGE-INBOX-CLEAR-OWNERSHIP-PO-SELF-READ, dev-team-vs-po CLEAR ownership contradiction

Router-dispatched directly (no task-board row existed; router flagged the contradiction PO surfaced
during today's triage and declined to arbitrate itself — correctly, per PO's own boundary_rules).

- **Contradiction:** `docs/agents/po/flow/triage-signals.md:7` said the subtractive CLEAR on
  `.dev_team_idle_chain.pending_triage_inbox[]` belongs to `docs/agents/dev-team/flow/main.md` §
  Step 1, never PO. PO's own notebook (~90 min earlier, same session) cited that exact line to
  decline the clear. 90 minutes later the router's own direct-to-PO dispatch prompt (per
  `.claude/skills/dispatch/SKILL.md`'s "queue / triage" dispatch-table row) instructed PO to do the
  clear instead — contradicting the doc. A 64-envelope backlog (including an already-correctly-
  dispositioned 08-15 `ci_red`) had regrown because nothing reliably cleared it.
- **Root cause, verified before picking a side (not just "router guessed wrong once"):** dev-team's
  Step 1 CLEAR code (`main.md:1100-1129` before this fix) was well-formed and workable IN ISOLATION
  — it ran, in-session, immediately after PO's spawn returned, using the SAME `pendingSignals` var
  captured before spawn. But `.claude/skills/dispatch/SKILL.md:40` has a standing, sanctioned
  dispatch-table row — "queue / triage — what should we work on? → po → main" — that spawns PO
  DIRECTLY, bypassing `dev-team/flow/main.md` entirely. On that path, dev-team's Step 1 CLEAR
  block is never reached — physically unreachable, not merely skipped. Confirmed live: today's
  contradiction was exactly this — the router took the direct-dispatch path and had to improvise.
  So dev-team-Step-1-owns-it was not survivable as written; the real question was which party is
  present on BOTH invocation paths — that's PO (`docs/agents/po/flow/main.md`'s own "Called from"
  line only ever named the dev-team path — also stale, also fixed here).
- **Fix — ownership moved to PO, made self-sufficient on either invocation path:**
  - `docs/agents/po/flow/triage-signals.md`: PO's Step 0-SIG now does its own fresh
    `.dev_team_idle_chain.pending_triage_inbox` read as SSOT (never trusts a caller-supplied
    array), and owns the CLEAR unconditionally as its own last step (new executable
    `ORCH_APPLY_DECLARED_INBOX_TRIAGED`-guarded block, same shape dev-team used, `_updated_by:
    "po"`). Framing/header rewritten to name both invocation paths explicitly.
  - `docs/agents/dev-team/flow/main.md` § Step 1: removed the CLEAR write; its own durable-inbox
    read is kept, re-scoped to the no-op short-circuit gate + convenience-pass only. History
    comment appended (established convention).
  - `docs/agents/po/flow/main.md`: "Called from: dev-team Step 1" / "Receives: pendingSignals[]
    from Step 0a" lines corrected to name both paths + PO's self-read (this was flagged as a known
    residual gap by `FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION` 2026-08-09 and left untouched then —
    closed now, same task).
  - `docs/agents/dev-team/flow/drain-signals.md`: cross-reference pointer that named
    `dev-team/flow/main.md § Step 1` as the CLEAR site re-pointed to `po/flow/triage-signals.md §
    Step 0-SIG` — no functional change to this file's own append-only logic.
- **`docs/policies/dev-standards.md` — drafted then REVERTED, out of zone:** that file's own
  "Inbox row-identity dimension" CANONICAL block (~L351-373) also names
  `docs/agents/dev-team/flow/main.md § Step 1` as the CLEAR site and is now stale by the same
  measure as drain-signals.md's pointer above. Drafted the identical pointer correction, then
  reverted it (`git checkout -- docs/policies/dev-standards.md`) on re-checking
  `commit-boundary/SKILL.md`'s per-agent zone table + my own init.md `commit_zone.allowed` — neither
  lists `docs/policies/` for agent-father (allowlist model: `docs/agents/`, `docs/agent-memory/`,
  `.claude/skills/`, `.claude/agents/` only). **Flagged via RETURN as a residual follow-up** for
  whichever agent owns `docs/policies/` commits — exact before/after text: replace `` Wired ONLY
  into `docs/agents/dev-team/flow/main.md` § Step 1 "Durable-inbox CLEAR" — the SOLE legitimate
  remover of inbox entries `` with `` Wired ONLY into `docs/agents/po/flow/triage-signals.md` §
  Step 0-SIG "Durable-inbox CLEAR" (moved off `docs/agents/dev-team/flow/main.md` § Step 1 by
  `FIX-TRIAGE-INBOX-CLEAR-OWNERSHIP-PO-SELF-READ`, 2026-08-22 — that call site was unreachable
  whenever PO is spawned directly by the router instead of via a dev-team tick) — the SOLE
  legitimate remover of inbox entries `` (same section header + one earlier "Step-1 triage pass"
  wording tweak a few lines above it) — mechanical text-only fix, no logic change, low risk to hand
  off.
- **Not touched (deliberate):** the architecture brief
  `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` and the closed
  `docs/handoffs/TASK_FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION.md` — historical design/handoff
  records of what was implemented at the time, not live specs an agent re-reads each cycle; SUPERSEDED-
  not-deleted convention applies. Did not edit PO's notebook or decision journal (another agent's
  memory — out of scope; PO's own entry `docs/agent-memory/decisions/triage-20260822T1927Z-po.md`
  already documents the incident from PO's side and was cross-checked, not modified).
- No task-board row minted — pure flow-doc/spec-clarity correction across 4 docs (all within
  agent-father's `docs/agents/` commit zone) + this notebook entry; no code/orch-state.json
  touched, `docs/policies/dev-standards.md` handed off (see bullet above) rather than self-committed
  out-of-zone. Committed directly per the task's own "lighter-weight, sufficient resolution"
  allowance.

## FIX 2026-08-22T19:54Z — FIX-NOTEBOOKWRITE-AC6-FLOWDOC-CONTRADICTION-CODEJANITOR-DEVRAGSERVICE

Router-dispatched directly (developer-surfaced finding during today's digest-predict fix, no
board row; same flow-doc-contradiction pattern as the two prior entries above).

- Read `.claude/skills/notebook-write/SKILL.md` AC-6 fresh: canonical table lists both
  `code-janitor` and `dev-rag-service` under APPEND class (not OVERWRITE).
- **`docs/agents/code-janitor/flow/main.md`:** its "Memory + State" section explicitly said
  "(OVERWRITE)" and templated a `### Scan NNN` sub-heading — contradicts AC-6. Verified live in
  `docs/agent-memory/notebooks/code-janitor.md`: exactly this shape, ONE permanent undated
  `## 2026-08 Sessions` heading with `### Session N` sub-headings appended every cycle since at
  least 2026-05-21 — same section_count-pinned-at-1 root cause as the digest-predict fix just
  landed this session (commit 0225479e0). Corrected the section to APPEND class: dated `## `
  heading per cycle template + RETIRED note. Notebook itself NOT touched (in scope per task —
  manual archive-split is separate work, same as digest-predict's own RETIRED note says).
- **`docs/agents/dev-rag-service/flow/main.md`:** pointer file carried no explicit section
  template at all — inherits a generic notebook-write pointer from
  `docs/agents/developer/flow/microservice-main.md` (shared by all 9 dev-* zone agents), which
  itself has no per-agent template. Verified live in `docs/agent-memory/notebooks/dev-rag-service.md`:
  same bug shape — ONE permanent undated `## Working Memory` heading with dated `### ` sub-blocks,
  confirmed over-cap (127L/23244B) and safe-failing in code-janitor's own Notebook Line-Cap Sweep
  log (`notebook_single_section_overage_breach`). Added a new "Notebook Write (override)" section
  to the pointer file making the AC-6 APPEND-class dated-`## `-per-cycle convention explicit,
  since the shared flow it inherits from doesn't carry one. Notebook itself NOT touched.
- **Not fixed here (flagged, out of scope):** the other 7 thin-pointer dev-* agents sharing
  `microservice-main.md` (dev-stock-price, dev-technical-analysis, dev-macro-indicators,
  dev-mcp-server, dev-kinh-dich, dev-alert-engine, dev-api-gateway, dev-pdf-extractor) carry the
  same generic-pointer gap as dev-rag-service did — none has been spot-checked for the same
  single-section notebook shape; `dev-team.md` notebook was also flagged over-cap in the same
  janitor sweep log line and is a candidate for the identical fix. Also noted but NOT touched
  (out of my commit zone / not this task): `microservice-main.md:142` hardcodes
  `docs/agent-memory/notebooks/developer.md` in its "Commit notebook" step for ALL 9 dev-*
  consumers instead of the per-agent `<agent-id>` path — a separate latent bug, not part of this
  AC-6 classification fix.
- Both fixes are doc-only, within `docs/agents/` commit zone. No board row minted (router relay,
  not a task-board dispatch). Committed directly.

## FIX 2026-08-23T09:30Z — FIX-SIGNAL-TYPE-ROUTING-GAP-bctc-image-fetch-degraded, P0 CI-red fix
- Added 1 Pipeline-B routing row (`bctc_image_fetch_degraded`) to `docs/agents/po/flow/triage-signals-longtail.md` — mcp-server `push_bctc_refined_unit`/`bctcImageFetchDegradedSignalWriter.ts`, dedup on `dedup_key`, mint FIX zone `cross-service/` next_agent `developer`. Placed in the longtail sibling (single-fire-so-far type, matches existing `bctc-data-quality-anomaly` precedent), not the hot-path main table.
- Guard `guard-signal-type-coverage.sh --check`: FAIL (`unrouted Pipeline-B to=po types: ["bctc_image_fetch_degraded"]`) → PASS, reproduced. Paired suite: 23/24 → 24/24, reproduced once (TEST10 live-files smoke).
- Committed `a309c9334` (file alone, pushed clean to origin/main, no rebase). Board write via `orch-apply.sh` moved the FIX row `backlog[]→review[]` (`next_agent: qa`; `ci_green_on_subsequent_push` gate not yet independently observed) — lands UNCOMMITTED, `docs/data/orch/orch-state.json` is outside agent-father's commit zone (FU-AGENT-FATHER-ORCH-SCOPE).
- **Not fixed here (flagged, out of scope):** a genuinely new, unrelated Pipeline-A type `cowork-fire` appeared live mid-task and re-trips the guard/TEST10 post-fix — different pipeline, different subject, no claim held. Guard's own self-filing fallback already auto-tracked it (`FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire`, backlog, owner po). Needs its own fresh triage/dispatch, not folded into this task.
