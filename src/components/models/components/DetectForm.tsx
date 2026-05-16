import { useRef } from "react";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { CopyButton } from "../../CopyButton";
import { HintTooltip } from "../../HintTooltip";
import { Tooltip } from "../../Tooltip";
import {
  FIELD_INPUT_CLASS,
} from "@/lib/formStyles";
import { Input } from "../../ui";
import {
  BUTTON_ICON_GHOST_MD_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles";
import {
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  X,
  Zap,
} from "lucide-react";
import { animate, spring } from "animejs";
import type { DetectFormState } from "@/hooks/useDetectForm";

interface DetectFormProps {
  form: DetectFormState;
  isLoading: boolean;
  isDone: boolean;
  onOpenModels: () => void;
  onReset: () => void;
  onQuickTest: () => void;
  onCancelDetection?: () => void;
  onSave: () => void;
  onSaveAsNew: () => void;
}

export function DetectForm({
  form,
  isLoading,
  isDone,
  onOpenModels,
  onReset,
  onQuickTest,
  onCancelDetection,
  onSave,
  onSaveAsNew,
}: DetectFormProps) {
  const testBtnRef = useRef<HTMLButtonElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-3 rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-3 py-2.5">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-gray-100">
              {form.editingId ? "正在编辑当前 provider" : "先填写一个 provider"}
            </p>
            <HintTooltip content="Base URL 支持根地址、/v1、/v1/models、/chat/completions；系统会自动归一化，本地服务可不填 Key。" />
          </div>
        </div>
        <button
          onClick={onOpenModels}
          className={`flex-shrink-0 ${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
        >
          <ArrowRight className="h-3.5 w-3.5" />
          前往模型列表
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <label className="block text-xs text-gray-400">名称</label>
            <HintTooltip content="列表中的 provider 名称。" />
          </div>
          <div className="relative">
            <Input
              value={form.name}
              onChange={(e) => form.setName(e.target.value)}
              placeholder="如：官方 OpenAI、企业代理、网关服务"
              className="pr-8"
            />
            {form.name && (
              <button
                onClick={() => form.setName("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                tabIndex={-1}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <label className="block text-xs text-gray-400">Base URL</label>
            <HintTooltip content="示例：https://api.openai.com、https://openrouter.ai/api、https://your-gateway.example.com/v1/models；支持根地址、/v1、/v1/models、/chat/completions。" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Input
                value={form.baseUrl}
                onChange={(e) => form.setBaseUrl(e.target.value)}
                onBlur={() => {
                  if (form.baseUrl.trim() && !form.baseUrl.trim().startsWith("http"))
                    form.setUrlError("请输入完整 URL（以 http:// 或 https:// 开头）");
                  else form.setUrlError(null);
                }}
                error={form.urlError ?? undefined}
                placeholder="例如：https://openrouter.ai/api"
                className="pr-8"
              />
              {form.baseUrl && (
                <button
                  onClick={() => {
                    form.setBaseUrl("");
                    form.setUrlError(null);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
            {form.baseUrl && <CopyButton text={form.baseUrl} />}
            {form.baseUrl && (
              <button
                onClick={() => void openExternalUrl(form.baseUrl)}
                className={BUTTON_ICON_GHOST_MD_CLASS}
                title="浏览器打开 Base URL"
                aria-label="浏览器打开 Base URL"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
          </div>
          {form.urlError && (
            <p className="text-xs text-red-400 mt-1">{form.urlError}</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-xs text-gray-400">API Key</label>
          <HintTooltip content="模型测试可能走 OpenAI / Claude / Gemini 协议；导出可能包含明文 Key。" />
        </div>
        <div className="relative flex items-center">
          <Input
            type={form.keyVisible ? "text" : "password"}
            value={form.apiKey}
            onChange={(e) => form.setApiKey(e.target.value)}
            placeholder="sk-..."
            className="pr-24"
          />
          <div className="absolute right-2 flex items-center gap-1.5">
            {form.apiKey && <CopyButton text={form.apiKey} />}
            {form.apiKey && (
              <button
                onClick={() => form.setApiKey("")}
                className="text-gray-500 hover:text-gray-300 transition-colors"
                tabIndex={-1}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => form.setKeyVisible((v) => !v)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              {form.keyVisible ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─── 操作按钮 ────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <div>
          {form.editingId ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                编辑模式
              </span>
              {(form.baseUrl.trim() !== form.origBaseUrl ||
                form.apiKey.trim() !== form.origApiKey) && (
                <span className="text-xs text-amber-400">
                  URL 或 Key 已修改，建议重新测试后保存
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-600">填写后点击一键测试</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {form.editingId ? "新建接口" : "重置"}
          </button>
          <button
            ref={testBtnRef}
            onClick={() => {
              if (testBtnRef.current) {
                animate(testBtnRef.current, {
                  scale: [1, 0.93, 1],
                  ease: spring({ stiffness: 500, damping: 16 }),
                  duration: 300,
                });
              }
              onQuickTest();
            }}
            disabled={isLoading || !form.baseUrl.trim() || !!form.urlError}
            className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <Zap className="h-3.5 w-3.5" />
            {isLoading ? "检测中..." : "一键测试"}
          </button>
          {isLoading && onCancelDetection && (
            <button
              onClick={onCancelDetection}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              title="取消当前检测"
            >
              <X className="h-3.5 w-3.5" />
              取消检测
            </button>
          )}
          {(isDone || form.editingId) && (
            <Tooltip
              content={
                !form.name.trim()
                  ? "请填写名称后再保存"
                  : !form.baseUrl.trim()
                    ? "请填写 Base URL"
                    : undefined
              }
              placement="top"
              disabled={form.name.trim() !== "" && form.baseUrl.trim() !== ""}
            >
              <button
                ref={saveBtnRef}
                onClick={() => {
                  if (saveBtnRef.current) {
                    animate(saveBtnRef.current, {
                      scale: [1, 0.93, 1],
                      ease: spring({ stiffness: 500, damping: 16 }),
                      duration: 300,
                    });
                  }
                  onSave();
                }}
                disabled={!form.name.trim() || !form.baseUrl.trim() || form.saving}
                className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <Save className="h-3.5 w-3.5" />
                {form.saving ? "保存中..." : "保存"}
              </button>
            </Tooltip>
          )}
          {form.editingId && (
            <Tooltip
              content={
                !form.name.trim()
                  ? "请填写名称"
                  : !form.baseUrl.trim()
                    ? "请填写 Base URL"
                    : undefined
              }
              placement="top"
              disabled={form.name.trim() !== "" && form.baseUrl.trim() !== ""}
            >
              <button
                onClick={onSaveAsNew}
                disabled={!form.name.trim() || !form.baseUrl.trim() || form.saving}
                className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <Save className="h-3.5 w-3.5" />
                {form.saving ? "保存中..." : "另存为新接口"}
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
