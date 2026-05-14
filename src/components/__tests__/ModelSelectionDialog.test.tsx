import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelSelectionDialog } from "../models/components/ModelSelectionDialog";

describe("ModelSelectionDialog defaults", () => {
  it("preselects only the saved models that still exist", async () => {
    const user = userEvent.setup();
    render(
      <ModelSelectionDialog
        models={["alpha", "beta", "gamma"]}
        initialSelectedModels={["beta", "missing-model"]}
        loading={false}
        fetchError={null}
        onConfirm={vi.fn()}
        onManualConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("已选 1 / 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /下一步：选择协议 \(1\)/ }));
    expect(screen.getByRole("button", { name: /开始测试 \(1 模型 × 4 协议\)/ })).toBeInTheDocument();
  });

  it("defaults to none selected for new models when there is no saved list", () => {
    render(
      <ModelSelectionDialog
        models={["alpha", "beta"]}
        initialSelectedModels={[]}
        loading={false}
        fetchError={null}
        onConfirm={vi.fn()}
        onManualConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("已选 0 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下一步：选择协议 \(0\)/ })).toBeDisabled();
  });
});
