import { useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../lib/buttonStyles";
import { toast } from "../../lib/toast";
import type { McpServerConfigInput, ModelscopeMcpServerDetail } from "../../types";

interface InstallDialogProps {
  detail: ModelscopeMcpServerDetail;
  onImport: (payload: {
    name: string;
    config: McpServerConfigInput;
    sourceUrl?: string | null;
  }) => Promise<void>;
  onClose: () => void;
}

function preferredTransport(detail: ModelscopeMcpServerDetail) {
  for (const key of ["stdio", "streamable_http", "sse", "http"]) {
    if (detail.transportConfigs[key]) return key;
  }
  return Object.keys(detail.transportConfigs)[0] ?? "";
}

function prettyTransportLabel(transport: string) {
  if (transport === "stdio") return "stdio";
  if (transport === "streamable_http") return "streamable_http";
  if (transport === "sse") return "sse";
  return transport || "unknown";
}

export function InstallDialog({
  detail,
  onImport,
  onClose,
}: InstallDialogProps) {
  const defaultTransport = preferredTransport(detail);
  const [selectedTransport, setSelectedTransport] = useState(defaultTransport);
  const [importing, setImporting] = useState(false);

  const currentConfig = detail.transportConfigs[selectedTransport] ??
    detail.transportConfigs[defaultTransport];

  async function handleInstall() {
    if (!currentConfig) {
      toast("当前传输方式没有可导入的配置", "warning");
      return;
    }
    setImporting(true);
    try {
      await onImport({
        name: detail.name,
        config: currentConfig,
        sourceUrl: detail.fromSiteUrl ?? detail.pageUrl ?? null,
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(`安装失败：${message}`, "error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            安装 {detail.chineseName || detail.name}
          </h3>
          <button
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1 text-xs text-gray-400">服务名</p>
            <p className="text-sm text-gray-200">{detail.name}</p>
          </div>

          {detail.originalAbstract && (
            <p className="text-xs leading-5 text-gray-400">
              {detail.originalAbstract}
            </p>
          )}

          {Object.keys(detail.transportConfigs).length > 1 && (
            <div>
              <p className="mb-1.5 text-xs text-gray-400">传输方式</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(detail.transportConfigs).map((transport) => (
                  <button
                    key={transport}
                    type="button"
                    onClick={() => setSelectedTransport(transport)}
                    className={`rounded-full border px-2 py-1 text-[10px] font-mono transition ${
                      selectedTransport === transport
                        ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200"
                        : "border-gray-700 bg-gray-950 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                    }`}
                  >
                    {prettyTransportLabel(transport)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs text-gray-400">导入配置</p>
            <pre className="max-h-[200px] overflow-auto rounded-xl border border-gray-800 bg-gray-950/80 px-3 py-2 font-mono text-[11px] leading-5 text-gray-300">
              {currentConfig
                ? JSON.stringify(currentConfig, null, 2)
                : "当前传输方式没有可导入配置。"}
            </pre>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            取消
          </button>
          <button
            onClick={() => void handleInstall()}
            disabled={importing || !currentConfig}
            className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            确认安装
          </button>
        </div>
      </div>
    </div>
  );
}
