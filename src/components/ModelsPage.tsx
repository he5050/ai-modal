import { Fragment, useState, useRef, useEffect } from "react";
import { dirname } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  listModelsByProvider,
  testModelsByProvider,
  testSingleModelByProvider,
} from "../api";
import type { Provider, ProviderLastResult } from "../types";
import type { ModelResult } from "../types";
import { CopyButton } from "./CopyButton";
import { Tooltip } from "./Tooltip";
import { toast } from "../lib/toast";
import { logger } from "../lib/devlog";
import {
  ACTION_GROUP_BUTTON_ACTIVE_CLASS,
  ACTION_GROUP_BUTTON_BASE_CLASS,
  ACTION_GROUP_BUTTON_INACTIVE_CLASS,
  ACTION_GROUP_WRAPPER_CLASS,
} from "../lib/actionGroupStyles";
import { getConcurrency } from "./SettingsPage";
import { animate, spring } from "animejs";
import {
  ArrowRight,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  TerminalSquare,
  X,
} from "lucide-react";

const RECENT_EXPORT_DIR_KEY = "ai-modal-model-export-dir";

type ImportSummary = {
  valid: Provider[];
  invalidCount: number;
  duplicateInFileCount: number;
  duplicateExistingCount: number;
};

function formatTime(ts: number) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${min}`;
}

function maskKey(key: string) {
  if (!key) return "—";
  if (key.length <= 4) return "*".repeat(key.length);
  return key.slice(0, 2) + "******" + key.slice(-2);
}

function maskPreviewText(value: string) {
  if (!value) return "—";
  if (value.length <= 4) return `${value.slice(0, 1)}******${value.slice(-1)}`;
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
}

function escapeCsvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeImportedProvider(
  raw: Record<string, unknown>,
): Provider | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  const createdAtValue = raw.createdAt;
  const createdAt =
    typeof createdAtValue === "number"
      ? createdAtValue
      : typeof createdAtValue === "string" && createdAtValue.trim()
        ? Number(createdAtValue)
        : Date.now();

  if (!id || !name || !baseUrl) return null;

  const provider: Provider = {
    id,
    name,
    baseUrl,
    apiKey,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };

  if (raw.lastResult && typeof raw.lastResult === "object") {
    provider.lastResult = raw.lastResult as ProviderLastResult;
  }

  return provider;
}

function parseJsonProviders(
  text: string,
  existingIds: Set<string>,
): ImportSummary {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("JSON 顶层必须是数组");

  const seenIds = new Set<string>();
  const valid: Provider[] = [];
  let invalidCount = 0;
  let duplicateInFileCount = 0;
  let duplicateExistingCount = 0;

  for (const item of data) {
    if (typeof item !== "object" || item === null) {
      invalidCount++;
      continue;
    }
    const provider = normalizeImportedProvider(item as Record<string, unknown>);
    if (!provider) {
      invalidCount++;
      continue;
    }
    if (seenIds.has(provider.id)) {
      duplicateInFileCount++;
      continue;
    }
    seenIds.add(provider.id);
    if (existingIds.has(provider.id)) {
      duplicateExistingCount++;
      continue;
    }
    valid.push(provider);
  }

  return { valid, invalidCount, duplicateInFileCount, duplicateExistingCount };
}

function parseCsvProviders(
  text: string,
  existingIds: Set<string>,
): ImportSummary {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) throw new Error("CSV 内容为空");

  const headers = splitCsvLine(lines[0]);
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const requiredHeaders = ["ID", "名称", "Base URL", "API Key", "创建时间"];
  const missingHeaders = requiredHeaders.filter(
    (header) => !headerIndex.has(header),
  );
  if (missingHeaders.length > 0) {
    throw new Error(`CSV 缺少字段：${missingHeaders.join("、")}`);
  }

  const seenIds = new Set<string>();
  const valid: Provider[] = [];
  let invalidCount = 0;
  let duplicateInFileCount = 0;
  let duplicateExistingCount = 0;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const raw: Record<string, unknown> = {
      id: cells[headerIndex.get("ID") ?? -1] ?? "",
      name: cells[headerIndex.get("名称") ?? -1] ?? "",
      baseUrl: cells[headerIndex.get("Base URL") ?? -1] ?? "",
      apiKey: cells[headerIndex.get("API Key") ?? -1] ?? "",
      createdAt: cells[headerIndex.get("创建时间") ?? -1] ?? "",
    };

    const provider = normalizeImportedProvider(raw);
    if (!provider) {
      invalidCount++;
      continue;
    }
    if (seenIds.has(provider.id)) {
      duplicateInFileCount++;
      continue;
    }
    seenIds.add(provider.id);
    if (existingIds.has(provider.id)) {
      duplicateExistingCount++;
      continue;
    }
    valid.push(provider);
  }

  return { valid, invalidCount, duplicateInFileCount, duplicateExistingCount };
}

function formatImportSummary(summary: ImportSummary) {
  return [
    `新增 ${summary.valid.length} 个`,
    summary.duplicateExistingCount > 0
      ? `已存在 ${summary.duplicateExistingCount} 个`
      : null,
    summary.duplicateInFileCount > 0
      ? `文件内重复 ${summary.duplicateInFileCount} 个`
      : null,
    summary.invalidCount > 0 ? `无效 ${summary.invalidCount} 个` : null,
  ]
    .filter(Boolean)
    .join("，");
}

function DeleteDialog({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (overlayRef.current) {
      animate(overlayRef.current, {
        opacity: [0, 1],
        duration: 180,
        ease: "outQuad",
      });
    }
    if (cardRef.current) {
      animate(cardRef.current, {
        opacity: [0, 1],
        translateY: [12, 0],
        scale: [0.97, 1],
        ease: spring({ stiffness: 380, damping: 22 }),
        duration: 400,
      });
    }
  }, []);

  return (
    <div
      ref={overlayRef}
      style={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div
        ref={cardRef}
        style={{ opacity: 0 }}
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-white mb-2">确认删除</h3>
        <p className="text-sm text-gray-400 mb-5">
          确定要删除 <span className="text-gray-200 font-medium">{name}</span>{" "}
          吗？此操作不可撤销。
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuickTestDialog({
  provider,
  onClose,
}: {
  provider: Provider;
  onClose: () => void;
}) {
  const availableModels = getAvailableModels(provider);
  const selectableModels = getSelectableModels(provider);
  const [selectedProtocol, setSelectedProtocol] =
    useState<QuickTestProtocol>("openai");
  const [selectedModel, setSelectedModel] = useState<string>(
    getDefaultQuickTestModel(provider),
  );
  const terminalSetup = buildQuickTestTerminalSetup(
    provider,
    selectedModel,
    selectedProtocol,
  );
  const curlSnippet = buildQuickTestCurlSnippet(
    provider,
    selectedModel,
    selectedProtocol,
  );
  const snippet = [
    terminalSetup,
    "",
    "# HTTP / curl 回退测试",
    curlSnippet,
  ].join("\n");

  useEffect(() => {
    setSelectedProtocol("openai");
    setSelectedModel(getDefaultQuickTestModel(provider));
  }, [provider.id, provider.lastResult?.timestamp]);

  async function handleCopyEnv() {
    try {
      await navigator.clipboard.writeText(terminalSetup);
      toast("已复制终端环境和启动命令", "success");
    } catch {
      toast("复制失败，请重试", "error");
    }
  }

  async function handleCopySnippet() {
    try {
      await navigator.clipboard.writeText(curlSnippet);
      toast("已复制 curl 回退命令", "success");
    } catch {
      toast("复制失败，请重试", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">
              模型协议快速测试
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              第一行手动选择协议，第二行选择模型；上方会生成可直接在终端使用的环境变量
              + CLI 启动命令，下方保留 `curl` 回退测试片段。
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-indigo-200">
                  {provider.name}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 ${getQuickTestProtocolBadgeClass(selectedProtocol)}`}
                >
                  {getQuickTestProtocolLabel(selectedProtocol)}
                </span>
                <span className="rounded-full bg-gray-800 px-2.5 py-1 text-gray-300">
                  {availableModels.length > 0
                    ? `${availableModels.length} 个可用模型`
                    : selectableModels.length > 0
                      ? `${selectableModels.length} 个最近检测模型`
                      : "暂无模型结果"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyEnv}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                  复制终端变量 + 启动命令
                </button>
                <button
                  onClick={handleCopySnippet}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                >
                  <TerminalSquare className="h-4 w-4" />
                  复制 curl 回退命令
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 text-gray-400 transition-colors hover:border-gray-600 hover:text-white"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-gray-800 bg-gray-950/80 p-4">
          <p className="mb-2 text-xs uppercase tracking-widest text-gray-500">
            复制协议
          </p>
          <div className="flex flex-wrap gap-2">
            {(["openai", "claude", "gemini"] as QuickTestProtocol[]).map(
              (protocol) => (
                <button
                  key={protocol}
                  onClick={() => setSelectedProtocol(protocol)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                    selectedProtocol === protocol
                      ? `${getQuickTestProtocolBadgeClass(protocol)} shadow-[0_0_0_1px_rgba(255,255,255,0.06)]`
                      : "border-gray-700 bg-gray-900/70 text-gray-300 hover:border-gray-500 hover:bg-gray-800/80 hover:text-white"
                  }`}
                >
                  {selectedProtocol === protocol && (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                  )}
                  {getQuickTestProtocolLabel(protocol)}
                </button>
              ),
            )}
          </div>
        </div>

        {selectableModels.length > 0 && (
          <div className="mt-5 rounded-xl border border-gray-800 bg-gray-950/80 p-4">
            <p className="mb-2 text-xs uppercase tracking-widest text-gray-500">
              {availableModels.length > 0 ? "可用模型" : "最近检测模型"}
            </p>
            <div className="max-h-32 overflow-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {selectableModels.map((model) => (
                  <button
                    key={model}
                    onClick={() => setSelectedModel(model)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono transition-all ${
                      selectedModel === model
                        ? "border-indigo-300/70 bg-indigo-500/25 text-white shadow-[0_0_0_1px_rgba(129,140,248,0.24),0_8px_24px_rgba(79,70,229,0.18)]"
                        : "border-gray-700 bg-gray-900/70 text-gray-300 hover:border-gray-500 hover:bg-gray-800/80 hover:text-white"
                    }`}
                  >
                    {selectedModel === model && (
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-200" />
                    )}
                    {model}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div
          className={`min-h-0 flex-1 overflow-auto rounded-xl border border-gray-800 bg-gray-950/80 p-4 ${
            selectableModels.length > 0 ? "mt-4" : "mt-5"
          }`}
        >
          <pre className="overflow-x-auto whitespace-pre-wrap break-all pr-2 font-mono text-xs leading-6 text-gray-200">
            {snippet}
          </pre>
        </div>
      </div>
    </div>
  );
}

type RowStatus = "pending" | "done";
interface LiveResult extends ModelResult {
  status: RowStatus;
}

export function getResultDetails(result: ModelResult) {
  return result.response_text?.trim() || result.error || "—";
}

export function summarizeFailedResultDetails(
  results: Pick<ModelResult, "available" | "response_text" | "error">[],
) {
  const uniqueDetails = Array.from(
    new Set(
      results
        .filter((result) => !result.available)
        .map((result) => getResultDetails(result as ModelResult))
        .map((detail) => detail.trim())
        .filter((detail) => detail && detail !== "—"),
    ),
  );

  if (uniqueDetails.length === 0) return "";
  return uniqueDetails.join(" | ");
}

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getAvailableModels(provider: Provider) {
  return (provider.lastResult?.results ?? [])
    .filter((result) => result.available)
    .map((result) => result.model);
}

function getSelectableModels(provider: Provider) {
  const availableModels = getAvailableModels(provider);
  if (availableModels.length > 0) return availableModels;
  return Array.from(
    new Set(
      (provider.lastResult?.results ?? [])
        .map((result) => result.model)
        .filter(Boolean),
    ),
  );
}

type QuickTestProtocol = "openai" | "claude" | "gemini";
const QUICK_TEST_PROMPT =
  "现在的梵蒂冈的教皇是谁，你现在模型名称是什么，版本号是多少。";

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function stripTrailingSuffixes(baseUrl: string, suffixes: string[]) {
  let normalized = normalizeBaseUrl(baseUrl);

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      if (normalized.endsWith(suffix)) {
        normalized = normalized.slice(0, -suffix.length).replace(/\/+$/, "");
        changed = true;
      }
    }
  }

  return normalized;
}

function getQuickTestProtocolLabel(protocol: QuickTestProtocol) {
  if (protocol === "claude") return "Claude";
  if (protocol === "gemini") return "Gemini";
  return "OpenAI";
}

function getQuickTestProtocolBadgeClass(protocol: QuickTestProtocol) {
  if (protocol === "claude") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (protocol === "gemini") {
    return "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

function buildOpenAiStyleUrl(baseUrl: string, leaf: string) {
  const normalized = stripTrailingSuffixes(baseUrl, [
    "/chat/completions",
    "/models",
  ]);

  return normalized.endsWith("/v1") ||
    normalized.endsWith("/v1beta/openai") ||
    normalized.endsWith("/openai")
    ? `${normalized}/${leaf}`
    : `${normalized}/v1/${leaf}`;
}

function buildClaudeUrl(baseUrl: string, leaf: string) {
  const normalized = stripTrailingSuffixes(baseUrl, ["/messages", "/models"]);
  return normalized.endsWith("/v1")
    ? `${normalized}/${leaf}`
    : `${normalized}/v1/${leaf}`;
}

function buildOpenAiCliBaseUrl(baseUrl: string) {
  return buildOpenAiStyleUrl(baseUrl, "").replace(/\/$/, "");
}

function buildClaudeCliBaseUrl(baseUrl: string) {
  return buildClaudeUrl(baseUrl, "").replace(/\/$/, "");
}

function normalizeGeminiBaseUrl(baseUrl: string) {
  return stripTrailingSuffixes(baseUrl, [
    "/openai/chat/completions",
    "/chat/completions",
    "/models",
    "/v1beta/openai",
    "/v1beta",
    "/openai",
    "/v1",
  ]);
}

function normalizeGeminiModelName(model: string) {
  return model.trim().replace(/^models\//, "") || "your-model";
}

function buildGeminiGenerateUrl(baseUrl: string, model: string) {
  return `${normalizeGeminiBaseUrl(baseUrl)}/v1beta/models/${normalizeGeminiModelName(model)}:generateContent`;
}

function getDefaultQuickTestModel(provider: Provider) {
  return getSelectableModels(provider)[0] ?? "your-model";
}

function buildQuickTestTerminalSetup(
  provider: Provider,
  model: string,
  protocol: QuickTestProtocol,
) {
  const normalizedModel = model || "your-model";

  if (protocol === "claude") {
    return [
      `export ANTHROPIC_API_KEY=${quoteShell(provider.apiKey)}`,
      `export ANTHROPIC_BASE_URL=${quoteShell(buildClaudeCliBaseUrl(provider.baseUrl))}`,
      `export ANTHROPIC_MODEL=${quoteShell(normalizedModel)}`,
      "",
      "# 直接启动 Claude Code",
      'claude --model "$ANTHROPIC_MODEL"',
    ].join("\n");
  }

  if (protocol === "gemini") {
    return [
      `export GEMINI_API_KEY=${quoteShell(provider.apiKey)}`,
      `export GEMINI_MODEL=${quoteShell(normalizeGeminiModelName(normalizedModel))}`,
      "",
      "# Gemini CLI 官方文档当前仅明确 API key + model；未提供稳定通用的 BASE_URL override。",
      'gemini -m "$GEMINI_MODEL"',
    ].join("\n");
  }

  return [
    `export OPENAI_API_KEY=${quoteShell(provider.apiKey)}`,
    `export OPENAI_BASE_URL=${quoteShell(buildOpenAiCliBaseUrl(provider.baseUrl))}`,
    `export OPENAI_MODEL=${quoteShell(normalizedModel)}`,
    "",
    "# 直接启动 Codex CLI",
    'codex -m "$OPENAI_MODEL" -c openai_base_url="$OPENAI_BASE_URL"',
  ].join("\n");
}

function buildQuickTestCurlSnippet(
  provider: Provider,
  model: string,
  protocol: QuickTestProtocol,
) {
  const availableModels = getAvailableModels(provider);
  const selectableModels = getSelectableModels(provider);
  const protocolLabel = getQuickTestProtocolLabel(protocol);
  const lines = [
    `# ${protocolLabel} HTTP 回退测试（仅当前会话有效）`,
    `# Provider: ${provider.name}`,
    `# Protocol: ${protocolLabel}`,
  ];
  const modelEnvName =
    protocol === "claude"
      ? "ANTHROPIC_MODEL"
      : protocol === "gemini"
        ? "GEMINI_MODEL"
        : "OPENAI_MODEL";

  if (selectableModels.length === 0) {
    lines.push(
      `# 当前 provider 还没有检测结果，请先测试，或把 ${modelEnvName} 替换成你要验证的模型名。`,
    );
  } else if (availableModels.length === 0) {
    lines.push(
      "# 当前没有可用模型，已回退到最近一次检测到的模型名；建议重新测试后再执行。",
    );
  } else {
    lines.push(
      `# 当前将按 ${protocolLabel} 协议请求；如果服务端 allowlist 已变化，请重新测试或改成报错里提示的模型名。`,
    );
  }

  if (protocol === "claude") {
    lines.push(
      `export ANTHROPIC_API_KEY=${quoteShell(provider.apiKey)}`,
      `export ANTHROPIC_MESSAGES_URL=${quoteShell(buildClaudeUrl(provider.baseUrl, "messages"))}`,
      `export ANTHROPIC_MODEL=${quoteShell(model || "your-model")}`,
      "",
      `curl ${quoteShell(buildClaudeUrl(provider.baseUrl, "messages"))} \\`,
      '  -H "Content-Type: application/json" \\',
      '  -H "x-api-key: $ANTHROPIC_API_KEY" \\',
      '  -H "anthropic-version: 2023-06-01" \\',
      "  -X POST \\",
      '  -d "{',
      `    \\"model\\": \\"${model || "your-model"}\\",`,
      '    \\"max_tokens\\": 1000000,',
      '    \\"messages\\": [',
      "      {",
      '        \\"role\\": \\"user\\",',
      `        \\"content\\": \\"${QUICK_TEST_PROMPT}\\"`,
      "      }",
      "    ]",
      '  }"',
    );
  } else if (protocol === "gemini") {
    lines.push(
      `export GEMINI_API_KEY=${quoteShell(provider.apiKey)}`,
      `export GEMINI_GENERATE_URL=${quoteShell(buildGeminiGenerateUrl(provider.baseUrl, model || "your-model"))}`,
      `export GEMINI_MODEL=${quoteShell(normalizeGeminiModelName(model || "your-model"))}`,
      "",
      `curl ${quoteShell(buildGeminiGenerateUrl(provider.baseUrl, model || "your-model"))} \\`,
      '  -H "Content-Type: application/json" \\',
      '  -H "x-goog-api-key: $GEMINI_API_KEY" \\',
      "  -X POST \\",
      '  -d "{',
      '    \\"contents\\": [',
      "      {",
      '        \\"parts\\": [',
      "          {",
      `            \\"text\\": \\"${QUICK_TEST_PROMPT}\\"`,
      "          }",
      "        ]",
      "      }",
      "    ]",
      '  }"',
    );
  } else {
    lines.push(
      `export OPENAI_API_KEY=${quoteShell(provider.apiKey)}`,
      `export OPENAI_CHAT_URL=${quoteShell(buildOpenAiStyleUrl(provider.baseUrl, "chat/completions"))}`,
      `export OPENAI_MODEL=${quoteShell(model || "your-model")}`,
      "",
      `curl ${quoteShell(buildOpenAiStyleUrl(provider.baseUrl, "chat/completions"))} \\`,
      '  -H "Content-Type: application/json" \\',
      '  -H "Authorization: Bearer $OPENAI_API_KEY" \\',
      "  -X POST \\",
      '  -d "{',
      `    \\"model\\": \\"${model || "your-model"}\\",`,
      '    \\"messages\\": [',
      "      {",
      '        \\"role\\": \\"user\\",',
      `        \\"content\\": \\"${QUICK_TEST_PROMPT}\\"`,
      "      }",
      "    ],",
      '    \\"stream\\": false',
      '  }"',
    );
  }

  return lines.join("\n");
}

function SelectionCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
        checked
          ? "border-indigo-500 bg-indigo-600 text-white"
          : "border-gray-600 bg-gray-800 text-transparent hover:border-indigo-500/60"
      }`}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

export function DetailRow({
  provider,
  onSaveResult,
  onOpenQuickTest,
}: {
  provider: Provider;
  onSaveResult: (id: string, r: ProviderLastResult) => void;
  onOpenQuickTest: (provider: Provider) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<LiveResult[]>([]);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rowRef.current) {
      animate(rowRef.current, {
        opacity: [0, 1],
        translateY: [-4, 0],
        ease: spring({ stiffness: 300, damping: 24 }),
        duration: 320,
      });
    }
  }, []);

  const displayResults: LiveResult[] =
    liveResults.length > 0
      ? liveResults
      : (provider.lastResult?.results ?? []).map((r) => ({
          ...r,
          status: "done" as RowStatus,
        }));
  const totalCount = displayResults.length;
  const availableCount = displayResults.filter(
    (r) => r.status === "done" && r.available,
  ).length;
  const unavailableCount = displayResults.filter(
    (r) => r.status === "done" && !r.available,
  ).length;

  async function handleTest() {
    setError(null);
    setLiveResults([]);
    setTesting(true);
    setProgress("正在获取模型列表...");
    onSaveResult(provider.id, { timestamp: Date.now(), results: [] });
    logger.info(`[${provider.name}] 开始测试，baseUrl: ${provider.baseUrl}`);
    let models: string[];
    try {
      models = await listModelsByProvider(provider.baseUrl, provider.apiKey);
      logger.success(
        `[${provider.name}] 获取模型列表成功，共 ${models.length} 个：${models.join(", ")}`,
      );
    } catch (e) {
      logger.error(`[${provider.name}] 获取模型列表失败：${String(e)}`);
      setError(String(e));
      setTesting(false);
      return;
    }

    const initial: LiveResult[] = models.map((m) => ({
      model: m,
      available: false,
      latency_ms: null,
      error: null,
      status: "pending",
    }));
    setLiveResults(initial);
    setProgress(`检测 ${models.length} 个模型...`);
    const concurrency = getConcurrency();
    logger.info(`[${provider.name}] 开始逐条检测，并发数: ${concurrency}`);

    const final: LiveResult[] = [...initial];
    const queue = models.map((model, idx) => ({ model, idx }));
    async function runNext(): Promise<void> {
      const item = queue.shift();
      if (!item) return;
      const { model, idx } = item;
      logger.debug(`[${provider.name}] → 检测中：${model}`);
      try {
        const res = await testSingleModelByProvider(
          provider.baseUrl,
          provider.apiKey,
          model,
        );
        final[idx] = { ...res, status: "done" };
        if (res.available) {
          logger.success(
            `[${provider.name}] ✓ ${model}  ${res.latency_ms != null ? res.latency_ms + "ms" : ""}`,
          );
        } else {
          const detail = getResultDetails(res);
          logger.warn(
            `[${provider.name}] ✗ ${model} 不可用${detail && detail !== "—" ? " — " + detail : ""}`,
          );
        }
      } catch (e) {
        final[idx] = {
          model,
          available: false,
          latency_ms: null,
          error: String(e),
          status: "done",
        };
        logger.error(`[${provider.name}] ✗ ${model} 请求失败：${String(e)}`);
      }
      setLiveResults([...final]);
      await runNext();
    }
    await Promise.all(Array.from({ length: concurrency }, runNext));

    const sorted = [...final].sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return (a.latency_ms ?? 99999) - (b.latency_ms ?? 99999);
    });
    const available = sorted.filter((r) => r.available).length;
    logger.success(
      `[${provider.name}] 检测完成：${available}/${sorted.length} 可用`,
    );
    if (available === 0) {
      const detail = summarizeFailedResultDetails(sorted);
      logger.warn(
        `[${provider.name}] 所有模型均不可用${
          detail ? `：${detail}` : "，请检查 API Key 或服务状态"
        }`,
      );
    }
    onSaveResult(provider.id, { timestamp: Date.now(), results: sorted });
    setLiveResults([]);
    setTesting(false);
    setProgress("");
  }

  return (
    <tr>
      <td colSpan={7} className="px-0 pb-0">
        <div
          ref={rowRef}
          style={{ opacity: 0 }}
          className="w-full bg-gray-800/40 border-t border-gray-800"
        >
          <div className="px-6 py-3 flex items-center justify-between border-b border-gray-800/60">
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>
                {provider.lastResult
                  ? formatTime(provider.lastResult.timestamp)
                  : "尚未检测"}
              </span>
              <span>
                {availableCount}/{totalCount} 可用
              </span>
              {!!totalCount && <span>{unavailableCount} 不可用</span>}
              {testing && (
                <span className="text-indigo-400">
                  {progress || "检测中..."}
                </span>
              )}
            </div>
            <button
              onClick={handleTest}
              disabled={testing}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              {testing ? "检测中..." : "一键测试"}
            </button>
            <button
              onClick={() => onOpenQuickTest(provider)}
              disabled={!provider.baseUrl.trim() || !provider.apiKey.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-indigo-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <TerminalSquare className="h-3.5 w-3.5" />
              生成终端测试
            </button>
          </div>
          {error && (
            <div className="px-6 py-2 text-xs text-red-400">{error}</div>
          )}
          {displayResults.length > 0 && (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-gray-800/60">
                  <th className="w-[34%] text-left px-6 py-2 text-xs text-gray-500">
                    模型
                  </th>
                  <th className="w-[14%] text-left px-6 py-2 text-xs text-gray-500">
                    状态
                  </th>
                  <th className="w-[14%] text-left px-6 py-2 text-xs text-gray-500">
                    延迟
                  </th>
                  <th className="w-[38%] text-left px-6 py-2 text-xs text-gray-500">
                    返回结果
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayResults.map((r, i) => (
                  <tr
                    key={r.model}
                    className={`hover:bg-gray-800/30 ${i < displayResults.length - 1 ? "border-b border-gray-800/40" : ""}`}
                  >
                    <td className="px-6 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-gray-300 truncate max-w-xs">
                          {r.model}
                        </span>
                        {r.status === "done" && <CopyButton text={r.model} />}
                      </div>
                    </td>
                    <td className="px-6 py-2">
                      {r.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-pulse" />
                          检测中
                        </span>
                      ) : r.available ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          可用
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          不可用
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-2 text-xs text-gray-400">
                      {r.latency_ms != null ? `${r.latency_ms} ms` : "—"}
                    </td>
                    <td className="px-6 py-2 text-xs text-gray-600">
                      {r.status === "pending" ? (
                        ""
                      ) : (
                        <div className="flex items-start gap-1.5">
                          <Tooltip
                            content={getResultDetails(r)}
                            placement="top"
                          >
                            <span className="max-w-[240px] truncate leading-5 text-gray-600 cursor-default">
                              {getResultDetails(r)}
                            </span>
                          </Tooltip>
                          {getResultDetails(r) !== "—" && (
                            <CopyButton
                              text={getResultDetails(r)}
                              message="已复制返回结果"
                            />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!testing && displayResults.length === 0 && !error && (
            <div className="px-6 py-4 text-xs text-gray-600">
              点击一键测试获取该 provider 的 model 列表
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

interface Props {
  providers: Provider[];
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => void;
  onSaveResult: (id: string, result: ProviderLastResult) => void;
  onImport: (providers: Provider[]) => void;
  onGoDetect: () => void;
  onOpenDetail: (provider: Provider) => void;
}

type Filter = "all" | "available" | "untested";
type SortKey = "name" | "time" | "available" | null;
type SortDir = "asc" | "desc";

export function ModelsPage({
  providers,
  onEdit,
  onDelete,
  onSaveResult,
  onImport,
  onGoDetect,
  onOpenDetail,
}: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>(
    () => (localStorage.getItem("ai-modal-sort-key") as SortKey) ?? null,
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () => (localStorage.getItem("ai-modal-sort-dir") as SortDir) ?? "asc",
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  function handleImportClick() {
    importRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = String(ev.target?.result ?? "");
        const existingIds = new Set(providers.map((provider) => provider.id));
        const lowerName = file.name.toLowerCase();
        const summary = lowerName.endsWith(".csv")
          ? parseCsvProviders(text, existingIds)
          : parseJsonProviders(text, existingIds);

        if (summary.valid.length === 0) {
          throw new Error(`未找到可导入记录：${formatImportSummary(summary)}`);
        }

        onImport(summary.valid);
        logger.success(
          `[导入] ${file.name} -> ${formatImportSummary(summary)}`,
        );
        toast(`导入完成：${formatImportSummary(summary)}`, "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "文件格式不正确";
        logger.error(`[导入] 失败：${msg}`);
        toast(`导入失败：${msg}`, "error");
      } finally {
        setImporting(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function handleSort(key: SortKey) {
    let newKey: SortKey, newDir: SortDir;
    if (sortKey === key) {
      if (sortDir === "asc") {
        newKey = key;
        newDir = "desc";
      } else {
        newKey = null;
        newDir = "asc";
      }
    } else {
      newKey = key;
      newDir = "asc";
    }
    setSortKey(newKey);
    setSortDir(newDir);
    if (newKey) {
      localStorage.setItem("ai-modal-sort-key", newKey);
      localStorage.setItem("ai-modal-sort-dir", newDir);
    } else {
      localStorage.removeItem("ai-modal-sort-key");
      localStorage.setItem("ai-modal-sort-dir", "asc");
    }
  }

  function buildCsvContent() {
    const headers = [
      "ID",
      "名称",
      "Base URL",
      "API Key",
      "创建时间",
      "可用数",
      "总数",
    ];
    const rows = providers.map((provider) => {
      const available =
        provider.lastResult?.results.filter((result) => result.available)
          .length ?? 0;
      const total = provider.lastResult?.results.length ?? 0;
      return [
        provider.id,
        provider.name,
        provider.baseUrl,
        provider.apiKey,
        provider.createdAt,
        available,
        total,
      ]
        .map(escapeCsvCell)
        .join(",");
    });
    return headers.join(",") + "\n" + rows.join("\n");
  }

  async function saveExportFile(
    content: string,
    filename: string,
    filterName: string,
    extensions: string[],
  ) {
    const defaultPath =
      localStorage.getItem(RECENT_EXPORT_DIR_KEY) ?? undefined;
    const filePath = await save({
      defaultPath: defaultPath ? `${defaultPath}/${filename}` : filename,
      filters: [{ name: filterName, extensions }],
    });

    if (!filePath) return null;

    await writeTextFile(filePath, content);
    const exportDir = await dirname(filePath);
    localStorage.setItem(RECENT_EXPORT_DIR_KEY, exportDir);
    return { filePath, exportDir };
  }

  async function handleExportCSV() {
    const csv = buildCsvContent();
    const today = new Date().toISOString().slice(0, 10);
    try {
      const saved = await saveExportFile(csv, `ai-modal-${today}.csv`, "CSV", [
        "csv",
      ]);
      if (!saved) return;
      toast("CSV 已保存，含明文 Key", "warning");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[导出 CSV] 失败：${msg}`);
      toast(`导出 CSV 失败：${msg}`, "error");
    } finally {
      setExportOpen(false);
    }
  }

  async function handleExportJSON() {
    const data = providers.map((p) => ({
      ...p,
      lastResult: p.lastResult ?? null,
    }));
    const today = new Date().toISOString().slice(0, 10);
    try {
      const saved = await saveExportFile(
        JSON.stringify(data, null, 2),
        `ai-modal-${today}.json`,
        "JSON",
        ["json"],
      );
      if (!saved) return;
      toast("JSON 已保存，含明文 Key", "warning");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[导出 JSON] 失败：${msg}`);
      toast(`导出 JSON 失败：${msg}`, "error");
    } finally {
      setExportOpen(false);
    }
  }

  async function handleOpenRecentExportDir() {
    const exportDir = localStorage.getItem(RECENT_EXPORT_DIR_KEY);
    if (!exportDir) {
      toast("暂无最近导出目录", "info");
      setExportOpen(false);
      return;
    }
    try {
      await openPath(exportDir);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[导出目录] 打开失败：${msg}`);
      toast(`打开目录失败：${msg}`, "error");
    } finally {
      setExportOpen(false);
    }
  }

  function handleCopyCSV() {
    const rows = providers.map((p) => {
      const available =
        p.lastResult?.results.filter((r) => r.available).length ?? 0;
      const total = p.lastResult?.results.length ?? 0;
      return `"${p.name}","${p.baseUrl}","${p.apiKey}",${available},${total}`;
    });
    const csv = "名称,Base URL,API Key,可用数,总数\n" + rows.join("\n");
    navigator.clipboard.writeText(csv);
    toast("已复制 CSV 到剪贴板", "success");
    setExportOpen(false);
  }

  function handleCopyJSON() {
    const data = providers.map((p) => ({
      ...p,
      lastResult: p.lastResult ?? null,
    }));
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast("已复制 JSON 到剪贴板", "success");
    setExportOpen(false);
  }
  const [batchTesting, setBatchTesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const cancelRef = useRef(false);

  async function handleBatchTest() {
    if (batchTesting) return;
    cancelRef.current = false;
    setBatchTesting(true);
    let successCount = 0;
    let stopped = false;
    logger.info(`[批量测试] 开始，共 ${providers.length} 个接口`);
    for (let i = 0; i < providers.length; i++) {
      if (cancelRef.current) {
        stopped = true;
        break;
      }
      const p = providers[i];
      setBatchProgress(`正在检测 ${i + 1} / ${providers.length}：${p.name}`);
      logger.info(
        `[批量测试] (${i + 1}/${providers.length}) ${p.name} — ${p.baseUrl}`,
      );
      try {
        const models = await listModelsByProvider(p.baseUrl, p.apiKey);
        logger.debug(`[批量测试] ${p.name} 获取到 ${models.length} 个模型`);
        if (cancelRef.current) {
          stopped = true;
          break;
        }
        const res = await testModelsByProvider(p.baseUrl, p.apiKey, models);
        const avail = res.filter((r) => r.available).length;
        const detail = summarizeFailedResultDetails(res);
        logger.success(
          `[批量测试] ${p.name} 完成：${avail}/${res.length} 可用`,
        );
        if (avail === 0 && detail) {
          logger.warn(`[批量测试] ${p.name} 错误详情：${detail}`);
        }
        onSaveResult(p.id, { timestamp: Date.now(), results: res });
        successCount++;
      } catch (e) {
        logger.error(`[批量测试] ${p.name} 失败：${String(e)}`);
      }
    }
    setBatchTesting(false);
    setBatchProgress("");
    if (stopped) {
      logger.warn(
        `[批量测试] 用户手动停止，已完成 ${successCount}/${providers.length} 个`,
      );
      toast(`批量测试已停止：${successCount} 个完成`, "warning");
    } else {
      const failed = providers.length - successCount;
      if (failed === 0) {
        logger.success(`[批量测试] 全部完成，共 ${successCount} 个接口`);
        toast(`批量测试完成：${successCount} 个完成`, "success");
      } else {
        logger.warn(`[批量测试] 完成：${successCount} 成功，${failed} 失败`);
        toast(`批量测试完成：${successCount} 成功，${failed} 失败`, "warning");
      }
    }
  }

  function handleFilterChange(f: Filter) {
    setFilter(f);
  }

  const deleteTarget = providers.find((p) => p.id === deleteId);

  const filtered = providers
    .filter((p) => {
      if (filter === "available")
        return p.lastResult?.results.some((r) => r.available);
      if (filter === "untested") return !p.lastResult;
      return true;
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      let av: string | number, bv: string | number;
      if (sortKey === "name") {
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
      } else if (sortKey === "time") {
        av = a.lastResult?.timestamp ?? a.createdAt;
        bv = b.lastResult?.timestamp ?? b.createdAt;
      } else {
        av = a.lastResult?.results.filter((r) => r.available).length ?? -1;
        bv = b.lastResult?.results.filter((r) => r.available).length ?? -1;
      }
      return sortDir === "asc"
        ? av < bv
          ? -1
          : av > bv
            ? 1
            : 0
        : av > bv
          ? -1
          : av < bv
            ? 1
            : 0;
    });
  const testedCount = providers.filter((p) => p.lastResult).length;
  const availableCount = providers.filter((p) =>
    p.lastResult?.results.some((r) => r.available),
  ).length;
  const untestedCount = providers.length - testedCount;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">
              模型列表
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              管理全部 provider，查看各 provider 下的 model
              数量、可用情况和最近结果。
            </p>
          </div>
          <button
            onClick={onGoDetect}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
          >
            前往模型检测
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">
              全部接口
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {providers.length}
            </p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">
              可用接口
            </p>
            <p className="mt-2 text-lg font-semibold text-emerald-400">
              {availableCount}
            </p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">
              未检测接口
            </p>
            <p className="mt-2 text-lg font-semibold text-amber-400">
              {untestedCount}
            </p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {batchTesting && (
              <span className="text-xs text-indigo-400">{batchProgress}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={() => setBatchDeleteConfirm(true)}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                删除已选 ({selectedIds.size})
              </button>
            )}
            {batchTesting ? (
              <button
                onClick={() => {
                  cancelRef.current = true;
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                停止检测
              </button>
            ) : (
              <button
                onClick={handleBatchTest}
                disabled={providers.length === 0}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                批量测试
              </button>
            )}
            <input
              ref={importRef}
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={handleImportClick}
              disabled={importing}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200 disabled:opacity-40 transition-colors"
            >
              {importing ? "导入中..." : "导入 JSON / CSV"}
            </button>
            <div className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors flex items-center gap-1"
              >
                导出{" "}
                <ChevronDown
                  className={`w-3 h-3 text-gray-500 transition-transform ${exportOpen ? "rotate-180" : ""}`}
                />
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 overflow-hidden">
                  <div className="px-3 py-1.5 text-xs text-gray-600 border-b border-gray-800">
                    保存到本地
                  </div>
                  <button
                    onClick={() => void handleExportCSV()}
                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    保存 CSV 到...
                  </button>
                  <button
                    onClick={() => void handleExportJSON()}
                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    保存 JSON 到...
                  </button>
                  <button
                    onClick={() => void handleOpenRecentExportDir()}
                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors border-t border-gray-800"
                  >
                    打开最近导出目录
                  </button>
                  <div className="px-3 py-1.5 text-xs text-gray-600 border-t border-b border-gray-800">
                    复制到剪贴板
                  </div>
                  <button
                    onClick={handleCopyCSV}
                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    复制为 CSV
                  </button>
                  <button
                    onClick={handleCopyJSON}
                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    复制为 JSON
                  </button>
                </div>
              )}
            </div>
            <div className={ACTION_GROUP_WRAPPER_CLASS}>
              {(["all", "available", "untested"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => handleFilterChange(f)}
                  className={`${ACTION_GROUP_BUTTON_BASE_CLASS} ${
                    filter === f
                      ? ACTION_GROUP_BUTTON_ACTIVE_CLASS
                      : ACTION_GROUP_BUTTON_INACTIVE_CLASS
                  }`}
                >
                  {f === "all" ? "全部" : f === "available" ? "可用" : "未检测"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-4 shadow-[0_0_20px_4px_rgba(99,102,241,0.15)]">
              <ArrowRight className="w-6 h-6 text-indigo-400/60" />
            </div>
            <p className="mb-1 text-sm font-medium text-gray-400">
              还没有任何接口
            </p>
            <p className="text-xs text-gray-600">
              先前往模型检测新增并测试第一个 provider。
            </p>
            <button
              onClick={onGoDetect}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              去模型检测新增接口
            </button>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-5 py-3 text-xs font-medium text-gray-400 w-10">
                    <SelectionCheckbox
                      checked={
                        selectedIds.size === filtered.length &&
                        filtered.length > 0
                      }
                      onToggle={() => {
                        if (
                          selectedIds.size !== filtered.length &&
                          filtered.length > 0
                        ) {
                          setSelectedIds(new Set(filtered.map((p) => p.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 w-10">
                    #
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">
                    <button
                      onClick={() => handleSort("name")}
                      className="flex items-center gap-1 hover:text-gray-200 transition-colors"
                    >
                      名称
                      {sortKey === "name" ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="w-3 h-3 ml-0.5 inline" />
                        ) : (
                          <ChevronDown className="w-3 h-3 ml-0.5 inline" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-3 h-3 ml-0.5 inline text-gray-600" />
                      )}
                    </button>
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">
                    Base URL
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">
                    API Key
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">
                    <button
                      onClick={() => handleSort("time")}
                      className="flex items-center gap-1 hover:text-gray-200 transition-colors"
                    >
                      更新时间
                      {sortKey === "time" ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="w-3 h-3 ml-0.5 inline" />
                        ) : (
                          <ChevronDown className="w-3 h-3 ml-0.5 inline" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-3 h-3 ml-0.5 inline text-gray-600" />
                      )}
                    </button>
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const results = p.lastResult?.results ?? [];
                  const hasAvailable = results.some((r) => r.available);
                  const hasTested = results.length > 0;
                  const availableModels = results
                    .filter((r) => r.available)
                    .map((r) => r.model);
                  const availableModelDetails = results
                    .filter((r) => r.available)
                    .map((r) => r.model);
                  const nameTooltipContent = !hasTested ? (
                    <span className="text-gray-400">尚未检测</span>
                  ) : availableModelDetails.length > 0 ? (
                    <div>
                      <p className="text-gray-400 mb-1.5 text-[11px] uppercase tracking-wider">
                        可用模型
                      </p>
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {availableModelDetails.map((m, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded-md bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 text-[11px] text-indigo-300 font-mono leading-tight"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400">当前无可用模型</span>
                  );

                  return (
                    <Fragment key={p.id}>
                      <tr
                        className={`hover:bg-gray-800/30 transition-colors border-l-2 ${
                          hasAvailable
                            ? "border-l-emerald-500/40"
                            : hasTested
                              ? "border-l-red-500/20"
                              : "border-l-transparent"
                        } ${i < filtered.length - 1 ? "border-b border-gray-800/50" : ""}`}
                      >
                        <td className="px-5 py-3">
                          <SelectionCheckbox
                            checked={selectedIds.has(p.id)}
                            onToggle={() => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.id)) {
                                  next.delete(p.id);
                                } else {
                                  next.add(p.id);
                                }
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500">
                          {i + 1}
                        </td>
                        <td className="px-5 py-3">
                          <Tooltip
                            content={nameTooltipContent}
                            placement="right"
                          >
                            <div className="flex flex-col gap-1">
                              <div className="inline-flex items-center gap-1.5">
                                <span className="text-gray-200 text-sm font-medium">
                                  {p.name}
                                </span>
                                {!hasTested && (
                                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                                    待检测
                                  </span>
                                )}
                                {hasTested && hasAvailable && (
                                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                                    可用
                                  </span>
                                )}
                                {hasTested && !hasAvailable && (
                                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">
                                    不可用
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">
                                {hasTested
                                  ? `${results.length} 个模型，${availableModels.length} 个可用`
                                  : "尚未生成模型结果"}
                              </span>
                            </div>
                          </Tooltip>
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Tooltip content={p.baseUrl} placement="top">
                              <span className="font-mono text-xs text-gray-500 truncate max-w-[220px] cursor-default">
                                {maskPreviewText(p.baseUrl)}
                              </span>
                            </Tooltip>
                            <CopyButton
                              text={p.baseUrl}
                              message="已复制 Base URL"
                            />
                          </div>
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-gray-600">
                                {maskKey(p.apiKey)}
                              </span>
                              {p.apiKey && (
                                <CopyButton
                                  text={p.apiKey}
                                  message="已复制 API Key"
                                />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-xs text-gray-500">
                          {formatTime(p.lastResult?.timestamp ?? p.createdAt)}
                        </td>
                        <td
                          className="px-5 py-2.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onOpenDetail(p)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors"
                            >
                              详情
                            </button>
                            <button
                              onClick={() => onEdit(p)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => setDeleteId(p.id)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-400 hover:border-red-500/50 hover:text-red-400 transition-colors"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteDialog
          name={deleteTarget.name}
          onConfirm={() => {
            const name = deleteTarget.name;
            onDelete(deleteTarget.id);
            setDeleteId(null);
            logger.warn(`[删除] 「${name}」已删除`);
            toast("已删除", "info");
          }}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {batchDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-2">
              确认批量删除
            </h3>
            <p className="text-sm text-gray-400 mb-5">
              确定要删除选中的{" "}
              <span className="text-gray-200 font-medium">
                {selectedIds.size}
              </span>{" "}
              个接口吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBatchDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  selectedIds.forEach((id) => onDelete(id));
                  setSelectedIds(new Set());
                  setBatchDeleteConfirm(false);
                  logger.warn(`[批量删除] 已删除 ${selectedIds.size} 个接口`);
                  toast(`已删除 ${selectedIds.size} 个接口`, "info");
                }}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
