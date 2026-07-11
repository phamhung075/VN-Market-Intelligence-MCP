# Decision Journal — Sprint NARRATIVE-TRUTH-CCATO-GATE · developer

**Sprint goal:** CCATO Tier-1 detection gate — narrative-truth re-probe engine (T1, DONE_VERIFIED) + shared skill (T2, this task) + 6-flow wiring (T3, next).
**Agent:** developer
**Started:** 2026-07-11T07:57:06Z

---

### STEP developer-S1 · developer · 2026-07-11T08:05:00Z
**task-id:** CCATO-T2-CLAIM-TRUTH-SKILL
**what-done:** Authored `.claude/skills/claim-truth-gate/SKILL.md` wrapping the already-shipped `scripts/narrative-truth-gate.sh` (T1, DONE_VERIFIED) — invocation contract (post_body/agent_id/cache), exit-code table, self-correct protocol (brief §4.6), time-sensitivity override (market-watcher/alert-commander), honest-NULL note.
**what-considered:**
- Duplicate the lexicon/tool-routing table inline in the skill for readability vs point to `claim-tool-map.json` SSOT only
- Only path: pointing-only — brief S4.1 + fb-jargon-gate/SKILL.md precedent both explicitly forbid re-listing SSOT data in the wrapper skill (drift risk)
**why-decision:** Skill must be the sole invocation surface per T2's own `verification_gate` ("no duplicated re-probe logic") — any inline copy of lexicon/tools becomes a second source of truth that silently drifts from `claim-tool-map.json`.
**why-change:** No change from architect brief §4/§4.6/§5 — contract documented matches the shipped script's actual CLI/exit-codes/output format, RAW-verified by running `scripts/test-narrative-truth-gate.sh` (10/10 pass) plus 3 standalone smoke-runs of the exact documented invocation steps (FAIL rc=1, clean-body PASS rc=0, missing-arg config-error rc=2) — all matched the doc exactly.
