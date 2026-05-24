import { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_SM_CLASS,
} from "@/lib/buttonStyles";
import { FIELD_INPUT_CLASS } from "@/lib/formStyles";
import type { CustomProviderRecord } from "./constants";

interface CustomProviderDialogProps {
  open: boolean;
  record: CustomProviderRecord | null;
  onClose: () => void;
  onSave: (record: CustomProviderRecord) => void;
}

export default function CustomProviderDialog({
  open,
  record,
  onClose,
  onSave,
}: CustomProviderDialogProps) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    if (open) {
      if (record) {
        setName(record.name);
        setBaseUrl(record.baseUrl);
        setApiKey(record.apiKey);
        setModel(record.model);
      } else {
        setName("");
        setBaseUrl("");
        setApiKey("");
        setModel("");
      }
    }
  }, [open, record]);

  if (!open) return null;

  function handleSubmit() {
    onSave({
      id: record?.id ?? "",
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    });
    onClose();
  }

  const valid = name.trim() && baseUrl.trim() && apiKey.trim();
  const isEdit = !!record && !!record.name;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {isEdit ? "编辑自定义 Provider" : "新增自定义 Provider"}
          </h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-gray-500 hover:bg-gray-800/70 hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              名称 <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：我的 API"
              className={FIELD_INPUT_CLASS}
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              URL <span className="text-red-400">*</span>
            </label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className={`${FIELD_INPUT_CLASS} font-mono`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              API Key <span className="text-red-400">*</span>
            </label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className={`${FIELD_INPUT_CLASS} font-mono`}
              type="password"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              模型{" "}
              <span className="text-gray-600">(选填，为空时不调整模型字段)</span>
            </label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o"
              className={`${FIELD_INPUT_CLASS} font-mono`}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!valid}
            className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
