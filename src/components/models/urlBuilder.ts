import type { Provider } from "../../types";
import type { QuickTestProtocol } from "./types";
import { QUICK_TEST_PROMPT } from "./constants";
import { normalizeBaseUrl, stripTrailingSuffixes } from "../../lib/providerBaseUrl";

// ─── OpenAI URL builders ─────────────────────────────────────────

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

function buildOpenAiCliBaseUrl(baseUrl: string) {
  return buildOpenAiStyleUrl(baseUrl, "").replace(/\/$/, "");
}

// ─── Claude URL builders ─────────────────────────────────────────

function buildClaudeUrl(baseUrl: string, leaf: string) {
  const normalized = stripTrailingSuffixes(baseUrl, [
    "/messages",
    "/models",
  ]);
  return normalized.endsWith("/v1")
    ? `${normalized}/${leaf}`
    : `${normalized}/v1/${leaf}`;
}

function buildClaudeCliBaseUrl(baseUrl: string) {
  return buildClaudeUrl(baseUrl, "").replace(/\/$/, "");
}

// ─── Gemini URL builders ─────────────────────────────────────────

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

// ─── OpenRouter detection ────────────────────────────────────────

function isOpenRouterBaseUrl(baseUrl: string) {
  return normalizeBaseUrl(baseUrl).toLowerCase().includes("openrouter.ai");
}

// ─── Protocol labels and badges ──────────────────────────────────

export function getQuickTestProtocolLabel(protocol: QuickTestProtocol) {
  if (protocol === "claude") return "Claude";
  if (protocol === "gemini") return "Gemini";
  return "OpenAI";
}

export function getQuickTestProtocolBadgeClass(protocol: QuickTestProtocol) {
  if (protocol === "claude") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (protocol === "gemini") {
    return "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

// ─── Model list helpers ──────────────────────────────────────────

export function getAvailableModels(provider: Provider) {
  return (provider.lastResult?.results ?? [])
    .filter((result) => result.available)
    .map((result) => result.model);
}

export function getSelectableModels(provider: Provider) {
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

export function getDefaultQuickTestModel(provider: Provider) {
  return getSelectableModels(provider)[0] ?? "your-model";
}

// ─── Quick test snippet builders ─────────────────────────────────

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildQuickTestTerminalSetup(
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

export function buildQuickTestCurlSnippet(
  provider: Provider,
  model: string,
  protocol: QuickTestProtocol,
) {
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

  const availableModels = getAvailableModels(provider);
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
      '    \\"max_tokens\\": 1,',
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
      "    ],",
      '    \\"generationConfig\\": {',
      '      \\"maxOutputTokens\\": 1',
      "    }",
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
      ...(isOpenRouterBaseUrl(provider.baseUrl)
        ? ['  -H "X-Title: AIModal" \\']
        : []),
      "  -X POST \\",
      '  -d "{',
      `    \\"model\\": \\"${model || "your-model"}\\",`,
      '    \\"messages\\": [',
      "      {",
      '        \\"role\\": \\"user\\",',
      `        \\"content\\": \\"${QUICK_TEST_PROMPT}\\"`,
      "      }",
      "    ],",
      '    \\"max_completion_tokens\\": 1,',
      '    \\"stream\\": false',
      '  }"',
    );
  }

  return lines.join("\n");
}
