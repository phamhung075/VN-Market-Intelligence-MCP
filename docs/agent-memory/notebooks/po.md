# PO Notebook

## c · 2026-06-02T04:13Z — TRIAGE (dev-team fire) — 2 architect briefs → agent-father impl (FB-GATE-2 + NB-PRUNE-IMPL)

**Inputs:** orch head idle/WIP 0/2 (none in_progress, verified raw). 2 pendingSignals[] (both pre-marked READ by dev-team):
1. brief_complete MED `arc-nb-prune-contract-...` → `docs/architecture-briefs/2026-06-02-notebook-write-prune-contract.md`
2. design_brief_request HIGH `po-fb-gate-intake-...` (FB-GATE-1) → its deliverable brief already exists.

**RAW-VERIFY (read both briefs, NOT relaying badges):**
- **NB-PRUNE brief = DECIDED & complete.** 4 root causes (F-1 intra-section accum / F-2 bctc double-write / F-3 AC-5 absent from flow path / F-4 market-watcher template > cap). 2-class contract (OVERWRITE po≤50L+market-watcher≤80L / APPEND rest ≤200L+≤60L/section) + new AC-2b intra-`### `-prune + AC-5 inline wc-gate per flow. Named scope S-1..S-6 (chef.md Step8 / bctc stage-log-notify / news-scout stage-log-notify / market-watcher cycle.md Step5 / SKILL L95 / file-size-caps note). All target files exist (verified). → ready for agent-father impl, NO further design needed.
- **FB-GATE brief = DESIGN-DONE & complete.** Status badge confirmed by reading: shared `.claude/skills/fb-jargon-gate/` + `scripts/fb-jargon-gate.sh` (executable `grep -nEi` hard-fail, exit 1 blocks STEP 5), groups A–E, 10 false-positive traps (esp. `vị thế <name>` anchor vs `không`), 3 smoke tests (A fires / B clean / C không-safe) as fence-proof. design_brief_request SATISFIED → FB-GATE-1 closeable, open path = FB-GATE-2 impl.
- **Stale context corrected:** both briefs are already git-TRACKED (committed prior cycle) — Signal-2's "untracked brief needs committing" no longer applies; no commit-of-others'-files needed.

**DECISION → BATCH (2/2, both maintenance-lane agent-father, both PLAN/skill/script edits, no docker):**
1. **FB-GATE-2** (SPRINT-S, route_to=agent-father, zone cross-service) — implement per `2026-06-02-fb-jargon-gate.md` §4/§7/§8. Files: CREATE scripts/fb-jargon-gate.sh (+chmod +x) · CREATE .claude/skills/fb-jargon-gate/SKILL.md · REPLACE fb-market-poster/flow/main.md STEP4 check3 inline list → STEP4a skill hard-fail call + STEP8 `JARGON GATE:` pasted-output field. baseline_pass: §6 smoke A exit 1 + B exit 0 + C exit 0 all pasted; flow has 0 inline token lists + frontmatter on L1. HIGH (3 false-greens in one session).
2. **NB-PRUNE-IMPL** (SPRINT-S, route_to=agent-father, zone cross-service, RE-CAP-1 absorbs) — implement S-1..S-6 per `2026-06-02-notebook-write-prune-contract.md` in ONE commit. Files: docs/agents/unified-agent/flow/chef.md(S8) · docs/agents/bctc-analyst/flow/stage-log-notify.md · docs/agents/news-scout/flow/stage-log-notify.md · docs/agents/market-watcher/flow/cycle.md(S5) · .claude/skills/notebook-write/SKILL.md(L95→2-class table+AC-2b) · docs/data/file-size-caps.json(doc-note). Apply agent-md-factory discipline; frontmatter L1. baseline_pass: each of 5 agents one full cycle → `wc -l` ≤ cap, no backstop-prune fires; SKILL shows 2-class table + AC-2b.

Rationale: both are architect-decided briefs needing implementation only — no ba/architect re-loop. agent-md-factory rule applies to all flow/.md edits. Fills WIP 2/2 cleanly; everything else stays carry-over.

**Carry-over (deferred, valid):** FU-FIXER-NO-FORCE (HIGH) · FPT-OPUS-DEEPDIVE outcome + ESC-OPUS-DISPATCH-SEAM · BCTC-TABLE-2 (PROMOTE 9cy DHG/EIB) + BCTC-CTG-ATTACHMENT-FETCH + FU-BANK-CODECOL · FU-ORCH-HEAD-CAS · FU-SIGNAL-DASHBOARD-CAP · AUDITOR-SLA-CADENCE + A-01b · MSG-1/3 · EI-P2-* · CHEF-FLOW-CAP-REFACTOR. Next live tick = agent-father FB-GATE-2 + agent-father NB-PRUNE-IMPL.
