import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromptsPage } from "../PromptsPage";
import type { PromptRecord } from "../../types";

const { mockSaveDialog, mockWriteTextFile } = vi.hoisted(() => ({
  mockSaveDialog: vi.fn(),
  mockWriteTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: mockSaveDialog,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: mockWriteTextFile,
}));

function renderPage(
  prompts: PromptRecord[] = [],
  overrides?: Partial<React.ComponentProps<typeof PromptsPage>>,
) {
  const onCreate = vi.fn();
  const onOpenDetail = vi.fn();
  const onDelete = vi.fn();
  const onImport = vi.fn();

  const view = render(
    <PromptsPage
      prompts={prompts}
      onCreate={onCreate}
      onOpenDetail={onOpenDetail}
      onDelete={onDelete}
      onImport={onImport}
      {...overrides}
    />,
  );

  return { ...view, onCreate, onOpenDetail, onDelete, onImport };
}

describe("PromptsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveDialog.mockResolvedValue("/tmp/ai-modal-prompts.json");
    mockWriteTextFile.mockResolvedValue(undefined);
  });

  it("renders empty state and top actions", () => {
    const { onCreate } = renderPage([]);

    expect(screen.getByText("提示词管理")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增" })).toBeInTheDocument();
    expect(
      screen.getByText(/当前还没有提示词。你可以先新增一条，或者导入一个 JSON 提示词库。/),
    ).toBeInTheDocument();

    void onCreate;
  });

  it("calls create callback when creating a new prompt", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderPage([]);

    await user.click(screen.getByRole("button", { name: "新增" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("filters prompt rows by flattened category tag", async () => {
    const user = userEvent.setup();
    renderPage([
      {
        id: "prompt-a",
        title: "产品总结",
        content: "content a",
        tags: ["日报"],
        createdAt: 1,
        updatedAt: 10,
      },
      {
        id: "prompt-b",
        title: "接口调试",
        content: "content b",
        tags: ["开发", "接口"],
        createdAt: 2,
        updatedAt: 20,
      },
    ]);

    expect(screen.getByText("产品总结")).toBeInTheDocument();
    expect(screen.getByText("接口调试")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "开发" }));

    expect(screen.getByText("接口调试")).toBeInTheDocument();
    expect(screen.queryByText("产品总结")).not.toBeInTheDocument();
  });

  it("opens detail from row actions", async () => {
    const user = userEvent.setup();
    const { onOpenDetail } = renderPage([
      {
        id: "prompt-1",
        title: "日报总结",
        content: "请总结今天的研发进展",
        tags: ["产品", "接口"],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    await user.click(screen.getByRole("button", { name: "详情日报总结" }));

    expect(onOpenDetail).toHaveBeenCalledWith("prompt-1", "detail");
  });

  it("renders a dedicated content column and shows markdown preview on hover", async () => {
    const user = userEvent.setup();
    renderPage([
      {
        id: "prompt-1",
        title: "日报总结",
        content: "## 今日进展\n- 完成接口联调\n- 修复列表样式",
        tags: ["日报"],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    expect(screen.getByText("内容")).toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "预览内容日报总结" }));

    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(await screen.findByText("Markdown 内容预览")).toBeInTheDocument();
    expect(await screen.findByText("今日进展")).toBeInTheDocument();
  });

  it("keeps markdown preview visible while hovering the preview itself", async () => {
    const user = userEvent.setup();
    renderPage([
      {
        id: "prompt-1",
        title: "日报总结",
        content: "## 今日进展\n- 完成接口联调\n- 修复列表样式",
        tags: ["日报"],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const trigger = screen.getByRole("button", { name: "预览内容日报总结" });
    await user.hover(trigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toBeInTheDocument();

    await user.unhover(trigger);
    await user.hover(tooltip);

    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("Markdown 内容预览")).toBeInTheDocument();
  });

  it("deletes a prompt after confirmation", async () => {
    const user = userEvent.setup();
    const { onDelete } = renderPage([
      {
        id: "prompt-1",
        title: "日报总结",
        content: "请总结今天的研发进展",
        tags: ["日报"],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    await user.click(screen.getByRole("button", { name: "删除日报总结" }));
    expect(await screen.findByText("确认删除提示词")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(onDelete).toHaveBeenCalledWith("prompt-1");
  });

  it("exports the prompt library as json text", async () => {
    const user = userEvent.setup();
    renderPage([
      {
        id: "prompt-1",
        title: "日报总结",
        content: "请总结今天的研发进展",
        tags: ["日报"],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    await user.click(screen.getByRole("button", { name: "导出" }));

    expect(mockSaveDialog).toHaveBeenCalled();
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "/tmp/ai-modal-prompts.json",
      expect.stringContaining('"title": "日报总结"'),
    );
  });

  it("imports prompts from a json file and forwards merged records", async () => {
    const user = userEvent.setup();
    const { container, onImport } = renderPage([
      {
        id: "prompt-existing",
        title: "现有提示词",
        content: "existing",
        tags: ["产品"],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;

    expect(fileInput).not.toBeNull();

    const file = new File(
      [
        JSON.stringify([
          {
            id: "prompt-imported",
            title: "接口排查",
            content: "请按步骤排查当前接口问题",
            tags: ["开发", "接口"],
            createdAt: 1,
            updatedAt: 2,
          },
        ]),
      ],
      "prompts.json",
      { type: "application/json" },
    );

    await user.upload(fileInput!, file);

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: "prompt-existing" }),
          expect.objectContaining({ id: "prompt-imported" }),
        ]),
      );
    });
  });
});
