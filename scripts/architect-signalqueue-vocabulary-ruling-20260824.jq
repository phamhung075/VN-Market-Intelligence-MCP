# scripts/architect-signalqueue-vocabulary-ruling-20260824.jq
#
# Architect ruling for FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING.
# Brief: docs/architecture-briefs/2026-08-24-fix-signalqueue-status-and-recipient-vocabulary.md
#
# Single-pass triple mutation, all inside .task_board.backlog[] (id-guarded, idempotent):
#   M1 ENRICH FIX-ORCHAPPLY-SIGNALROW-STATUS-UNVALIDATED-ADMITS-UNPICKABLE-UNEVICTABLE-VALUES
#      (developer row) with the concrete ratified vocabulary + OPEN/to rulings + extended files[].
#   M2 MINT FIX-SIGNALQUEUE-STATUS-TO-VOCABULARY-DOCS (agent-father, docs child, depends=[]).
#   M3 CONVERT FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING (this row) into
#      the umbrella: children/depends = [M1 id, M2 id], next_agent=qa.
#
# Usage: jq --arg now "$NOW" -f scripts/architect-signalqueue-vocabulary-ruling-20260824.jq \
#   docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now |
"FIX-ORCHAPPLY-SIGNALROW-STATUS-UNVALIDATED-ADMITS-UNPICKABLE-UNEVICTABLE-VALUES" as $devId |
"FIX-SIGNALQUEUE-STATUS-TO-VOCABULARY-DOCS" as $docsId |
"FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING" as $umbrellaId |
"docs/architecture-briefs/2026-08-24-fix-signalqueue-status-and-recipient-vocabulary.md" as $brief |

# id-guard: only mint the docs row if it doesn't already exist anywhere on the board
([.task_board[]? | (if type=="array" then .[] else empty end) | select(type=="object") | .id]) as $allIds |
($allIds | index($docsId) == null) as $shouldMintDocs |

.task_board.backlog = (
  .task_board.backlog
  | map(
      if (type=="object" and .id == $devId) then
        . + {
          size: "M",
          files: ((.files // []) + [
            "apps/mcp-server/src/scheduler/walEscalation.ts",
            "scripts/audits/signal-queue-vocabulary-drift-check.sh"
          ] | unique),
          ac: ((.ac // []) + [
            "AC-7 (architect ruling, " + $brief + " §2) RATIFIED SET: SignalStatusEnum = [\"NEW\",\"READ\",\"RESOLVED\",\"SUPERSEDED\",\"ACUTE-RESOLVED-ROOT-TRACKED\",\"triaged\",\"TRIAGED\",\"RETRACTED\"] (8 members). TERMINAL_SIGNAL_SET = the 7 non-NEW members, byte-identical to orch-cold-evict.sh:181's current TERMINAL_SIGNAL_STATUSES default — zero picker/evictor literal changes required.",
            "AC-8 (architect ruling §3) OPEN DISPOSITION: OPEN is NOT ratified. Remove it from orchStateStore.ts:47's union entirely (do not carry as a dead member). No sanctioned producer emits it (emit-audit-signal.sh + all 5 TS in-process writers all hardcode NEW). Hard-reject any future write, never quarantine — a quarantine state is the wrong tool for a provable producer mistake vs a not-yet-ratified value. PARTIAL is the same class (zero signal-row producer found anywhere) — also dropped from the type, never admitted to the schema.",
            "AC-9 (architect ruling §5) to:ops RULING + SignalRecipientEnum: to:\"ops\" is INVALID for signal_queue.rows[] — ops has no polling loop and no push-spawn target (docs/data/cowork-schedule.json has zero ops entries); PO's triage-signals.md already bridges auditor/scheduler findings to owner:ops task-board mints via to:\"po\". apps/mcp-server/src/scheduler/walEscalation.ts:30 (SANCTIONED, shipped, correctly-cased producer, proves the delivery hole empirically) — change to: 'ops' -> to: 'po'. Add SignalRecipientEnum = [\"po\",\"tran-ngoc-bau\",\"alert-commander\",\"unified-agent\"] to SignalRowSchema.to (was z.string().optional()) and OrchStateSignalRow.to (was bare string) — same reject-closed treatment as status, justified by the walEscalation.ts evidence alone. Inline TS enum, NOT a live system-map.json read (avoids coupling two independent hot files' failure modes) — kept honest by AC-10's drift-check instead. Also hand-fix the one live to:\"ops\" row (po-decision-bug5468-2026-08-23T15:27:38Z) to to:\"po\" in the same pass (data cleanup, not mechanism).",
            "AC-10 (architect ruling §4.4/§6) IMPLEMENTATION NOTES: (a) both status and to enums live in orchStateSchema.ts and are picked up by BOTH write paths for free (orch-validate.mjs's OrchStateSchema.safeParse AND writeOrchStateAtomic's own safeParse call inside appendSignalQueueRow's writeAtomicFn — traced live, one Zod schema, two callers, no duplicate mechanism needed). (b) No dual-file live-vs-candidate grandfather script (unlike orch-row-prose-ceiling-check.mjs's pattern) — live file is already 100% clean (verified 2026-08-24: READ=86/RETRACTED=12/triaged=8/NEW=1, zero OPEN, zero lowercase new) so ship the hard enum directly; re-run that same live-conformance jq check immediately before deploy as the safety margin, escalate rather than silently widen if it is no longer clean. (c) appendSignalQueueRow()'s retry loop has NO try/catch around writeAtomicFn — a Zod-schema throw (which this AC's own enum newly makes reachable) propagates uncaught, contradicting the function's own docstring (\"do NOT throw\"). Wrap that call in try/catch; on a schema-validation error specifically, follow the same warn-and-drop path already used for CAS exhaustion. (d) Ship scripts/audits/signal-queue-vocabulary-drift-check.sh (mirrors guard-signal-type-coverage.sh's SSOT-parsing pattern) asserting TERMINAL_SIGNAL_SET (TS) == orch-cold-evict.sh's TERMINAL_SIGNAL_STATUSES default and SignalRecipientEnum (TS) == system-map.json .project.cowork_signal_recipient; wire into .github/workflows/ci.yml as a new job mirroring signal-type-coverage-guard."
          ]),
          updated_at: $now,
          updated_by: "architect",
          architect_ruling_ref: $brief
        }
      else . end
    )
  + (
      if $shouldMintDocs then [{
        id: $docsId,
        type: "FIX",
        title: "Signal-dashboard docs: ratify status/to vocabulary + to:ops->to:po redirect rule",
        status: "BACKLOG",
        priority: "P1",
        size: "S",
        zone: ".claude/skills/signal-dashboard/",
        owner: "po",
        next_agent: "agent-father",
        depends: [],
        parent: $umbrellaId,
        created_at: $now,
        created_by: "architect/" + $umbrellaId,
        files: [".claude/skills/signal-dashboard/SKILL.md", ".claude/skills/signal-dashboard/reference.md"],
        note: "Per " + $brief + " §8. Update SKILL.md § Receivers with an explicit negative entry: ops is NOT a valid `to` for signal_queue rows — route ops-actionable findings via to:\"po\" (triage-signals.md already dispatches owner:ops task-board work from there). Update § ACK/CLOSE to cite the now-enforced 8-member SignalStatusEnum (NEW/READ/RESOLVED/SUPERSEDED/ACUTE-RESOLVED-ROOT-TRACKED/triaged/TRIAGED/RETRACTED) as the SSOT, replacing the prior unenforced prose framing. Add a reference.md note documenting the to:ops -> to:po redirect rule and citing walEscalation.ts as the concrete precedent. Parallel-safe with the sibling developer row (depends=[]) — the ratified vocabulary is fixed by the architect brief, not pending developer discretion.",
        ac: [
          "AC-1 SKILL.md § Receivers table gains an explicit ops-invalid entry + to:po redirect rule.",
          "AC-2 SKILL.md § ACK/CLOSE cites the 8-member SignalStatusEnum verbatim, matching orchStateSchema.ts byte-for-byte (no drift between shipped code and shipped prose).",
          "AC-3 reference.md gains a short section on the push-vs-pull delivery split (cross-reference FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS, the sibling epic's own docs child, so the two do not silently diverge on the same file)."
        ]
      }] else [] end
    )
  | map(
      if (type=="object" and .id == $umbrellaId) then
        . + {
          children: [$devId, $docsId],
          depends: [$devId, $docsId],
          next_agent: "qa",
          updated_at: $now,
          updated_by: "architect",
          architect_ruling_delivered: "Ruling delivered in full — " + $brief + ". Row converted to umbrella per the auditor-tier1-spawn-debounce precedent (backlog[], next_agent=qa, depends=children — EPIC-WRAPPER gate + depends-satisfied gate both hold it out of auto-pickup until both children reach DONE_VERIFIED). QA joint check on promotion: pre-deploy live-conformance re-check was run and clean, drift-check script passes, AC-6 regression on a 3rd unseen value rejects, walEscalation.ts repoint has a test, docs child cites the shipped enum byte-for-byte."
        }
      else . end
    )
)
