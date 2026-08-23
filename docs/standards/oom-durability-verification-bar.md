# OOM / Crash-Durability Verification Bar

**Owned by:** qa (primary enforcer) — binding on ANY agent that certifies a DONE/DONE_VERIFIED (or APPROVED) flip on an OOM-class or crash/durability-class acceptance criterion, fleet-wide.
**Applies to:** every task board row whose title/AC/`verification_gate`/`status_note` asserts a crash-free, OOM-free, memory-leak-fixed, or general durability-under-time claim — service-agnostic, not scoped to rag-service or any single zone.
**Origin:** generalised, verbatim in substance, from RAG-MEM-DURABILITY-BAR v2 (`po_RAG_MEM_DURABILITY_BAR_V2_20260814T0927Z` on `FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED`, itself superseding a v1 bar proven gameable — see § 5). This file is the fleet-wide, service-agnostic SSOT going forward; do not re-derive a per-service variant, extend this file instead.
**Enforced at:** `docs/agents/qa/flow/main.md` § OOM-Class Durability Gate (Pipeline + Direct-Commit Verify entry points).
**Task genealogy:** minted to close `FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW` (5 defects, all evidenced live against the same rag-service incident — §§ 2–4 below map 1:1 onto them).

---

## 1. When this bar applies (detection)

A row's acceptance criterion is OOM-class / durability-class if its title, `verification_gate`, AC text, or `status_note` asserts ANY of:
- "no OOM" / "does not OOM" / "OOM-kill" / "oom_memcg" / "OOMKilled"
- a memory leak fixed, bounded, or plateaued
- a crash loop resolved / "crash-free"
- a "durability window" / "supervised sampling" / "N-hour(s) stable" claim
- RSS/memory percentage described as plateauing, bounded, or "under cap"

This is a content match on the row itself, not a service allowlist — it binds equally to rag-service, mcp-server, pdf-extractor, or any future service that produces the same claim shape.

## 2. Three proven-false signals — never sole evidence (defect 1)

Live-proven false-negative across ≥3 confirmed kernel OOM-kills (rag-service incident, 2026-08-12 → 2026-08-14):
- `docker inspect .State.OOMKilled` — read `false` through every confirmed VM-boundary cgroup kill.
- `docker inspect .State.ExitCode` — read `0` through every confirmed kill.
- `docker inspect .RestartCount` — recreate-resets to 0; never a reliable crash counter once container identity has changed.

None of the three may be the sole (or primary) evidence for an OOM-class certification. They may be cited as corroborating/negative context only, never as the deciding signal.

## 3. D1–D5 — the bar itself

### D1 — Signal: authoritative kernel source, in-VM/in-host (defect 1)
`>= 24h` wall-clock (or the row's own explicitly-larger stated window) with ZERO OOM-class kernel events for the target cgroup/process, read from the authoritative kernel log — `dmesg` INSIDE the container runtime's VM (`nsenter` on Docker Desktop) or the host's own `dmesg`/`journalctl -k` where no VM boundary exists. Never derived from any of the three signals in § 2.

### D2 — Continuous lifetime (defect 3, restart-laundering)
The window must span ONE unbroken process/container lifetime. Evidence: an identity field unchanged between window OPEN and CLOSE — `docker inspect .State.StartedAt` (containers) or the equivalent process-start timestamp (bare processes/services). Any restart or recreate during the window resets identity. A window whose identity moved is not a short window — it is no window, and reporting "zero crash in window" over it is a false green of the same family as the docker-inspect false-negative this bar exists to replace: it measures the mitigation, not the fix.

### D3 — Positive plateau (defect 4, negative-only criterion)
"No crash observed" is negative-only and cannot establish boundedness — proven insufficient three consecutive times on one incident (§ 5). Require, over the FINAL segment of the window (last 12h, or the final third of a shorter explicitly-approved window):
- a fitted growth rate `<= 0.02 pp/min` (percentage-of-cap per minute), AND
- a final reading `<= 85%` of the configured cap.

Both conditions must hold. A window ending at 95% of cap having merely not died yet is a FAIL. Task-specific thresholds may be tighter if the row states so; never looser.

### D4 — No-mitigation (defect 3, restart-laundering)
The window is INVALID — not merely reset — if ANY mitigation (preemptive restart, cap raise, traffic throttle, manual memory intervention) was applied during it. Mitigation windows and certification windows are mutually exclusive. If the target cannot survive the window unassisted, that inability IS the finding — report it; never launder it into a green by restarting and re-measuring from zero.

### D5 — Evidence shape (defect 4, process)
The certifying agent MUST write these six fields onto the row before any DONE/DONE_VERIFIED (or APPROVED) flip:
- `durability_window_started_at` (= the D2 identity timestamp at open)
- `durability_window_container_id` (or process-identity equivalent for non-container targets)
- `durability_window_ended_at`
- `durability_samples[]` — `>= 6` entries, each `{ts, mem_pct}`
- `durability_growth_pp_per_min` — the D3 fitted rate
- the verbatim in-VM/in-host kernel query used for D1

A prose assertion without all six fields is NOT a certification, and any lane-move it would have justified is void.

**Collector (use this, do not hand-roll):** `scripts/durability-mem-sample.sh <container> <interval_s> <duration_s> <out.csv>`
produces a D5-shaped series and must be started at window OPEN — D3's fitted rate and D5's `durability_samples[]`
are **not reconstructible after the fact**. `docker stats` keeps no history, no service in this fleet logs RSS,
and there is no metrics endpoint carrying it; verified live 2026-08-23 (0 memory lines in 10630 rag-service log
lines across a 25h window). Three consecutive qa cycles on `FU-RAG-DEPLOY-MEMORY` reached a mature D1 wall clock
and then could not certify for exactly this reason — the blocker was never elapsed time, it was that nobody was
sampling. The script is read-only w.r.t. the target (`docker stats` only, so it is **not** a D4 mitigation), takes
a lock (three concurrent samplers writing two schemas is what corrupted the 2026-08-14 series), refuses a container
with `HostConfig.Memory=0`, and writes the D2 identity + the **live** cap into the CSV header at open, re-reading
identity at close so a moved `StartedAt` is self-evident. Never take the cap from a row's prose: the rag-service
AC text named a stale cap three times in five weeks (768m, then 1g, while the live value was 2 GiB).

## 4. Grandfather-exemption guard (defect 5)

`apps/mcp-server/src/infrastructure/orchStateSchema.ts` `RC_VERIF_GRANDFATHERED_IDS` exempts a fixed, frozen list of pre-existing ids from the schema's `verification.raw_probe{}` requirement on `DONE_VERIFIED`. D5's six fields independently satisfy that same intent — never rely on a grandfather exemption to skip D1-D5 for an OOM-class row; write the D5 fields regardless of whether the schema would otherwise require them.

**Retraction rule:** if a row's id is in `RC_VERIF_GRANDFATHERED_IDS` AND the row's own text (any field, including `status_note` / `po_*` ruling fields) carries a retraction/void marker — matches `RETRACTED`, `FALSIFIED`, `VOID`, "certification retracted", or equivalent — the exemption MUST NOT be relied upon for that row going forward. Treat it as if it were never grandfathered: a live D1-D5 raw-probe re-certification is required before any further `DONE_VERIFIED` flip, exemption list notwithstanding.

**Known open engineering gap (process control only — not closed by this doc; a code change, out of a docs-only edit's scope):** `checkVerificationGate()` in `orchStateSchema.ts` has no runtime guard today that rejects a grandfathered id from re-entering `DONE_VERIFIED` after it has carried a retraction marker — the schema currently trusts the frozen allowlist unconditionally, forever. The § 4 rule above is the compensating process control until a dedicated `apps/mcp-server` code task adds that guard (e.g. "reject `DONE_VERIFIED` on a `RC_VERIF_GRANDFATHERED_IDS` member if the row also carries a retraction/void marker, regardless of exemption"). Any agent minting or triaging that follow-up should cite this section.

## 5. Why v1 (docker-inspect + short window) failed 3x running on one incident

1. thread-pin `ca6d86869` → certified `DONE_VERIFIED` 2026-08-12T12:46:40Z → kernel OOM at +1h00m, +1h14m, +20h34m.
2. cap raise `2f835ec63` → certified `DONE_VERIFIED` 2026-08-08T10:59:52Z → three kernel OOMs on the raised cap.
3. skip-rebuild `82216e291` → stale-ack'd benign on a single post-restart reading at 84.85% → monotonic accelerating climb to 89.18% within 24 minutes; the window was then separately invalidated under D4 by a preemptive mitigation restart at +42min.

Each closure shared the same structural flaw this bar exists to close: a negative criterion, evaluated over a window shorter than the failure's own recurrence period, on a signal (`docker inspect`) that cannot see the failure at all.

## 6. Cross-references
- Origin ruling text (verbatim D1-D5 + rationale): `docs/data/orch/orch-state.json` → `po_RAG_MEM_DURABILITY_BAR_V2_20260814T0927Z` and `po_AC_EXTENSION_20260814T0927Z` on `FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW`.
- Decision trail: `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-21.md`, `docs/agent-memory/decisions/triage-20260814T0931Z-po.md`.
- Enforcement: `docs/agents/qa/flow/main.md` § OOM-Class Durability Gate.
- Schema/exemption source: `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (`RC_VERIF_GRANDFATHERED_IDS`, `checkVerificationGate`).
