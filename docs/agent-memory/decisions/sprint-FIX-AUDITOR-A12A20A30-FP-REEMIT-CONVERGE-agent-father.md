# Decision Journal — Sprint FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE · agent-father

**Sprint goal:** Detection-layer predicate tune for system-auditor — A-30 multi-probe reclamation gate (closes the 07-23T03:42Z false CRITICAL, bare 2-point MemPerc delta) + A-21 windowed crash-only restart re-model (closes the cumulative-RestartCount always-grows false-positive class), per `docs/architecture-briefs/2026-07-23-auditor-a30-reclamation-gate-a21-windowed-restart.md`
**Agent:** agent-father
**Started:** 2026-07-23T04:33Z

---

### STEP agent-father-S1 · agent-father · 2026-07-23T04:36Z
**task-id:** FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE
**what-done:** Implemented both code blocks from the brief exactly — `probe.sh` conditional A-30 deep-probe subprocess call (baseline≥85% gate, reuses `scripts/audits/verify-a30-mcp-memory-reclamation.sh` unmodified) + `tier1-probe.md` A-30 override section and A-21 windowed inline `bun:sqlite` query (ports `restartCadenceAlertJob.ts` 1:1). Live-QA'd both against the running mcp-server container (read-only, no mutation) before trusting the wiring.
**what-considered:**
- Implement the brief's `probe.sh` snippet verbatim, no fallback on the subprocess call — rejected: the file runs under `set -euo pipefail` and documents its own "failures are evidence, exit 0" contract; an ungated subprocess failure (e.g. container vanishing mid-window, a live-leak edge case) would abort the rest of probe.sh (disk check, A-20 never run) — silently narrower evidence collection on exactly the cycle that matters most.
- Add `|| echo "[A-30] deep-probe subprocess FAILED ...": $?"` matching the file's own existing per-command idiom (every other fallible command in probe.sh already does this) — accepted: zero new pattern, zero behavior change on the success path, closes the abort risk.
- Where to place the VmHWM>VmRSS veto: router's dispatch text said "in the CALLING layer (probe.sh)", but the brief's actual design places it in `tier1-probe.md`'s JSON-interpretation step (probe.sh only captures raw stdout, it has no JSON-parsing logic anywhere in the file) — resolved by reading "calling layer" as "system-auditor's own two files" (as opposed to inside the reused script), which is what the brief's detailed section actually implements; followed the brief's literal placement, not the paraphrase.
**why-decision:** The brief is the declared SOURCE OF TRUTH and its own text instructs implementing the code blocks exactly; the one addition beyond the literal snippet (the `||` fallback) preserves an existing, explicitly-documented file invariant that the brief's snippet would otherwise silently violate on a narrow edge case — a safety-preserving addition, not a redesign of the escalation logic.
**why-change:** No change to the brief's actual escalation/verdict logic (85% gate, 6-probe/13s cadence, FOLD/ESCALATE mapping, VmHWM veto, A-21 threshold/window/bootstrap-guard) — implemented verbatim.
**commit:** 2f956f1c5
