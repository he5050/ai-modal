import { useState } from "react";
import { X } from "lucide-react";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../lib/buttonStyles";
import { FIELD_MONO_INPUT_CLASS } from "../../lib/formStyles";
import { toast } from "../../lib/toast";
import { HintTooltip } from "../HintTooltip";
import type { ModelscopeRequestProfile } from "../../types";

function parseCurlCommand(curlText: string): ModelscopeRequestProfile {
  const profile: ModelscopeRequestProfile = { extraHeaders: {} };
  const cookieMatch =
    curlText.match(/-b\s+'([^']+)'/s) ?? curlText.match(/-b\s+"([^"]+)"/s);
  const headerMatches = [
    ...curlText.matchAll(/-H\s+'([^']+)'/gs),
    ...curlText.matchAll(/-H\s+"([^"]+)"/gs),
  ];
  if (cookieMatch?.[1]) profile.cookie = cookieMatch[1];
  for (const match of headerMatches) {
    const raw = match[1];
    const separator = raw.indexOf(":");
    if (separator <= 0) continue;
    const key = raw.slice(0, separator).trim().toLowerCase();
    const value = raw.slice(separator + 1).trim();
    if (key === "x-csrf-token") profile.csrfToken = value;
    else if (key === "user-agent") profile.userAgent = value;
    else if (key === "referer") profile.referer = value;
    else if (key === "origin") profile.origin = value;
    else if (key === "accept-language") profile.acceptLanguage = value;
    else if (key === "x-modelscope-accept-language")
      profile.xModelscopeAcceptLanguage = value;
    else if (key === "x-modelscope-trace-id") profile.traceId = value;
    else if (key === "bx-v") profile.bxVersion = value;
    if (profile.extraHeaders) {
      profile.extraHeaders[key] = value;
    }
  }
  return profile;
}

interface RequestConfigDialogProps {
  requestProfile: ModelscopeRequestProfile;
  onApply: (profile: ModelscopeRequestProfile) => void;
  onClose: () => void;
}

export function RequestConfigDialog({
  requestProfile,
  onApply,
  onClose,
}: RequestConfigDialogProps) {
  const [curlDraft, setCurlDraft] = useState("");

  function handleParse() {
    const next = parseCurlCommand(curlDraft);
    onApply(next);
    toast("已解析请求配置", "success");
  }

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-base font-semibold text-white">请求配置</h3>
            <HintTooltip content="粘贴浏览器 curl 命令来解析 Cookie、CSRF Token 等请求头，用于访问 ModelScope 社区 API。" />
          </div>
          <button onClick={onClose} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1 text-xs text-gray-400">
              粘贴浏览器里的 curl 命令
            </p>
            <textarea
              value={curlDraft}
              onChange={(event) => setCurlDraft(event.target.value)}
              placeholder={`curl 'https://modelscope.cn/api/v1/...' \\\n  -H 'cookie: ...' \\\n  -H 'x-csrf-token: ...'`}
              className={`${FIELD_MONO_INPUT_CLASS} min-h-[140px] w-full resize-y`}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-800/60 bg-gray-950/40 px-3 py-2">
            <span className="text-[11px] text-gray-500">
              {requestProfile.cookie ? "已配置 Cookie" : "未配置请求 Cookie"}
              {requestProfile.csrfToken ? " · 已配置 CSRF" : ""}
            </span>
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
            onClick={handleParse}
            className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            解析并应用
          </button>
        </div>
      </div>
    </div>
  );
}
