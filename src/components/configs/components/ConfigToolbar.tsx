import { ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import {
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_MD_CLASS,
} from "@/lib/buttonStyles";
import { FIELD_SELECT_CLASS } from "@/lib/formStyles";
import type { ConfigGroupId } from "@/types";
import { Input } from "../../ui";

interface ConfigToolbarProps {
  groups: Array<{ id: ConfigGroupId; label: string }>;
  selectedGroup: ConfigGroupId | null;
  selectedFile: {
    absolutePath: string;
    fileName: string;
    isBuiltin: boolean;
  } | null;
  homePath: string;
  onGroupChange: (groupId: ConfigGroupId) => void;
  onOpenDirectory: () => void;
  onOpenFile: () => void;
  onDeleteClick: () => void;
  fileExists: boolean;
}

export function ConfigToolbar({
  groups,
  selectedGroup,
  selectedFile,
  homePath,
  onGroupChange,
  onOpenDirectory,
  onOpenFile,
  onDeleteClick,
  fileExists,
}: ConfigToolbarProps) {
  return (
    <div className="grid grid-cols-[210px_minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        <select
          value={selectedGroup ?? ""}
          onChange={(event) => onGroupChange(event.target.value as ConfigGroupId)}
          aria-label="选择工具"
          className={FIELD_SELECT_CLASS}
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.label}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-0">
        <Input
          value={selectedFile ? selectedFile.absolutePath : ""}
          readOnly
          placeholder="/Users/you/.../config"
          aria-label="配置文件路径"
          mono
          className="cursor-default opacity-80"
        />
      </div>

      <div className="flex flex-nowrap items-center gap-2">
        <button onClick={onOpenDirectory} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}>
          <FolderOpen className="h-4 w-4" />
          打开目录
        </button>
        <button onClick={onOpenFile} disabled={!fileExists} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}>
          <ExternalLink className="h-4 w-4" />
          文件
        </button>
        {selectedFile && !selectedFile.isBuiltin && (
          <button onClick={onDeleteClick} className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_MD_CLASS}`}>
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        )}
      </div>
    </div>
  );
}
