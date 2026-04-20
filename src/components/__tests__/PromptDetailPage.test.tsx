import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromptDetailPage } from "../PromptDetailPage";
import type { PromptRecord } from "../../types";

const { mockToast } = vi.hoisted(() => ({
  mockToast: vi.fn(),
}));

vi.mock("../../lib/toast", () => ({
  toast: mockToast,
}));

function createPrompt(overrides: Partial<PromptRecord> = {}): PromptRecord {
  return {
    id: "prompt-1",
    title: "日报总结",
    content: "请总结今天的研发进展",
    category: "产品 / 接口",
    tags: ["日报"],
    note: "工作日常",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function renderDetailPage(
  overrides?: Partial<React.ComponentProps<typeof PromptDetailPage>>,
) {
  const onBack = vi.fn();
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onDirtyChange = vi.fn();

  render(
    <PromptDetailPage
      prompt={createPrompt()}
      mode="detail"
      availableCategories={["产品", "接口", "总结"]}
      onBack={onBack}
      onSave={onSave}
      onDelete={onDelete}
      onDirtyChange={onDirtyChange}
      {...overrides}
    />,
  );

  return { onBack, onSave, onDelete, onDirtyChange };
}

describe("PromptDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders detail mode by default and switches to edit mode", async () => {
    const user = userEvent.setup();
    renderDetailPage();

    expect(screen.getByText("提示词详情")).toBeInTheDocument();
    expect(screen.getByText("请总结今天的研发进展")).toBeInTheDocument();
    expect(screen.queryByLabelText("标题")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑当前提示词" }));

    expect(await screen.findByLabelText("标题")).toHaveValue("日报总结");
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("creates a new prompt in edit mode and saves it", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDetailPage({
      prompt: null,
      mode: "create",
      availableCategories: ["产品", "接口"],
    });

    expect(screen.getByText("新增提示词")).toBeInTheDocument();

    await user.type(screen.getByLabelText("标题"), "接口排查");
    await user.type(screen.getByLabelText("内容"), "按步骤检查接口");
    await user.type(screen.getByLabelText("分类"), "排查");
    await user.click(screen.getByRole("button", { name: "选择分类接口" }));
    await user.type(screen.getByLabelText("标签"), "排查, 接口");
    await user.type(screen.getByLabelText("备注"), "常用流程");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "接口排查",
          content: "按步骤检查接口",
          category: "接口 / 排查",
          tags: ["排查", "接口"],
          note: "常用流程",
        }),
      );
    });
  });

  it("deletes current prompt after confirmation", async () => {
    const user = userEvent.setup();
    const { onDelete } = renderDetailPage({ mode: "edit" });

    await user.click(screen.getByRole("button", { name: "删除当前提示词" }));
    expect(await screen.findByText("确认删除提示词")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(onDelete).toHaveBeenCalledWith("prompt-1");
  });
});
