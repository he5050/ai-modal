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

describe("McpPage", () => {
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

  it("hides the online import entry", async () => {
    render(<McpPage />);

    expect(await screen.findByRole("button", { name: "服务列表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同步目标" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "在线导入" })).not.toBeInTheDocument();
  });

  it("does not trigger ModelScope requests when online import is hidden", async () => {
    render(<McpPage />);

    await waitFor(() => {
      expect(mockSearchModelscopeMcpServers).not.toHaveBeenCalled();
      expect(mockInspectModelscopeMcpServer).not.toHaveBeenCalled();
    });
  });

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
});
