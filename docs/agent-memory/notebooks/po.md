# PO Notebook

_Last: 2026-07-20T22:11Z (feature scope — obsolete-file cleanup pass for Context Janitor; 1 CLEAN mint + design brief → agent-father; ZERO code)_

## Tick 2026-07-20T22:11Z — "add clean obsolete file to system audit cron"

Router-directed feature scope. Verified live garbage (`$DUMP_FILE` 10MB unexpanded-var dump, `*.json.tmp`, stale synthesis snapshots) with RAW probes before scoping. Minted 1 backlog row via `orch-apply.sh` (conservation 553→554 PASS). Prior-art grepped: no existing obsolete-cleanup task; `CLEAN-SIGNALS-DIR-NONSIGNAL-ARTIFACTS` is a distinct drain-side relocation task.

**MINT — `FIX-CMH-OBSOLETE-FILE-CLEANUP` (CLEAN/S, → agent-father):**
Add `Pass 0b: Obsolete-File Cleanup` to claude-manager-helper (cron `77876d96` Mon/Thu). Design brief: `docs/handoffs/2026-07-20-obsolete-file-cleanup-janitor-pass.md`.
- Owner = CMH (mutating janitor, owns Pass 0 relocation), NOT system-auditor (read-only prober).
- **TWO-FOLD (coordinator input):** (1) new Pass 0b delete pass; (2) fix Pass 0 — it currently RELOCATES garbage into `docs/archive/` (NOT gitignored, holds legit tracked docs) = 10MB `$DUMP_FILE` + `coverage-state.json.tmp` moved root→archive, still committable (latent `git add -A` sweep risk). Pass 0 must exclude pattern-A/B garbage from relocation.
- **Allow-list delete only:** (A) unexpanded-var filenames `$*`, (B) aged `*.tmp`, (C) superseded synthesis/cycle snapshots past keep-window. Scan scope incl. `docs/archive/` (tracked-guard protects legit docs). Opt-in per pattern.
- **Quarantine-first:** move → gitignored `docs/data/.trash/<date>/` + manifest, dry-run default, `--live` gated; NO blind `rm`. Self-purge after 7d.
- **Hard NEVER:** git-tracked files; `.git/.claude/node_modules/apps/packages/.backups`; <grace-age; path-traversal. Idempotent. Do NOT blanket-ignore `docs/archive/` (tracked legit docs) — fix disposition instead.
- Deliverables: flow Pass 0b + Pass 0 disposition fix + `docs/policies/obsolete-file-cleanup.md` SSOT + `scripts/audits/clean-obsolete-files.sh` + `.gitignore` `.trash/`.

## Carry-over
- **KEY BOUNDARY (STANDING):** signal-file retention is OWNED by dev-team `drain-signals.md` (move→processed/→7d prune + purge-legacy script). The cleanup pass is DETECT-ONLY on `docs/signals/*.json` — >50 ⇒ DRAIN-BEHIND BUG flag, never delete. Do NOT create a second racing lifecycle owner.
- Stale `bctc_signal_*_20260719_*` in tree today = drain-behind symptom, not janitor targets.
- **A-30 TRIPWIRE (STANDING):** mcp-server mem FOLD holds only while GC ceiling intact — escalate ops if baseline >93% no-dip / peak >97% no-reclaim / OOMKilled.
- **DO NOT flip GAP-CHEF-SYNTHESIS-A DONE_VERIFIED** on one good cycle — need 3 consecutive non-empty conviction_calls[]+sector_phases[].
- pdf-extractor + dashboard-tier PLAN-ONLY (supervised:true blocks idle auto-pickup).
- Session 58a64705 (router coord). Committed MY scoped paths only; did NOT push.
