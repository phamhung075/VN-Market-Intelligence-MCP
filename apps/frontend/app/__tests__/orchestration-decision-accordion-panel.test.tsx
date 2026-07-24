/**
 * orchestration-decision-accordion-panel.test.tsx — FACTORY-FRONTEND-split-orchestration.
 * Render smoke test for DecisionAccordion, written BEFORE the component was
 * split out of dashboard.orchestration.tsx (TDD RED->GREEN — test-first
 * extraction). Named "-panel" to avoid collision with the pre-existing
 * pure-logic mirror f3-decision-accordion.test.ts.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionAccordion } from "~/components/orchestration/DecisionAccordion";
import type { DecisionsDto, StepDto } from "~/domain/orchestration/types";

const STEP_1: StepDto = {
  step_id: "S1",
  agent_id: "dev-frontend",
  timestamp: "2026-07-24T09:00:00Z",
  task_id: "TASK-1",
  what_done: "Older step",
  what_considered: [],
  why_decision: "d1",
  why_change: "c1",
};

const STEP_2: StepDto = {
  ...STEP_1,
  step_id: "S2",
  timestamp: "2026-07-24T11:00:00Z",
  what_done: "Newer step",
};

const DECISIONS: DecisionsDto = {
  by_task: { "TASK-1": [STEP_1, STEP_2] },
  sprint_bucket: { "SPRINT-1": [STEP_1] },
};

describe("DecisionAccordion", () => {
  it("renders by_task steps sorted newest-first when present", () => {
    render(<DecisionAccordion taskId="TASK-1" decisions={DECISIONS} />);
    const nodes = screen.getAllByText(/step$/i);
    expect(nodes[0].textContent).toBe("Newer step");
    expect(nodes[1].textContent).toBe("Older step");
  });

  it("falls back to sprint_bucket steps when by_task has no entry for taskId", () => {
    render(<DecisionAccordion taskId="TASK-UNKNOWN" sprintId="SPRINT-1" decisions={DECISIONS} />);
    expect(screen.getByText("Sprint-level decisions (no task-id assigned)")).toBeTruthy();
    expect(screen.getByText("Older step")).toBeTruthy();
  });

  it("empty state when neither by_task nor sprint_bucket has entries", () => {
    render(<DecisionAccordion taskId="TASK-NONE" decisions={{ by_task: {}, sprint_bucket: {} }} />);
    expect(screen.getByText("No decisions recorded for this task.")).toBeTruthy();
  });

  it("renders the statusNote banner when provided", () => {
    render(<DecisionAccordion taskId="TASK-1" decisions={DECISIONS} statusNote="pending rebuild" />);
    expect(screen.getByText("pending rebuild")).toBeTruthy();
  });
});
