import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { animate, spring } from "animejs";
import { AlertTriangle } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { DetectPage } from "./components/DetectPage";
import { ModelsPage } from "./components/ModelsPage";
import { DevLog } from "./components/DevLog";
import { ToastContainer } from "./components/Toast";
import {
  CONCURRENCY_DB_KEY,
  CONCURRENCY_KEY,
  DEBUG_DB_KEY,
  DEBUG_KEY,
  SettingsPage,
} from "./components/SettingsPage";
import { ProviderDetailPage } from "./components/ProviderDetailPage";
import { PromptDetailPage } from "./components/PromptDetailPage";
import { SkillsPage } from "./components/SkillsPage";
import { loadPersistedJson, savePersistedJson } from "./lib/persistence";
import type {
  AppPage,
  ConfigPath,
  PromptRecord,
  Provider,
  ProviderLastResult,
  RulePath,
} from "./types";

const PROVIDERS_KEY = "ai-modal-providers";
const RULE_PATHS_KEY = "ai-modal-rule-paths";
const CONFIG_PATHS_KEY = "ai-modal-config-paths";
const PROMPTS_KEY = "ai-modal-prompts";
const PROVIDERS_DB_KEY = "providers";
const RULE_PATHS_DB_KEY = "rule_paths";
const CONFIG_PATHS_DB_KEY = "config_paths";
const PROMPTS_DB_KEY = "prompts";
const SORT_KEY_DB_KEY = "models_sort_key";
const SORT_DIR_DB_KEY = "models_sort_dir";
const EXPORT_DIR_DB_KEY = "recent_export_dir";
const SORT_KEY = "ai-modal-sort-key";
const SORT_DIR_KEY = "ai-modal-sort-dir";
const EXPORT_DIR_KEY = "ai-modal-model-export-dir";

const RulesPage = lazy(() =>
  import("./components/RulesPage").then((module) => ({
    default: module.RulesPage,
  })),
);
const ConfigPage = lazy(() =>
  import("./components/ConfigPage").then((module) => ({
    default: module.ConfigPage,
  })),
);
const PromptsPage = lazy(() =>
  import("./components/PromptsPage").then((module) => ({
    default: module.PromptsPage,
  })),
);

function parseProviders(raw: unknown): Provider[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: Provider & { providerType?: string }) => {
    const { providerType: _providerType, ...provider } = item;
    return provider;
  });
}

function parseRulePaths(raw: unknown): RulePath[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (
        item,
      ): item is Pick<
        RulePath,
        "id" | "label" | "path" | "isBuiltin" | "kind"
      > =>
        typeof item?.id === "string" &&
        typeof item?.label === "string" &&
        typeof item?.path === "string",
    )
    .map((item) => ({
      id: item.id,
      label: item.label,
      path: item.path,
      isBuiltin: item.isBuiltin !== false,
      kind: item.kind === "directory" ? "directory" : "file",
    }));
}

function parseConfigPaths(raw: unknown): ConfigPath[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (
        item,
      ): item is Pick<
        ConfigPath,
        "id" | "label" | "path" | "isBuiltin" | "kind" | "format"
      > =>
        typeof item?.id === "string" &&
        typeof item?.label === "string" &&
        typeof item?.path === "string",
    )
    .map((item) => ({
      id: item.id,
      label: item.label,
      path: item.path,
      isBuiltin: item.isBuiltin !== false,
      kind: "file",
      format:
        item.format === "toml"
          ? "toml"
          : item.format === "yaml"
            ? "yaml"
            : item.format === "xml"
              ? "xml"
              : "json",
    }));
}

function parsePrompts(raw: unknown): PromptRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is PromptRecord =>
        typeof item?.id === "string" &&
        typeof item?.title === "string" &&
        typeof item?.content === "string" &&
        typeof item?.category === "string" &&
        Array.isArray(item?.tags) &&
        typeof item?.note === "string" &&
        typeof item?.createdAt === "number" &&
        typeof item?.updatedAt === "number",
    )
    .map((item) => ({
      ...item,
      tags: item.tags.filter((tag): tag is string => typeof tag === "string"),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function LeaveConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (overlayRef.current) {
      animate(overlayRef.current, {
        opacity: [0, 1],
        duration: 180,
        ease: "outQuad",
      });
    }
    if (cardRef.current) {
      animate(cardRef.current, {
        opacity: [0, 1],
        translateY: [12, 0],
        scale: [0.97, 1],
        ease: spring({ stiffness: 380, damping: 22 }),
        duration: 360,
      });
    }
  }, []);

  return (
    <div
      ref={overlayRef}
      style={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60"
    >
      <div
        ref={cardRef}
        style={{ opacity: 0 }}
        className="w-[360px] rounded-2xl border border-amber-500/25 bg-gray-900 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">离开当前编辑？</h3>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              当前有未保存的改动，离开后会丢失。确认继续切换页面吗？
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
          >
            继续编辑
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:bg-amber-400"
          >
            放弃并离开
          </button>
        </div>
      </div>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-6 pb-6">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-6 py-8 text-center">
        <p className="text-sm font-medium text-gray-200">正在加载页面…</p>
        <p className="mt-2 text-xs text-gray-500">
          编辑器相关模块将按需加载，以减少首屏包体积。
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<AppPage>("detect");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [rulePaths, setRulePaths] = useState<RulePath[]>([]);
  const [configPaths, setConfigPaths] = useState<ConfigPath[]>([]);
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [editTarget, setEditTarget] = useState<Provider | null>(null);
  const [detailProviderId, setDetailProviderId] = useState<string | null>(null);
  const [detailPromptId, setDetailPromptId] = useState<string | null>(null);
  const [promptDetailMode, setPromptDetailMode] = useState<
    "detail" | "edit" | "create"
  >("detail");
  const [editingDirty, setEditingDirty] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(
    () => localStorage.getItem("ai-modal-debug") === "true",
  );
  const [pendingPage, setPendingPage] = useState<AppPage | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  function animatePage() {
    if (!mainRef.current) return;
    animate(mainRef.current, {
      opacity: [0, 1],
      translateY: [8, 0],
      ease: spring({ stiffness: 280, damping: 22 }),
      duration: 380,
    });
  }

  function applyPageChange(p: AppPage) {
    setPage(p);
    if (p !== "detect") setEditTarget(null);
  }

  function handlePageChange(p: AppPage) {
    if (p === page) return;
    if (editingDirty) {
      setPendingPage(p);
      return;
    }
    applyPageChange(p);
  }

  useEffect(() => {
    animatePage();
  }, [page]);
  useEffect(() => {
    let active = true;

    async function bootstrapStorage() {
      try {
        const [
          providersRaw,
          rulePathsRaw,
          configPathsRaw,
          promptsRaw,
          debugValue,
          concurrencyValue,
          sortKeyValue,
          sortDirValue,
          exportDirValue,
        ] = await Promise.all([
          loadPersistedJson<unknown[]>(PROVIDERS_DB_KEY, PROVIDERS_KEY, []),
          loadPersistedJson<unknown[]>(RULE_PATHS_DB_KEY, RULE_PATHS_KEY, []),
          loadPersistedJson<unknown[]>(
            CONFIG_PATHS_DB_KEY,
            CONFIG_PATHS_KEY,
            [],
          ),
          loadPersistedJson<unknown[]>(PROMPTS_DB_KEY, PROMPTS_KEY, []),
          loadPersistedJson<boolean>(
            DEBUG_DB_KEY,
            DEBUG_KEY,
            localStorage.getItem(DEBUG_KEY) === "true",
          ),
          loadPersistedJson<number>(
            CONCURRENCY_DB_KEY,
            CONCURRENCY_KEY,
            Number.parseInt(localStorage.getItem(CONCURRENCY_KEY) ?? "", 10) ||
              3,
          ),
          loadPersistedJson<string | null>(
            SORT_KEY_DB_KEY,
            SORT_KEY,
            (localStorage.getItem(SORT_KEY) as string | null) ?? null,
          ),
          loadPersistedJson<string>(
            SORT_DIR_DB_KEY,
            SORT_DIR_KEY,
            localStorage.getItem(SORT_DIR_KEY) ?? "asc",
          ),
          loadPersistedJson<string | null>(
            EXPORT_DIR_DB_KEY,
            EXPORT_DIR_KEY,
            localStorage.getItem(EXPORT_DIR_KEY),
          ),
        ]);

        if (!active) return;
        setProviders(parseProviders(providersRaw));
        setRulePaths(parseRulePaths(rulePathsRaw));
        setConfigPaths(parseConfigPaths(configPathsRaw));
        setPrompts(parsePrompts(promptsRaw));
        localStorage.setItem(DEBUG_KEY, String(debugValue));
        setDebugEnabled(debugValue);
        localStorage.setItem(CONCURRENCY_KEY, String(concurrencyValue));
        if (sortKeyValue) {
          localStorage.setItem(SORT_KEY, sortKeyValue);
        } else {
          localStorage.removeItem(SORT_KEY);
        }
        localStorage.setItem(SORT_DIR_KEY, sortDirValue);
        if (exportDirValue) {
          localStorage.setItem(EXPORT_DIR_KEY, exportDirValue);
        } else {
          localStorage.removeItem(EXPORT_DIR_KEY);
        }
      } catch (error) {
        console.error("Failed to bootstrap persisted state", error);
      } finally {
        if (active) setStorageReady(true);
      }
    }

    void bootstrapStorage();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    void savePersistedJson(PROVIDERS_DB_KEY, providers, PROVIDERS_KEY).catch(
      (error) => {
        console.error("Failed to persist providers", error);
      },
    );
  }, [providers, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    const payload = rulePaths.map(({ id, label, path, isBuiltin, kind }) => ({
      id,
      label,
      path,
      isBuiltin,
      kind,
    }));
    void savePersistedJson(RULE_PATHS_DB_KEY, payload, RULE_PATHS_KEY).catch(
      (error) => {
        console.error("Failed to persist rule paths", error);
      },
    );
  }, [rulePaths, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    const payload = configPaths.map(
      ({ id, label, path, isBuiltin, kind, format }) => ({
        id,
        label,
        path,
        isBuiltin,
        kind,
        format,
      }),
    );
    void savePersistedJson(
      CONFIG_PATHS_DB_KEY,
      payload,
      CONFIG_PATHS_KEY,
    ).catch((error) => {
      console.error("Failed to persist config paths", error);
    });
  }, [configPaths, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    void savePersistedJson(PROMPTS_DB_KEY, prompts, PROMPTS_KEY).catch(
      (error) => {
        console.error("Failed to persist prompts", error);
      },
    );
  }, [prompts, storageReady]);

  function handleAddProvider(
    data: Omit<Provider, "id" | "createdAt" | "lastResult">,
  ) {
    const p: Provider = {
      ...data,
      id: Date.now().toString(),
      createdAt: Date.now(),
    };
    setProviders((prev) => [...prev, p]);
    return p.id;
  }

  function handleEditProvider(
    id: string,
    data: Omit<Provider, "id" | "createdAt" | "lastResult">,
  ) {
    setProviders((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const configChanged =
          p.baseUrl !== data.baseUrl || p.apiKey !== data.apiKey;
        return {
          ...p,
          ...data,
          lastResult: configChanged ? undefined : p.lastResult,
        };
      }),
    );
  }

  function handleDeleteProvider(id: string) {
    if (detailProviderId === id) {
      setDetailProviderId(null);
      if (page === "provider-detail") {
        setPage("models");
      }
    }
    setProviders((prev) => prev.filter((p) => p.id !== id));
  }

  function handleSaveResult(id: string, result: ProviderLastResult) {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, lastResult: result } : p)),
    );
  }

  function handleEditFromList(provider: Provider) {
    setEditTarget(provider);
    setPage("detect");
  }

  function handleOpenProviderDetail(provider: Provider) {
    setDetailProviderId(provider.id);
    setPage("provider-detail");
  }

  function handleOpenPromptDetail(
    promptId: string | null,
    mode: "detail" | "edit" | "create",
  ) {
    setDetailPromptId(promptId);
    setPromptDetailMode(mode);
    setPage("prompt-detail");
  }

  function handleSavePrompt(nextPrompt: PromptRecord) {
    setPrompts((prev) => {
      const exists = prev.some((item) => item.id === nextPrompt.id);
      const next = exists
        ? prev.map((item) => (item.id === nextPrompt.id ? nextPrompt : item))
        : [nextPrompt, ...prev];
      return [...next].sort((a, b) => b.updatedAt - a.updatedAt);
    });
    setDetailPromptId(nextPrompt.id);
    setPromptDetailMode("detail");
    setPage("prompt-detail");
  }

  function handleDeletePrompt(promptId: string) {
    setPrompts((prev) => prev.filter((item) => item.id !== promptId));
    if (detailPromptId === promptId) {
      setDetailPromptId(null);
      setPromptDetailMode("detail");
      setPage("prompts");
    }
  }

  function handleImportProviders(imported: Provider[]) {
    setProviders((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const newOnes = imported.filter((p) => !existingIds.has(p.id));
      return [...prev, ...newOnes];
    });
  }

  function handleRulePathChange(id: string, path: string) {
    setRulePaths((prev) => {
      const current = prev.find((item) => item.id === id);
      const next = prev.filter((item) => item.id !== id);
      return [
        ...next,
        {
          id,
          label: current?.label ?? id,
          path,
          isBuiltin: current?.isBuiltin ?? true,
          kind: current?.kind ?? "file",
        },
      ];
    });
  }

  function handleAddRulePath(input: {
    label: string;
    path: string;
    kind?: "file" | "directory";
  }) {
    setRulePaths((prev) => {
      const next = prev;
      return [
        ...next,
        {
          id: `custom-${Date.now()}`,
          label: input.label.trim(),
          path: input.path.trim(),
          isBuiltin: false,
          kind: input.kind ?? "file",
        },
      ];
    });
  }

  function handleDeleteRulePath(id: string) {
    setRulePaths((prev) => prev.filter((item) => item.id !== id));
  }

  function handleUpsertConfigPath(next: ConfigPath) {
    setConfigPaths((prev) => {
      const rest = prev.filter((item) => item.id !== next.id);
      return [...rest, next];
    });
  }

  function handleDeleteConfigPath(id: string) {
    setConfigPaths((prev) => prev.filter((item) => item.id !== id));
  }

  const availableCount = providers.filter((p) =>
    p.lastResult?.results.some((r) => r.available),
  ).length;

  return (
    <div className="flex h-screen bg-gray-950 text-gray-200 overflow-hidden">
      <Sidebar
        page={page}
        onPageChange={handlePageChange}
        modelCount={providers.length}
        availableCount={availableCount}
      />
      <main ref={mainRef} className="flex-1 min-h-0 overflow-hidden pt-7">
        {page === "detect" && (
          <DetectPage
            providers={providers}
            editTarget={editTarget}
            onClearEditTarget={() => setEditTarget(null)}
            onAddProvider={handleAddProvider}
            onEditProvider={handleEditProvider}
            onDeleteProvider={handleDeleteProvider}
            onSaveResult={handleSaveResult}
            onDirtyChange={setEditingDirty}
            onOpenModels={() => handlePageChange("models")}
          />
        )}
        {page === "models" && (
          <ModelsPage
            providers={providers}
            onEdit={handleEditFromList}
            onDelete={handleDeleteProvider}
            onSaveResult={handleSaveResult}
            onImport={handleImportProviders}
            onGoDetect={() => handlePageChange("detect")}
            onOpenDetail={handleOpenProviderDetail}
          />
        )}
        {page === "provider-detail" && (
          <ProviderDetailPage
            provider={
              providers.find((item) => item.id === detailProviderId) ?? null
            }
            onBack={() => handlePageChange("models")}
            onEdit={handleEditFromList}
            onDelete={handleDeleteProvider}
            onSaveResult={handleSaveResult}
          />
        )}
        {page === "skills" && <SkillsPage onDirtyChange={setEditingDirty} />}
        {page === "prompts" && (
          <Suspense fallback={<PageFallback />}>
            <PromptsPage
              prompts={prompts}
              onCreate={() => handleOpenPromptDetail(null, "create")}
              onOpenDetail={handleOpenPromptDetail}
              onDelete={handleDeletePrompt}
              onImport={setPrompts}
            />
          </Suspense>
        )}
        {page === "prompt-detail" && (
          <PromptDetailPage
            prompt={
              detailPromptId == null
                ? null
                : prompts.find((item) => item.id === detailPromptId) ?? null
            }
            mode={promptDetailMode}
            availableCategories={Array.from(
              new Set(prompts.flatMap((item) => item.category.split(/\s*\/\s*/))),
            ).filter(Boolean)}
            onBack={() => handlePageChange("prompts")}
            onSave={handleSavePrompt}
            onDelete={handleDeletePrompt}
            onDirtyChange={setEditingDirty}
          />
        )}
        {page === "settings" && (
          <SettingsPage
            debugEnabled={debugEnabled}
            onDebugChange={setDebugEnabled}
          />
        )}
        {page === "rules" && (
          <Suspense fallback={<PageFallback />}>
            <RulesPage
              storedPaths={rulePaths}
              onPathChange={handleRulePathChange}
              onAddPath={handleAddRulePath}
              onDeletePath={handleDeleteRulePath}
              onDirtyChange={setEditingDirty}
            />
          </Suspense>
        )}
        {page === "configs" && (
          <Suspense fallback={<PageFallback />}>
            <ConfigPage
              providers={providers}
              storedPaths={configPaths}
              onUpsertPath={handleUpsertConfigPath}
              onDeletePath={handleDeleteConfigPath}
              onDirtyChange={setEditingDirty}
            />
          </Suspense>
        )}
      </main>
      {debugEnabled && <DevLog />}
      <ToastContainer />
      {pendingPage && (
        <LeaveConfirmDialog
          onCancel={() => setPendingPage(null)}
          onConfirm={() => {
            applyPageChange(pendingPage);
            setPendingPage(null);
          }}
        />
      )}
    </div>
  );
}
