# po-triage-20260822T1900-uccca-p2-mw-signoff-cired-sizelint-fold.jq
#
# Owner flow: docs/agents/po/flow/main.md (§ Reusable triage scripts — one-off triage transform,
#             same convention as scripts/po-triage-20260731-*.jq siblings).
# Invocation: jq -f scripts/po-triage-20260822T1900-uccca-p2-mw-signoff-cired-sizelint-fold.jq \
#               docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# THREE mutations, one atomic write (never three racing writes against a live peer-dirty file):
#   1. UC-CCA-P2-MARKET-WATCHER : review[] -> done[], REVIEW -> DONE, AC-3 signed off via
#      substituted falsifiable criterion (literal AC-3 is unfalsifiable — see po_note).
#   2. FIX-CI-SIZELINT-GETBCTCPENDINGREFINETOOL-BASELINE-TOLERANCE-EXCEEDED : backlog[] -> ready[],
#      BACKLOG -> READY, occurrence_count 3 -> 7 (folds 4 further ci_red fires, all pre-dedup
#      failing-file-read verified byte-identical).
#   3. Mint FIX-BA-AC-NAMES-PLANE-IMPLEMENTATION-NEVER-WRITES into backlog[] (spec-quality
#      guardrail spun out of mutation 1's root cause).
#
# NOTE: this script deliberately does NOT clear .dev_team_idle_chain.pending_triage_inbox[] —
# that subtractive CLEAR is owned by docs/agents/dev-team/flow/main.md § Step 1 "Durable-inbox
# CLEAR" (docs/agents/po/flow/triage-signals.md:7). PO routes/dispositions only.

def NOW: "2026-08-22T19:00:18Z";

def MW_PO_NOTE:
  "PO AC-3 SIGN-OFF 2026-08-22T19:00:18Z — DONE. Supersedes the 2026-08-14T12:47:50Z NOT-SIGNED-OFF note. The root blocker that note named (cowork master dispatcher silent since tick 06:45Z) RESOLVED on its own at 2026-08-14T16:11Z; 4 live cycles have run since.\n\nAC-3 AS WRITTEN IS UNFALSIFIABLE — that, not the dispatcher outage, is the real reason this row stalled 8 days. docs/handoffs/UC-CCA-P2-BA-spec.md:418-419 defines AC-3 as \"next live market-watcher cycle's WORK ping / notebook shows exactly one [GATEWAY] probe log line, not two\". NEITHER named plane can ever carry that line on a healthy cycle: .claude/skills/gateway-availability-gate/SKILL.md:30 emits `[GATEWAY] probe OK — proceed` as a TRANSCRIPT log line only, and writes the notebook solely on its DEFER/BLOCKED failure branches (SKILL.md:54); docs/agents/market-watcher/flow/cycle.md:328 fixes the Step 5b WORK ping to the ULTRA template `[mw] HH:MM — N stocks | anom:X vol:Y chain:Z | next:TIME` (<=80 chars, no gateway field). Zero [GATEWAY] lines on a gateway-UP cycle is the CORRECT output, not a miss. No amount of further waiting could ever have settled it.\n\nSUBSTITUTED CRITERION (equivalent, falsifiable) + EVIDENCE, re-verified live at HEAD 2026-08-22T19:00Z:\n(1) Exactly ONE probe INVOCATION site across all 3 market-watcher flow files — main.md:61, the one-line pointer to gateway-availability-gate/SKILL.md (agent-id=market-watcher, covers cycle.md AND eod.md). cycle.md's two surviving \"Step 0-GW\" hits are prose only (:20 execution-contract terminal clause, :22 narrate-not-execute guard text); eod.md zero. This is DISPOSITIVE for \"exactly one probe per invocation\": there is no second site left to invoke.\n(2) 4 post-commit live cycles all completed through that single site — 2026-08-14T16:11Z (23eed1755), 2026-08-15T00:14Z (5be446b8b), 2026-08-15T04:19Z (248ce4e42), 2026-08-15T08:11Z (55d939b98). Every one: items_fetched=34, exit_status=complete, zero [GATEWAY] DEFER/BLOCKED notebook entries, zero gateway bug escalation.\n(3) No regression vs the pre-change 2026-08-14T04:09Z baseline (34 tickers, 0 anomalies, complete): the 08-15T08:11Z cycle is exact parity (34/0/complete); 08-14T16:11Z is 34 tickers / 1 anomaly (DXG +5.99%) / 1 suppressed / complete — normal market variation, not regression.\ncommit 3cfabaa28 re-confirmed ancestor of HEAD.\n\nSPEC-QUALITY DEFECT SPUN OUT (do not re-litigate here): FIX-BA-AC-NAMES-PLANE-IMPLEMENTATION-NEVER-WRITES, backlog[], next_agent=ba. Full reasoning: docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-po.md.";

def CIRED_FOLD_NOTE:
  "[po/triage 2026-08-22T19:00:18Z] FOLD +4 fires (occurrence_count 3 -> 7) AND lane-promote backlog[] -> ready[]. This row now covers SEVEN CI RED probes on the SAME failing file.\n\nNEW FIRES FOLDED THIS PASS (none were ever folded before — the 2026-08-15T13:30Z fold covered runs at 10:21/11:21/12:20 only, and feb68920 landed at 13:19:36Z, ~10min before that fold, so it was missed):\n  - CI-RED-feb68920 head feb6892035873b245603b4b4f7d9cfdd355610f8 run 31886091545 (2026-08-15T13:01:39Z)\n  - CI-RED-9d29dad8 head 9d29dad8... run 32585964001 (2026-08-22T16:51:36Z)\n  - CI-RED-6bbc7e11 head 6bbc7e11... run 32588886623 (2026-08-22T17:49:43Z)\n  - CI-RED-dc0f9033 head dc0f90334e72fae38ce496df428ef7815233631e run 32591495299 (2026-08-22T18:42:01Z)\n\nMANDATORY PRE-DEDUP FAILING-FILE READ PERFORMED ON ALL FOUR (not skipped, not inherited from this row): `gh run view <run_id> --log-failed` on each. size-lint is not the bun-test per-file-isolation runner, so no FAILEDFILE block exists and FAILING_FILES was read verbatim from each failing step's own error line. All four emit the byte-identical pair:\n  `[size-lint] FAIL — 1 offending file(s) (scanned 1409):`\n  `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts — baseline-tolerance-exceeded (baseline=464L actual=605L upper=510L)`\nOne offending file, one row, no split, no collapse. File-scoped dedup_key matched on all four.\n\nANSWERS THE dev-team-tick 18:37Z QUESTION (\"is PO's file-scoped dedup actually collapsing these into one FIX row rather than 4?\"): YES — file-scoped dedup is correct and collapses all of them onto THIS row. The 4 envelopes did not represent 4 defects. But the collapse is a PO-TRIAGE-TIME action, and no PO triage pass had run since 2026-08-15T13:30Z, so 4 fires sat unfolded in .dev_team_idle_chain.pending_triage_inbox[] / docs/signals/ looking like 4 independent problems. The ci-health-probe's OWN dedup cannot help here and is not the bug: scripts/agents-flow/ci-health-probe.js builds `dedup_key = \"ci_red:<full head_sha>:<job>\"`, which is HEAD-scoped by construction, so every advancing HEAD necessarily emits a fresh envelope — the probe never parses the failing file and structurally cannot dedup across SHAs. Same shape as feedback_ci_red_close_must_record_fingerprint_else_redrain.\n\nWHY PROMOTED TO ready[] RATHER THAN LEFT IN backlog[]: this row was triaged, root-caused and stamped next_agent=dev-mcp-server on 2026-08-15T13:31Z and then sat in backlog[] for 7 days with main CONTINUOUSLY RED. RAW-RE-VERIFIED LIVE at 2026-08-22T19:00Z, not read off any signal payload: `wc -l apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` = 605, and `git log --since=2026-08-15 -- <that file>` is EMPTY — the file has not been touched since the row was minted, so the breach is still live and every further push to main inherits a RED CI. backlog[] is not a dispatchable lane; ready[] is. Fix path unchanged and already fully written on this row: refresh the size-justification header + re-baseline, OR split the tool if 605L is genuinely unjustified. Do NOT investigate any of the seven SHAs — all are docs/chore commits that never touched this file (the sequencing trap this row already warns about, now confirmed 7x).";

def BA_AC_ROW:
  {
    id: "FIX-BA-AC-NAMES-PLANE-IMPLEMENTATION-NEVER-WRITES",
    type: "FIX",
    title: "BA acceptance criteria may name an evidence plane the implementation never writes to — makes the AC unfalsifiable and strands the row",
    owner: "po",
    status: "BACKLOG",
    priority: "P2",
    size: "S",
    zone: "cross-service/",
    next_agent: "ba",
    created_at: NOW,
    created_by: "po",
    updated_at: NOW,
    updated_by: "po",
    files: ["docs/agents/ba/flow/", "docs/handoffs/UC-CCA-P2-BA-spec.md"],
    depends: [],
    verification_gate: "ba_spec_ac_plane_check_documented_and_one_historical_spec_replayed",
    status_note: "CONFIRMED LIVE, cost measured: UC-CCA-P2-MARKET-WATCHER sat in review[] for 8 days (2026-08-14 -> 2026-08-22) on an acceptance criterion that could never be satisfied. docs/handoffs/UC-CCA-P2-BA-spec.md:418-419 wrote AC-3 as 'next live market-watcher cycle's WORK ping / notebook shows exactly one [GATEWAY] probe log line, not two'. The implementation it gates (.claude/skills/gateway-availability-gate/SKILL.md:30) emits that line to the TRANSCRIPT on the success path and writes the notebook ONLY on its DEFER/BLOCKED failure branches; the WORK ping is a fixed <=80-char ULTRA template (docs/agents/market-watcher/flow/cycle.md:328) with no gateway field. So on every healthy cycle both named planes read ZERO, forever. The row was re-reviewed, re-blamed on an unrelated dispatcher outage, claimed by a dev-team secondary-drain and re-spawned to PO before anyone read the skill and noticed the plane does not exist.\n\nCLASS, not an instance: this is the AC-authoring twin of the already-known agent-side failure in docs/protocols/fail-loud-protocol.md § Analysis-Only Exit Guard ('re-read the persistence layer before claiming it'). That rule tells the WRITER to verify the plane. Nothing tells the AC AUTHOR that the plane must exist and be written by the code under test in the first place. An AC whose evidence plane is never written is indistinguishable, to every downstream reviewer, from an AC that is failing.\n\nPROPOSED SCOPE (small — BA to confirm/adjust, not prescriptive):\n(1) BA spec-authoring rule: every AC MUST name a persistence plane (file path / DB table / signal row / commit / channel message) that the code or flow under test demonstrably writes on the PASS path, and the spec must cite where that write happens. 'Transcript log line' is NOT an acceptable AC plane — no reviewer can re-read a past transcript.\n(2) A reviewer-side escape hatch, so this never strands a row again: when an AC turns out to be unfalsifiable, the reviewing agent is explicitly authorised to substitute an equivalent falsifiable criterion, record the substitution + evidence on the row, and sign off — rather than blocking indefinitely or fabricating a pass. PO exercised exactly this on UC-CCA-P2-MARKET-WATCHER 2026-08-22 without a documented mandate; the mandate should exist.\n(3) OPTIONAL, flagged not proposed (avoid scope creep): a grep-based scripts/audits/ check over docs/handoffs/*-BA-spec.md for ACs whose evidence noun is 'log line'/'transcript'/'output' with no file path — opt-IN allowlist only per feedback_fleetwide_gate_validated_on_one_file_optout_allowlist.\n\nORIGIN: docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-po.md (2026-08-22 PO cycle)."
  };

# ---- mutation 1: UC-CCA-P2-MARKET-WATCHER  review[] -> done[] --------------------------------
( [ .task_board.review[] | select(.id == "UC-CCA-P2-MARKET-WATCHER") ][0]
  # next_agent DELETED, not set to null: schema types it string|absent (null aborts Stage 1
  # validation). Matches the sibling UC-CCA-P2-SKILL-GW-GATE / -ALERT-COMMANDER / -FB-MARKET-POSTER
  # rows already in done[], which all carry it absent.
  | del(.secondary_claimed_at, .secondary_claimed_by, .secondary_dispatch_target,
        .ac3_evidence_cutoff, .next_agent)
  | .status              = "DONE"
  | .updated_at          = NOW
  | .updated_by          = "po"
  | .ac3_status          = "CONFIRMED_VIA_SUBSTITUTED_FALSIFIABLE_CRITERION"
  | .ac3_last_checked_at = NOW
  | .po_note             = MW_PO_NOTE
) as $mw

# ---- mutation 2: FIX-CI-SIZELINT...  backlog[] -> ready[] -----------------------------------
| ( [ .task_board.backlog[]
      | select(.id == "FIX-CI-SIZELINT-GETBCTCPENDINGREFINETOOL-BASELINE-TOLERANCE-EXCEEDED") ][0]
    | .status                            = "READY"
    | .updated_at                        = NOW
    | .updated_by                        = "po"
    | .next_agent                        = "dev-mcp-server"
    | .occurrence_count                  = 7
    | .po_triage_fold_20260822T1900      = CIRED_FOLD_NOTE
  ) as $ci

# ---- apply ----------------------------------------------------------------------------------
| .task_board.review  = [ .task_board.review[]  | select(.id != "UC-CCA-P2-MARKET-WATCHER") ]
| .task_board.done    = ( .task_board.done + [ $mw ] )
| .task_board.backlog = ( [ .task_board.backlog[]
                            | select(.id != "FIX-CI-SIZELINT-GETBCTCPENDINGREFINETOOL-BASELINE-TOLERANCE-EXCEEDED") ]
                          + [ BA_AC_ROW ] )
| .task_board.ready   = ( .task_board.ready + [ $ci ] )
| .task_board.last_triaged_at = NOW
| .task_board.last_triaged_by = "po"
| ._updated_at = NOW
| ._updated_by = "po (UC-CCA-P2-MARKET-WATCHER AC-3 sign-off + ci_red size-lint fold x4 + BA-AC guardrail mint)"
