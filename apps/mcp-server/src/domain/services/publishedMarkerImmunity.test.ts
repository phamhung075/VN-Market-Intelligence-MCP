/**
 * publishedMarkerImmunity.test.ts — Unit tests for isPublishedMarkerTaskId()
 *
 * UC-CCA-P3-FR5-CODE-GATE (FR-5 AC-CODE-GATE code track, PO B1 Path-A ruling
 * 2026-08-08, architecture brief docs/architecture-briefs/
 * 2026-08-08-uc-cca-p3-published-marker-gate-skill.md §6).
 *
 * Pure predicate — no DB, no I/O. The coordinationStore.ts release-refusal
 * guard tests (proving the guard actually fires inside releaseTask()/
 * releaseOrphanTask()) live in
 * src/infrastructure/__tests__/coordinationStore.test.ts, extended by this
 * same task.
 *
 * @module domain/services/publishedMarkerImmunity.test
 */

import { describe, it, expect } from "bun:test";
import { isPublishedMarkerTaskId } from "./publishedMarkerImmunity.js";

describe("isPublishedMarkerTaskId", () => {
  it("returns true for a bare 'published:' prefix", () => {
    expect(isPublishedMarkerTaskId("published:")).toBe(true);
  });

  it("returns true for a realistic published marker key (single-fire slot)", () => {
    expect(isPublishedMarkerTaskId("published:chef:2026-08-12")).toBe(true);
  });

  it("returns true for a realistic published marker key (week-period slot)", () => {
    expect(isPublishedMarkerTaskId("published:digest-sunday:2026-W33")).toBe(true);
  });

  it("returns false for a cron:* task_id", () => {
    expect(isPublishedMarkerTaskId("cron:foreign-flow-sweep")).toBe(false);
  });

  it("returns false for a sprint-task-shaped task_id", () => {
    expect(isPublishedMarkerTaskId("UC-CCA-P3-FR5-CODE-GATE")).toBe(false);
  });

  it("returns false when 'published:' appears mid-string, not as a prefix", () => {
    expect(isPublishedMarkerTaskId("cowork:published:decoy")).toBe(false);
  });

  it("returns false for the empty string", () => {
    expect(isPublishedMarkerTaskId("")).toBe(false);
  });

  it("is case-sensitive — 'Published:' does not match", () => {
    expect(isPublishedMarkerTaskId("Published:chef:2026-08-12")).toBe(false);
  });
});
