import { useState, useEffect } from "react";
import { Copy, TerminalSquare, X } from "lucide-react";
import type { Provider } from "../../../types";
import { HintTooltip } from "../../HintTooltip";
import { toast } from "../../../lib/toast";
import { BUTTON_SECONDARY_CLASS, BUTTON_ICON_MD_CLASS } from "../../../lib/buttonStyles";
import type { QuickTestProtocol } from "../types";
import {
  getQuickTestProtocolLabel,
  getQuickTestProtocolBadgeClass,
  getAvailableModels,
  getSelectableModels,
  getDefaultQuickTestModel,
  buildQuickTestTerminalSetup,
  buildQuickTestCurlSnippet,
} from "../urlBuilder";

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
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">
                模型协议快速测试
              </h3>
              <HintTooltip content="第一行手动选择协议，第二行选择模型；上方会生成可直接在终端使用的环境变量 + CLI 启动命令，下方保留 curl 回退测试片段。" />
            </div>
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
                  className={`${BUTTON_SECONDARY_CLASS} px-3 py-2 text-sm`}
                >
                  <Copy className="h-4 w-4" />
                  复制终端变量 + 启动命令
                </button>
                <button
                  onClick={handleCopySnippet}
                  className={`${BUTTON_SECONDARY_CLASS} px-3 py-2 text-sm`}
                >
                  <TerminalSquare className="h-4 w-4" />
                  复制 curl 回退命令
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className={BUTTON_ICON_MD_CLASS}
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
