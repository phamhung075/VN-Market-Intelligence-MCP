/**
 * Task 1837a — Pipeline-state Persistence
 *
 * These tests verify docs/pipeline-state.json has the correct schema and valid
 * field values required for post-/compact pipeline resume.
 *
 * AC-1: file exists with all required fields
 * AC-2: status is one of "in_progress" | "idle"
 * AC-3: updatedAt is a valid ISO date string
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const PIPELINE_STATE_PATH = resolve(
  import.meta.dir,
  "../../../../docs/pipeline-state.json"
);

interface PipelineState {
  _maintained_by: string;
  status: string;
  currentSprint: number;
  activeTaskId: string;
  nextAgent: string | null;
  nextPrompt: string | null;
  updatedAt: string;
  updatedBy: string;
}

function loadPipelineState(): PipelineState {
  const raw = readFileSync(PIPELINE_STATE_PATH, "utf-8");
  return JSON.parse(raw) as PipelineState;
}

describe("1837a — pipeline-state.json schema", () => {
  it("AC-1: file exists and has all required fields", () => {
    const state = loadPipelineState();

    const requiredFields: (keyof PipelineState)[] = [
      "status",
      "currentSprint",
      "activeTaskId",
      "nextAgent",
      "nextPrompt",
      "updatedAt",
      "updatedBy",
    ];

    for (const field of requiredFields) {
      expect(
        Object.prototype.hasOwnProperty.call(state, field),
        `Missing required field: ${field}`
      ).toBe(true);
    }
  });

  it("AC-2: status is one of 'in_progress' | 'idle'", () => {
    const state = loadPipelineState();
    const validStatuses = ["in_progress", "idle"];
    expect(validStatuses).toContain(state.status);
  });

  it("AC-3: updatedAt is a valid ISO date string", () => {
    const state = loadPipelineState();
    const parsed = new Date(state.updatedAt);
    expect(isNaN(parsed.getTime())).toBe(false);
    // Must look like ISO 8601 (contains T and Z or offset)
    expect(state.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
