import { useEffect, useRef, useState } from "react";
import { animate, spring } from "animejs";
import { AlertTriangle } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { DetectPage } from "./components/DetectPage";
import { ModelsPage } from "./components/ModelsPage";
import { DevLog } from "./components/DevLog";
import { ToastContainer } from "./components/Toast";
import { SettingsPage } from "./components/SettingsPage";
import { RulesPage } from "./components/RulesPage";
import { ConfigPage } from "./components/ConfigPage";
import { ProviderDetailPage } from "./components/ProviderDetailPage";
import type {
  AppPage,
  ConfigFormat,
  ConfigPath,
  Provider,
  ProviderLastResult,
  RulePath,
} from "./types";

const PROVIDERS_KEY = "ai-modal-providers";
const RULE_PATHS_KEY = "ai-modal-rule-paths";
const CONFIG_PATHS_KEY = "ai-modal-config-paths";

function loadProviders(): Provider[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROVIDERS_KEY) ?? "");
    if (!Array.isArray(raw)) return [];
    return raw.map((item: Provider & { providerType?: string }) => {
      const { providerType: _providerType, ...provider } = item;
      return provider;
    });
  } catch {
    return [];
  }
}

function loadRulePaths(): RulePath[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RULE_PATHS_KEY) ?? "");
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
  } catch {
    return [];
  }
}

function loadConfigPaths(): ConfigPath[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG_PATHS_KEY) ?? "");
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
  } catch {
    return [];
  }
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

export default function App() {
  const [page, setPage] = useState<AppPage>("detect");
  const [providers, setProviders] = useState<Provider[]>(loadProviders);
  const [rulePaths, setRulePaths] = useState<RulePath[]>(loadRulePaths);
  const [configPaths, setConfigPaths] = useState<ConfigPath[]>(loadConfigPaths);
  const [editTarget, setEditTarget] = useState<Provider | null>(null);
  const [detailProviderId, setDetailProviderId] = useState<string | null>(null);
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
    if (p !== "detect" && editingDirty) {
      setPendingPage(p);
      return;
    }
    applyPageChange(p);
  }

  useEffect(() => {
    animatePage();
  }, [page]);
  useEffect(() => {
    localStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers));
  }, [providers]);
  useEffect(() => {
    const payload = rulePaths.map(({ id, label, path, isBuiltin, kind }) => ({
      id,
      label,
      path,
      isBuiltin,
      kind,
    }));
    localStorage.setItem(RULE_PATHS_KEY, JSON.stringify(payload));
  }, [rulePaths]);
  useEffect(() => {
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
    localStorage.setItem(CONFIG_PATHS_KEY, JSON.stringify(payload));
  }, [configPaths]);

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
      prev.map((p) => (p.id === id ? { ...p, ...data } : p)),
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

  function handleConfigPathChange(id: string, path: string) {
    setConfigPaths((prev) => {
      const current = prev.find((item) => item.id === id);
      const next = prev.filter((item) => item.id !== id);
      return [
        ...next,
        {
          id,
          label: current?.label ?? id,
          path,
          isBuiltin: current?.isBuiltin ?? true,
          kind: "file",
          format: current?.format ?? "json",
        },
      ];
    });
  }

  function handleAddConfigPath(input: {
    label: string;
    path: string;
    format?: ConfigFormat;
  }) {
    setConfigPaths((prev) => [
      ...prev,
      {
        id: `custom-config-${Date.now()}`,
        label: input.label.trim(),
        path: input.path.trim(),
        isBuiltin: false,
        kind: "file",
        format: input.format ?? "json",
      },
    ]);
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
            onSaveResult={handleSaveResult}
          />
        )}
        {page === "settings" && (
          <SettingsPage
            debugEnabled={debugEnabled}
            onDebugChange={setDebugEnabled}
          />
        )}
        {page === "rules" && (
          <RulesPage
            storedPaths={rulePaths}
            onPathChange={handleRulePathChange}
            onAddPath={handleAddRulePath}
            onDeletePath={handleDeleteRulePath}
            onDirtyChange={setEditingDirty}
          />
        )}
        {page === "configs" && (
          <ConfigPage
            storedPaths={configPaths}
            onPathChange={handleConfigPathChange}
            onAddPath={handleAddConfigPath}
            onDeletePath={handleDeleteConfigPath}
            onDirtyChange={setEditingDirty}
          />
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
