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
      success: true,
      request_id: "req-1",
      data: {
        total_count: 1,
        mcp_server_list: [
          {
            id: "team/demo",
            name: "demo",
            chinese_name: "演示服务",
            description: "演示服务简介",
            tags: ["tool"],
            logo_url: null,
            categories: ["productivity"],
          },
        ],
      },
    });
    mockInspectModelscopeMcpServer.mockResolvedValue({
      success: true,
      request_id: "req-2",
      data: {
        id: "team/demo",
        name: "demo",
        chinese_name: "演示服务",
        description: "演示服务简介",
        tags: ["tool"],
        logo_url: null,
        categories: ["productivity"],
        source_url: "https://example.com/source",
        readme: "这是 readme",
        operational_urls: [
          {
            url: "https://example.com/sse",
            transport_type: "sse",
          },
        ],
        server_config: [
          {
            mcpServers: {
              stdio: {
                type: "stdio",
                command: "npx",
                args: ["-y", "demo-mcp"],
              },
            },
          },
        ],
      },
    });
  });

  afterEach(() => {
  });

  it("loads online search results from the backend command", async () => {
    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线导入" }));

    expect((await screen.findAllByText("演示服务", {}, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(screen.getByText("productivity")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockSearchModelscopeMcpServers).toHaveBeenCalledWith("", 100, null);
    }, { timeout: 8000 });
  }, 10000);

  it("loads detail after selecting an online MCP result", async () => {
    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线导入" }));
    await user.click(await screen.findByText("详情", {}, { timeout: 8000 }));

    await waitFor(() => {
      expect(mockInspectModelscopeMcpServer).toHaveBeenCalledWith("team/demo", null);
    }, { timeout: 8000 });

    expect(await screen.findByRole("dialog", { name: "演示服务" }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/这是 readme/)).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/example\.com\/source/)).toBeInTheDocument();
    expect(screen.getByText(/"stdio"/)).toBeInTheDocument();
    expect(screen.getByText(/"sse"/)).toBeInTheDocument();
  }, 10000);

  it("imports all transport configs with transport-suffixed names and exposes next actions", async () => {
    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线导入" }));
    await user.click(await screen.findByText("详情", {}, { timeout: 8000 }));
    await screen.findByText("配置预览", {}, { timeout: 8000 });

    const importButtons = screen.getAllByRole("button", { name: /导入/ });
    await user.click(importButtons[importButtons.length - 1]);

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

    expect(mockToast).toHaveBeenCalledWith(
      "已导入 2 个 MCP 配置，请继续验证源服务或同步到目标",
      "success",
    );
    expect(screen.getByRole("button", { name: "验证刚导入的服务" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同步到已启用目标" })).toBeInTheDocument();
  }, 10000);

  it("fetches detail on demand when importing directly from a card", async () => {
    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线导入" }));
    await screen.findByText("演示服务", {}, { timeout: 8000 });

    const cardImportButtons = (await screen.findAllByRole("button", {}, { timeout: 8000 }))
      .filter((button) => {
        const label = button.textContent?.trim();
        return label === "导入" || label === "重新导入";
      });
    await user.click(cardImportButtons[0]);

    await waitFor(() => {
      expect(mockInspectModelscopeMcpServer).toHaveBeenCalledWith("team/demo", null);
    }, { timeout: 8000 });

    await waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalled();
    }, { timeout: 8000 });
  }, 10000);

  it("falls back to summary content when detail loading fails", async () => {
    mockInspectModelscopeMcpServer.mockRejectedValue(new Error("详情接口失败"));

    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线导入" }));
    await user.click(await screen.findByText("详情", {}, { timeout: 8000 }));

    expect(await screen.findByRole("dialog", { name: "演示服务" }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/详情接口未返回完整配置/)).toBeInTheDocument();
    expect(screen.getByText(/详情接口失败/)).toBeInTheDocument();
    expect((await screen.findAllByText(/演示服务简介/)).length).toBeGreaterThan(0);
  }, 10000);

  it("passes the saved ModelScope API key as an Authorization header profile", async () => {
    mockLoadPersistedJson.mockImplementation(async (_dbKey: string, legacyKey: string) => {
      if (legacyKey === "ai-modal-mcp-sync-targets") return [];
      if (legacyKey === "ai-modal-modelscope-api-key") return "ms-test-key";
      return "";
    });

    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线导入" }));

    await waitFor(() => {
      expect(mockSearchModelscopeMcpServers).toHaveBeenCalledWith("", 100, {
        extra_headers: {
          Authorization: "Bearer ms-test-key",
        },
      });
    }, { timeout: 8000 });
  }, 10000);

  it("distinguishes stdio spawn checks from http initialize handshakes in the service list", async () => {
    mockExists.mockImplementation(async (path: string) => path === "/Users/test/.agents/mcp.config.json");
    mockReadTextFile.mockImplementation(async (path: string) => {
      if (path === "/Users/test/.agents/mcp.config.json") {
        return JSON.stringify({
          mcpServers: {
            "local-stdio": {
              type: "stdio",
              command: "npx",
              args: ["-y", "demo-mcp"],
            },
            "remote-http": {
              type: "http",
              url: "https://example.com/mcp",
            },
          },
        });
      }
      return "{}";
    });

    mockTestMcpServer
      .mockResolvedValueOnce({
        ok: true,
        status: "stdio-initialize-ok",
        message: "初始化握手成功",
        detail: "Local MCP 1.0.0",
        latency_ms: 25,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: "HTTP 200",
        message: "初始化握手成功",
        detail: "Remote MCP 1.0.0",
        latency_ms: 90,
      });

    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "一键测试" }));

    expect(await screen.findByText("stdio · 握手成功", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText("http · 握手成功", {}, { timeout: 8000 })).toBeInTheDocument();
  }, 10000);

  it("shows the default returned online result list without pagination controls", async () => {
    mockSearchModelscopeMcpServers.mockResolvedValueOnce({
      success: true,
      request_id: "req-many",
      data: {
        total_count: 25,
        mcp_server_list: Array.from({ length: 25 }, (_, index) => ({
          id: `team/demo-${index + 1}`,
          name: `demo-${index + 1}`,
          chinese_name: `演示服务${index + 1}`,
          description: `摘要${index + 1}`,
          tags: [],
          logo_url: null,
          categories: ["productivity"],
        })),
      },
    });

    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线导入" }));

    expect(await screen.findByText("演示服务1", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText("演示服务21", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一页" })).not.toBeInTheDocument();
  }, 10000);

  it("loads detail only when the user manually opens the dialog", async () => {
    const user = userEvent.setup();
    render(<McpPage />);

    await user.click(await screen.findByRole("button", { name: "在线导入" }));

    await waitFor(() => {
      expect(mockInspectModelscopeMcpServer).not.toHaveBeenCalled();
    }, { timeout: 8000 });

    await user.click(await screen.findByText("详情", {}, { timeout: 8000 }));

    await waitFor(() => {
      expect(mockInspectModelscopeMcpServer).toHaveBeenCalledWith("team/demo", null);
    }, { timeout: 8000 });
  }, 10000);
});
