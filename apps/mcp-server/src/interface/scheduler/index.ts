/**
 * Scheduler Interface — barrel export
 *
 * Cron job definitions using node-cron (GMT+7 timezone).
 * Jobs are pure side-effect triggers that call application use cases.
 *
 * Populated by future tasks:
 *   - Task 101: Morning briefing job (08:00 GMT+7)
 *   - Task 102: News polling job (every 30 min)
 *   - Task 103: Market open/close scan jobs
 *   - Task 104: SSC nightly report check (20:00)
 *   - Task 105: Evening summary job (22:00)
 */

// Re-export scheduler jobs as they are implemented
export {};
