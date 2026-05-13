import { useEffect, useState } from "react";
import {
  BUTTON_ICON_SM_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_MD_CLASS,
} from "../lib/buttonStyles"
import { FIELD_MONO_INPUT_CLASS } from "../lib/formStyles";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import { loadModelMappingSettings, saveModelMappingSettings } from "../api";
import { HintTooltip } from "./HintTooltip";
import { ModelConfigSection } from "./ModelConfigSection";
import { toast } from "../lib/toast";
import { Loader2 } from "lucide-react";
import type { Provider } from "../types";

export const DEBUG_KEY = "ai-modal-debug";
export const DEBUG_DB_KEY = "debug_enabled";
export const CONCURRENCY_KEY = "ai-modal-concurrency";
export const CONCURRENCY_DB_KEY = "concurrency";
export const MODELSCOPE_API_KEY = "ai-modal-modelscope-api-key";
export const MODELSCOPE_API_DB_KEY = "modelscope_api_key";
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 20;
const DEFAULT_MODEL_MAPPING_PORT = 5678;

export function getConcurrency(): number {
  const v = parseInt(localStorage.getItem(CONCURRENCY_KEY) ?? "", 10);
  return isNaN(v)
    ? DEFAULT_CONCURRENCY
    : Math.min(Math.max(1, v), MAX_CONCURRENCY);
}

interface Props {
  providers: Provider[];
  debugEnabled: boolean;
  onDebugChange: (v: boolean) => void;
  onDirtyChange?: (v: boolean) => void;
}

export function SettingsPage({
  providers,
  debugEnabled,
  onDebugChange,
  onDirtyChange,
}: Props) {
  const [concurrency, setConcurrency] = useState<number>(getConcurrency);
  const [modelscopeKey, setModelscopeKey] = useState("");
  const [modelscopeKeySaved, setModelscopeKeySaved] = useState(false);
  const [modelscopeKeyBusy, setModelscopeKeyBusy] = useState(false);
  const [modelMappingPort, setModelMappingPort] = useState(String(DEFAULT_MODEL_MAPPING_PORT));
  const [modelMappingPortSaved, setModelMappingPortSaved] = useState(DEFAULT_MODEL_MAPPING_PORT);
  const [modelMappingPortBusy, setModelMappingPortBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadModelMappingSettings()
      .then((settings) => {
        if (!active) return;
        setModelMappingPort(String(settings.port));
        setModelMappingPortSaved(settings.port);
      })
      .catch((error) => {
        console.error("Failed to load model mapping settings", error);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadPersistedJson<string>(MODELSCOPE_API_DB_KEY, MODELSCOPE_API_KEY, "")
      .then((key) => {
        if (!active) return;
        setModelscopeKey(key ?? "");
        setModelscopeKeySaved(!!(key && key.trim()));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function handleToggle() {
    const next = !debugEnabled;
    try {
      await savePersistedJson(DEBUG_DB_KEY, next, DEBUG_KEY);
      localStorage.setItem(DEBUG_KEY, String(next));
      onDebugChange(next);
      toast(next ? "Debug 模式已开启" : "Debug 模式已关闭", "success");
    } catch (error) {
      console.error("Failed to update debug mode", error);
      toast("Debug 模式更新失败", "error");
    }
  }

  async function handleConcurrencyChange(v: number) {
    if (v === concurrency) return;
    try {
      await savePersistedJson(CONCURRENCY_DB_KEY, v, CONCURRENCY_KEY);
      setConcurrency(v);
      localStorage.setItem(CONCURRENCY_KEY, String(v));
      toast(`检测并发数已更新为 ${v}`, "success");
    } catch (error) {
      console.error("Failed to update concurrency", error);
      toast("检测并发数更新失败", "error");
    }
  }

  async function handleModelMappingPortSave() {
    const port = Number.parseInt(modelMappingPort, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast("模型映射代理端口必须在 1 - 65535 之间", "warning");
      return;
    }
    if (port === modelMappingPortSaved) return;
    setModelMappingPortBusy(true);
    try {
      await saveModelMappingSettings({ port });
      setModelMappingPort(String(port));
      setModelMappingPortSaved(port);
      toast("模型映射代理端口已保存，重启代理后生效", "success");
    } catch (error) {
      console.error("Failed to update model mapping port", error);
      toast("模型映射代理端口更新失败", "error");
    } finally {
      setModelMappingPortBusy(false);
    }
  }

  async function handleModelscopeKeySave() {
    const key = modelscopeKey.trim();
    setModelscopeKeyBusy(true);
    try {
      await savePersistedJson(MODELSCOPE_API_DB_KEY, key, MODELSCOPE_API_KEY);
      setModelscopeKeySaved(!!key);
      toast(key ? "ModelScope API Key 已保存" : "ModelScope API Key 已清除", "success");
    } catch (error) {
      console.error("Failed to save modelscope key", error);
      toast("ModelScope API Key 保存失败", "error");
    } finally {
      setModelscopeKeyBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-white">
            系统配置
          </h2>
          <HintTooltip content="全局配置与调试辅助。" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500">
            通用
          </h3>
          <div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-200">
                    Debug 模式
                  </p>
                  <HintTooltip content="开启后右下角显示实时操作日志面板。" />
                </div>
              </div>
              <button
                onClick={() => void handleToggle()}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  debugEnabled ? "bg-indigo-600" : "bg-gray-700"
                }`}
                role="switch"
                aria-checked={debugEnabled}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                    debugEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-200">
                    检测并发数
                  </p>
                  <HintTooltip
                    content={`同时发起检测的最大请求数，范围 1 - ${MAX_CONCURRENCY}。`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    void handleConcurrencyChange(Math.max(1, concurrency - 1))
                  }
                  disabled={concurrency <= 1}
                  className={BUTTON_ICON_SM_CLASS}
                >
                  −
                </button>
                <span className="w-6 text-center font-mono text-sm font-semibold text-indigo-400">
                  {concurrency}
                </span>
                <button
                  onClick={() =>
                    void handleConcurrencyChange(
                      Math.min(MAX_CONCURRENCY, concurrency + 1),
                    )
                  }
                  disabled={concurrency >= MAX_CONCURRENCY}
                  className={BUTTON_ICON_SM_CLASS}
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-200">
                    模型映射代理端口
                  </p>
                  <HintTooltip content="Claude Desktop 连接模型映射 Gateway 使用的本地端口。修改后会更新 Claude 配置，运行中的代理需要停止再启动才会监听新端口。" />
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  当前地址：http://127.0.0.1:{modelMappingPortSaved}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={modelMappingPort}
                  onChange={(event) => setModelMappingPort(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                  onBlur={() => void handleModelMappingPortSave()}
                  className={`${FIELD_MONO_INPUT_CLASS} w-28 text-center`}
                  inputMode="numeric"
                  placeholder="5678"
                />
                <button
                  onClick={() => void handleModelMappingPortSave()}
                  disabled={modelMappingPortBusy || modelMappingPort === String(modelMappingPortSaved)}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
                >
                  保存
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-200">
                    ModelScope API Key
                  </p>
                  <HintTooltip content="用于访问 ModelScope MCP 服务列表和安装配置的 API Key，可在 modelscope.cn 获取。" />
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  {modelscopeKeySaved ? "已配置" : "未配置 — MCP 在线安装将不可用"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={modelscopeKey}
                  onChange={(event) => setModelscopeKey(event.target.value)}
                  className={`${FIELD_MONO_INPUT_CLASS} w-72`}
                  type="password"
                  placeholder="ms-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
                <button
                  onClick={() => void handleModelscopeKeySave()}
                  disabled={modelscopeKeyBusy}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
                >
                  {modelscopeKeyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  保存
                </button>
              </div>
            </div>
          </div>
        </section>

        <ModelConfigSection
          providers={providers}
          onDirtyChange={onDirtyChange ?? (() => {})}
        />
      </div>
    </div>
  );
}
