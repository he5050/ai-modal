import type { ComponentProps } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsPage } from "../SkillsPage";
import type {
  SkillAnnotationMode,
  SkillEnrichmentJobSnapshot,
  SkillEnrichmentRecord,
  OnlineSkillDetail,
  SkillTargetConfig,
  SkillTargetStatus,
  SkillsCatalogSnapshot,
  SkillsCommandResult,
  SystemLlmSnapshot,
} from "../../types";

const {
  mockHomeDir,
  mockPickPath,
  mockOpenPath,
  mockScanLocalSkills,
  mockInspectSkillTargets,
  mockInspectOnlineSkill,
  mockRunSkillsCommand,
  mockSearchOnlineSkills,
  mockSyncSkillTargets,
  mockResolveSystemLlm,
  mockStartSkillEnrichmentJob,
  mockGetSkillEnrichmentJobStatus,
  mockStopSkillEnrichmentJob,
  mockListen,
  mockLoadPersistedJson,
  mockSavePersistedJson,
  mockToast,
  mockLogger,
} = vi.hoisted(() => ({
  mockHomeDir: vi.fn(),
  mockPickPath: vi.fn(),
  mockOpenPath: vi.fn(),
  mockScanLocalSkills: vi.fn(),
  mockInspectSkillTargets: vi.fn(),
  mockInspectOnlineSkill: vi.fn(),
  mockRunSkillsCommand: vi.fn(),
  mockSearchOnlineSkills: vi.fn(),
  mockSyncSkillTargets: vi.fn(),
  mockResolveSystemLlm: vi.fn(),
  mockStartSkillEnrichmentJob: vi.fn(),
  mockGetSkillEnrichmentJobStatus: vi.fn(),
  mockStopSkillEnrichmentJob: vi.fn(),
  mockListen: vi.fn(),
  mockLoadPersistedJson: vi.fn(),
  mockSavePersistedJson: vi.fn(),
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
  homeDir: mockHomeDir,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mockPickPath,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: mockOpenPath,
}));

vi.mock("../../api", () => ({
  scanLocalSkills: mockScanLocalSkills,
  inspectSkillTargets: mockInspectSkillTargets,
  inspectOnlineSkill: mockInspectOnlineSkill,
  runSkillsCommand: mockRunSkillsCommand,
  searchOnlineSkills: mockSearchOnlineSkills,
  syncSkillTargets: mockSyncSkillTargets,
  resolveSystemLlm: mockResolveSystemLlm,
  startSkillEnrichmentJob: mockStartSkillEnrichmentJob,
  getSkillEnrichmentJobStatus: mockGetSkillEnrichmentJobStatus,
  stopSkillEnrichmentJob: mockStopSkillEnrichmentJob,
}));

vi.mock("../../lib/persistence", () => ({
  loadPersistedJson: mockLoadPersistedJson,
  savePersistedJson: mockSavePersistedJson,
}));

vi.mock("../../lib/toast", () => ({
  toast: mockToast,
}));

vi.mock("../../lib/devlog", () => ({
  logger: mockLogger,
}));

function createCatalog(
  skills: SkillsCatalogSnapshot["skills"] = [],
): SkillsCatalogSnapshot {
  return {
    sourceDir: "/Users/test/.agents/skills",
    scannedAt: Date.now(),
    totalSkills: skills.length,
    skills,
  };
}

function createDemoSkill() {
  return {
    name: "demo-skill",
    dir: "demo-skill",
    description: "demo description",
    version: "1.0.0",
    updatedAt: Date.now(),
    categories: ["tools"],
    internal: false,
    path: "/Users/test/.agents/skills/demo-skill",
    hasSkillFile: true,
    sourceType: "github" as const,
    sourceValue: "example/repo",
  };
}

function createDocxSkill() {
  return {
    name: "docx",
    dir: "docx",
    description: "docx description",
    version: "1.0.0",
    updatedAt: Date.now(),
    categories: ["docs"],
    internal: false,
    path: "/Users/test/.agents/skills/docx",
    hasSkillFile: true,
    sourceType: "github" as const,
    sourceValue: "example/docx",
  };
}

function createCommandResult(
  overrides: Partial<SkillsCommandResult> = {},
): SkillsCommandResult {
  return {
    action: "update",
    command: ["npx", "-y", "skills", "update", "-g", "-y"],
    cwd: "/Users/test",
    success: true,
    code: 0,
    stdout: "updated",
    stderr: "",
    catalogRefreshed: true,
    ...overrides,
  };
}

function createSystemLlmSnapshot(
  overrides: Partial<SystemLlmSnapshot> = {},
): SystemLlmSnapshot {
  return {
    current: {
      toolId: "codex",
      label: "Codex",
      sourcePath: "/Users/test/.codex/config.toml",
      baseUrl: "https://llm.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-5.4",
      requestKind: "openai-responses",
      protocols: ["openai"],
      updatedAt: Date.now(),
    },
    profiles: [],
    ...overrides,
  };
}

function createEnrichmentRecord(
  overrides: Partial<SkillEnrichmentRecord> = {},
): SkillEnrichmentRecord {
  return {
    skillDir: "demo-skill",
    skillPath: "/Users/test/.agents/skills/demo-skill",
    sourceUpdatedAt: Date.now(),
    sourceDescription: "demo description",
    localizedDescription: "这是一个中文技能简介",
    fullDescription: "这是一个用于测试的完整中文技能介绍。",
    contentSummary: "内容摘要",
    usage: "用法说明",
    scenarios: "使用场景说明",
    tags: ["自动化", "工具链"],
    status: "success",
    providerLabel: "Codex",
    model: "gpt-5.4",
    requestKind: "openai-responses",
    rawResponse: "{}",
    errorMessage: null,
    enrichedAt: Date.now(),
    ...overrides,
  };
}

function createJobSnapshot(
  overrides: Partial<SkillEnrichmentJobSnapshot> = {},
): SkillEnrichmentJobSnapshot {
  return {
    runId: Date.now(),
    mode: "full" satisfies SkillAnnotationMode,
    status: "running",
    total: 2,
    completed: 0,
    currentSkillDir: null,
    currentSkillName: null,
    nextRunAt: null,
    message: "准备使用 AIModal 模型配置 执行技能注解",
    errorMessage: null,
    providerLabel: "AIModal 模型配置",
    model: "gpt-5.4",
    requestKind: "openai-chat",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    records: {},
    ...overrides,
  };
}

function createOnlineSkillDetail(
  overrides: Partial<OnlineSkillDetail> = {},
): OnlineSkillDetail {
  return {
    id: "anthropics/skills/frontend-design",
    skillId: "frontend-design",
    source: "anthropics/skills",
    pageUrl: "https://skills.sh/anthropics/skills/frontend-design",
    installCommand:
      "npx skills add https://github.com/anthropics/skills --skill frontend-design",
    summary:
      "Distinctive, production-grade frontend interfaces.\n- Bold design direction\n- Avoid generic AI aesthetics",
    usageHints: [
      "Use this skill when building production-grade frontend interfaces.",
      "Triggers: component, page, application, interface to build.",
    ],
    skillDoc:
      "This skill guides creation of distinctive frontend interfaces.\nUse this skill when building production-grade frontend interfaces.",
    ...overrides,
  };
}

const builtinTargets: SkillTargetConfig[] = [
  {
    id: "codex",
    label: "Codex",
    path: "/Users/test/.codex/skills",
    isBuiltin: true,
    enabled: true,
  },
  {
    id: "snow",
    label: "Snow",
    path: "/Users/test/.snow/skills",
    isBuiltin: true,
    enabled: true,
  },
];

const builtinStatuses: SkillTargetStatus[] = [
  {
    id: "codex",
    label: "Codex",
    path: "/Users/test/.codex/skills",
    exists: true,
    managedCount: 1,
    brokenCount: 0,
    totalEntries: 1,
  },
  {
    id: "snow",
    label: "Snow",
    path: "/Users/test/.snow/skills",
    exists: false,
    managedCount: 0,
    brokenCount: 0,
    totalEntries: 0,
  },
];

async function renderSkillsPage(
  props: Partial<ComponentProps<typeof SkillsPage>> = {},
) {
  render(<SkillsPage onDirtyChange={vi.fn()} {...props} />);
  await screen.findByText("本地技能");
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mockHomeDir.mockResolvedValue("/Users/test");
  mockLoadPersistedJson.mockImplementation(
    async (dbKey: string, _legacyKey: string, fallback: unknown) => {
      if (dbKey === "skill_targets") return builtinTargets;
      if (dbKey === "skills_sources") return {};
      if (dbKey === "skills_catalog") {
        return createCatalog([createDemoSkill(), createDocxSkill()]);
      }
      if (dbKey === "skill_enrichments") return {};
      if (dbKey === "model_config") {
        return {
          baseUrl: "https://llm.example.com/v1",
          apiKey: "sk-test",
          model: "gpt-5.4",
          lastTestAt: Date.now(),
          lastTestResult: {
            supported_protocols: ["openai"],
          },
        };
      }
      return fallback;
    },
  );
  mockScanLocalSkills.mockResolvedValue(
    createCatalog([createDemoSkill(), createDocxSkill()]),
  );
  mockInspectSkillTargets.mockResolvedValue(builtinStatuses);
  mockSearchOnlineSkills.mockResolvedValue({
    query: "skill",
    searchType: "skills.sh",
    skills: [],
    count: 0,
    durationMs: 0,
  });
  mockInspectOnlineSkill.mockResolvedValue(createOnlineSkillDetail());
  mockSyncSkillTargets.mockResolvedValue([]);
  mockResolveSystemLlm.mockResolvedValue(createSystemLlmSnapshot());
  mockStartSkillEnrichmentJob.mockResolvedValue(createJobSnapshot());
  mockGetSkillEnrichmentJobStatus.mockResolvedValue(null);
  mockStopSkillEnrichmentJob.mockResolvedValue(
    createJobSnapshot({
      status: "stopped",
      message: "技能注解已中断",
    }),
  );
  mockRunSkillsCommand.mockResolvedValue(createCommandResult());
  mockListen.mockResolvedValue(() => {});
  mockSavePersistedJson.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SkillsPage", () => {
  it("runs global update and shows actual command in recent command results", async () => {
    const user = userEvent.setup();
    await renderSkillsPage();

    await user.click(screen.getByRole("button", { name: "同步与安装" }));
    await user.click(screen.getByRole("button", { name: "更新全部" }));
    await user.click(screen.getByRole("button", { name: "更新全部技能" }));

    await waitFor(() => {
      expect(mockRunSkillsCommand).toHaveBeenCalledWith({
        action: "update",
        skillNames: ["demo-skill", "docx"],
      });
    });

    await user.click(screen.getByRole("button", { name: /最近命令结果/ }));

    expect(
      await screen.findByText(/command:\s*npx -y skills update -g -y/i),
    ).toBeInTheDocument();
  });

  it("shows enriched chinese description and tooltip details", async () => {
    mockLoadPersistedJson.mockReset();
    mockLoadPersistedJson.mockImplementation(
      async (dbKey: string, _legacyKey: string, fallback: unknown) => {
        if (dbKey === "skill_targets") return builtinTargets;
        if (dbKey === "skills_sources") return {};
        if (dbKey === "skills_catalog")
          return createCatalog([createDemoSkill()]);
        if (dbKey === "skill_enrichments") {
          return {
            "demo-skill": createEnrichmentRecord(),
          };
        }
        if (dbKey === "model_config") {
          return {
            baseUrl: "https://llm.example.com/v1",
            apiKey: "sk-test",
            model: "gpt-5.4",
            lastTestAt: Date.now(),
            lastTestResult: {
              supported_protocols: ["openai"],
            },
          };
        }
        return fallback;
      },
    );

    await renderSkillsPage();

    expect(
      await screen.findByRole("button", { name: "查看 demo-skill 的技能详情" }),
    ).toHaveTextContent("这是一个中文技能简介");

    await userEvent.hover(
      screen.getByRole("button", { name: "查看 demo-skill 的技能详情" }),
    );

    expect(await screen.findByText("完整介绍")).toBeInTheDocument();
    expect(
      await screen.findByText("这是一个用于测试的完整中文技能介绍。"),
    ).toBeInTheDocument();
  });

  it("starts a background annotation job with the filtered skills and delay config", async () => {
    const user = userEvent.setup();

    await renderSkillsPage({
      enrichmentDelayMs: 200,
    });

    await user.click(screen.getByRole("button", { name: "技能注解" }));
    await user.click(
      screen.getByRole("button", {
        name: /全量注解.*全部重新处理一次/,
      }),
    );

    await waitFor(() => {
      expect(mockStartSkillEnrichmentJob).toHaveBeenCalledWith({
        baseUrl: "https://llm.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-5.4",
        requestKind: "openai-chat",
        providerLabel: "AIModal 模型配置",
        mode: "full",
        delayMs: 200,
        skills: [
          {
            skillDir: "demo-skill",
            skillPath: "/Users/test/.agents/skills/demo-skill",
            description: "demo description",
            categories: ["tools"],
            updatedAt: expect.any(Number),
          },
          {
            skillDir: "docx",
            skillPath: "/Users/test/.agents/skills/docx",
            description: "docx description",
            categories: ["docs"],
            updatedAt: expect.any(Number),
          },
        ],
      });
    });
  });

  it("keeps the queue running and surfaces failure reason when one skill fails", async () => {
    const user = userEvent.setup();
    let enrichmentHandler:
      | ((event: { payload: SkillEnrichmentJobSnapshot }) => void)
      | null = null;

    mockListen.mockImplementation(async (event, handler) => {
      if (event === "skill-enrichment-progress") {
        enrichmentHandler = handler as (event: {
          payload: SkillEnrichmentJobSnapshot;
        }) => void;
      }
      return () => {};
    });
    mockStartSkillEnrichmentJob.mockResolvedValueOnce(
      createJobSnapshot({
        message: "正在注解 demo-skill",
        currentSkillDir: "demo-skill",
        currentSkillName: "demo-skill",
      }),
    );

    await renderSkillsPage({
      enrichmentDelayMs: 10,
    });

    await user.click(screen.getByRole("button", { name: "技能注解" }));
    await user.click(
      screen.getByRole("button", {
        name: /全量注解.*全部重新处理一次/,
      }),
    );

    await act(async () => {
      enrichmentHandler?.({
        payload: createJobSnapshot({
          status: "running",
          completed: 1,
          message: "技能 demo-skill 注解失败，继续处理后续技能",
          errorMessage: "provider timeout",
          currentSkillDir: "demo-skill",
          currentSkillName: "demo-skill",
          records: {
            "demo-skill": createEnrichmentRecord({
              status: "error",
              errorMessage: "provider timeout",
              localizedDescription: "",
              fullDescription: "",
              contentSummary: "",
              usage: "",
              scenarios: "",
              rawResponse: null,
            }),
          },
        }),
      });
    });

    expect(
      (await screen.findAllByText("技能 demo-skill 注解失败，继续处理后续技能"))
        .length,
    ).toBeGreaterThan(0);
    expect((await screen.findAllByText("失败摘要")).length).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText("provider timeout")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("running")).toBeInTheDocument();

    await act(async () => {
      enrichmentHandler?.({
        payload: createJobSnapshot({
          status: "done",
          completed: 2,
          message: "技能注解队列已完成，失败 1 个",
          errorMessage: "技能注解队列已完成，失败 1 个",
          records: {
            "demo-skill": createEnrichmentRecord({
              status: "error",
              errorMessage: "provider timeout",
              localizedDescription: "",
              fullDescription: "",
              contentSummary: "",
              usage: "",
              scenarios: "",
              rawResponse: null,
            }),
          },
        }),
      });
    });

    expect(
      (await screen.findAllByText("技能注解队列已完成，失败 1 个")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  it("keeps failed skill details visible after the annotation dialog closes", async () => {
    const user = userEvent.setup();
    let enrichmentHandler:
      | ((event: { payload: SkillEnrichmentJobSnapshot }) => void)
      | null = null;

    mockListen.mockImplementation(async (event, handler) => {
      if (event === "skill-enrichment-progress") {
        enrichmentHandler = handler as (event: {
          payload: SkillEnrichmentJobSnapshot;
        }) => void;
      }
      return () => {};
    });
    mockStartSkillEnrichmentJob.mockResolvedValueOnce(
      createJobSnapshot({
        message: "正在注解 demo-skill",
        currentSkillDir: "demo-skill",
        currentSkillName: "demo-skill",
      }),
    );

    await renderSkillsPage({
      enrichmentDelayMs: 10,
    });

    await user.click(screen.getByRole("button", { name: "技能注解" }));
    await user.click(
      screen.getByRole("button", {
        name: /全量注解.*全部重新处理一次/,
      }),
    );

    await act(async () => {
      enrichmentHandler?.({
        payload: createJobSnapshot({
          status: "done",
          completed: 2,
          message: "技能注解队列已完成，失败 1 个",
          errorMessage: "技能注解队列已完成，失败 1 个",
          records: {
            "demo-skill": createEnrichmentRecord({
              status: "error",
              errorMessage: "provider timeout",
              localizedDescription: "",
              fullDescription: "",
              contentSummary: "",
              usage: "",
              scenarios: "",
              rawResponse: null,
            }),
          },
        }),
      });
    });

    await user.click(screen.getByRole("button", { name: "关闭技能注解弹窗" }));

    expect(await screen.findByText("失败技能列表（1）")).toBeInTheDocument();
    expect((await screen.findAllByText("demo-skill")).length).toBeGreaterThan(
      0,
    );
    expect(
      (await screen.findAllByText("provider timeout")).length,
    ).toBeGreaterThan(0);
  });

  it("updates installed skill snapshots from annotation records for local search", async () => {
    const user = userEvent.setup();
    let enrichmentHandler:
      | ((event: { payload: SkillEnrichmentJobSnapshot }) => void)
      | null = null;

    mockListen.mockImplementation(async (event, handler) => {
      if (event === "skill-enrichment-progress") {
        enrichmentHandler = handler as (event: {
          payload: SkillEnrichmentJobSnapshot;
        }) => void;
      }
      return () => {};
    });

    await renderSkillsPage({
      enrichmentDelayMs: 10,
    });

    expect(screen.getAllByText("demo-skill").length).toBeGreaterThan(0);
    expect(screen.getAllByText("docx").length).toBeGreaterThan(0);

    await act(async () => {
      enrichmentHandler?.({
        payload: createJobSnapshot({
          status: "running",
          completed: 1,
          message: "正在注解 demo-skill（2 并发）",
          currentSkillDir: "demo-skill",
          records: {
            "demo-skill": createEnrichmentRecord({
              contentSummary: "截图图像处理与像素清理快照",
              usage: "通过图像快照搜索触发",
              scenarios: "适合图像编辑工作流",
              tags: ["图像处理", "快照检索"],
            }),
          },
        }),
      });
    });

    await user.type(
      screen.getByPlaceholderText("搜索技能名、目录名或注解快照"),
      "像素清理",
    );

    expect((await screen.findAllByText("demo-skill")).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("docx")).not.toBeInTheDocument();
    expect(mockSavePersistedJson).toHaveBeenCalledWith(
      "installed_skill_snapshots",
      expect.objectContaining({
        "demo-skill": expect.objectContaining({
          searchText: expect.stringContaining("像素清理"),
          tags: ["图像处理", "快照检索"],
        }),
      }),
      "ai-modal-installed-skill-snapshots",
    );
  });

  it("shows all currently running skills during concurrent annotation", async () => {
    let enrichmentHandler:
      | ((event: { payload: SkillEnrichmentJobSnapshot }) => void)
      | null = null;

    mockListen.mockImplementation(async (event, handler) => {
      if (event === "skill-enrichment-progress") {
        enrichmentHandler = handler as (event: {
          payload: SkillEnrichmentJobSnapshot;
        }) => void;
      }
      return () => {};
    });

    await renderSkillsPage({
      enrichmentDelayMs: 10,
    });

    await act(async () => {
      enrichmentHandler?.({
        payload: createJobSnapshot({
          status: "running",
          message: "正在注解 demo-skill（2 并发）",
          currentSkillDir: "demo-skill",
          records: {
            "demo-skill": createEnrichmentRecord({
              status: "running",
            }),
            docx: createEnrichmentRecord({
              skillDir: "docx",
              skillPath: "/Users/test/.agents/skills/docx",
              sourceDescription: "docx description",
              status: "running",
            }),
          },
        }),
      });
    });

    expect(
      await screen.findByText(/当前 2 个：demo-skill、docx/),
    ).toBeInTheDocument();
  });

  it("does not render category filter tags below the local search input", async () => {
    await renderSkillsPage();

    expect(
      screen.getByPlaceholderText("搜索技能名、目录名或注解快照"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "tools" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "docs" }),
    ).not.toBeInTheDocument();
  });

  it("allows closing the annotation dialog while the queue keeps running and reopens progress", async () => {
    const user = userEvent.setup();
    let enrichmentHandler:
      | ((event: { payload: SkillEnrichmentJobSnapshot }) => void)
      | null = null;

    mockListen.mockImplementation(async (event, handler) => {
      if (event === "skill-enrichment-progress") {
        enrichmentHandler = handler as (event: {
          payload: SkillEnrichmentJobSnapshot;
        }) => void;
      }
      return () => {};
    });
    const runningSnapshot = createJobSnapshot({
      message: "正在注解 demo-skill",
      currentSkillDir: "demo-skill",
      currentSkillName: "demo-skill",
    });
    mockStartSkillEnrichmentJob.mockResolvedValueOnce(runningSnapshot);
    mockGetSkillEnrichmentJobStatus.mockResolvedValue(runningSnapshot);

    await renderSkillsPage({
      enrichmentDelayMs: 10,
    });

    await user.click(screen.getByRole("button", { name: "技能注解" }));
    await user.click(
      screen.getByRole("button", {
        name: /全量注解.*全部重新处理一次/,
      }),
    );

    expect(
      await screen.findByRole("progressbar", { name: "技能注解进度" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭技能注解弹窗" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("progressbar", { name: "技能注解进度" }),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "技能注解" }));

    expect(
      await screen.findByRole("progressbar", { name: "技能注解进度" }),
    ).toBeInTheDocument();

    await act(async () => {
      enrichmentHandler?.({
        payload: createJobSnapshot({
          status: "done",
          completed: 2,
          message: "技能注解队列已完成",
          records: {
            "demo-skill": createEnrichmentRecord(),
          },
        }),
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("技能注解队列已完成")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("progressbar", { name: "技能注解进度" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows progress immediately when running global update", async () => {
    const user = userEvent.setup();
    let resolveCommand: ((value: SkillsCommandResult) => void) | null = null;
    mockRunSkillsCommand.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCommand = resolve;
        }),
    );

    await renderSkillsPage();

    await user.click(screen.getByRole("button", { name: "同步与安装" }));
    await user.click(screen.getByRole("button", { name: "更新全部" }));
    await user.click(screen.getByRole("button", { name: "更新全部技能" }));

    expect(
      await screen.findByText("开始更新全部：更新全部全局技能"),
    ).toBeInTheDocument();

    resolveCommand?.(createCommandResult());

    await waitFor(() => {
      expect(mockRunSkillsCommand).toHaveBeenCalledWith({
        action: "update",
        skillNames: ["demo-skill", "docx"],
      });
    });
  });

  it("shows stderr warning summary when npm config warnings are folded", async () => {
    const user = userEvent.setup();
    mockRunSkillsCommand.mockResolvedValueOnce(
      createCommandResult({
        stderr: [
          'npm warn Unknown user config "python"',
          'npm warn Unknown env config "registry"',
        ].join("\n"),
      }),
    );

    await renderSkillsPage();

    await user.click(screen.getByRole("button", { name: "同步与安装" }));
    await user.click(screen.getByRole("button", { name: "更新全部" }));
    await user.click(screen.getByRole("button", { name: "更新全部技能" }));

    expect(
      await screen.findByText((content) =>
        content.includes("stderr 摘要：包含 2 条 npm 配置告警"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/示例：npm warn Unknown user config "python"/),
    ).toBeInTheDocument();
  });

  it("writes a concise failure log with exit code and first stderr line", async () => {
    const user = userEvent.setup();
    mockRunSkillsCommand.mockResolvedValueOnce(
      createCommandResult({
        success: false,
        code: 1,
        stdout: "",
        stderr: "permission denied\nstack trace line 2",
      }),
    );

    await renderSkillsPage();

    await user.click(screen.getByRole("button", { name: "同步与安装" }));
    await user.click(screen.getByRole("button", { name: "更新全部" }));
    await user.click(screen.getByRole("button", { name: "更新全部技能" }));

    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        "[技能] 更新全部失败：更新全部全局技能；退出码 1，permission denied",
      );
    });
  });

  it("updates visible progress from skills-command-progress events", async () => {
    const user = userEvent.setup();
    let progressHandler:
      | ((event: {
          payload: {
            action: "update";
            stage: string;
            message: string;
            current?: number;
            total?: number;
            skillName?: string;
          };
        }) => void)
      | null = null;

    mockListen.mockImplementationOnce(async (_event, handler) => {
      progressHandler = handler;
      return () => {};
    });

    await renderSkillsPage();
    await user.click(screen.getByRole("button", { name: "同步与安装" }));
    await user.click(screen.getByRole("button", { name: "更新全部" }));
    await user.click(screen.getByRole("button", { name: "更新全部技能" }));

    await act(async () => {
      progressHandler?.({
        payload: {
          action: "update",
          stage: "checking",
          message: "正在检查 23 / 76：docx",
          current: 23,
          total: 76,
          skillName: "docx",
        },
      });
    });

    expect(
      await screen.findByText("正在检查 23 / 76：docx"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("当前进度：23 / 76 · docx"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("progressbar", { name: "技能更新进度" }),
    ).toHaveAttribute("aria-valuenow", "30");
  });

  it("shows confirmation and removes a local skill from the list tab", async () => {
    const user = userEvent.setup();
    mockRunSkillsCommand.mockResolvedValueOnce(
      createCommandResult({
        action: "remove",
        command: ["npx", "-y", "skills", "remove", "demo-skill", "-g", "-y"],
      }),
    );

    await renderSkillsPage();
    await screen.findByRole("button", { name: "移除 demo-skill" });

    await user.click(screen.getByRole("button", { name: "移除 demo-skill" }));
    expect(await screen.findByText("确认移除技能")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认移除" }));

    await waitFor(() => {
      expect(mockRunSkillsCommand).toHaveBeenCalledWith({
        action: "remove",
        skillNames: ["demo-skill"],
      });
    });
  });

  it("warns instead of running remove when no skill names are provided", async () => {
    const user = userEvent.setup();
    await renderSkillsPage();

    await user.click(screen.getByRole("button", { name: "同步与安装" }));
    await user.click(screen.getAllByRole("button", { name: "移除技能" })[0]);
    await screen.findByPlaceholderText("输入技能名，支持逗号或换行分隔");
    await user.click(screen.getAllByRole("button", { name: "移除技能" })[1]);

    expect(mockRunSkillsCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "remove" }),
    );
    expect(mockToast).toHaveBeenCalledWith("请填写要移除的技能名", "warning");
  });

  it("shows snow as a builtin sync target", async () => {
    const user = userEvent.setup();
    await renderSkillsPage();
    await user.click(screen.getByRole("button", { name: "同步与安装" }));
    await user.click(screen.getByRole("button", { name: /同步目标/ }));

    expect(screen.getAllByText("Snow").length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByRole("combobox"), "snow");
    expect(
      screen.getByDisplayValue("/Users/test/.snow/skills"),
    ).toBeInTheDocument();
  });

  it("loads and shows online skill details from skills.sh", async () => {
    const user = userEvent.setup();
    mockSearchOnlineSkills.mockResolvedValue({
      query: "frontend-design",
      searchType: "skills.sh",
      skills: [
        {
          id: "anthropics/skills/frontend-design",
          skillId: "frontend-design",
          name: "frontend-design",
          installs: 328754,
          source: "anthropics/skills",
        },
      ],
      count: 1,
      durationMs: 35,
    });

    await renderSkillsPage();
    await user.click(screen.getByRole("button", { name: "同步与安装" }));

    const input = screen.getByPlaceholderText("搜索 skills.sh 上的技能...");
    await user.clear(input);
    await user.type(input, "frontend-design");

    expect(await screen.findByText("frontend-design")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "查看 frontend-design 详情" }),
    );

    await waitFor(() => {
      expect(mockInspectOnlineSkill).toHaveBeenCalledWith(
        "frontend-design",
        "anthropics/skills",
      );
    });

    expect(await screen.findByText("详细介绍")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Distinctive, production-grade frontend interfaces.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Use this skill when building production-grade frontend interfaces.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "npx skills add https://github.com/anthropics/skills --skill frontend-design",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("SKILL.md 原文")).toBeInTheDocument();
  });
});
