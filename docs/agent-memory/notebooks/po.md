# PO Notebook

_Last: 2026-07-25T08:57Z (Tier-1 A-30 memory check sees 1 of 13 containers — ONE row minted, scoped triage only)_

## Tick 2026-07-25T08:56–08:58Z — A-30 memory detector coverage gap (router-dispatched)

**MINTED:** `FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE` — backlog, FIX, P1, S, zone `cross-service/`, next_agent `developer` (precedent: the three sibling `FIX-*-TIER1-PROBE-*` / `FIX-LAUNCHD-PROBE-*` rows are all `cross-service/` + developer-owned). Board 389→390, conservation 652→653 OK via `scripts/orch-apply.sh`.

**The gap, re-verified at source:** `scripts/agents-flow/auditor-tier1-probe.sh:209` resolves its subject with `grep -i 'mcp-server' | head -1`, then applies WARN_PCT=85 to that one container at :224. Tier-1 has no other memory check. `docker inspect -f '{{.Name}} {{.HostConfig.Memory}}'` at 08:56Z: 12 containers carry a real byte cap, `mcp-gateway` is 0 (uncapped) — so **11 capped containers have zero memory coverage**, permanently, at any threshold.

**Same-tick false PASS confirmed:** 08:30Z Tier-1 said "A-30 Memory: 58.63% — PASS" + HEALTHY / 0 anomalies while rag-service was at 94.76%. PO re-probe 08:56Z: rag 756.2MiB/768MiB = **98.46%**, mcp-server 56.94%, every other container ≤16.88%. Not a threshold problem — the check cannot look at the container.

**Prior-art gate: router's fold list CONFIRMED, mint stands.** Independent full-text jq over all 12 lanes (backlog 389 / review 105 / ready 45 / done 16 / in_progress 1 / active_sprints 8 / closed_sprints 19 / archive 7) for `MemPerc|docker stats|per-container|multi-container|all-container` → 4 hits, all inspected, none covers detector scope. `git log` on the probe script: last 3 commits are launchd-only, line 209 untouched and tree-clean (health-recheck stale-dup guard applied).

**Design decision — the FP tension is solved by the ACK LEDGER, not by thresholds.** Router flagged correctly that flat-85 would make rag-service fire every tick forever and re-open the churn `FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE` (DONE) just closed. The mechanism already exists **live in the same script**: `FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION` shipped `docs/data/auditor-launchd-ack.json` at b9484fa7a with exactly the two properties needed — mixed case never suppresses (no permanent blindness) and entries are removed on DONE_VERIFIED (suppression cannot outlive its fix). Row prescribes a parallel `acked_memory[]`, seeded rag-service → `RAG-FTS-BUILD-MEMORY-BOUND`.

## Carry-over
- **Per-container threshold constants were explicitly REJECTED and the row says why.** A static override list is the identical failure mode to `FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX` (whitelist authored 07-08 never learned a lock kind added 07-19). A 99% rag override would also silently swallow a real rag OOM approach; an ack entry pointing at an open row cannot.
- **`HostConfig.Memory == 0` is the honest uncapped discriminator — do not read docker-compose.yml for the container set.** Compose is config-truth and already drifts from runtime-truth (`FU-RUNTIME-SET-TRUTH-RECONCILE` exists for exactly that). `docker stats` MemPerc for an uncapped container is measured against total host RAM (mcp-gateway prints 0.27% of 7.753GiB) and is not a headroom signal.
- **The detail string at :225 hardcodes the words "mcp-server mem".** A widened loop that forgets (c) in the deliverable will mislabel every other container's breach as mcp-server — a false-green class swapped for a false-attribution class.
- **rag-service's 98.46% is NOT novel and must not be re-minted.** Mechanism tracked at `RAG-FTS-BUILD-MEMORY-BOUND` (REVIEW, P1 — `_build_fts_index()` OOM-crashes the 768m container at ~56k rows); restart rate at `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` (RestartCount=12 today matches its documented ~10/day); any limit-raise proposal belongs on `FU-RAG-DEPLOY-MEMORY` and is user-gated infra regardless. mcp-server 45.20%→58.63%/90min is BELOW the trajectory in `FIX-MCP-MEMORY-CODE-LEAK`.
- **Absolute-headroom predicate deliberately deferred, not forgotten.** 11.9MiB free on a 768m cap is genuinely thin and a percentage is not comparable across a 512m and a 3g cap — but shipping it alongside the loop would confound the FP evidence for the loop. Mint separately if the percentage view proves insufficient.
- Untouched as required: no edit to `auditor-tier1-probe.sh`, no container restart/rebuild, no memory-limit change. `git status` on the script = empty.
