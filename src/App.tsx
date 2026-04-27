import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { animate, spring } from "animejs";
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
import { loadPersistedJson } from "./lib/persistence";
import { LeaveConfirmDialog, PageFallback } from "./components/shared/LeaveConfirmDialog";
import { useProviders } from "./hooks/useProviders";
import { usePrompts } from "./hooks/usePrompts";
import { useRulePaths } from "./hooks/useRulePaths";
import { useConfigPaths } from "./hooks/useConfigPaths";
import { toast } from "./lib/toast";
import type {
  AppPage,
  Provider,
  SkillEnrichmentJobSnapshot,
} from "./types";

const RulesPage = lazy(() =>
  import("./components/RulesPage").then((m) => ({ default: m.RulesPage })),
);
const ConfigPage = lazy(() =>
  import("./components/ConfigPage").then((m) => ({ default: m.ConfigPage })),
);
const PromptsPage = lazy(() =>
  import("./components/PromptsPage").then((m) => ({ default: m.PromptsPage })),
);

const SORT_KEY_DB_KEY = "models_sort_key";
const SORT_DIR_DB_KEY = "models_sort_dir";
const EXPORT_DIR_DB_KEY = "recent_export_dir";
const SORT_KEY = "ai-modal-sort-key";
const SORT_DIR_KEY = "ai-modal-sort-dir";
const EXPORT_DIR_KEY = "ai-modal-model-export-dir";

export default function App() {
  const [page, setPage] = useState<AppPage>("detect");
  const [editTarget, setEditTarget] = useState<Provider | null>(null);
  const [detailProviderId, setDetailProviderId] = useState<string | null>(null);
  const [detailPromptId, setDetailPromptId] = useState<string | null>(null);
  const [promptDetailMode, setPromptDetailMode] = useState<"detail" | "edit" | "create">("detail");
  const [editingDirty, setEditingDirty] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(
    () => localStorage.getItem("ai-modal-debug") === "true",
  );
  const [pendingPage, setPendingPage] = useState<AppPage | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const {
    providers,
    addProvider,
    editProvider,
    deleteProvider,
    saveResult,
    importProviders,
  } = useProviders();

  const {
    prompts,
    savePrompt,
    deletePrompt,
    importPrompts: setPrompts,
  } = usePrompts();

  const {
    rulePaths,
    changePath: handleRulePathChange,
    addPath: handleAddRulePath,
    deletePath: handleDeleteRulePath,
  } = useRulePaths();

  const {
    configPaths,
    upsertPath: handleUpsertConfigPath,
    deletePath: handleDeleteConfigPath,
  } = useConfigPaths();

  // ─── Bootstrap settings that live in localStorage but sync to SQLite ──

  useEffect(() => {
    let active = true;
    Promise.all([
      loadPersistedJson<boolean>(DEBUG_DB_KEY, DEBUG_KEY, localStorage.getItem(DEBUG_KEY) === "true"),
      loadPersistedJson<number>(CONCURRENCY_DB_KEY, CONCURRENCY_KEY, Number.parseInt(localStorage.getItem(CONCURRENCY_KEY) ?? "", 10) || 3),
      loadPersistedJson<string | null>(SORT_KEY_DB_KEY, SORT_KEY, (localStorage.getItem(SORT_KEY) as string | null) ?? null),
      loadPersistedJson<string>(SORT_DIR_DB_KEY, SORT_DIR_KEY, localStorage.getItem(SORT_DIR_KEY) ?? "asc"),
      loadPersistedJson<string | null>(EXPORT_DIR_DB_KEY, EXPORT_DIR_KEY, localStorage.getItem(EXPORT_DIR_KEY)),
    ]).then(([debug, concurrency, sortKey, sortDir, exportDir]) => {
      if (!active) return;
      localStorage.setItem(DEBUG_KEY, String(debug));
      setDebugEnabled(debug);
      localStorage.setItem(CONCURRENCY_KEY, String(concurrency));
      if (sortKey) localStorage.setItem(SORT_KEY, sortKey); else localStorage.removeItem(SORT_KEY);
      localStorage.setItem(SORT_DIR_KEY, sortDir);
      if (exportDir) localStorage.setItem(EXPORT_DIR_KEY, exportDir); else localStorage.removeItem(EXPORT_DIR_KEY);
    });
    return () => { active = false; };
  }, []);

  // ─── Page navigation ──────────────────────────────────────────────

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
    if (editingDirty) { setPendingPage(p); return; }
    applyPageChange(p);
  }

  useEffect(() => { animatePage(); }, [page]);

  // ─── Derived handlers ─────────────────────────────────────────────

  function handleEditFromList(provider: Provider) {
    setEditTarget(provider);
    setPage("detect");
  }

  function handleOpenProviderDetail(provider: Provider) {
    setDetailProviderId(provider.id);
    setPage("provider-detail");
  }

  function handleOpenPromptDetail(promptId: string | null, mode: "detail" | "edit" | "create") {
    setDetailPromptId(promptId);
    setPromptDetailMode(mode);
    setPage("prompt-detail");
  }

  function handleSavePrompt(nextPrompt: import("./types").PromptRecord) {
    savePrompt(nextPrompt);
    setDetailPromptId(nextPrompt.id);
    setPromptDetailMode("detail");
    setPage("prompt-detail");
  }

  function handleDeletePrompt(promptId: string) {
    deletePrompt(promptId);
    if (detailPromptId === promptId) {
      setDetailPromptId(null);
      setPromptDetailMode("detail");
      setPage("prompts");
    }
  }

  function handleDeleteProvider(id: string) {
    deleteProvider(id);
    if (detailProviderId === id && page === "provider-detail") {
      setDetailProviderId(null);
      setPage("models");
    }
  }

  // ─── Skill enrichment notifications ────────────────────────────────

  const lastSkillEnrichmentNoticeRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || typeof (window as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ === "undefined") return;
    let unlisten: (() => void) | null = null;
    void listen<SkillEnrichmentJobSnapshot>("skill-enrichment-progress", (event) => {
      const snapshot = event.payload;
      if (snapshot.status !== "done" && snapshot.status !== "error" && snapshot.status !== "stopped") return;
      const noticeKey = `${snapshot.runId}:${snapshot.status}`;
      if (lastSkillEnrichmentNoticeRef.current === noticeKey) return;
      lastSkillEnrichmentNoticeRef.current = noticeKey;
      if (snapshot.status === "done") {
        if (snapshot.errorMessage) { toast(snapshot.errorMessage, "warning"); return; }
        toast("技能注解完成", "success"); return;
      }
      if (snapshot.status === "error") { toast(`技能注解失败：${snapshot.errorMessage || snapshot.message}`, "error"); return; }
      toast("技能注解已停止", "info");
    }).then((dispose) => { unlisten = dispose; });
    return () => { unlisten?.(); };
  }, []);

  // ─── Render ───────────────────────────────────────────────────────

  const availableCount = providers.filter((p) => p.lastResult?.results.some((r) => r.available)).length;

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
            onAddProvider={addProvider}
            onEditProvider={editProvider}
            onDeleteProvider={handleDeleteProvider}
            onSaveResult={saveResult}
            onDirtyChange={setEditingDirty}
            onOpenModels={() => handlePageChange("models")}
          />
        )}
        {page === "models" && (
          <ModelsPage
            providers={providers}
            onEdit={handleEditFromList}
            onDelete={handleDeleteProvider}
            onSaveResult={saveResult}
            onImport={importProviders}
            onGoDetect={() => handlePageChange("detect")}
            onOpenDetail={handleOpenProviderDetail}
          />
        )}
        {page === "provider-detail" && (
          <ProviderDetailPage
            provider={providers.find((item) => item.id === detailProviderId) ?? null}
            onBack={() => handlePageChange("models")}
            onEdit={handleEditFromList}
            onDelete={handleDeleteProvider}
            onSaveResult={saveResult}
          />
        )}
        {page === "skills" && (
          <SkillsPage
            providers={providers}
            onDirtyChange={setEditingDirty}
          />
        )}
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
            prompt={detailPromptId == null ? null : prompts.find((item) => item.id === detailPromptId) ?? null}
            mode={promptDetailMode}
            availableTags={Array.from(new Set(prompts.flatMap((item) => item.tags))).filter(Boolean)}
            onBack={() => handlePageChange("prompts")}
            onSave={handleSavePrompt}
            onDelete={handleDeletePrompt}
            onDirtyChange={setEditingDirty}
          />
        )}
        {page === "settings" && (
          <SettingsPage
            providers={providers}
            debugEnabled={debugEnabled}
            onDebugChange={setDebugEnabled}
            onDirtyChange={setEditingDirty}
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
