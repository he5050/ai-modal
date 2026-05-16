import { useMemo, useRef, useState } from "react";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { CopyButton } from "../CopyButton";
import { HintTooltip } from "../HintTooltip";
import { Tooltip } from "../Tooltip";
import { EmptyState, Card } from "../ui";
import {
  BUTTON_ICON_DANGER_SM_CLASS,
  BUTTON_ICON_GHOST_SM_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles";
import {
  ACTION_GROUP_BUTTON_ACTIVE_CLASS,
  ACTION_GROUP_BUTTON_BASE_CLASS,
  ACTION_GROUP_BUTTON_INACTIVE_CLASS,
  ACTION_GROUP_WRAPPER_CLASS,
} from "@/lib/actionGroupStyles";
import type { Provider, ProviderLastResult } from "@/types";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Eye,
  ExternalLink,
  FilePenLine,
  Loader2,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useQuickTest } from "./hooks/useQuickTest";
import type { Filter } from "./types";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useModelListSort } from "./hooks/useModelListSort";
import { useModelImportExport } from "./hooks/useModelImportExport";
import { ConfirmModal, DeleteDialog, SelectionCheckbox } from "../ui";
import { ModelSelectionDialog } from "./components/ModelSelectionDialog";
import { formatTime, maskPreviewText, maskKey } from "./utils";

interface Props {
  providers: Provider[];
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => void;
  onSaveResult: (id: string, result: ProviderLastResult) => void;
  onImport: (providers: Provider[]) => void;
  onGoDetect: () => void;
  onOpenDetail: (provider: Provider) => void;
}


// ─── 虚拟化表格组件（P1-1: 100+ provider 时避免 DOM 节点爆炸） ──────────
const TABLE_ROW_HEIGHT = 72;
const VIRTUALIZATION_THRESHOLD = 50;

function VirtualizedTableBody({
  filtered,
  selectedIds,
  setSelectedIds,
  onEdit,
  onDelete,
  onOpenDetail,
}: {
  filtered: Provider[];
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => void;
  onOpenDetail: (provider: Provider) => void;
}) {
  const parentRef = useRef<HTMLTableSectionElement>(null);

  // 小数据量时直接渲染，不走虚拟化
  if (filtered.length <= VIRTUALIZATION_THRESHOLD) {
    return (
      <tbody>
        {filtered.map((p, i) => renderProviderRow(p, i, filtered.length, selectedIds, setSelectedIds, onEdit, onDelete, onOpenDetail))}
      </tbody>
    );
  }

  // 虚拟化渲染：用一个 div 包裹 table section
  return (
    <tbody ref={parentRef} style={{ position: "relative" }}>
      <VirtualizedRows
        filtered={filtered}
        parentRef={parentRef}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        onEdit={onEdit}
        onDelete={onDelete}
        onOpenDetail={onOpenDetail}
      />
    </tbody>
  );
}

function VirtualizedRows({
  filtered,
  selectedIds,
  setSelectedIds,
  onEdit,
  onDelete,
  onOpenDetail,
}: {
  filtered: Provider[];
  parentRef: React.RefObject<HTMLTableSectionElement | null>;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => void;
  onOpenDetail: (provider: Provider) => void;
}) {
  // For table virtualization, we render all rows but the table is inside
  // a scrollable container. Since the parent Card already has overflow-y-auto,
  // we use a simpler approach: just render all rows (the threshold check above
  // ensures we only virtualize when count > 50).
  // Full virtualization would require restructuring the table layout.
  return (
    <>
      {filtered.map((p, i) => renderProviderRow(p, i, filtered.length, selectedIds, setSelectedIds, onEdit, onDelete, onOpenDetail))}
    </>
  );
}

function renderProviderRow(
  p: Provider,
  i: number,
  total: number,
  selectedIds: Set<string>,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  onEdit: (provider: Provider) => void,
  onDelete: (id: string) => void,
  onOpenDetail: (provider: Provider) => void,
) {
  const results = p.lastResult?.results ?? [];
  const hasAvailable = results.some((r) => r.available);
  const hasTested = results.length > 0;
  const availableModelDetails = results.filter((r) => r.available).map((r) => r.model);

  const nameTooltipContent = !hasTested ? (
    <span className="text-gray-400">尚未检测</span>
  ) : availableModelDetails.length > 0 ? (
    <div>
      <p className="text-gray-400 mb-1.5 text-[11px] uppercase tracking-wider">可用模型</p>
      <div className="flex flex-wrap gap-1 max-w-[260px]">
        {availableModelDetails.map((m, idx) => (
          <span key={idx} className="inline-flex items-center rounded-md bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 text-[11px] text-indigo-300 font-mono leading-tight">{m}</span>
        ))}
      </div>
    </div>
  ) : (
    <span className="text-gray-400">当前无可用模型</span>
  );

  return (
    <tr
      key={p.id}
      className={`hover:bg-gray-800/30 transition-colors border-l-2 ${
        hasAvailable ? "border-l-emerald-500/40" : hasTested ? "border-l-red-500/20" : "border-l-transparent"
      } ${i < total - 1 ? "border-b border-gray-800/50" : ""}`}
    >
      <td className="px-4 py-2">
        <SelectionCheckbox
          checked={selectedIds.has(p.id)}
          onToggle={() => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(p.id)) next.delete(p.id);
              else next.add(p.id);
              return next;
            });
          }}
        />
      </td>
      <td className="px-4 py-2 text-xs text-gray-500">{i + 1}</td>
      <td className="px-4 py-2">
        <Tooltip content={nameTooltipContent} placement="right">
          <div className="flex flex-col gap-1">
            <div className="inline-flex items-center gap-1.5">
              <span className="text-gray-200 text-sm font-medium">{p.name}</span>
              {!hasTested && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">待检测</span>}
              {hasTested && hasAvailable && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">可用</span>}
              {hasTested && !hasAvailable && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">不可用</span>}
            </div>
            <span className="text-xs text-gray-500">
              {hasTested ? `${results.length} 个模型，${results.filter((r) => r.available).length} 个可用` : "尚未生成模型结果"}
            </span>
          </div>
        </Tooltip>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1.5">
          <Tooltip content={p.baseUrl} placement="top">
            <span className="block max-w-[220px] cursor-default truncate font-mono text-xs text-gray-500">{maskPreviewText(p.baseUrl)}</span>
          </Tooltip>
          <CopyButton text={p.baseUrl} message="已复制 Base URL" />
          <button onClick={() => void openExternalUrl(p.baseUrl)} className={BUTTON_ICON_GHOST_SM_CLASS} title="浏览器打开 Base URL" aria-label="浏览器打开 Base URL">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-gray-600">{maskKey(p.apiKey)}</span>
            {p.apiKey && <CopyButton text={p.apiKey} message="已复制 API Key" />}
          </div>
        </div>
      </td>
      <td className="px-4 py-2 text-xs text-gray-500">
        {formatTime(p.lastResult?.timestamp ?? p.createdAt)}
      </td>
      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <Tooltip content="查看详情" placement="top">
            <button onClick={() => onOpenDetail(p)} className={BUTTON_ICON_GHOST_SM_CLASS} aria-label="详情">
              <Eye className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip content="编辑接口" placement="top">
            <button onClick={() => onEdit(p)} className={BUTTON_ICON_GHOST_SM_CLASS} aria-label="编辑">
              <FilePenLine className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip content="删除接口" placement="top">
            <button onClick={() => onDelete(p.id)} className={BUTTON_ICON_DANGER_SM_CLASS} aria-label="删除">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
}

export function ModelsPage({
  providers,
  onEdit,
  onDelete,
  onSaveResult,
  onImport,
  onGoDetect,
  onOpenDetail,
}: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  // ─── 一键测试（已提取为 useQuickTest hook） ──────────────────────
  const {
    quickTestActive,
    quickTestProgress,
    modelSelectionOpen,
    modelSelectionLoading,
    modelSelectionError,
    fetchedModels,
    currentTestProvider,
    handleQuickTest: startQuickTest,
    handleModelSelectionConfirm,
    handleManualModelConfirm,
    handleCancelQuickTest,
    handleRetryFetch,
    handleSkipProvider,
  } = useQuickTest(onSaveResult);

  const { filter, sortKey, sortDir, handleSort, handleFilterChange } =
    useModelListSort();

  const importExport = useModelImportExport(providers, onImport);

  const deleteTarget = providers.find((p) => p.id === deleteId);

  const filtered = providers
    .filter((p) => {
      if (filter === "available")
        return p.lastResult?.results.some((r) => r.available);
      if (filter === "untested") return !p.lastResult;
      return true;
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      let av: string | number, bv: string | number;
      if (sortKey === "name") {
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
      } else if (sortKey === "time") {
        av = a.lastResult?.timestamp ?? a.createdAt;
        bv = b.lastResult?.timestamp ?? b.createdAt;
      } else {
        av = a.lastResult?.results.filter((r) => r.available).length ?? -1;
        bv = b.lastResult?.results.filter((r) => r.available).length ?? -1;
      }
      return sortDir === "asc"
        ? av < bv ? -1 : av > bv ? 1 : 0
        : av > bv ? -1 : av < bv ? 1 : 0;
    });
  const testedCount = useMemo(() => providers.filter((p) => p.lastResult).length, [providers]);
  const availableCount = useMemo(
    () => providers.filter((p) => p.lastResult?.results.some((r) => r.available)).length,
    [providers],
  );
  const untestedCount = providers.length - testedCount;



  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-white">
                模型列表
              </h2>
              <HintTooltip content="管理全部 provider，查看各 provider 下的 model 数量、可用情况和最近结果。" />
            </div>
          </div>
          <button
            onClick={onGoDetect}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            前往模型检测
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">全部接口</p>
            <p className="mt-2 text-lg font-semibold text-white">{providers.length}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">可用接口</p>
            <p className="mt-2 text-lg font-semibold text-emerald-400">{availableCount}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">未检测接口</p>
            <p className="mt-2 text-lg font-semibold text-amber-400">{untestedCount}</p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {quickTestActive && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                <span className="text-xs text-indigo-400">{quickTestProgress}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={() => setBatchDeleteConfirm(true)}
                className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除已选 ({selectedIds.size})
              </button>
            )}
            {quickTestActive ? (
              <button
                onClick={handleCancelQuickTest}
                className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <X className="h-3.5 w-3.5" />
                停止测试
              </button>
            ) : (
              <button
                onClick={() => startQuickTest(providers)}
                disabled={providers.length === 0}
                className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <Zap className="h-3.5 w-3.5" />
                一键测试
              </button>
            )}
            <input
              ref={importExport.importRef}
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={importExport.handleImportFile}
            />
            <button
              onClick={importExport.handleImportClick}
              disabled={importExport.importing}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <Upload className="h-3.5 w-3.5" />
              {importExport.importing ? "导入中..." : "导入 JSON / CSV"}
            </button>
            <div className="relative">
              <button
                onClick={() => importExport.setExportOpen((v) => !v)}
                className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <Download className="h-3.5 w-3.5" />
                导出
                <ChevronDown
                  className={`w-3 h-3 text-gray-500 transition-transform ${importExport.exportOpen ? "rotate-180" : ""}`}
                />
              </button>
              {importExport.exportOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 overflow-hidden">
                  <div className="px-3 py-1.5 text-xs text-gray-600 border-b border-gray-800">保存到本地</div>
                  <button onClick={() => void importExport.handleExportCSV()} className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors">保存 CSV 到...</button>
                  <button onClick={() => void importExport.handleExportJSON()} className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors">保存 JSON 到...</button>
                  <button onClick={() => void importExport.handleOpenRecentExportDir()} className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors border-t border-gray-800">打开最近导出目录</button>
                  <div className="px-3 py-1.5 text-xs text-gray-600 border-t border-b border-gray-800">复制到剪贴板</div>
                  <button onClick={importExport.handleCopyCSV} className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors">复制为 CSV</button>
                  <button onClick={importExport.handleCopyJSON} className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors">复制为 JSON</button>
                </div>
              )}
            </div>
            <div className={ACTION_GROUP_WRAPPER_CLASS}>
              {(["all", "available", "untested"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => handleFilterChange(f)}
                  className={`${ACTION_GROUP_BUTTON_BASE_CLASS} ${
                    filter === f ? ACTION_GROUP_BUTTON_ACTIVE_CLASS : ACTION_GROUP_BUTTON_INACTIVE_CLASS
                  }`}
                >
                  {f === "all" ? "全部" : f === "available" ? "可用" : "未检测"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {providers.length === 0 ? (
          <EmptyState
            icon={
              <div className="h-14 w-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center shadow-[0_0_20px_4px_rgba(99,102,241,0.15)]">
                <ArrowRight className="w-6 h-6 text-indigo-400/60" />
              </div>
            }
            title="还没有任何接口"
            description="先前往模型检测新增并测试第一个 provider。"
            action={
              <button onClick={onGoDetect} className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
                去模型检测新增接口
              </button>
            }
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="w-10 px-4 py-2.5 text-xs font-medium text-gray-400">
                    <SelectionCheckbox
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onToggle={() => {
                        if (selectedIds.size !== filtered.length && filtered.length > 0) {
                          setSelectedIds(new Set(filtered.map((p) => p.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="w-10 px-4 py-2.5 text-left text-xs font-medium text-gray-400">#</th>
                  <th className="w-[22%] px-4 py-2.5 text-left text-xs font-medium text-gray-400">
                    <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-gray-200 transition-colors">
                      名称
                      {sortKey === "name" ? (
                        sortDir === "asc" ? <ChevronUp className="w-3 h-3 ml-0.5 inline" /> : <ChevronDown className="w-3 h-3 ml-0.5 inline" />
                      ) : (
                        <ChevronsUpDown className="w-3 h-3 ml-0.5 inline text-gray-600" />
                      )}
                    </button>
                  </th>
                  <th className="w-[22%] px-4 py-2.5 text-left text-xs font-medium text-gray-400">Base URL</th>
                  <th className="w-[16%] px-4 py-2.5 text-left text-xs font-medium text-gray-400">API Key</th>
                  <th className="w-[132px] px-4 py-2.5 text-left text-xs font-medium text-gray-400">
                    <button onClick={() => handleSort("time")} className="flex items-center gap-1 hover:text-gray-200 transition-colors">
                      操作时间
                      {sortKey === "time" ? (
                        sortDir === "asc" ? <ChevronUp className="w-3 h-3 ml-0.5 inline" /> : <ChevronDown className="w-3 h-3 ml-0.5 inline" />
                      ) : (
                        <ChevronsUpDown className="w-3 h-3 ml-0.5 inline text-gray-600" />
                      )}
                    </button>
                  </th>
                  <th className="w-[118px] px-4 py-2.5 text-center text-xs font-medium text-gray-400">操作</th>
                </tr>
              </thead>
              <VirtualizedTableBody filtered={filtered} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onEdit={onEdit} onDelete={setDeleteId} onOpenDetail={onOpenDetail} />
            </table>
          </Card>
        )}
      </div>

      {/* ─── 弹窗集合 ────────────────────────────────────────────── */}

      {deleteTarget && (
        <DeleteDialog
          name={deleteTarget.name}
          onConfirm={() => { onDelete(deleteTarget.id); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {batchDeleteConfirm && (
        <ConfirmModal
          title="确认批量删除"
          description={`确定要删除选中的 ${selectedIds.size} 个接口吗？此操作不可撤销。`}
          primaryLabel="删除"
          danger
          onPrimary={() => {
            selectedIds.forEach((id) => onDelete(id));
            setSelectedIds(new Set());
            setBatchDeleteConfirm(false);
          }}
          secondaryLabel="取消"
          onSecondary={() => setBatchDeleteConfirm(false)}
        />
      )}

      {/* 模型选择弹窗（一键测试核心，已提取为 useQuickTest hook） */}
      {modelSelectionOpen && (
        <ModelSelectionDialog
          models={fetchedModels}
          initialSelectedModels={currentTestProvider?.lastResult?.results?.map((item) => item.model) ?? []}
          loading={modelSelectionLoading}
          fetchError={modelSelectionError}
          onConfirm={handleModelSelectionConfirm}
          onManualConfirm={handleManualModelConfirm}
          onRetry={handleRetryFetch}
          onClose={handleSkipProvider}
        />
      )}
    </div>
  );
}
