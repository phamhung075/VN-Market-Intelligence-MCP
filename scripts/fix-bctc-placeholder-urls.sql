-- fix-bctc-placeholder-urls.sql — Task 1401
-- ─────────────────────────────────────────────────────────────────────────────
-- PURPOSE
-- -------
-- Remove two categories of blocking rows from bctc_vps_queue:
--
--   1. Rows with literal test/placeholder source_urls inserted during development:
--        - https://congbothongtin.ssc.gov.vn/test   (BID, Q4-2025, pending)
--        - https://test.example.com/test.pdf         (TEST, Q1-2025, done)
--
--   2. Rows with NULL source_url and status='pending' that have 0 attempts
--      and have been stale since April 2026, preventing bctcQueueEnricherJob
--      from making progress on real tickers (ACB, CTG, MBB, VIC, VHM, VPB,
--      SSI, VRE and 36 more).
--
-- EFFECT
-- ------
-- After this script:
--   - No rows with test-domain source_urls remain in the queue.
--   - No stale NULL+pending+0-attempt rows block the enricher batch.
--   - The unique constraint (action_code, period_year, period_quarter) is freed
--     for each deleted ticker so bctcQueueEnricherJob/seedWatchlist can
--     re-enqueue fresh rows on next cycle.
--
-- SAFE TO RE-RUN: DELETE ... WHERE is idempotent; if rows are already gone the
-- statements affect 0 rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Pre-flight count (informational)
SELECT
  'pre_delete_literal_placeholder' AS check_name,
  COUNT(*) AS row_count
FROM bctc_vps_queue
WHERE source_url IN (
  'https://congbothongtin.ssc.gov.vn/test',
  'https://test.example.com/test.pdf'
);

SELECT
  'pre_delete_null_pending_stale' AS check_name,
  COUNT(*) AS row_count
FROM bctc_vps_queue
WHERE source_url IS NULL
  AND status = 'pending'
  AND attempts = 0;

-- Step 2: Delete literal placeholder URL rows
DELETE FROM bctc_vps_queue
WHERE source_url IN (
  'https://congbothongtin.ssc.gov.vn/test',
  'https://test.example.com/test.pdf'
);

-- Step 3: Delete stale NULL source_url pending rows (0 attempts, never enriched)
-- These rows have been blocking re-discovery since 2026-04-14 / 2026-04-27.
-- Deleting them frees the unique slot so the enricher/seeder can re-insert
-- with a fresh created_at timestamp and re-attempt URL discovery.
DELETE FROM bctc_vps_queue
WHERE source_url IS NULL
  AND status = 'pending'
  AND attempts = 0;

-- Step 4: Post-delete verification — must return 0 rows
SELECT
  'post_delete_literal_placeholder' AS check_name,
  COUNT(*) AS row_count
FROM bctc_vps_queue
WHERE source_url LIKE '%test.example.com%'
   OR source_url LIKE '%congbothongtin.ssc.gov.vn/test%';

SELECT
  'post_delete_null_pending_stale' AS check_name,
  COUNT(*) AS row_count
FROM bctc_vps_queue
WHERE source_url IS NULL
  AND status = 'pending'
  AND attempts = 0;

-- Step 5: Queue health summary
SELECT
  status,
  COUNT(*) AS cnt,
  SUM(CASE WHEN source_url IS NULL THEN 1 ELSE 0 END) AS null_url_cnt
FROM bctc_vps_queue
GROUP BY status
ORDER BY status;
