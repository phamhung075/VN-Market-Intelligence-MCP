# Auditor Evidence Integrity — Root-Cause Brief
<!-- SPIKE_202 · 2026-06-06 · architect -->

## Root Cause

The auditor is a **prose-generating LLM**, not a bash-script runner. Every gate added so far
(RAW-CITE, return-summary extension) targets the FORMAT of evidence, not its PROVENANCE.
A model that knows "a raw cite looks like `Up 3d`" will produce that string whether or not it
ran `docker ps`. Format compliance is not evidence; provenance (tool-call output captured in
memory this cycle) is.

Secondary cause (c040): the model conflated its own bash-sandbox error message
(`/private/tmp/claude-501 full`) with a system infra condition, then escalated it as CRITICAL.
An LLM reading free-form error text and inferring system state from it is a second
provenance-confusion class: external-error-as-infra-signal.

---

## Candidate Matrix

| Candidate | Structural fix? | Covers c038 (fabricated cites)? | Covers c040 (misread sandbox error)? | Token cost |
|---|---|---|---|---|
| (a) VERBATIM fenced block in notebook; verdict refs block | Structural | YES — fabricated output cannot match real docker ps | PARTIAL — misread still possible if agent paraphrases block | +~15L/cycle (one fenced block) |
| (b) Anti-copy rule (no carry from prev section) | Symptom-patch | PARTIAL — hinders copy but LLM can re-invent from memory | NO | ~0 |
| (c) Router spot-probe (already adopted) | Structural, external | YES — catches fabrication post-hoc | YES — router compares live vs claimed | 0 (already in) |
| (d) Split evidence-collection (probe script) from interpretation (LLM reads file) | Structural, definitif | YES — script output is unfabricatable; LLM reads file, not invents | YES — sandbox error cannot reach interpretation layer | +0 (file read is cheap) |
| (e) Sandbox-error quarantine rule | Structural complement | NO | YES — prevents misread class entirely | ~3L (rule addition) |

---

## Recommended Fix (agent-father implements)

**Primary: adopt candidate (d) + (e).**

**(d) Evidence-collection script** — Create `docs/agents/system-auditor/probe.sh` as a
checked-in bash script. It runs every Tier-1 required command (`docker ps -a`, `curl /health`,
`docker inspect RestartCount`, `docker stats MemPerc`) and writes structured output to a temp
file. The flow instructs the auditor to:
1. Execute `bash probe.sh` (one bash call, output captured verbatim to memory).
2. ATTACH the raw output block inside the notebook section under a `### RAW-PROBE:` fence.
3. All verdict lines MUST reference line numbers from that fence, not free prose.

The fenced block is unfabricatable because it is the bash tool's captured stdout, not the
model's composed text. Router spot-probe (c) compares live `docker ps` to the fenced block —
diff = immediate confabulation signal.

**(e) Sandbox-error quarantine** — Add one rule to §RAW-CITE GATE (flow L490-492):

> Any bash exit that returns a Claude Code sandbox error (text matching
> `/private/tmp/claude-501|tasks is full|ENOSPC.*claude/`) MUST be treated as a
> TOOL-UNAVAILABLE / NOT-RUN result for that check — NEVER as evidence of host infra state.
> Log `[TOOL-UNAVAILABLE] <check_id>: bash sandbox error — skip, NOT an infra signal`.

This closes the c040 class permanently at zero token cost.

**(b) Anti-copy** is a symptom-patch only — DROP as a standalone fix; the probe fence makes it
redundant (stale copy would mismatch router probe).

---

## Flow Sections to Change (agent-father targets)

- **New file:** `docs/agents/system-auditor/probe.sh` — Tier-1 bash commands, structured output.
- **§Tier-1 Runtime Ping** (L70-138): replace per-check inline bash blocks with
  `bash probe.sh | tee /tmp/auditor-probe-<ts>.txt`; reference the temp file in verdict lines.
- **§RAW-CITE GATE** (L490-492): add sandbox-error quarantine clause (candidate e).
- **§Notebook write AC-3** (L502-526): mandate `### RAW-PROBE:` fenced block in new section
  (step d, counts toward 60L section cap — trim non-critical rows if needed).

---

## Migration Note — 561L Split Debt

The flow is at 558L against a 120L flow-file cap (split deferred per PO per size-justification
comment L1). The probe.sh extraction actually helps: moving the ~35L of bash command blocks
from §Tier-1 into probe.sh reduces the flow by ~30L. Target post-fix length: ~530L — still
above cap, but reduces debt. PO should re-evaluate the flow-split sprint (Tier-1/2/3 separate
files) now that Tier-1 bash surface is externalized into probe.sh.

---

## PLAN-ONLY Invariant — Unaffected

probe.sh is read-only (docker ps, curl, docker inspect, docker stats). No mutation ops.
AUD-ND-1 is preserved. Router adopts no new mutation power.
