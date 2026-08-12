/**
 * publishedMarkerImmunity.ts — Domain invariant: publish-once release immunity.
 *
 * A `published:*` task_id is release-immune once claimed. A SUCCEEDED publish
 * becomes an immutable tombstone; TTL is the sole expiry path. This pure
 * predicate is the single source of truth the infrastructure choke point
 * (coordinationStore.ts releaseTask()/releaseOrphanTask()) consults to refuse
 * every release attempt unconditionally, regardless of caller/owner/staleness.
 *
 * UC-CCA-P3 FR-5 (AC-CODE-GATE) — code-enforced backstop after 3x prose-gate
 * oscillation (2026-07-02 release-after-publish, 2026-07-03 release-on-no-post,
 * 2026-07-15 conditional-release-wrong-direction). See architecture brief
 * docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md §6.
 *
 * Layer: domain/services — pure function, zero I/O, zero infrastructure imports.
 *
 * @module domain/services/publishedMarkerImmunity
 */

const PUBLISHED_MARKER_PREFIX = "published:";

/**
 * True iff `task_id` is a published-marker lock (release-immune by design).
 * Prefix match only — never re-derives or parses the key's internal shape.
 */
export function isPublishedMarkerTaskId(task_id: string): boolean {
  return task_id.startsWith(PUBLISHED_MARKER_PREFIX);
}
