/**
 * orchestration-step-card.test.tsx — FACTORY-FRONTEND-split-orchestration.
 * Render smoke test for StepCard, written BEFORE the component was split out
 * of dashboard.orchestration.tsx (TDD RED->GREEN — test-first extraction).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StepCard } from "~/components/orchestration/StepCard";
import type { StepDto } from "~/domain/orchestration/types";

const STEP: StepDto = {
  step_id: "S1",
  agent_id: "dev-frontend",
  timestamp: "2026-07-24T10:00:00Z",
  task_id: "TASK-1",
  what_done: "Split the route",
  what_considered: ["option A", "option B"],
  why_decision: "matches precedent",
  why_change: "no change from plan",
};

describe("StepCard", () => {
  it("renders step_id, agent_id, what_done, why_decision, why_change", () => {
    render(<StepCard step={STEP} />);
    expect(screen.getByText("S1")).toBeTruthy();
    expect(screen.getByText("dev-frontend")).toBeTruthy();
    expect(screen.getByText("Split the route")).toBeTruthy();
    expect(screen.getByText("matches precedent")).toBeTruthy();
    expect(screen.getByText("no change from plan")).toBeTruthy();
  });

  it("renders each what_considered bullet", () => {
    render(<StepCard step={STEP} />);
    expect(screen.getByText("option A")).toBeTruthy();
    expect(screen.getByText("option B")).toBeTruthy();
  });

  it("omits the what_considered block when the array is empty", () => {
    render(<StepCard step={{ ...STEP, what_considered: [] }} />);
    expect(screen.queryByText("What was considered:")).toBeNull();
  });
});
