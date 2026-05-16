import { Plus } from "lucide-react";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_GHOST_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_MD_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../../lib/buttonStyles";
import { FIELD_MONO_INPUT_CLASS } from "../../../lib/formStyles";
import { HintTooltip } from "../../HintTooltip";

interface ConfigFileTab {
  id: string;
  fileName: string;
}

interface ConfigFileTabsProps {
  files: ConfigFileTab[];
  selectedFileId: string;
  showAddForm: boolean;
  newRelativePath: string;
  homePath: string;
  groupRootDir: string;
  getFileDirty: (fileId: string) => boolean;
  onSwitchFile: (fileId: string) => void;
  onShowAddForm: (show: boolean) => void;
  onNewPathChange: (path: string) => void;
  onCancelAdd: () => void;
  onSaveAdd: () => void;
  toDisplayPath: (path: string, homePath: string) => string;
  resolveGroupAbsolutePath: (homePath: string, rootDir: string, relativePath: string) => string;
}

export function ConfigFileTabs({
  files,
  selectedFileId,
  showAddForm,
  newRelativePath,
  homePath,
  groupRootDir,
  getFileDirty,
  onSwitchFile,
  onShowAddForm,
  onNewPathChange,
  onCancelAdd,
  onSaveAdd,
  toDisplayPath,
  resolveGroupAbsolutePath,
}: ConfigFileTabsProps) {
  return (
    <div className="rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-gray-200">组内文件</p>
              <HintTooltip content="左侧按工具分组，当前组内的所有配置文件都在这里以 Tab 切换。" />
            </div>
          </div>
          {!showAddForm && (
            <button onClick={() => onShowAddForm(true)} className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
              <Plus className="h-4 w-4" />
              添加文件
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {files.map((file) => {
            const fileDirty = getFileDirty(file.id);
            const isActive = file.id === selectedFileId;
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => onSwitchFile(file.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "border-indigo-500/40 bg-indigo-500/15 text-white"
                    : "border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white"
                }`}
              >
                <span>{file.fileName}</span>
                {fileDirty && (
                  <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-100">未保存</span>
                )}
              </button>
            );
          })}
        </div>

        {showAddForm && (
          <div className="mt-3 rounded-xl border border-gray-800/80 bg-black/15 px-3 py-3">
            <div className="mb-2 flex items-center justify-end gap-3">
              <button onClick={onCancelAdd} className={`${BUTTON_GHOST_CLASS} h-8 px-2 text-sm text-gray-500 hover:text-gray-300`}>
                取消
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="min-w-[280px] flex-1">
                <input value={newRelativePath} onChange={(event) => onNewPathChange(event.target.value)} placeholder="hooks/custom.json" className={FIELD_MONO_INPUT_CLASS} />
              </div>
              <button onClick={onSaveAdd} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}>
                保存
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              请输入当前组根目录下的相对路径，系统会自动解析到{" "}
              <span className="font-mono text-gray-400">{toDisplayPath(resolveGroupAbsolutePath(homePath, groupRootDir, newRelativePath), homePath)}</span>。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
