import { useState, useMemo, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { BUTTON_PRIMARY_CLASS, BUTTON_SECONDARY_CLASS, BUTTON_SIZE_XS_CLASS } from "@/lib/buttonStyles";
import { FIELD_INPUT_CLASS } from "@/lib/formStyles";
import type { ModelTestProtocol } from "@/lib/protocolUtils";
import { MODEL_TEST_PROTOCOLS } from "@/lib/protocolUtils";
import { getSelectionCheckboxClassName } from "../../ui";

/** 协议按钮的标签和颜色 */
const PROTOCOL_CONFIG: Record<ModelTestProtocol, { label: string; color: string; bg: string; borderColor: string; selectedColor: string }> = {
  openApi: { label: "Chat (OpenAI)", color: "text-emerald-300", bg: "bg-emerald-500/10", borderColor: "border-emerald-500/30", selectedColor: "text-white" },
  "openai-responses": { label: "Codex (Responses)", color: "text-cyan-300", bg: "bg-cyan-500/10", borderColor: "border-cyan-500/30", selectedColor: "text-white" },
  claude: { label: "Claude", color: "text-amber-300", bg: "bg-amber-500/10", borderColor: "border-amber-500/30", selectedColor: "text-white" },
  gemini: { label: "Gemini", color: "text-fuchsia-300", bg: "bg-fuchsia-500/10", borderColor: "border-fuchsia-500/30", selectedColor: "text-white" },
};

interface ModelSelectionDialogProps {
  /** 弹窗模式：test 用于测试流程，select 用于仅选择模型 */
  mode?: "test" | "select";
  /** 模型列表，已按 A-Z 排序 */
  models: string[];
  /** 编辑状态下的已保存模型；只默认勾选当前仍存在的交集 */
  initialSelectedModels?: string[];
  /** 是否正在加载模型列表 */
  loading: boolean;
  /** 加载失败的错误信息，为 null 表示加载成功或未开始 */
  fetchError: string | null;
  /** 确认选择：{ models, protocols } */
  onConfirm?: (models: string[], protocols: ModelTestProtocol[]) => void;
  /** 手动输入模型后确认：{ models, protocols } */
  onManualConfirm?: (models: string[], protocols: ModelTestProtocol[]) => void;
  /** 仅选择模型后确认 */
  onSelectConfirm?: (models: string[]) => void;
  /** 关闭弹窗 */
  onClose: () => void;
  /** 重新尝试获取模型列表 */
  onRetry?: () => void;
}

type DialogStep = "models" | "protocols" | "manual";

export function ModelSelectionDialog({
  mode = "test",
  models,
  initialSelectedModels = [],
  loading,
  fetchError,
  onConfirm,
  onManualConfirm,
  onSelectConfirm,
  onClose,
  onRetry,
}: ModelSelectionDialogProps) {
  const [step, setStep] = useState<DialogStep>("models");
  const [selectedModels, setSelectedModels] = useState<Set<string>>(() => new Set());
  const [selectedProtocols, setSelectedProtocols] = useState<Set<ModelTestProtocol>>(() => new Set(MODEL_TEST_PROTOCOLS));
  const [search, setSearch] = useState("");
  const [manualInput, setManualInput] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 当 models 更新时，只默认勾选“已保存模型”与“当前模型列表”的交集；新模型默认不勾选
  useEffect(() => {
    const saved = new Set(initialSelectedModels);
    setSelectedModels(new Set(models.filter((model) => saved.has(model))));
  }, [models.join(","), initialSelectedModels.join(",")]);

  const filteredModels = useMemo(() => {
    if (!search.trim()) return models;
    const lower = search.toLowerCase();
    return models.filter((m) => m.toLowerCase().includes(lower));
  }, [models, search]);

  const allFilteredSelected =
    filteredModels.length > 0 &&
    filteredModels.every((m) => selectedModels.has(m));

  // ─── 模型选择逻辑 ───────────────────────────────────────────────

  function toggleModel(model: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) {
        next.delete(model);
      } else {
        next.add(model);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedModels((prev) => {
        const next = new Set(prev);
        filteredModels.forEach((m) => next.delete(m));
        return next;
      });
    } else {
      setSelectedModels((prev) => {
        const next = new Set(prev);
        filteredModels.forEach((m) => next.add(m));
        return next;
      });
    }
  }

  // ─── 协议选择逻辑 ───────────────────────────────────────────────

  function toggleProtocol(protocol: ModelTestProtocol) {
    setSelectedProtocols((prev) => {
      const next = new Set(prev);
      if (next.has(protocol)) {
        if (next.size === 1) return prev; // 至少保留一个
        next.delete(protocol);
      } else {
        next.add(protocol);
      }
      return next;
    });
  }

  // ─── 确认逻辑 ─────────────────────────────────────────────────────

  function goNextStep() {
    if (selectedModels.size > 0) {
      if (mode === "select") {
        handleSelectConfirm();
        return;
      }
      setStep("protocols");
    }
  }

  function handleConfirm() {
    const selectedArr = Array.from(selectedModels).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    const protocolsArr = Array.from(selectedProtocols);
    onConfirm?.(selectedArr, protocolsArr);
  }

  function handleSelectConfirm() {
    const selectedArr = Array.from(selectedModels).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    onSelectConfirm?.(selectedArr);
  }

  function handleManualConfirm() {
    const parsedModels = manualInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const protocolsArr = Array.from(selectedProtocols);
    if (parsedModels.length > 0) {
      onManualConfirm?.(parsedModels, protocolsArr);
    }
  }

  // ─── 渲染步骤 ────────────────────────────────────────────────────

  const stepTitles: Record<DialogStep, string> = {
    models: mode === "select" ? "选择要导入的模型" : "选择要测试的模型",
    protocols: "选择测试协议",
    manual: "手动输入模型名称",
  };

  function renderStep() {
    // ─── 加载状态 ───
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          <p className="mt-4 text-sm text-gray-400">正在从 v1/models 获取模型列表...</p>
        </div>
      );
    }

    // ─── 错误状态：手动输入 ───
    if (fetchError && mode === "test") {
      return renderManualStep();
    }

    if (fetchError) {
      return (
        <div className="flex flex-col gap-4 px-6 py-6">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-300">模型列表加载失败：{fetchError}</p>
          </div>
          <div className="flex items-center justify-end gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                重试
              </button>
            )}
            <button
              onClick={onClose}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              关闭
            </button>
          </div>
        </div>
      );
    }

    // ─── 模型选择 ───
    if (step === "models") {
      return renderModelStep();
    }

    // ─── 协议选择 ───
    if (step === "protocols") {
      return renderProtocolStep();
    }

    return null;
  }

  function renderModelStep() {
    return (
      <>
        {/* 搜索 + 操作 */}
        <div className="flex items-center gap-2 border-b border-gray-800 px-6 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型..."
              className={`${FIELD_INPUT_CLASS} pl-8 text-xs`}
            />
          </div>
          <button
            onClick={toggleAll}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS} whitespace-nowrap`}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
            {allFilteredSelected ? "取消全选" : "全选"}
          </button>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            已选 {selectedModels.size} / {models.length}
          </span>
        </div>

        {/* 模型列表 */}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {filteredModels.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              {search ? "没有匹配的模型" : "没有可用的模型"}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filteredModels.map((model) => {
                const isSelected = selectedModels.has(model);
                return (
                  <button
                    key={model}
                    onClick={() => toggleModel(model)}
                    className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-mono transition-all ${
                      isSelected
                        ? "border-indigo-400/60 bg-indigo-500/20 text-white shadow-[0_0_0_1px_rgba(129,140,248,0.2)]"
                        : "border-gray-700 bg-gray-800/70 text-gray-400 hover:border-gray-500 hover:bg-gray-700/80 hover:text-gray-200"
                    }`}
                  >
                    <span
                      className={`${getSelectionCheckboxClassName(isSelected)} flex-shrink-0 ${
                        !isSelected ? "group-hover:border-indigo-500/60" : ""
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    {model}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between border-t border-gray-800 px-6 py-4">
          <span className="text-xs text-gray-500">
            点击模型切换选中状态
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              取消
            </button>
            <button
              onClick={goNextStep}
              disabled={selectedModels.size === 0}
              className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              {mode === "select"
                ? `导入所选模型 (${selectedModels.size})`
                : `下一步：选择协议 (${selectedModels.size})`}
            </button>
          </div>
        </div>
      </>
    );
  }

  function renderProtocolStep() {
    return (
      <>
        {/* 协议列表 */}
        <div className="flex flex-col gap-3 px-6 py-5">
          {MODEL_TEST_PROTOCOLS.map((protocol) => {
            const cfg = PROTOCOL_CONFIG[protocol];
            const isSelected = selectedProtocols.has(protocol);
            return (
              <button
                key={protocol}
                onClick={() => toggleProtocol(protocol)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                  isSelected
                    ? `${cfg.borderColor} ${cfg.bg} shadow-[0_0_0_1px_rgba(255,255,255,0.04)]`
                    : "border-gray-700 bg-gray-800/70 text-gray-400 hover:border-gray-500 hover:bg-gray-700/80"
                }`}
              >
                <span
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? `${cfg.borderColor} ${cfg.bg} ${cfg.selectedColor}`
                      : "border-gray-600 bg-gray-900"
                  }`}
                >
                  {isSelected && <Check className="h-2.5 w-2.5" />}
                </span>
                <div className="flex-1">
                  <span className={`text-sm font-medium ${isSelected ? cfg.selectedColor : "text-gray-300"}`}>
                    {cfg.label}
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {protocol === "openApi" && "使用 Chat Completions 接口测试模型响应"}
                    {protocol === "openai-responses" && "使用 Responses (Codex) 接口测试"}
                    {protocol === "claude" && "使用 Claude Messages 接口测试模型响应"}
                    {protocol === "gemini" && "使用 Gemini GenerateContent 接口测试模型响应"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between border-t border-gray-800 px-6 py-4">
          <span className="text-xs text-gray-500">
            已选 {selectedProtocols.size} 个协议，确认后将对所有选中的模型执行协议测试
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep("models")}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              上一步
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedModels.size === 0}
              className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <Check className="h-3.5 w-3.5" />
              开始测试 ({selectedModels.size} 模型 × {selectedProtocols.size} 协议)
            </button>
          </div>
        </div>
      </>
    );
  }

  function renderManualStep() {
    return (
      <div className="flex flex-col gap-4 px-6 py-6">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-300">
            无法获取模型列表：{fetchError}
          </p>
          <p className="mt-1 text-xs text-amber-200/70">
            该接口可能不支持 v1/models，请手动输入要测试的模型名称。
          </p>
        </div>

        {/* 协议选择（即使手动输入也需要选协议） */}
        <div>
          <label className="mb-2 block text-xs text-gray-400">选择测试协议</label>
          <div className="flex flex-wrap gap-2">
            {MODEL_TEST_PROTOCOLS.map((protocol) => {
              const cfg = PROTOCOL_CONFIG[protocol];
              const isSelected = selectedProtocols.has(protocol);
              return (
                <button
                  key={protocol}
                  onClick={() => toggleProtocol(protocol)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    isSelected
                      ? `${cfg.borderColor} ${cfg.bg} ${cfg.selectedColor}`
                      : "border-gray-700 bg-gray-800/70 text-gray-400 hover:border-gray-500 hover:bg-gray-700/80"
                  }`}
                >
                  <span
                    className={`flex h-3 w-3 items-center justify-center rounded border ${
                      isSelected ? `${cfg.borderColor} ${cfg.bg}` : "border-gray-600 bg-gray-900"
                    }`}
                  >
                    {isSelected && <Check className="h-2 w-2" />}
                  </span>
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-gray-400">
            手动输入模型名称（每行一个，或用逗号分隔）
          </label>
          <textarea
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder={"gpt-4o\nclaude-3-5-sonnet\ngemini-2.0-flash"}
            rows={5}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-none"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              重试获取
            </button>
          )}
          <button
            onClick={onClose}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            取消
          </button>
          <button
            onClick={handleManualConfirm}
            disabled={
              !manualInput
                .split(/[\n,]+/)
                .map((s) => s.trim())
                .filter(Boolean).length || selectedProtocols.size === 0
            }
            className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <Check className="h-3.5 w-3.5" />
            开始测试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-white">
              {stepTitles[step]}
            </h3>
            {step === "models" && (
              <p className="mt-1 text-xs text-gray-500">
                {mode === "select"
                  ? `从当前 Provider 最近可用模型里找到 ${models.length} 个模型，已按 A-Z 排序。勾选要导入到模型映射的模型。`
                  : `从 v1/models 获取到 ${models.length} 个模型，已按 A-Z 排序。勾选需要测试的模型。`}
              </p>
            )}
            {step === "protocols" && (
              <p className="mt-1 text-xs text-gray-500">
                已选 {selectedModels.size} 个模型，选择要测试的协议。未选则默认测试全部协议。
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {renderStep()}
      </div>
    </div>
  );
}
