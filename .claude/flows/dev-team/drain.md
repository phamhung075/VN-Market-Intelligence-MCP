# Dev Team — Drain

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md   # why: SQLite dedup spec for signals.db
- docs/protocols/agent-chaining-protocol.md                    # why: DB unavailability degradation rules

## Step 1: Open signals.db

```
db_path = docs/signals/signals.db
try:
  open db_path with bun:sqlite (READ_WRITE mode)
  db_available = true
catch (ENOENT | SQLITE_CANTOPEN | locked after 3×200ms retry):
  db_available = false
  log to notebook: "[dev-team] WARN: signals.db unavailable — skipping drain this cycle, inbox retained for retry"
  # hard skip: pendingSignals = [] (no triage this cycle)
  # inbox files left untouched — no mv to processed/
  # cycle continues downstream with empty pendingSignals; retry on next cron tick
```

## Step 2: Glob and iterate

Glob `docs/signals/*.json`. For each signal file (sorted by `createdAt` ascending):

1. Read the JSON file.
2. Log to notebook: `"[dev-team] Signal: {from} → {to} | type={type} | priority={priority}"`
3. Append to an in-memory `pendingSignals[]` array.

3b. **Fingerprint check vs `signals_processed` table:**
    ```
    fingerprint = sha256(signal.from + signal.type + JSON.stringify(signal.payload) + signal.createdAt)

    SELECT 1 FROM signals_processed WHERE fingerprint = ? LIMIT 1
    ```
    - **Match found** (duplicate):
      - Do NOT append to `pendingSignals[]` (skip PO routing)
      - Set `result = "skipped-duplicate-replay"`
      - Move source file → `docs/signals/processed/{filename-replay}.json` (insert `-replay` before `.json`)
      - Append metadata to JSON before moving (see step 4 format)
      - Log to notebook: `"[dev-team] Signal {filename} skipped — duplicate replay (fingerprint match in signals.db)"`
      - No DB INSERT for duplicates
    - **No match** (new signal): proceed to step 4 (dual-record write)

    **Escape hatches** (manual replay):
    - Delete the `processed/` filesystem copy AND the `signals_processed` row for that fingerprint → signal routes again on next cycle
    - Bump `createdAt` in the source file → different fingerprint → treated as new signal

4. **Dual-record write** (new, non-duplicate signals only):

   **4a — Filesystem move** (existing behavior, preserved):
   ```
   mv docs/signals/{filename} → docs/signals/processed/{filename}
   ```
   Before moving, append treatment metadata to the JSON:
   ```json
   {
     "...original fields",
     "fingerprint": "<sha256 hex>",
     "processedAt": "{ISO timestamp}",
     "processedBy": "dev-team",
     "result": "routed-to-po|skipped-duplicate|skipped-duplicate-replay|skipped-stale"
   }
   ```
   - `routed-to-po`: signal passed to PO triage
   - `skipped-duplicate`: identical signal already in pendingSignals (same `from` + `type` + `payload`, in-memory check within this drain pass)
   - `skipped-duplicate-replay`: fingerprint matched `signals_processed` DB row — signal was already handled in a previous cycle
   - `skipped-stale`: `createdAt` older than 24h

   **4b — DB INSERT** (new behavior — SSOT for dedup):
   ```sql
   INSERT INTO signals_processed
     (fingerprint, from_agent, to_agent, type, priority, payload,
      created_at, processed_at, processed_by, result, source_filename)
   VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'dev-team', ?, ?)
   ```
   - File is the canonical human-readable artifact; DB row is the search index for dedup.
   - If DB INSERT fails (non-UNIQUE violation should not occur — UNIQUE constraint is a safety net):
     - Log to notebook: `"[dev-team] ERROR: signals.db INSERT failed for {filename}: {error}"`
     - Continue — file move is canonical SSOT; DB insert failure is non-fatal.

5. **Prune** (both DB and filesystem — run once after all signals in the inbox batch are processed):

   **5a — DB prune:**
   ```sql
   DELETE FROM signals_processed WHERE processed_at < datetime('now', '-7 days');
   ```

   **5b — Filesystem prune** (parallel, unchanged behavior):
   Delete any files in `docs/signals/processed/` with `processedAt` older than 7 days.

   Both prunes run each cycle to keep DB rows and filesystem copies in sync.

## Step 3: Pipeline Resume

Read `docs/pipeline-state.json`:

- If `status == "in_progress"` AND `nextAgent` present AND `updatedAt < 24h` → spawn `nextAgent` immediately. Skip PO triage.
- If `status == "in_progress"` AND `updatedAt >= 24h` → stale crash, reset to `"idle"`. Fall through to PO triage.
- If `"idle"` or missing → fall through to PO triage.

**Session Gate:** PO cannot self-initiate if TASKS.md empty AND no Telegram reports AND `pendingSignals` is empty. `send_telegram(work, "Dev loop idle.")` → EXIT.

If `pendingSignals` is non-empty, these signals feed into PO triage. PO receives them as additional input alongside Telegram reports and TASKS.md.

## RETURN

```
DONE: Drain complete — N signals processed, M duplicates skipped
PENDING_SIGNALS: [array or empty]
PIPELINE: continue → triage
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → flows/dev-team/triage.md     # when: pendingSignals non-empty OR Telegram reports exist OR TASKS.md has pending items
- → STOP                          # when: pendingSignals empty AND no Telegram reports AND TASKS.md idle (session gate triggered)
