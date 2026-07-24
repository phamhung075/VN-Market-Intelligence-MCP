/**
 * orchestration-done-task-group.test.tsx — FACTORY-FRONTEND-split-orchestration.
 * Render smoke test for DoneTaskGroup, written BEFORE the component was
 * split out of dashboard.orchestration.tsx (TDD RED->GREEN — test-first
 * extraction). Mirrors the pre-existing pure-logic suite in
 * orchestration-task-board.test.ts (Suite 5b) — this suite covers the ACTUAL
 * rendered DOM, that one covers the equivalent pure slicing functions.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DoneTaskGroup } from "~/components/orchestration/DoneTaskGroup";
import type { TaskRow } from "~/domain/orchestration/types";

function makeTasks(n: number): TaskRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `T-${String(i + 1).padStart(3, "0")}`,
    title: `Done task ${i + 1}`,
    status: "DONE" as const,
    owner: "agent",
    zone: "apps/",
  }));
}

describe("DoneTaskGroup", () => {
  it('renders "Done (N)" heading', () => {
    render(<DoneTaskGroup tasks={makeTasks(3)} />);
    expect(screen.getByText("Done (3)")).toBeTruthy();
  });

  it("collapsed: shows only the last 10 tasks, no toggle button when <=10", () => {
    render(<DoneTaskGroup tasks={makeTasks(10)} />);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
    expect(screen.getByText("T-001")).toBeTruthy();
    expect(screen.getByText("T-010")).toBeTruthy();
  });

  it("collapsed: 101 tasks shows only the last 10 (T-092..T-101), not T-001", () => {
    render(<DoneTaskGroup tasks={makeTasks(101)} />);
    expect(screen.queryByText("T-001")).toBeNull();
    expect(screen.getByText("T-092")).toBeTruthy();
    expect(screen.getByText("T-101")).toBeTruthy();
  });

  it('clicking "Show all" reveals every task', () => {
    render(<DoneTaskGroup tasks={makeTasks(101)} />);
    fireEvent.click(screen.getByRole("button", { name: /Show all 101/ }));
    expect(screen.getByText("T-001")).toBeTruthy();
    expect(screen.getByText("T-101")).toBeTruthy();
  });

  it("clicking a row toggles its DecisionAccordion open/closed", () => {
    render(<DoneTaskGroup tasks={makeTasks(1)} />);
    expect(screen.queryByTestId("decision-accordion-T-001")).toBeNull();
    // Only one task → only one role=button element (the row itself; no "Show all" toggle).
    const rowButtons = screen.getAllByRole("button");
    expect(rowButtons).toHaveLength(1);
    fireEvent.click(rowButtons[0]);
    expect(screen.getByTestId("decision-accordion-T-001")).toBeTruthy();
  });
});
