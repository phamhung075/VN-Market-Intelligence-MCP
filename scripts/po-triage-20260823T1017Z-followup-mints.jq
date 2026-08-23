# scripts/po-triage-20260823T1017Z-followup-mints.jq
#
# PO 2026-08-23T10:17:06Z — four follow-up mints + one note tightening.
# Companion to scripts/po-triage-20260823T1017Z-wip-deadlock-and-catchup-disposition.jq.
#
# Usage:
#   jq -f scripts/po-triage-20260823T1017Z-followup-mints.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Every figure below was measured live this tick. New rows land in backlog[],
# a PROSE_CEILING_LANE, so each gets liveBytes=0 — notes are deliberately kept
# well under the 12000B ORCH_ROW_PROSE_CEILING_BYTES to avoid a D3 self-inflict.

# ---------- Tighten the Item 3 rationale with the decisive measurement ----------
.task_board.ready = (.task_board.ready | map(
  if .id == "FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER" then
    . + {
      po_next_agent_ruling_addendum_20260823: "ADDENDUM (same ruling, sharper evidence). An earlier draft of this ruling rested on 'no docs/handoffs/TASK_*.md exists'. That alone is NOT disqualifying: docs/agents/dev-team/flow/execute-tier.md:123 documents a sanctioned direct-execute / self-closeout path explicitly described as having 'no task branch/handoff', used for small FIX rows whose OWN `note` carries the spec. So the absence of a handoff file does not by itself make a developer route wrong. THE DECISIVE MEASUREMENT IS DIFFERENT: this row's `note` field is literally null — 0 bytes. The row carries exactly four things a developer could read: files[] (4 paths), title, zone, and architect_handoff. architect_handoff has zero readers fleet-wide. So the direct-execute escape hatch does NOT rescue this row — a developer dispatched today would receive four file paths and no design, no acceptance criteria, and no rationale, while the brief's §2 decision (age-bounded loud escalation; blanket envelope-synthesis explicitly REJECTED) and its six ACs stayed invisible. The realistic failure is not a stall but a plausible WRONG implementation: with only the file list visible, the obvious-looking fix is exactly the reader-widening the brief rejects. next_agent=pm stands."
    }
  else . end
))

# ---------- MINT 1: architect_handoff is a dead field ----------
| .task_board.backlog += [{
    id: "FIX-ARCHITECTHANDOFF-DEAD-FIELD-ZERO-READERS-STRANDS-EVERY-ARCHITECT-BRIEF",
    type: "FIX",
    size: "S",
    priority: "P1",
    status: "BACKLOG",
    zone: "cross-service/",
    owner: "architect",
    next_agent: "architect",
    created_at: "2026-08-23T10:17:06Z",
    created_by: "po/triage-20260823T1017Z",
    updated_at: "2026-08-23T10:17:06Z",
    baseline_pass: true,
    dedup_checked: true,
    dedup_key: "architect_handoff-field-has-no-reader",
    files: [
      "docs/agents/developer/flow/main.md",
      "docs/agents/dev-team/flow/execute-tier.md",
      "docs/agents/architect/flow/main.md",
      "docs/agents/pm/flow/main.md"
    ],
    title: "`architect_handoff` is a write-only orch-state field with ZERO readers fleet-wide — every architect brief reaches an implementer only if a human-equivalent hop happens to re-open it by hand",
    desc: "Root cause behind today's FIX-SIGNAL-INBOX-... misroute (po ruling 2026-08-23T10:17:06Z). MEASURED: grepping `architect_handoff` across docs/agents/, scripts/ and .claude/ returns exactly one non-data hit — scripts/architect-20260823-orch-prose-ceiling-row-handoff.jq, the jq that WRITES it — plus stale .claude/worktrees/ copies of orch-state itself. No flow doc and no dispatch script READS it. Meanwhile docs/agents/developer/flow/main.md declares its Input (line 12) as `docs/handoffs/TASK_NNN.md with [Architect] Brownfield Findings`, and Step 0c + Step 3 both hard-require that exact path. So an architect can complete a design, write an 18KB brief, stamp architect_design_complete=true and architect_handoff=<path>, and the pointer reaches no consumer. The row then either (a) routes to pm, who re-derives the handoff by hand, or (b) routes to developer, who never learns the brief exists.",
    acceptance: [
      "AC-1: Name the single mechanism by which an architecture brief reaches an implementer, and make it real in the flow docs — either developer/flow/main.md Step 0c gains an architect_handoff fallback when docs/handoffs/TASK_NNN.md is absent, OR architect's own flow is required to emit docs/handoffs/TASK_*.md so the existing reader always finds one, OR architect_design_complete=true is made to force next_agent=pm. Pick ONE; do not ship two half-mechanisms.",
      "AC-2: Negative control — construct a ready[] row with architect_handoff set, note=null, and no docs/handoffs/ file, then demonstrate the chosen mechanism surfaces the brief to the implementer. A design that only works when a handoff file already exists does not close this.",
      "AC-3: If architect_handoff is retained, at least one live reader must exist and be exercised by a test. If it is retired, remove it from the writer jq and from any row that carries it, rather than leaving a field that looks meaningful and is not."
    ],
    non_goals: [
      "Do NOT re-litigate zone routing. Both of today's briefs correctly name `developer` as the eventual zone owner for cross-service/ work; this row is about the HOP, not the OWNER.",
      "Do not touch the direct-execute / self-closeout path in execute-tier.md:123 — it is legitimate for rows whose own note carries the spec."
    ],
    status_note: "MINTED by po 2026-08-23T10:17:06Z while ruling Item 3 of the WIP-deadlock dispatch. Routed to architect rather than developer because AC-1 is a genuine three-way design choice with fleet-wide blast radius, not a mechanical edit. Live instance that exposed it: FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER carried next_agent=developer, architect_handoff=docs/architecture-briefs/2026-08-23-signal-inbox-orphan-escalation-discriminator.md (18530B, 8 sections, 6 ACs) and note=null. po corrected that row to next_agent=pm as a point fix; this row is the class fix."
  }]

# ---------- MINT 2: notebook-auto-prune grep -c double-emit ----------
| .task_board.backlog += [{
    id: "FIX-NOTEBOOKAUTOPRUNE-GREPC-DOUBLE-EMIT-WRITES-MALFORMED-SIGNAL-JSON",
    type: "FIX",
    size: "S",
    priority: "P1",
    status: "BACKLOG",
    zone: "cross-service/",
    owner: "developer",
    next_agent: "developer",
    created_at: "2026-08-23T10:17:06Z",
    created_by: "po/triage-20260823T1017Z",
    updated_at: "2026-08-23T10:17:06Z",
    baseline_pass: true,
    dedup_checked: true,
    dedup_key: "notebook-auto-prune-grep-c-or-echo-0-double-emit",
    files: [
      "scripts/agents-flow/notebook-auto-prune.sh"
    ],
    title: "notebook-auto-prune.sh emits structurally malformed signal JSON whenever a section count is zero — `grep -c ... || echo 0` double-emits at 5 sites, and both currently-malformed files in the signal inbox come from this one bug",
    desc: "REPRODUCED DIRECTLY THIS TICK, not inferred. The idiom `VAR=\"$(... | grep -c PATTERN 2>/dev/null || echo 0)\"` is wrong for `grep -c`: on zero matches grep -c PRINTS its own `0` to stdout AND exits 1, so the `|| echo 0` fallback also fires and the capture becomes the two-line string \"0\\n0\". Verified by direct repro: `X=$(grep -c NOMATCH file || echo 0); echo \"[$X]\"` yields `[0` / `0]`. When that value is interpolated into the emitted signal JSON the document is corrupted. LIVE WIRE EVIDENCE: docs/signals/notebook-prune-dropped-newest-docs-agent-memory-notebooks-dev-mcp-server-md-2026-08-22T232534Z.json line 13 reads `\"sentinel_section_count\": 0` and line 14 is a bare `0,`. `jq .` on that file fails with `parse error: Expected separator between values at line 14, column 2`. AFFECTED SITES (all in scripts/agents-flow/notebook-auto-prune.sh): 477 SECTION_COUNT, 518 SECTION_COUNT, 574 NON_SENTINEL_SECTION_COUNT, 575 SENTINEL_SECTION_COUNT, 601 TIE_COUNT. BLAST RADIUS MEASURED: scanning every docs/signals/*.json this tick, exactly 2 files are invalid JSON and BOTH are notebook-prune-dropped-newest-* files from this writer — i.e. 100% of the signal inbox's malformed-JSON population is produced by this one defect. Those files never reach isDrainableShape() at all, so they are permanently undrainable and invisible to the drain path's own accounting.",
    acceptance: [
      "AC-1: All 5 sites corrected so a zero count yields the single character `0`. `grep -c` already prints 0 on no-match, so the `|| echo 0` fallback is redundant for the no-match case; it is only needed for a genuine grep ERROR (exit 2). Preferred shape: `VAR=\"$(... | grep -c PATTERN 2>/dev/null)\" || VAR=0` — capture first, default only on non-zero exit, then normalize.",
      "AC-2: Regression test that drives the zero-match path on each of the 5 sites and asserts the emitted signal file parses under `jq .`. Asserting the variable equals \"0\" is NOT sufficient — the observable defect is malformed JSON on disk.",
      "AC-3: The 2 existing malformed files in docs/signals/ are repaired or removed as part of this fix, and a rerun of the full-inbox scan (`for f in docs/signals/*.json; do jq . \"$f\" >/dev/null || echo INVALID; done`) reports zero invalid files.",
      "AC-4: Negative control — a NON-zero section count still emits valid JSON with the correct number, proving the fix did not simply hardcode 0."
    ],
    non_goals: [
      "Do NOT touch scripts/agents-flow/drain-signals.js, isDrainableShape(), isByPathConsumerFamilies(), or the price_anomaly_* files — all owned by FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER and its brief, which deliberately scoped this writer OUT.",
      "Do not widen the prune logic itself; this is a quoting/exit-code defect only."
    ],
    status_note: "MINTED by po 2026-08-23T10:17:06Z. Flagged by the router during the signal-inbox architect run and deliberately left out of scope by that brief (§3.4/§1) as a separate live writer defect — this row is where it lands. Routed straight to developer with a self-sufficient desc/AC block (no architect hop): the diagnosis is complete, the repro is in hand, the fix is a 5-line quoting correction, and per docs/agents/dev-team/flow/execute-tier.md:123 the direct-execute path is legitimate when the row's own note carries the spec. It does."
  }]

# ---------- MINT 3: QA-verified / status desync class ----------
| .task_board.backlog += [{
    id: "FIX-QAVERIFIED-STATUS-DESYNC-DONE-ROWS-DAM-DEPENDENT-CHAINS",
    type: "FIX",
    size: "M",
    priority: "P1",
    status: "BACKLOG",
    zone: "cross-service/",
    owner: "architect",
    next_agent: "architect",
    created_at: "2026-08-23T10:17:06Z",
    created_by: "po/triage-20260823T1017Z",
    updated_at: "2026-08-23T10:17:06Z",
    baseline_pass: true,
    dedup_checked: true,
    dedup_key: "qa-verified-at-set-but-status-left-DONE",
    files: [
      "scripts/lib/devteam-eligibility.jq",
      "scripts/devteam-review-claim-secondary-drain.jq",
      "docs/agents/qa/flow/main.md",
      "docs/agents/dev-team/flow/execute-tier.md"
    ],
    title: "A row can carry qa_verified_at + a full QA APPROVED record while its `status` stays DONE — deps_satisfied() then reads it as unsatisfied and silently dams every dependent chain behind it",
    desc: "GENERALISED FROM A CONFIRMED 26-DAY OUTAGE. deps_satisfied() (scripts/lib/devteam-eligibility.jq:278-281) requires every dep to string-equal 'DONE_VERIFIED'; plain DONE is explicitly insufficient and a dep found in no lane resolves MISSING. Nothing anywhere asserts that qa_verified_at and status agree, so a partially-applied QA closeout leaves a row that LOOKS finished to every human reader and reads as unfinished to every picker. MEASURED LIVE 2026-08-23: 3 of the 15 rows in done[] carry a qa_verified_at stamp while status=DONE — TASK-COWORK-CATCHUP-2 (qa 2026-07-28T20:35:33Z), FACTORY-APP-split-assembleBriefing (qa 2026-07-28T20:17:55Z), TASK_RUNIDLE-1-AUDIT (qa 2026-08-08T23:10:08Z). Two of the three are load-bearing: CATCHUP-2 was the SOLE unsatisfied dep of TASK-COWORK-CATCHUP-3/4/5, which cascade to 6/7/8/9/10 — nine rows dammed 26 days; TASK_RUNIDLE-1-AUDIT is the sole dep of TASK_RUNIDLE-2-REDESIGN and TASK_RUNIDLE-3-STALENESS, which cascade to TASK_RUNIDLE-4-TEST and -5-VERIFY — four rows dammed 15 days and still dammed right now. po ratified CATCHUP-2 to DONE_VERIFIED this tick after RAW-verifying all 4 commits in its QA record are real ancestors of HEAD. po deliberately did NOT ratify the other two: FACTORY-APP-split-assembleBriefing and TASK_RUNIDLE-1-AUDIT have commit=none and no review_note, so their evidence is materially weaker and they need real verification, not a status flip.",
    acceptance: [
      "AC-1: Identify the writer that lands qa_verified_at/qa_verified_by without advancing status, and fix it so the two are written in the same transform. Note CATCHUP-2's updated_at (2026-07-28T20:39:16Z) is 3m43s AFTER its qa_verified_at — a LATER write touched the row and still did not advance status, so this is a partial application, not an interrupted one. Find that second writer.",
      "AC-2: A guard that fails loud on any row where qa_verified_at is set and status is not in TERMINAL_SET — wired into orch-apply.sh alongside the existing lane-coherence checks, so the desync cannot be reintroduced silently.",
      "AC-3: TASK_RUNIDLE-1-AUDIT is genuinely verified by qa (not status-flipped on trust — it has commit=none and no review_note) and, if it passes, advanced to DONE_VERIFIED, unblocking TASK_RUNIDLE-2/3 and thence 4/5. Same for FACTORY-APP-split-assembleBriefing, which blocks nothing and is therefore lower priority.",
      "AC-4: A one-shot audit reporting every row in ANY lane whose qa_verified_at/status disagree, run once and attached to the fix — the 3 found today were found in done[] only; the same scan must cover review[], qa[] and in_progress[]."
    ],
    non_goals: [
      "Do NOT mass-flip the remaining two rows to DONE_VERIFIED to clear the count. The whole failure class is a status field asserting more than the evidence supports; curing it by asserting harder would be the same defect.",
      "Do not change deps_satisfied()'s strictness — requiring DONE_VERIFIED rather than DONE is correct and is not the bug."
    ],
    status_note: "MINTED by po 2026-08-23T10:17:06Z while ruling Item 2 of the WIP-deadlock dispatch. Item 2 asked whether TASK-COWORK-CATCHUP-2 should be verified to unblock its chain; the answer was that it had ALREADY been verified 26 days earlier and only the status field lagged. That reframing is what produced this class row. Routed to architect: AC-1 requires tracing an unknown second writer across the QA-drain and closeout paths, and AC-2 adds a guard to the shared orch-apply pipeline."
  }]

# ---------- MINT 4: price_anomaly unbounded growth ----------
| .task_board.backlog += [{
    id: "CLEAN-PRICEANOMALY-SIGNAL-FILES-UNBOUNDED-NO-AGE-CEILING-ANYWHERE",
    type: "CLEAN",
    size: "S",
    priority: "P2",
    status: "BACKLOG",
    zone: "cross-service/",
    owner: "developer",
    next_agent: "developer",
    created_at: "2026-08-23T10:17:06Z",
    created_by: "po/triage-20260823T1017Z",
    updated_at: "2026-08-23T10:17:06Z",
    baseline_pass: true,
    dedup_checked: true,
    dedup_key: "price-anomaly-signal-files-no-age-ceiling",
    files: [
      "scripts/agents-flow/drain-signals.js",
      "docs/standards/mcp-tools.md"
    ],
    title: "`price_anomaly_*` signal files accumulate forever — 21 files live, oldest 52 days, and no age ceiling exists anywhere in the codebase",
    desc: "Deferred candidate handed to po by architect during the 2026-08-23 signal-inbox design, re-measured by po this tick before minting. MEASURED: docs/signals/ holds 21 price_anomaly_*.json files; oldest price_anomaly_20260702T1607.json dated 2026-07-02 (52 days), newest 2026-08-15. These are a SANCTIONED by-path consumer family — isByPathConsumerFamilies() deliberately exempts them from the drain path, and that exemption is correct and must stay. But exemption from draining was never paired with any retention bound, so the population is monotonically increasing with no upper limit. This is the quiet half of the signal-inbox story: the 26 unenveloped-litter files are a detection problem, these 21 are a retention problem, and only the first has an owner.",
    acceptance: [
      "AC-1: A retention bound exists and is enforced — an age ceiling, a count ceiling, or archival to a dated subdirectory. State which and why.",
      "AC-2: The bound is documented in docs/standards/mcp-tools.md § price_anomaly DUAL-PLANE CONTRACT next to the by-path exemption, so the next reader sees exemption and retention together rather than discovering the gap the way this row did.",
      "AC-3: Negative control — a fresh price_anomaly_* file inside the retention window is untouched by the sweep, and the by-path drain exemption still holds after the change (zero behaviour change to isByPathConsumerFamilies())."
    ],
    non_goals: [
      "Do NOT remove or narrow the by-path drain exemption. These files are correctly excluded from draining; the gap is retention, not classification.",
      "Do not touch isDrainableShape() or the 26 unenveloped-litter files — owned by FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER."
    ],
    status_note: "MINTED by po 2026-08-23T10:17:06Z. P2 rather than P1: unlike the malformed-JSON writer defect this corrupts nothing and blocks nothing today, it just grows. Routed straight to developer — scope is small, fully measured, and the desc is self-sufficient for the direct-execute path."
  }]
