import { useEffect, useMemo, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Download,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCcw,
  Search,
} from "lucide-react";
import {
  extractModelscopeMcpServer,
  inspectModelscopeMcpServer,
  searchModelscopeMcpServers,
} from "../../api";
import type {
  McpServerConfigInput,
  ModelscopeMcpServerDetail,
  ModelscopeMcpServerSummary,
} from "../../types";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../lib/buttonStyles";
import { FIELD_INPUT_CLASS, FIELD_MONO_INPUT_CLASS } from "../../lib/formStyles";
import { loadPersistedJson, savePersistedJson } from "../../lib/persistence";
import { toast } from "../../lib/toast";
import { HintTooltip } from "../HintTooltip";
import type { ModelscopeRequestProfile } from "../../types";

const MODELSCOPE_REQUEST_PROFILE_KEY = "ai-modal-modelscope-request-profile";
const MODELSCOPE_REQUEST_PROFILE_DB_KEY = "modelscope_request_profile";

interface ModelscopeOnlineInstallPanelProps {
  existingServerNames: Set<string>;
  onImportServer: (payload: {
    name: string;
    config: McpServerConfigInput;
    sourceUrl?: string | null;
  }) => Promise<void>;
}

function preferredTransport(detail: ModelscopeMcpServerDetail | null) {
  if (!detail) return "";
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

function transportPreview(config: McpServerConfigInput | undefined) {
  if (!config) return "当前运输方式没有可导入配置。";
  return `${JSON.stringify(config, null, 2)}\n`;
}

function parseCurlCommand(curlText: string): ModelscopeRequestProfile {
  const profile: ModelscopeRequestProfile = { extraHeaders: {} };
  const cookieMatch = curlText.match(/-b\s+'([^']+)'/s) ?? curlText.match(/-b\s+"([^"]+)"/s);
  const headerMatches = [...curlText.matchAll(/-H\s+'([^']+)'/gs), ...curlText.matchAll(/-H\s+"([^"]+)"/gs)];
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
    else if (key === "x-modelscope-accept-language") profile.xModelscopeAcceptLanguage = value;
    else if (key === "x-modelscope-trace-id") profile.traceId = value;
    else if (key === "bx-v") profile.bxVersion = value;
    if (profile.extraHeaders) {
      profile.extraHeaders[key] = value;
    }
  }
  return profile;
}

export function ModelscopeOnlineInstallPanel({
  existingServerNames,
  onImportServer,
}: ModelscopeOnlineInstallPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchDuration, setSearchDuration] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<ModelscopeMcpServerSummary[]>([]);
  const [searchNonce, setSearchNonce] = useState(0);
  const [requestProfile, setRequestProfile] = useState<ModelscopeRequestProfile>({});
  const [curlDraft, setCurlDraft] = useState("");
  const [selectedServerId, setSelectedServerId] = useState("");
  const [details, setDetails] = useState<Record<string, ModelscopeMcpServerDetail>>({});
  const [loadingDetailIds, setLoadingDetailIds] = useState<Set<string>>(new Set());
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [selectedTransport, setSelectedTransport] = useState("");
  const [extractUrl, setExtractUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPersistedJson<ModelscopeRequestProfile>(
      MODELSCOPE_REQUEST_PROFILE_DB_KEY,
      MODELSCOPE_REQUEST_PROFILE_KEY,
      {},
    ).then((profile) => {
      if (!active) return;
      setRequestProfile(profile ?? {});
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void savePersistedJson(
      MODELSCOPE_REQUEST_PROFILE_DB_KEY,
      requestProfile,
      MODELSCOPE_REQUEST_PROFILE_KEY,
    );
  }, [requestProfile]);

  const selectedSummary = useMemo(
    () => searchResults.find((item) => item.id === selectedServerId) ?? null,
    [searchResults, selectedServerId],
  );
  const selectedDetail = selectedServerId ? details[selectedServerId] ?? null : null;

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoadingSearch(true);
      setSearchError(null);
      try {
        const response = await searchModelscopeMcpServers(
          searchQuery.trim(),
          30,
          requestProfile,
        );
        setSearchResults(response.servers);
        setSearchDuration(response.durationMs);
        setSelectedServerId((prev) =>
          response.servers.some((item) => item.id === prev)
            ? prev
            : (response.servers[0]?.id ?? ""),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSearchResults([]);
        setSearchDuration(null);
        setSelectedServerId("");
        setSearchError(message);
      } finally {
        setLoadingSearch(false);
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [requestProfile, searchNonce, searchQuery]);

  useEffect(() => {
    const summary = selectedSummary;
    if (!summary) return;
    const currentSummary = summary;
    if (details[currentSummary.id] || loadingDetailIds.has(currentSummary.id)) return;

    let cancelled = false;
    async function loadDetail() {
      setLoadingDetailIds((prev) => {
        const next = new Set(prev);
        next.add(currentSummary.id);
        return next;
      });
      setDetailErrors((prev) => {
        const next = { ...prev };
        delete next[currentSummary.id];
        return next;
      });

      try {
        const detail = await inspectModelscopeMcpServer(
          currentSummary.path,
          currentSummary.name,
          requestProfile,
        );
        if (cancelled) return;
        setDetails((prev) => ({ ...prev, [currentSummary.id]: detail }));
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setDetailErrors((prev) => ({ ...prev, [currentSummary.id]: message }));
      } finally {
        if (!cancelled) {
          setLoadingDetailIds((prev) => {
            const next = new Set(prev);
            next.delete(currentSummary.id);
            return next;
          });
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [details, loadingDetailIds, requestProfile, selectedSummary]);

  useEffect(() => {
    setSelectedTransport(preferredTransport(selectedDetail));
  }, [selectedDetail]);

  async function handleImportDetail(detail: ModelscopeMcpServerDetail) {
    const transport = selectedTransport || preferredTransport(detail);
    const config =
      detail.transportConfigs[transport] ??
      detail.transportConfigs[preferredTransport(detail)];
    if (!config) {
      toast("当前服务没有可导入的配置", "warning");
      return;
    }

    setImporting(true);
    try {
      await onImportServer({
        name: detail.name,
        config,
        sourceUrl: detail.fromSiteUrl ?? detail.pageUrl ?? null,
      });
    } finally {
      setImporting(false);
    }
  }

  async function handleExtractImport() {
    const trimmedUrl = extractUrl.trim();
    if (!trimmedUrl) {
      toast("请先输入要提取的 MCP URL", "warning");
      return;
    }

    setExtracting(true);
    try {
      const detail = await extractModelscopeMcpServer(trimmedUrl, requestProfile);
      const transport = preferredTransport(detail);
      const config = detail.transportConfigs[transport];
      if (!config) {
        toast("提取成功，但没有可导入的配置", "warning");
        return;
      }
      await onImportServer({
        name: detail.name,
        config,
        sourceUrl: trimmedUrl,
      });
      setExtractUrl("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(`URL 提取失败：${message}`, "error");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/80 px-5 py-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-medium text-gray-100">在线安装</h3>
            <HintTooltip content="从 ModelScope 社区搜索 MCP 服务，查看配置详情，并直接导入到当前 ~/.agents/mcp.config.json 源配置。" />
          </div>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            优先走社区搜索；如果搜索受限，也可以直接粘贴 GitHub / npm /
            ModelScope 页面 URL 做配置提取。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void openPath("https://www.modelscope.cn/mcp")}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <Globe className="h-3.5 w-3.5" />
            打开社区
          </button>
          <button
            onClick={() => setSearchNonce((prev) => prev + 1)}
            disabled={loadingSearch}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            {loadingSearch ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
            刷新
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-800/70 bg-black/15 px-4 py-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索 ModelScope 社区 MCP..."
              className={`${FIELD_MONO_INPUT_CLASS} pl-9`}
            />
          </div>
          <div className="flex min-w-[280px] gap-2">
            <input
              value={extractUrl}
              onChange={(event) => setExtractUrl(event.target.value)}
              placeholder="粘贴 GitHub / npm / ModelScope URL"
              className={`${FIELD_INPUT_CLASS} flex-1`}
            />
            <button
              onClick={() => void handleExtractImport()}
              disabled={extracting}
              className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              {extracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              提取并导入
            </button>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-gray-500">
          {loadingSearch ? (
            "正在查询社区 MCP..."
          ) : searchDuration != null ? (
            `${searchResults.length} 个结果 · ${searchDuration}ms`
          ) : (
            "默认自动加载社区列表。"
          )}
        </div>
        {searchError && (
          <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200">
            {searchError}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-gray-800/70 bg-black/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-gray-400">请求配置</div>
          <button
            onClick={() => {
              const next = parseCurlCommand(curlDraft);
              setRequestProfile(next);
              toast("已解析请求配置", "success");
            }}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            解析 curl
          </button>
        </div>
        <textarea
          value={curlDraft}
          onChange={(event) => setCurlDraft(event.target.value)}
          placeholder="粘贴浏览器里的 curl（可选）"
          className={`${FIELD_MONO_INPUT_CLASS} mt-2 min-h-[110px] w-full resize-y`}
        />
        <div className="mt-2 text-[11px] text-gray-500">
          {requestProfile.cookie ? "已配置 Cookie" : "未配置请求 Cookie"}
          {requestProfile.csrfToken ? " · 已配置 CSRF" : ""}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-2">
          {searchResults.length === 0 && !loadingSearch ? (
            <div className="rounded-xl border border-dashed border-gray-800 bg-black/10 px-4 py-8 text-sm text-gray-500">
              当前没有可展示的社区 MCP 结果。
            </div>
          ) : (
            searchResults.map((server) => {
              const active = server.id === selectedServerId;
              const installed = existingServerNames.has(server.name);
              return (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => setSelectedServerId(server.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-indigo-500/50 bg-indigo-500/10"
                      : "border-gray-800 bg-black/10 hover:border-gray-700 hover:bg-gray-900/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-100">
                          {server.name}
                        </span>
                        {server.chineseName && (
                          <span className="truncate text-xs text-gray-400">
                            {server.chineseName}
                          </span>
                        )}
                        {installed && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
                            已在源配置
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {server.path}
                      </div>
                      {server.originalAbstract && (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-300">
                          {server.originalAbstract}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {server.transportTypes.map((transport) => (
                          <span
                            key={`${server.id}-${transport}`}
                            className="rounded-full border border-gray-700 bg-gray-950 px-1.5 py-0.5 font-mono text-[10px] text-gray-400"
                          >
                            {prettyTransportLabel(transport)}
                          </span>
                        ))}
                        {server.tags.slice(0, 3).map((tag) => (
                          <span
                            key={`${server.id}-${tag}`}
                            className="rounded-full border border-gray-800 bg-gray-900 px-1.5 py-0.5 text-[10px] text-gray-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-black/15 p-4">
          {selectedSummary == null ? (
            <div className="text-sm text-gray-500">选择左侧服务查看详情。</div>
          ) : loadingDetailIds.has(selectedSummary.id) ? (
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载社区详情...
            </div>
          ) : detailErrors[selectedSummary.id] ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-red-200">详情加载失败</div>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs leading-5 text-red-200">
                {detailErrors[selectedSummary.id]}
              </div>
            </div>
          ) : selectedDetail ? (
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">
                    {selectedDetail.name}
                  </h4>
                  {selectedDetail.chineseName && (
                    <span className="text-xs text-gray-400">
                      {selectedDetail.chineseName}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {selectedDetail.path}
                </div>
              </div>

              <div className="space-y-1 text-xs text-gray-300">
                {selectedDetail.originalAbstract && (
                  <p className="leading-5">{selectedDetail.originalAbstract}</p>
                )}
                {selectedDetail.fromSiteUrl && (
                  <p className="break-all text-gray-500">
                    source: {selectedDetail.fromSiteUrl}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {Object.keys(selectedDetail.transportConfigs).map((transport) => (
                  <button
                    key={`${selectedDetail.id}-${transport}`}
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

              <div>
                <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">
                  配置预览
                </div>
                <pre className="max-h-[280px] overflow-auto rounded-xl border border-gray-800 bg-gray-950/80 px-3 py-2 font-mono text-[11px] leading-5 text-gray-300">
                  {transportPreview(
                    selectedDetail.transportConfigs[selectedTransport] ??
                      selectedDetail.transportConfigs[
                        preferredTransport(selectedDetail)
                      ],
                  )}
                </pre>
              </div>

              {selectedDetail.readme && (
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">
                    Readme 摘要
                  </div>
                  <div className="max-h-[160px] overflow-auto rounded-xl border border-gray-800 bg-gray-950/60 px-3 py-2 text-xs leading-5 text-gray-300">
                    {selectedDetail.readme}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void handleImportDetail(selectedDetail)}
                  disabled={importing}
                  className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  {importing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  导入当前配置
                </button>
                <button
                  onClick={() =>
                    void openPath(
                      selectedDetail.pageUrl ||
                        selectedDetail.fromSiteUrl ||
                        "https://www.modelscope.cn/mcp",
                    )
                  }
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  打开详情页
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">暂无详情数据。</div>
          )}
        </div>
      </div>
    </section>
  );
}
