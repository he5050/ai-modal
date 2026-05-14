import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpPage } from "../mcp/McpPage";

const {
  mockHomeDir,
  mockPickPath,
  mockExists,
  mockMkdir,
  mockReadDir,
  mockReadTextFile,
  mockRemove,
  mockWriteTextFile,
  mockLoadPersistedJson,
  mockSavePersistedJson,
  mockTestMcpServer,
  mockSearchModelscopeMcpServers,
  mockInspectModelscopeMcpServer,
  mockToast,
  mockLogger,
} = vi.hoisted(() => ({
  mockHomeDir: vi.fn(),
  mockPickPath: vi.fn(),
  mockExists: vi.fn(),
  mockMkdir: vi.fn(),
  mockReadDir: vi.fn(),
  mockReadTextFile: vi.fn(),
  mockRemove: vi.fn(),
  mockWriteTextFile: vi.fn(),
  mockLoadPersistedJson: vi.fn(),
  mockSavePersistedJson: vi.fn(),
  mockTestMcpServer: vi.fn(),
  mockSearchModelscopeMcpServers: vi.fn(),
  mockInspectModelscopeMcpServer: vi.fn(),
  mockToast: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  dirname: vi.fn(),
  homeDir: mockHomeDir,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mockPickPath,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: mockExists,
  mkdir: mockMkdir,
  readDir: mockReadDir,
  readTextFile: mockReadTextFile,
  remove: mockRemove,
  writeTextFile: mockWriteTextFile,
}));

vi.mock("../../lib/persistence", () => ({
  loadPersistedJson: mockLoadPersistedJson,
  savePersistedJson: mockSavePersistedJson,
}));

vi.mock("../../api", () => ({
  testMcpServer: mockTestMcpServer,
  searchModelscopeMcpServers: mockSearchModelscopeMcpServers,
  inspectModelscopeMcpServer: mockInspectModelscopeMcpServer,
}));

vi.mock("../../lib/toast", () => ({
  toast: mockToast,
}));

vi.mock("../../lib/devlog", () => ({
  logger: mockLogger,
}));

describe("McpPage online install", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockHomeDir.mockResolvedValue("/Users/test");
    mockPickPath.mockResolvedValue(null);
    mockExists.mockResolvedValue(false);
    mockMkdir.mockResolvedValue(undefined);
    mockReadDir.mockResolvedValue([]);
    mockReadTextFile.mockResolvedValue("{}");
    mockRemove.mockResolvedValue(undefined);
    mockWriteTextFile.mockResolvedValue(undefined);
    mockSavePersistedJson.mockResolvedValue(undefined);
    mockLoadPersistedJson.mockImplementation(async (_dbKey: string, legacyKey: string) => {
      if (legacyKey === "ai-modal-mcp-sync-targets") return [];
      return "";
    });
    mockTestMcpServer.mockResolvedValue({
      ok: true,
      status: "ok",
      message: "ok",
      detail: null,
      latency_ms: 10,
    });
    mockSearchModelscopeMcpServers.mockResolvedValue({
      query: "mcp",
      count: 1,
      duration_ms: 12,
      servers: [
        {
          id: "team/demo",
          name: "demo",
          chinese_name: "演示服务",
          path: "team",
          from_site_url: "https://example.com/source",
          page_url: "https://www.modelscope.cn/mcp/team/demo",
          original_abstract: "演示服务简介",
          tags: ["tool"],
          category: ["productivity"],
          from_site_icon: null,
          user_host_status: null,
          platform_collected: false,
          transport_types: ["stdio", "sse"],
        },
      ],
    });
    mockInspectModelscopeMcpServer.mockResolvedValue({
      id: "team/demo",
      name: "demo",
      chinese_name: "演示服务",
      path: "team",
      from_site_url: "https://example.com/source",
      page_url: "https://www.modelscope.cn/mcp/team/demo",
      original_abstract: "演示服务简介",
      tags: ["tool"],
      category: ["productivity"],
      from_site_icon: null,
      user_host_status: null,
      platform_collected: false,
      transport_types: ["stdio", "sse"],
      readme: "这是 readme",
      transport_configs: {
        stdio: {
          type: "stdio",
          command: "npx",
          args: ["-y", "demo-mcp"],
        },
        sse: {
          type: "sse",
          url: "https://example.com/sse",
        },
      },
    });
  });

  afterEach(() => {
  });

  it("loads online search results from the backend command", async () => {
    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线安装" }));

    expect(await screen.findByText("演示服务", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText("stdio")).toBeInTheDocument();
    expect(screen.getByText("sse")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockSearchModelscopeMcpServers).toHaveBeenCalledWith("", 20);
    }, { timeout: 8000 });
  }, 10000);

  it("loads detail after selecting an online MCP result", async () => {
    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线安装" }));
    await user.click(await screen.findByText("详情", {}, { timeout: 8000 }));

    await waitFor(() => {
      expect(mockInspectModelscopeMcpServer).toHaveBeenCalledWith("team", "demo");
    }, { timeout: 8000 });

    expect(await screen.findByText("配置预览", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/www\.modelscope\.cn\/mcp\/team\/demo/)).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/example\.com\/source/)).toBeInTheDocument();
    expect(screen.getByText(/"stdio"/)).toBeInTheDocument();
    expect(screen.getByText(/"sse"/)).toBeInTheDocument();
  }, 10000);

  it("imports all transport configs with transport-suffixed names", async () => {
    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线安装" }));
    await user.click(await screen.findByText("详情", {}, { timeout: 8000 }));
    await screen.findByText("配置预览", {}, { timeout: 8000 });

    const installButtons = screen.getAllByRole("button", { name: /安装/ });
    await user.click(installButtons[installButtons.length - 1]);

    await waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalled();
    }, { timeout: 8000 });

    const sourceWrite = mockWriteTextFile.mock.calls.find(
      ([path]) => path === "/Users/test/.agents/mcp.config.json",
    );
    expect(sourceWrite).toBeTruthy();

    const writtenContent = String(sourceWrite?.[1] ?? "");
    const parsed = JSON.parse(writtenContent) as {
      mcpServers: Record<string, unknown>;
    };

    expect(parsed.mcpServers["demo-stdio"]).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "demo-mcp"],
    });
    expect(parsed.mcpServers["demo-sse"]).toEqual({
      type: "sse",
      url: "https://example.com/sse",
    });

    expect(mockToast).toHaveBeenCalledWith("已导入 2 个 MCP 配置", "success");
  }, 10000);
});
