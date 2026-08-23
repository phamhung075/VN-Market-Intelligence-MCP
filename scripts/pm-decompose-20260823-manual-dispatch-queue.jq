# scripts/pm-decompose-20260823-manual-dispatch-queue.jq
#
# pm decomposition pass 2026-08-23 over the 9 ready[] rows carrying
# next_agent=pm plus the in_progress[] UC-CDC-P1 tracking row.
#
# Mints 17 children, closes 7 decomposed parents (ready[] -> done[]), leaves
# IVC-PM-DECOMPOSE open (DECOMPOSITION_COMPLETE=false — IVC-A3+ is
# scan-dependent on IVC-A1 output per its BA spec's explicit caution),
# corrects UC-ASL-P5 routing (BA spec says keep as ONE task, do NOT split),
# records the pm assessment on UC-CDC-P1, and retargets the 2 dependents
# that named a now-closed parent onto that parent's concrete children.
#
# Owning flow doc: docs/agents/pm/flow/main.md Steps 2/3/3c/3e.
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/pm-decompose-20260823-manual-dispatch-queue.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def toarr: if type=="array" then . elif type==null then [] elif .==null then [] else [.] end;

def child($id;$title;$owner;$next;$zone;$size;$prio;$deps;$files;$note):
  ({
    id: $id,
    title: $title,
    type: "TASK",
    status: "TODO",
    priority: $prio,
    size: $size,
    zone: $zone,
    owner: $owner,
    next_agent: $next,
    files: $files,
    note: $note,
    created_at: $now,
    created_by: "pm",
    updated_at: $now,
    updated_by: "pm"
  } | if ($deps | length) > 0 then . + {depends_on: $deps} else . end);

# ── Children ────────────────────────────────────────────────────────────────
[
  # ── IVC-PM-DECOMPOSE → 8 (BA spec docs/handoffs/IVC-ARCH-BLUEPRINT-BA-spec.md §1;
  #    ids reused verbatim from the spec, owner dev-mcp-server per PO routing note) ──
  child("IVC-C1";
    "Generic registry-driven PreToolUse Write|Edit store-validation hook + shared store-validate.mjs CLI";
    "dev-mcp-server"; "dev-mcp-server"; "scripts/"; "M"; "high"; [];
    ["scripts/store-validate.mjs","scripts/agents-flow/store-validation-hook-prewrite.mjs",".claude/settings.local.json"];
    "Parent IVC-PM-DECOMPOSE. Absorb orch-state-hook-prewrite.mjs dispatch as registry entry #1 (NOT a 2nd parallel hook); orch-validate.mjs itself untouched. Fail-CLOSED on validator-infra crash; IVC_HOOK_EMERGENCY_BYPASS=<reason> escape hatch. AC a-f verbatim in BA spec §1 — note (d) blast-radius bound (NFR-1) and (e) bypass ALWAYS fires send_telegram(channel=bug) (NFR-2) are each a required test, not prose. EC-3: at least ONE real launchd/cron call site must be wired to store-validate.mjs, not merely 'designed to be callable'."),
  child("IVC-C2";
    "Schema registry scaffold storeSchemaRegistry.ts + classify docs/data/*.json into shape families + generated class-c-coverage.json";
    "dev-mcp-server"; "dev-mcp-server"; "apps/mcp-server/"; "M"; "high"; ["IVC-C1"];
    ["apps/mcp-server/src/infrastructure/schemas/storeSchemaRegistry.ts","docs/data/coverage/class-c-coverage.json"];
    "Parent IVC-PM-DECOMPOSE. NFR-3: registry is a TS module — Zod schemas are TS values, NEVER moved to docs/data/*.json. NFR-4: class-c-coverage.json is script output, never hand-edited. EC-2: family classification must FLAG which families are multi-writer (do not assume none are) — those need orch-apply.sh's CAS-mtime atomic-rename reused verbatim as an opt-in wrapper. Live re-glob must reproduce the same family boundaries (no silent drift)."),
  child("IVC-C3";
    "Author Zod schemas wave 1 (cowork-schedule, pressure-state, coverage-state, pilot-status-*, unified-agent-synthesis-*)";
    "dev-mcp-server"; "dev-mcp-server"; "apps/mcp-server/"; "M"; "high"; ["IVC-C2"];
    ["apps/mcp-server/src/infrastructure/schemas/storeSchemaRegistry.ts"];
    "Parent IVC-PM-DECOMPOSE. Default .strict(); any .passthrough() needs a SYS-FUNC-XX-style justification comment (signalTypes.ts convention). AC: each wave-1 family flips pass-through -> enforced in class-c-coverage.json; synthetic malformed write BLOCKED with per-field error (§3 contract); synthetic valid write unaffected (no false-positive regression)."),
  child("IVC-C4";
    "Structural validator (kind:structural) for docs/agent-memory/notebooks/*.md + docs/handoffs/*.md";
    "dev-mcp-server"; "dev-mcp-server"; "apps/mcp-server/"; "S"; "high"; ["IVC-C2"];
    ["apps/mcp-server/src/infrastructure/schemas/storeSchemaRegistry.ts"];
    "Parent IVC-PM-DECOMPOSE. Header line + required '## ' section markers per notebook-read / decision-journal conventions. Same registry, same hook, same fail-closed-on-crash contract. Missing section name is reported as `field` in §3's SAME error shape — do NOT invent a second error format for structural checks."),
  child("IVC-C5";
    "Class-C audit sink docs/data/validation-rejections.jsonl + cold-archive-sweep.sh rotation + bug-channel telegram per BLOCK";
    "dev-mcp-server"; "dev-mcp-server"; "scripts/"; "S"; "high"; ["IVC-C1"];
    ["docs/data/validation-rejections.jsonl","scripts/cold-archive-sweep.sh"];
    "Parent IVC-PM-DECOMPOSE. Append-only, one ValidationRejection record per BLOCK. Reuse cold-archive-sweep.sh's existing monthly rotation — do NOT build a bespoke second rotation mechanism. NFR-5: this jsonl is the Class-C sink; the write_rejections DB table (IVC-A2) is the Class-A sink — same logical shape, deliberately distinct physical stores, never unified."),
  child("IVC-C6";
    "auditor-tier1-probe.sh canary check — bun + store-validate.mjs + registry module all load and pass one canary schema";
    "dev-mcp-server"; "dev-mcp-server"; "scripts/"; "S"; "high"; ["IVC-C1"];
    ["scripts/agents-flow/auditor-tier1-probe.sh"];
    "Parent IVC-PM-DECOMPOSE. Fires a loud NAMED finding (existing tier1-probe finding convention) BEFORE a legitimate agent write silently hits an infra-crashed validator. Closes the store-registry silent-decay gap. Cross-ref: UC-CRITIC-HOOKS-ENFORCEMENT is ALREADY DONE_VERIFIED via a separate narrower mechanism (hook-guard.sh) — do NOT cite closing it as a deliverable here (BA spec §0 corrects the blueprint's stale claim)."),
  child("IVC-A1";
    "scripts/audits/class-a-validation-coverage-scan.sh -> docs/data/class-a-validation-coverage.json re-runnable Class-A inventory";
    "dev-mcp-server"; "dev-mcp-server"; "scripts/"; "S"; "high"; [];
    ["scripts/audits/class-a-validation-coverage-scan.sh","docs/data/class-a-validation-coverage.json"];
    "Parent IVC-PM-DECOMPOSE. GATES the IVC-A3+ mint — its JSON output is what pm decomposes next, so its shape is a downstream contract, not just a report. AC(a): report the CURRENT count, not the brief's frozen 162 (already 167 live on 2026-08-08 — a 5-file drift in 14 days is exactly why this must be a script). AC(b): must classify the 12 zero-zod files' read/write disposition (3-of-12 confirmed read-only, 9 unconfirmed) — output must NOT leave pm to guess which of the 9 are real gaps."),
  child("IVC-A2";
    "Shared domain/validation/writeRejection.ts (FieldValidationError/ValidationRejection + top-line formatter) + generic write_rejections DB table";
    "dev-mcp-server"; "dev-mcp-server"; "apps/mcp-server/"; "M"; "high"; [];
    ["apps/mcp-server/src/domain/validation/writeRejection.ts","apps/mcp-server/src/interface/mcp/tools/signals/signalTypes.ts"];
    "Parent IVC-PM-DECOMPOSE. Generalizes signalRejectionStore.ts. §3 canonical error contract is the ONE copy — do not re-derive a 4th shape. AC(a): agentSignalTools.ts's GOLD reject path stays byte-compatible after migration; AC(b): FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT's already-shipped write-door confirmed schema-compatible (second working precedent). NFR-6 folded in here, NOT dropped: signalTypes.ts PriceAnomalyFindingDataSchema's undocumented .passthrough() gets a justification comment or converts to .strict()."),

  # ── FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT → 2 ──
  child("TASK-OFFHOURS-SELFCOMMIT-SCRIPT";
    "Mechanize the off-hours notebook self-commit prose recipe into scripts/agents-flow/offhours-notebook-self-commit.sh + tests";
    "developer"; "developer"; "scripts/agents-flow/"; "M"; "P1"; [];
    ["scripts/agents-flow/offhours-notebook-self-commit.sh","scripts/agents-flow/offhours-notebook-self-commit.test.sh"];
    "Parent FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT. Design: docs/architecture-briefs/2026-08-23-newsscout-marketwatcher-offhours-selfcommit-mechanize.md §2 (7 numbered behaviours, mirror the prose 1:1 — no step becomes optional). Reuse scripts/agents-flow/mcp-call.sh for task_claim/task_release/send_telegram — its own header says do not reinvent this transport per script; build arg JSON with jq -n --arg/--argjson, NEVER hand-interpolate an agent-authored string. --agent must deterministically derive <agent>-notebook:main; reject a raw task_id override (aliasing the two mutexes reintroduces the deadlock the split keys avoid). Precedent to mirror: coverage-stamp.sh (+ coverage-stamp.test.sh fixture-repo/stubbed-mcp_call convention). Test scenarios (a)-(e) enumerated in brief §2 — (b) must assert NO other staged file is swept in (RULE 2.5 regression class)."),
  child("TASK-OFFHOURS-SELFCOMMIT-FLOWDOC-REWIRE";
    "Collapse the 26-line self-commit prose block in news-scout stage-log-notify.md AND market-watcher cycle.md to one script call";
    "agent-father"; "agent-father"; "docs/agents/"; "S"; "P1"; ["TASK-OFFHOURS-SELFCOMMIT-SCRIPT"];
    ["docs/agents/news-scout/flow/stage-log-notify.md","docs/agents/market-watcher/flow/cycle.md"];
    "Parent FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT. BOTH call sites in the SAME change — brief §5 risk flag: half-landing re-permits the divergence this row exists to close (AC2). news-scout block is stage-log-notify.md:18-49, market-watcher is cycle.md:283-308. AC3/AC4 are NOT hand-actioned: the stale 'c270 shipped' header bump rides along with the FIRST real post-cutover run, and the uncommitted c273 section is this row's own live evidence — it is recovered by construction when the new script's clean-diff guard first fires. PM SEQUENCING: land script + this rewire BEFORE the next news-scout-offhours tick if schedulable, so recovery happens under the deterministic path."),

  # ── FIX-USDVND-THRESHOLD-SSOT → 2 ──
  child("TASK-USDVND-TS-STATIC-RETIRE";
    "TS track: delete 4 dead macroTools.ts signal fns + retire the static usdVnd>25500/<24500 cascade rules";
    "dev-mcp-server"; "dev-mcp-server"; "apps/mcp-server/"; "S"; "high"; [];
    ["apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts","apps/mcp-server/src/domain/services/cascade/macroAdjustments.ts","apps/mcp-server/src/domain/services/cascade/cascadeEngine.ts"];
    "Parent FIX-USDVND-THRESHOLD-SSOT. Design: docs/architecture-briefs/2026-08-23-fix-usdvnd-threshold-ssot.md, Planes 1+2. Finding A: currencySignal (macroTools.ts:117-124) has ZERO callers repo-wide — DELETE, do not unify; same for its 3 siblings oilSignal/goldSignal/policySignal in the identical file. Finding B (USD/VND half only): cascadeEngine.ts applies the OLD fixed MACRO_ADJUSTMENTS *and* the sigma-based DYNAMIC_MACRO_MAP additively on identical domain sets — real double-counting. Retire ONLY the static USD/VND rule here; the oil/gold general form is flagged-not-fixed and needs its own row. Test: negative control asserting the dynamic rule alone yields equivalent-or-better confidence delta on a live-shaped fixture."),
  child("TASK-USDVND-GO-SIGMA-PORT";
    "Go track: port classifyDeviation sigma formula into macro_usdvnd_direction_classifier + cross-language agreement test";
    "dev-macro-indicators"; "dev-macro-indicators"; "apps/macro-indicators/"; "M"; "high"; ["TASK-USDVND-TS-STATIC-RETIRE"];
    ["apps/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier/macro_usdvnd_direction_classifier.go","apps/macro-indicators/pkg/usecase/macro_signals.go"];
    "Parent FIX-USDVND-THRESHOLD-SSOT. Planes 3+4. Option (a) relative/sigma is the SSOT and is ALREADY SHIPPED on the TS side (macroThresholds.ts classifyDeviation: rolling mean+-Nsigma, 50-VND absolute floor, FX_SLOW_MOVER_INDICATORS 0.5% floor already listing usdVndRate/usdVndOfficial BY NAME) — this is a mechanical cross-language port, NOT a second design decision. Kills the literal 'exceeds 25000 threshold' string, which is the mechanism behind recurring invented 25000/26500 citations in published dishes. DDD Fence-A: stats arrive as plain float64/int on UsdVndDirectionInput; the primitive package keeps importing nothing beyond fmt — only the CALLER computes and threads stats in (precedent services_vmt_omo.go). Cold-start: sampleCount<5 must mirror TS's early return to normal/zScore:0 — falling back to the old fixed bands under a data gap is a regression, not a fix. depends_on the TS track only because Plane 4's shared-tuple agreement test needs both sides."),

  # ── UC-ASL-P3 → 2 (dep-gated: parent's own depends_on is NOT satisfied) ──
  child("TASK-ASLP3-DB-CHECKS-SCRIPT";
    "Build scripts/auditor-db-checks.sh (FR-1, FR-3..FR-10) + fixture-DB test, extending the in-flight C-04 skeleton";
    "developer"; "developer"; "scripts/"; "M"; "P1"; ["FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE"];
    ["scripts/auditor-db-checks.sh","scripts/auditor-db-checks.test.sh"];
    "Parent UC-ASL-P3. Design: docs/architecture-briefs/2026-08-23-uc-asl-p3-auditor-db-checks-freeze.md. HARD GATE: FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE is building this same file RIGHT NOW (claimed 2026-08-23T12:56:49Z) with only checks.c04 populated — do NOT start until it is DONE_VERIFIED, this depends_on is the mechanical guard architect added because the edge was missing from the graph. Mirror db-integrity-counts.sh DISCIPLINE only, NOT its WAL-blind immutable open — use the FR-2 host-bind + sqlite-wal-guard.sh access pattern. FR-5 (C-06) composes the EXISTING vnTradingCalendar.ts isVnTradingDay + marketHours.ts isMarketHours via the bun -e dynamic-import idiom check-foreign-flow-freshness.sh already established — do NOT reimplement VN holidays in bash, and do NOT use the BCTC-earnings SLA Resolver (wrong domain). FR-6 (C-11) DOES legitimately reuse the earnings-window arithmetic — port to a small shared bash fn used by both B-05 and C-11. FR-7 (C-12): reuse already-open market.db/pdf_extractor.db connections, fresh open per remaining system-map.json DB. Test is fixture-DB driven, no live docker/network dependency (mirrors db-integrity-counts.test.sh)."),
  child("TASK-ASLP3-MAINMD-FR11-REPOINT";
    "FR-11: replace system-auditor main.md Tier-2 dup block + B-05/B-09/B-13 + Tier-3 C-01..C-16 table with one auditor-db-checks.sh call";
    "agent-father"; "agent-father"; "docs/agents/system-auditor/flow/"; "S"; "P1"; ["TASK-ASLP3-DB-CHECKS-SCRIPT"];
    ["docs/agents/system-auditor/flow/main.md"];
    "Parent UC-ASL-P3. agent-father zone, NOT developer (brief §2 zone note; same zone as the live FIX-AUDITOR-C04-FLOWDOC-REPOINT precedent). Collapses to: one `bash scripts/auditor-db-checks.sh` call, a RAW-CHECKS: fenced paste of its JSON stdout, then per-FAIL/WARN-row calls into the UNMODIFIED scripts/emit-audit-signal.sh / scripts/emit-dashboard-row.sh — only the check COMPUTATION moves, the emit plumbing does not. Write-tool only for the multiline replacement (known Edit-tool multiline strip bug, brief Hard Constraint 5); verify by git diff plus one live Tier-2/Tier-3 dry-run confirming the emit call sites still fire. This SUPERSEDES the narrow FIX-AUDITOR-C04-FLOWDOC-REPOINT — either order is safe, both converge on the same final text. Once this lands, PO/PM close FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE, -C11-PDFX-STATUS-PREDICATE and -C12-READONLY-BLINDED-AND-TABLENAME (repointed, not closed, by architect 2026-08-23)."),

  # ── FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR → 2 ──
  child("TASK-BRANCHGUARD-POSTCHECKOUT-HOOK";
    "Author scripts/git-hooks/post-checkout branch-hijack guard (MODE=warn default at install) + install.sh wiring + tests";
    "developer"; "developer"; "scripts/git-hooks/"; "M"; "P1"; [];
    ["scripts/git-hooks/post-checkout","scripts/git-hooks/install.sh"];
    "Parent FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR. Design: docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md, AC-1(a) chosen. git has NO pre-checkout hook (verified, git 2.49.0) — post-checkout hard-reverts a non-main checkout in the PRIMARY working dir back to main and fail-louds. MUST exempt LINKED worktrees by construction (git-dir vs git-common-dir), so SPIKE-C44 is NOT foreclosed and NOT a dependency. AC-2: reachable by agents with no MCP grant — this is why it is a git hook, not a skill or flow-doc rule (4/4 incidents were improvised behaviour, not doc-following). Non-destructive edge: if uncommitted work would be discarded, REFUSE the revert and fail loud rather than discard. PM DECISION (this is the timing call architect explicitly deferred to pm): ship at MODE=warn default here, do NOT enable enforce yet — see TASK-BRANCHGUARD-ENFORCE-FLIP."),
  child("TASK-BRANCHGUARD-ENFORCE-FLIP";
    "Flip post-checkout guard default to MODE=enforce + AC-4 two-agent live positive control";
    "developer"; "developer"; "scripts/git-hooks/"; "S"; "P1"; ["TASK-BRANCHGUARD-POSTCHECKOUT-HOOK","UC-RDL-P7-A"];
    ["scripts/git-hooks/post-checkout"];
    "Parent FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR. PM TIMING DECISION, recorded explicitly because architect routed the row to pm for exactly this call: enforce is correct as designed, but shipping it before the branch-checkout prose is retired WEDGES live flows — architect grep-confirmed 5 flow docs still author/verify/honor `git checkout task/NNN-*` TODAY, and developer/flow/main.md:51-54 + microservice-main.md:53-57 make `git branch --show-current == task/NNN-kebab` a HARD precondition that the hook will have already reverted. So: warn first (previous task), retire the prose (UC-RDL-P7-A, ready[]/agent-father, whose files[] already covers developer/main.md, microservice-main.md, qa/flow/main.md, fixer/flow/main.md and pm/flow/main.md), THEN enforce. depends_on UC-RDL-P7-A is an additive edge onto the row that ALREADY OWNS that rewrite — AC-3 forbids minting a 3rd overlapping row, so this does not duplicate it. AC-4: two concurrent agents in a disposable byte-clone (NEVER the live repo) — agent A checks out a branch, agent B commits, assert B's commit landed on main and is not reachable only from A's branch. Asserting from hook source prose is a rejection."),

  # ── FIX-CHEF-PUBLISHED-MARKER-RELEASE → 1 (Component B only; Component A already
  #    lives in FIX-CHEF-MARKER-KEY-ANCHOR-1..4) ──
  child("TASK-CHEF-MARKER-RELEASE-GATE";
    "Published Marker Release Gate in spawn-fanout.md — any task_release on published:* must pass a delivery-evidence check or be refused";
    "developer"; "developer"; "docs/agents/cowork-team/"; "S"; "P1"; ["FIX-CHEF-MARKER-KEY-ANCHOR-3"];
    ["docs/agents/cowork-team/flow/spawn-fanout.md","docs/protocols/dwf-ops-runbook.md"];
    "Parent FIX-CHEF-PUBLISHED-MARKER-RELEASE. Design: docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md COMPONENT B (Component A is already minted as FIX-CHEF-MARKER-KEY-ANCHOR-1..4 — do NOT re-implement it here). CORRECTED PREMISE, do not re-litigate: exhaustive grep found ZERO code paths that call task_release on a published:* key today — the row's title describes the pre-07-03 shape; the 2026-08-06 release was a MANUAL PO action on a content judgment. The gate therefore governs ANY release (human or automated): task_list_held + absence of the synthesis artifact + absence of a matching MARKET message, else REFUSE and escalate. Under this gate the 08-06 manual release would have been refused (artifact existed) and routed as a content/relabel problem, not a mutex problem. depends_on ANCHOR-3 is a same-file serialization edge (both edit spawn-fanout.md), not a logical dependency.")
] as $children

# ── 1. Mint children into ready[] ───────────────────────────────────────────
| .task_board.ready = ((.task_board.ready // []) + $children)

# ── 2. Close the 7 fully-decomposed parents: ready[] -> done[] ──────────────
| {
    "FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR": ["FIX-CHEF-MARKER-KEY-ANCHOR-1","FIX-CHEF-MARKER-KEY-ANCHOR-2","FIX-CHEF-MARKER-KEY-ANCHOR-3","FIX-CHEF-MARKER-KEY-ANCHOR-4"],
    "FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES": ["TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY","TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION"],
    "FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT": ["TASK-OFFHOURS-SELFCOMMIT-SCRIPT","TASK-OFFHOURS-SELFCOMMIT-FLOWDOC-REWIRE"],
    "FIX-USDVND-THRESHOLD-SSOT": ["TASK-USDVND-TS-STATIC-RETIRE","TASK-USDVND-GO-SIGMA-PORT"],
    "UC-ASL-P3": ["TASK-ASLP3-DB-CHECKS-SCRIPT","TASK-ASLP3-MAINMD-FR11-REPOINT"],
    "FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR": ["TASK-BRANCHGUARD-POSTCHECKOUT-HOOK","TASK-BRANCHGUARD-ENFORCE-FLIP"],
    "FIX-CHEF-PUBLISHED-MARKER-RELEASE": ["TASK-CHEF-MARKER-RELEASE-GATE"]
  } as $closeouts
| ([$closeouts | keys[]]) as $closed_ids
| ([ .task_board.ready[] | select(.id | IN($closed_ids[])) ]) as $closed_rows
| .task_board.ready = [ .task_board.ready[] | select((.id | IN($closed_ids[])) | not) ]
| .task_board.done = ((.task_board.done // []) + [
    $closed_rows[]
    # next_agent is DELETED, never nulled — TaskSchema types it string|absent,
    # and a terminal decomposed umbrella has no next hop by construction.
    | del(.next_agent)
    | . + {
        status: "DONE",
        closed_at: $now,
        children: $closeouts[.id],
        updated_at: $now,
        updated_by: "pm",
        pm_decomposition_complete: true,
        pm_closeout_note: ("CLOSED AS DECOMPOSED, NOT AS DELIVERED — pm 2026-08-23. All of this row's remaining scope is delegated to children[]; the umbrella itself has no residual work and is_epic_wrapper() already made it non-dispatchable, so leaving it in ready[] only re-routed it to pm every manual-dispatch sweep (the defect this closeout ends). Delivery is tracked on the children, NOT here — do not read this DONE as 'the underlying defect is fixed'. Children: " + ($closeouts[.id] | join(", ")) + ".")
      }
  ])

# ── 3. IVC-PM-DECOMPOSE: DECOMPOSITION_COMPLETE=false — stays in ready[] ────
#    IVC-A3..An is scan-dependent on IVC-A1's output; the BA spec explicitly
#    forbids guessing N ahead of time, so pm has a genuine future touch here.
| .task_board.ready |= map(
    if .id == "IVC-PM-DECOMPOSE" then
      . + {
        children: ["IVC-C1","IVC-C2","IVC-C3","IVC-C4","IVC-C5","IVC-C6","IVC-A1","IVC-A2"],
        depends_on: ["IVC-A1"],
        next_agent: "pm",
        updated_at: $now,
        updated_by: "pm",
        pm_decomposition_complete: false,
        status_note: "PARTIAL DECOMPOSITION 2026-08-23 (pm): 8 of the BA spec's 9 task groups minted (IVC-C1..C6, IVC-A1, IVC-A2 — ids reused verbatim from docs/handoffs/IVC-ARCH-BLUEPRINT-BA-spec.md §1, owner dev-mcp-server per the PO routing note). IVC-A3..An deliberately NOT minted: its row count is scan-dependent on IVC-A1's class-a-validation-coverage.json output, and both the blueprint §5 and the BA spec restate an explicit caution against fabricating that count ahead of time. depends_on=[IVC-A1] added so this row is mechanically non-dispatchable until that scan lands rather than re-surfacing to pm on every sweep; next_agent stays pm because the remaining hop genuinely is a second pm decomposition pass. Also track BA spec EC-1 as a metric, not a boolean: class-c-coverage.json's pass-through count must trend to zero, not sit as a permanently accepted gap."
      }
    else . end
  )

# ── 4. UC-ASL-P5: routing correction, NOT a decomposition ───────────────────
#    BA spec § Zone explicitly instructs pm to keep FR-1 + FR-2 as ONE task.
| .task_board.ready |= map(
    if .id == "UC-ASL-P5" then
      . + {
        next_agent: "agent-father",
        owner: "agent-father",
        zone: "docs/agents/",
        updated_at: $now,
        updated_by: "pm",
        status_note: "NOT DECOMPOSED — DELIBERATE (pm 2026-08-23). docs/handoffs/UC-ASL-P5-BA-spec.md § Zone instructs pm verbatim to keep both surviving edits in ONE task: 'Small/independent enough (S-size) that PM should keep both edits in ONE task rather than splitting per-zone — no runtime dependency between FR-1 and FR-2, but no coordination benefit to splitting either.' Splitting would be a scope invention, so this row is a routing correction only. SURVIVING SCOPE IS FR-1 + FR-2 ONLY — parts 2 and 5 of the original 4-part note were re-verified and DECLINED (part 2 was consciously declined in signal-dashboard/SKILL.md's own size-justification header; part 5's enum-tighten would now WEDGE orch writes and BLIND cold-evict because triaged/TRIAGED/RETRACTED became terminal in orch-cold-evict.sh:150). FR-1 = tier1-probe.md per-check-class category-type literals (microservice_degraded -> A-01..A-11/A-20/A-21/A-30; signal_feedback stays for A-12..A-19/A-32/A-33); FR-2 = triage-signals.md dedup-skip RESOLVED-closure guarded on status==READ ONLY, never NEW, with a NEW-status negative-control fixture. ROUTING OVERRIDE (pm): the BA spec routed these to generic `developer`, but both files are docs/agents/**/flow/*.md agent-instruction prose, which is agent-father's commit_zone and explicitly NOT developer's — same correction architect applied to UC-CDC-P1's FR-A4/A5 (po_routing_ruling_20260721 precedent). supervised/deploy_gate already cleared by architect; no rebuild, no deploy window."
      }
    else . end
  )

# ── 5. UC-CDC-P1: pm assessment — genuinely blocked, NOT stranded ───────────
| .task_board.in_progress |= map(
    if .id == "UC-CDC-P1" then
      . + {
        updated_at: $now,
        updated_by: "pm",
        pm_wip_assessment_20260823: "pm ASSESSED 2026-08-23, NO CHANGE — concurring with po_wip_ruling_20260823, independently re-verified rather than relayed. (1) NOT stranded and NOT in flight: all three WP-A children TASK_2008a/b/c are DONE_VERIFIED in docs/data/orch/archive/2026-08.json and absent from every hot lane, so the parent has no live work of its own. (2) NOT consuming a WIP slot: status=BLOCKED, and scripts/lib/devteam-eligibility.jq:115-118 excludes BLOCKED from wip_in_progress — live non-BLOCKED in_progress[] this tick is 2 (TASK-BCTC-INSPECT-UI-FILTERS, FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION), exactly at the WIP limit and unaffected by this row. (3) next_agent=pm is CORRECT, not stale: WP-B needs a pm decomposition hop once UC-SDF-P2 clears (re-probed live: still backlog[]/BACKLOG/plan_only/next_agent=ba/unclaimed). (4) The lane move out of in_progress[] is mechanically IMPOSSIBLE today, confirmed by reading scripts/orch-row-prose-ceiling-check.mjs directly and not from the prior note: PROSE_CEILING_LANES=['backlog','ready','review'], so a move from unguarded in_progress[] into ANY guarded lane sets liveBytes=0 and a >12000B row hard-rejects at :269 even on a byte-identical move. There is no legal destination that preserves the truth — done[] would falsely assert delivery. Correct disposition is to LEAVE IT, which is what po ruled and what this pass affirms. Blocked on defect D3 of FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS; complete the move when that ships."
      }
    else . end
  )

# ── 6. Retarget the 2 dependents that named a now-closed parent ─────────────
#    A closed-as-decomposed parent can never reach DONE_VERIFIED, so
#    deps_satisfied() would strand these forever. Point them at the concrete
#    children instead (replace the parent id, keep every other dep).
| .task_board.backlog |= map(
    if .id == "FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION" then
      . + {
        depends_on: ((((.depends_on | toarr) + (.depends | toarr)) | map(select(. != "FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR"))
                      + ["FIX-CHEF-MARKER-KEY-ANCHOR-1","FIX-CHEF-MARKER-KEY-ANCHOR-2","FIX-CHEF-MARKER-KEY-ANCHOR-3","FIX-CHEF-MARKER-KEY-ANCHOR-4"]) | unique),
        updated_at: $now,
        updated_by: "pm"
      } | del(.depends)
    else . end
  )
| .task_board.review |= map(
    if .id == "FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE" then
      . + {
        depends_on: ((((.depends_on | toarr) + (.depends | toarr)) | map(select(. != "FIX-USDVND-THRESHOLD-SSOT"))
                      + ["TASK-USDVND-TS-STATIC-RETIRE","TASK-USDVND-GO-SIGMA-PORT"]) | unique),
        updated_at: $now,
        updated_by: "pm"
      } | del(.depends)
    else . end
  )

| .task_board._updated_at = $now
| .task_board._updated_by = "pm (2026-08-23 manual-dispatch-queue decomposition: 17 minted, 7 parents closed)"
