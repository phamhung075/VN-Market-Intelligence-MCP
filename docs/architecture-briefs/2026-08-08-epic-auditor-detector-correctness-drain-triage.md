# EPIC-AUDITOR-DETECTOR-CORRECTNESS-DRAIN — triage-pass disposition (architect, 2026-08-08)

Scope: **disposition only**. No detector was fixed, no scope was absorbed, no new task
row was minted. Deliverable is a terminal state (real `next_agent` OR `CANCELLED` +
named successor) for each of the 18 rows PO's 2026-07-29T02:21Z board census flagged,
per `po_ruling` on the epic row.

## 1. Live-board re-verification of the 18-row list (before touching anything)

The dispatch prompt's paraphrase of the "6 already-owned" rows dropped the `FIX-AUDITOR-`
prefix. Re-derived the real ids from the live board:

| Paraphrase (prompt) | Real id | Live status/owner/next_agent |
|---|---|---|
| DOCAUDIT-MEMORY-PATH-PREDICATE=architect | `FIX-AUDITOR-DOCAUDIT-MEMORY-PATH-PREDICATE` | BACKLOG / architect / architect — correct, untouched |
| D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX=dev-mcp-server | `FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX` | BACKLOG / dev-mcp-server / dev-mcp-server — correct, untouched |
| C04-PARSEDAT-RECENCY-PREDICATE=architect | `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE` | BACKLOG / architect / architect — correct, untouched |
| A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE=architect | `FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE` | **DOES NOT EXIST** in any lane of the hot board or any monthly archive file (`jq` scan, all 7 flat lanes + `archive[]` + `archive/2026-0{6,7,8}.json` + `backlog-detail.json` — zero hits). See §2. |
| EMIT-SEVERITY-LABEL-FLAT-ESCALATION-BYPASS-NEVER-FIRES=developer | `FIX-AUDITOR-EMIT-SEVERITY-LABEL-FLAT-ESCALATION-BYPASS-NEVER-FIRES` | BACKLOG / developer / developer — correct, untouched |
| T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE=developer | `FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE` | **REVIEW** / po / next_agent=qa — already progressed past backlog, satisfies AC1 as-is, untouched |

## 2. Finding: FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE is a phantom row

`git log --all -S'FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE' -- docs/data/orch/orch-state.json`
shows the row WAS minted 2026-07-25T12:56:44Z (`po/triage-20260725T1254-a30-veto-gate-defect`,
commit `55c29b525`) and lived on the board for two weeks. The most recent commit touching
the string is `1faf2e94f` (2026-08-07T08:14Z, this session, `report-analyzer`), whose own
message states the row "never existed in any lane/archive" at that point and repoints a
peer row's `depends`/`blocked_by` from it to `FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP`
— the row was evidently retired/renamed at some point between 2026-08-06 and 2026-08-07
without leaving a `superseded_by` breadcrumb of its own (git history does not show the
removal commit's own message explaining it; only the *downstream* dependency-repair is
visible). `FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP` is confirmed
live (`BACKLOG`, `owner=po`, `next_agent=developer`, created `2026-08-07T06:05:54Z`) and is
the demonstrated successor per the `blocked_by` repointing.

**Disposition:** treated as already-CLOSED by prior sessions — `superseded-by-FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP`.
No board write applies (there is no row to write to). Recorded here so the count is
auditable: this accounts for 1 of the 18 as CLOSED without a corresponding orch-state.json
diff.

## 3. The 12 unowned rows — stale-check + disposition

Per AC(4), each row's target file(s) were read live before any disposition (not inferred
from the row's own text) to catch defects already fixed by unrelated later commits.

### 3a. Two already-superseded (CANCELLED, moved `backlog[]` → `archive[]`)

| id | Successor | Evidence |
|---|---|---|
| `FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC` | `FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD` | Row's own `po_supersede_20260721T1635` already said "DO NOT WORK THIS ROW — work the successor." Successor confirmed `status=DONE_VERIFIED` in `docs/data/orch/archive/2026-08.json`. |
| `NB-AUDITOR-MAIN-SPLIT` | `TE-T06` | Row's own `po_dedup_note_20260806T0752` already said "close it out when TE-T06 lands," naming TE-T06 as richer-scope owner of the identical file/section. TE-T06 confirmed live (`BACKLOG`/`agent-father`/`agent-father`). Closed NOW rather than waiting for TE-T06 to land — an open-ended "close later" leaves `next_agent` unset indefinitely, which is exactly the structural-undispatchability defect this epic exists to fix. |

`checkLaneCoherence()` (`orchStateSchema.ts` §9) does not permit `status=CANCELLED` inside
`backlog[]` (`LANE_ALLOWED_STATUSES.backlog = {BACKLOG, BLOCKED}`) — confirmed by a failed
first `orch-apply.sh` attempt (Stage 1b). Matches prior-art precedent
(`FIX-SLA-SBV-FX-BUSINESS-DAY-AWARE`, retired 2026-07-21, "the retired row sits in
`task_board.archive` as CANCELLED with `superseded_by` intact" per router's own note on that
transaction). Both rows were moved into `task_board.archive[]` (the small 13-entry inline
array, not a monthly archive file — no cold-evict script was invoked) with `status=CANCELLED`
in the same transform that removed them from `backlog[]`.

### 3b. Ten assigned a real `next_agent`

Stale-check method: live-read the row's `files`/predicate location; compare current content
against the defect description. All 10 remain **unfixed** (none were closeable on
already-fixed grounds) except one flagged ambiguity (B-05, below).

**Architect (4)** — predicate-drift family (`feedback_auditor_predicate_drift_false_regression`),
all inline SQL/jq predicates embedded directly in `docs/agents/system-auditor/flow/main.md`
(prose-spec defects, no code file), consistent with the two pre-owned siblings in the same
family (`FIX-AUDITOR-DOCAUDIT-MEMORY-PATH-PREDICATE`, `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE`,
both already `owner=architect`; C04's own `related[]` names two of these four directly):

- `FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE` — live `main.md` C-06 line still
  `sent_at > datetime('now','-3 hours')`, no age/SLA recalibration. Unfixed.
- `FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE` — live `main.md` C-11 line still
  `status = 'done'` (value never exists in `pdf_documents`; real terminal value is
  `'success'`). Unfixed.
- `FIX-AUDITOR-C12-READONLY-BLINDED-AND-TABLENAME` — `main.md` still mandates
  `{readonly: true}` bun:sqlite handles throughout, no `file:?immutable=1` anywhere — the
  readonly-blinding half is unfixed. The wrong-table-name half
  (`market_messages_price_history`) has zero hits anywhere in the current repo; likely a
  dynamic signal-payload string rather than a literal source line, so absence of the string
  is not proof of a fix — flagged for the assignee to re-verify against a live C-12
  emission rather than treated as closed here.
- `FIX-AUDITOR-TASKBOARD-OVERFLOW-PREDICATE-WIP-ONLY` — live `main.md` §4 size-cap still
  `[.task_board.active_sprints[].tasks[]] | length > 80` (lifetime-accumulated, includes
  terminal DONE/CANCELLED rows), not the active-WIP-only count the fix_spec demands.
  Severity wording has softened over time (now routes to "alert pm to run task-archive
  sub-flow" rather than a hard CRITICAL `doc_size_breach`), but the core WIP-vs-lifetime
  miscount is unchanged. Unfixed.

**agent-father (3)** — the "layer-split" subfamily (compares the WRONG LAYER: raw-fetch
cadence vs analysis cadence), explicitly routed away from architect by a dated PO ruling on
the sibling row (`FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT`'s own
`po_owner_note`: *"fix is a `docs/agents/system-auditor/flow/main.md` two-layer-freshness
edit (co-fix with B-11) -> agent-father, NOT ba"*, sourced from
`docs/architecture-briefs/2026-07-04-systemic-remake.md` §1.2):

- `FIX-AUDITOR-B11-NEWS-FRESHNESS-LAYER-SPLIT` — live `main.md` still has one generic
  "Per-Source Fetch Freshness (B-01..B-07, B-11, B-12)" loop, no B-11-specific
  raw-fetch-vs-analysis-cadence split. Row's own detail-ref says "groom together with B-11
  as ONE...two-layer-freshness pass" alongside B-05 — same assignee for both by design.
  Unfixed.
- `FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT` — owner/next_agent propagated from the
  detail-ref's own `po_owner_note` (board-level row carried neither field — the
  `FIX-BOARD-ROW-PLAN-ONLY-NOT-MIRRORED-FROM-DETAIL` class of gap). **Flagged, not
  resolved:** live `main.md` already carries a "BCTC Healthy-Idle Gate (B-05 —
  FIX-BCTC-SLA-THRESHOLD-360, sub-root c)" (landed 2026-06-25T05:18Z, commit `44c1402d7`
  — *before* this row's own 2026-07-03T23:01Z creation) that exempts raw-push staleness
  when `bctc_vps_queue` actionable rows = 0 AND VPS host Tier-1 = UP — functionally close
  to this row's own fix_spec clauses (1)-(3). Yet the row was minted *after* that gate
  landed, with fresh RAW corroboration citing `get_sla_status` directly, and its acceptance
  criteria reference machinery (`get_sla_status(bctc)` as primary authority,
  `trigger_bctc_vps_fetch(dry_run)` pending-count) that does not literally match the gate's
  own `bctc_vps_queue` status-column count. A doc-read alone cannot settle whether these are
  the same mechanism (row stale, should have been closed) or a second, narrower bug the
  existing gate doesn't cover (row still live). Per the epic's own stale-check standard
  (confirm, don't infer), this was **not** closed on the ambiguity — assigned to
  agent-father with the finding attached so the implementer re-verifies against a live B-05
  firing before writing anything.
- `FIX-AUDITOR-EVAL-DELTA-RECENCY-BOUND` — owner/next_agent propagated from existing
  `owner=agent-father` (set at mint by `po/triage-20260721T1907`, just never mirrored into
  `next_agent`). Live `main.md` "BCTC Eval Sweep (D-BCTC-EVAL)" section has no recency bound
  on `computed_at` (AC1 unmet) and its `emit-audit-signal.sh` call uses `--e3-only`, which
  explicitly bypasses the E-2 7-day-Telegram-dedup lane (AC2 "reuse the dedup ledger" unmet).
  Both halves confirmed still live.

**developer (2)** — implementation-only, fully specified, no design decision outstanding:

- `FIX-AUDITOR-SBVFX-SLA-POSTMARKET-TOLERANCE` — `next_agent` propagated from existing
  `owner=developer` (`po_ruling_20260721T2009`). Live
  `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` confirms
  `SBV_WINDOW_END_UTC_HOUR=10` and `OFF_HOURS_GRACE_MINUTES=30` unchanged from the row's
  described defect. Unfixed. Acceptance clauses (A)-(E) already fully specified by PO's own
  ruling; nothing left for architect to design.
- `FIX-AUDITOR-NOTEBOOK-COMMIT-TRAILER-DOC` — live `scripts/auditor-notebook-commit.sh` has
  zero hits for `Claude-Session`/`trailer`. Unfixed. Small script-edit + one doc line, AC
  already written in the detail-ref's `status_note`.

**dev-mcp-server (1)** — zone-corrected from the row's own mint-time guess:

- `FIX-AUDITOR-HEALTHCHECK-FALSE-UNHEALTHY-NONHTTP-SERVICES` — row's own `fix_spec`
  flagged the ambiguity itself ("BA/architect confirm zone first (auditor flow vs
  dev-mcp-server health-check tool)"). Traced live: the auditor's flow doc only *calls* the
  `get_vps_service_health` tool (`main.md:392`); the HTTP-vs-systemd probe/classification
  logic that actually needs to change lives in
  `apps/mcp-server/src/interface/mcp/tools/system/vpsHealthTools.ts` (confirmed via grep —
  no such classification logic exists in `docs/agents/system-auditor/`). This is an
  implementation defect, not a prose-spec defect — routed dev-mcp-server (zone owner of
  `apps/mcp-server/`), not architect. `zone` field corrected on the row from
  `docs/agents/system-auditor/` → `apps/mcp-server/` to prevent the next reader repeating
  the same misroute. (Sibling-by-title `FIX-AUDITOR-TASKBOARD-OVERFLOW-PREDICATE-WIP-ONLY`
  stays architect — its predicate is a bare inline jq expression in the flow doc itself, no
  code file involved; the two rows only resemble each other in the title, not in the
  technical content.)

## 4. Count

| Bucket | ids | n |
|---|---|---|
| Pre-owned, verified correct, untouched | DOCAUDIT-MEMORY-PATH-PREDICATE, D4-WHITELIST, C04-PARSEDAT-RECENCY, EMIT-SEVERITY-LABEL, T1-PREGATE-MEMCREEP | 5 |
| Pre-owned, phantom row → CLOSED (superseded, no board write possible — row doesn't exist) | A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE | 1 |
| Unowned → CLOSED (CANCELLED + superseded_by/duplicate_of, moved to `archive[]`) | COMMIT-NONEXPLICIT-PATHSPEC, NB-AUDITOR-MAIN-SPLIT | 2 |
| Unowned → ASSIGNED next_agent=architect | C06-OFFMARKET, C11-PDFX-STATUS, C12-READONLY-BLINDED, TASKBOARD-OVERFLOW | 4 |
| Unowned → ASSIGNED next_agent=agent-father | B11-NEWS-FRESHNESS, B05-BCTC-FRESHNESS, EVAL-DELTA-RECENCY | 3 |
| Unowned → ASSIGNED next_agent=developer | SBVFX-SLA, NOTEBOOK-COMMIT-TRAILER | 2 |
| Unowned → ASSIGNED next_agent=dev-mcp-server | HEALTHCHECK-FALSE-UNHEALTHY | 1 |

**N (assigned real next_agent, terminal-dispatchable) = 15** (5 pre-owned + 10 newly assigned)
**M (CLOSED, superseded/duplicate) = 3** (1 phantom + 2 cancelled)
**N + M = 18.**

Every row now carries either a real, dispatchable `next_agent` or a `CANCELLED` status with
a `superseded_by`/`duplicate_of` id naming the survivor. No row remains with `next_agent`
unset.

## 5. New work surfaced during triage (recorded for PO, NOT self-minted)

Per AC(3), this epic mints nothing. Two items surfaced that are genuinely new and out of
this epic's scope:

1. **`FIX-AUDITOR-HEALTHCHECK-FALSE-UNHEALTHY-NONHTTP-SERVICES` zone was wrong at mint
   time** (routed dev-mcp-server here, corrected in-place — not new work, a routing fix
   folded into this epic's own disposition-only mandate since it's a metadata correction,
   not an implementation change).
2. **Possible full staleness of `FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT`** (§3b) is a
   candidate for a fast PO/agent-father re-check *before* any implementation effort is
   spent — if the existing `FIX-BCTC-SLA-THRESHOLD-360` Healthy-Idle Gate already covers
   it, the row should close as `obsolete` rather than be implemented a second time. Not
   resolved here because the epic's stale-check standard requires confirmation, and a
   doc-only read could not settle it either way — recommended as agent-father's first
   action on picking up the row, not a new task mint.

No other new task rows are recommended.
