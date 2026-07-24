/**
 * orchestration-task-group.test.tsx — FACTORY-FRONTEND-split-orchestration.
 * Render smoke test for TaskGroup, written BEFORE the component was split out
 * of dashboard.orchestration.tsx (TDD RED->GREEN — test-first extraction).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskGroup } from "~/components/orchestration/TaskGroup";
import type { TaskRow } from "~/domain/orchestration/types";

const TASKS: TaskRow[] = [
  { id: "T-1", title: "First task", owner: "dev-frontend", status: "IN_PROGRESS", zone: "apps/frontend/" },
  { id: "T-2", title: "Second task", status: "TODO", note: "waiting on deps" },
];

describe("TaskGroup", () => {
  it("renders the label as a heading", () => {
    render(<TaskGroup label="In Progress" tasks={TASKS} />);
    expect(screen.getByText("In Progress")).toBeTruthy();
  });

  it("renders one row per task with id/title/owner/status/zone", () => {
    render(<TaskGroup label="In Progress" tasks={TASKS} />);
    expect(screen.getByText("T-1")).toBeTruthy();
    expect(screen.getByText("First task")).toBeTruthy();
    expect(screen.getByText("dev-frontend")).toBeTruthy();
    expect(screen.getByText("IN_PROGRESS")).toBeTruthy();
    expect(screen.getByText("apps/frontend/")).toBeTruthy();
  });

  it("missing owner/zone render em-dash fallback", () => {
    render(<TaskGroup label="Backlog" tasks={TASKS} />);
    const dashes = screen.getAllByText("—");
    // T-2 has no owner, no zone → 2 dashes
    expect(dashes.length).toBe(2);
  });

  it("renders task.note when present", () => {
    render(<TaskGroup label="Backlog" tasks={TASKS} />);
    expect(screen.getByText("waiting on deps")).toBeTruthy();
  });

  it("IN_PROGRESS status gets the blue color class", () => {
    render(<TaskGroup label="In Progress" tasks={TASKS} />);
    const statusCell = screen.getByText("IN_PROGRESS");
    expect(statusCell.className).toContain("text-blue-400");
  });
});
