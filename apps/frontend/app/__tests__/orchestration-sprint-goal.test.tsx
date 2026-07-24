/**
 * orchestration-sprint-goal.test.tsx — FACTORY-FRONTEND-split-orchestration.
 * Render smoke test for SprintGoal (exports SprintGoalPanel), written BEFORE
 * the component was split out of dashboard.orchestration.tsx (TDD RED->GREEN
 * — test-first extraction).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SprintGoalPanel } from "~/components/orchestration/SprintGoal";
import type { SprintGoal } from "~/domain/orchestration/types";

describe("SprintGoalPanel", () => {
  it("empty state when goal is undefined", () => {
    render(<SprintGoalPanel goal={undefined} />);
    expect(screen.getByText("No sprint goal available.")).toBeTruthy();
  });

  it("renders sprint_id, ACTIVE badge, vision, metric", () => {
    const goal: SprintGoal = {
      sprint_id: "FACTORY-FRONTEND-split-orchestration",
      vision: "Split the mega-route",
      scope: [],
      metric: "route <= 400L",
    };
    render(<SprintGoalPanel goal={goal} />);
    expect(screen.getByText("FACTORY-FRONTEND-split-orchestration")).toBeTruthy();
    expect(screen.getByText("ACTIVE")).toBeTruthy();
    expect(screen.getByText("Split the mega-route")).toBeTruthy();
    expect(screen.getByText("route <= 400L")).toBeTruthy();
  });

  it("renders scope bullets when scope is non-empty", () => {
    const goal: SprintGoal = {
      sprint_id: "S1",
      vision: "v",
      scope: ["Extract DTOs", "Split panels"],
      metric: "",
    };
    render(<SprintGoalPanel goal={goal} />);
    expect(screen.getByText("Extract DTOs")).toBeTruthy();
    expect(screen.getByText("Split panels")).toBeTruthy();
  });

  it("omits Scope block when scope is empty", () => {
    const goal: SprintGoal = { sprint_id: "S1", vision: "v", scope: [], metric: "" };
    render(<SprintGoalPanel goal={goal} />);
    expect(screen.queryByText("Scope:")).toBeNull();
  });

  it("omits Metric line when metric is empty", () => {
    const goal: SprintGoal = { sprint_id: "S1", vision: "v", scope: [], metric: "" };
    render(<SprintGoalPanel goal={goal} />);
    expect(screen.queryByText("Metric:")).toBeNull();
  });
});
