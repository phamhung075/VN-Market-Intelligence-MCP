/**
 * Shared grid-template-columns for the DONE table header (DoneTaskGroup.tsx)
 * and every data row (DoneTaskRow.tsx). One constant → header and rows
 * always co-align (FIX-ORCH-DONE-GRID-COLS).
 *
 * Columns: ID(120px) | Title(1fr) | Owner(110px) | Status(90px) | Zone(130px) | Chevron(24px)
 * All tracks are non-content-dependent (px or fr) so no single cell can expand
 * its column and crush the Title 1fr.
 *
 * Lives in its own module (rather than colocated in DoneTaskGroup.tsx) so
 * DoneTaskRow.tsx can import it without a DoneTaskGroup<->DoneTaskRow
 * circular dependency (DoneTaskGroup imports DoneTaskRow to render each row).
 *
 * Extracted verbatim from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration).
 */
export const DONE_GRID = "grid-cols-[120px_minmax(0,1fr)_110px_90px_130px_24px]";
