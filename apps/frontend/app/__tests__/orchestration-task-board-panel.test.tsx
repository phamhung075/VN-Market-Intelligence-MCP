/**
 * orchestration-task-board-panel.test.tsx — FACTORY-FRONTEND-split-orchestration.
 * Render smoke test for TaskBoard (exports TaskBoardPanel), written BEFORE
 * the component was split out of dashboard.orchestration.tsx (TDD RED->GREEN
 * — test-first extraction). Named "-panel" to avoid collision with the
 * pre-existing pure-logic mirror orchestration-task-board.test.ts.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskBoardPanel } from "~/components/orchestration/TaskBoard";
import type { TaskBoard } from "~/domain/orchestration/types";

describe("TaskBoardPanel", () => {
  it("empty state when both tasks and done are empty", () => {
    const board: TaskBoard = { counts: { done: 0, in_progress: 0, backlog: 0 }, tasks: [] };
    render(<TaskBoardPanel board={board} />);
    expect(screen.getByText("No tasks in board.")).toBeTruthy();
  });

  it("renders counts row", () => {
    const board: TaskBoard = {
      counts: { done: 2, in_progress: 1, backlog: 1 },
      tasks: [
        { id: "T-1", title: "t1", status: "IN_PROGRESS" },
        { id: "T-2", title: "t2", status: "TODO" },
      ],
    };
    render(<TaskBoardPanel board={board} />);
    expect(screen.getByText("in progress")).toBeTruthy();
    expect(screen.getByText("backlog")).toBeTruthy();
    expect(screen.getByText("total")).toBeTruthy();
  });

  it("renders In Progress group only when there are IN_PROGRESS tasks", () => {
    const board: TaskBoard = {
      counts: { done: 0, in_progress: 1, backlog: 0 },
      tasks: [{ id: "T-1", title: "t1", status: "IN_PROGRESS" }],
    };
    render(<TaskBoardPanel board={board} />);
    expect(screen.getByText("In Progress")).toBeTruthy();
    expect(screen.queryByText("Backlog / TODO")).toBeNull();
  });

  it("renders Done group from board.done (not a status filter over tasks[])", () => {
    const board: TaskBoard = {
      counts: { done: 1, in_progress: 0, backlog: 0 },
      tasks: [],
      done: [{ id: "T-9", title: "done task", status: "DONE" }],
    };
    render(<TaskBoardPanel board={board} />);
    expect(screen.getByText("Done (1)")).toBeTruthy();
    expect(screen.getByText("T-9")).toBeTruthy();
  });
});
