import type {
  LocalizedOnlineSkillDetail,
  SkillSourceMeta,
  SkillTargetConfig,
  SkillsCatalogSnapshot,
  SkillsCommandAction,
  SkillsCommandRequest,
  SkillsCommandResult,
} from "../../types";
import type { BuiltinSkillTarget } from "./types";

// ─── Persistence keys ───────────────────────────────────────────────

export const SKILL_TARGETS_KEY = "ai-modal-skill-targets";
export const SKILL_TARGETS_DB_KEY = "skill_targets";
export const SKILLS_CATALOG_KEY = "ai-modal-skills-catalog";
export const SKILLS_CATALOG_DB_KEY = "skills_catalog";
export const SKILL_SOURCES_KEY = "ai-modal-skill-sources";
export const SKILL_SOURCES_DB_KEY = "skills_sources";
export const SKILL_ENRICHMENTS_KEY = "ai-modal-skill-enrichments";
export const SKILL_ENRICHMENTS_DB_KEY = "skill_enrichments";
export const INSTALLED_SKILL_SNAPSHOTS_KEY =
  "ai-modal-installed-skill-snapshots";
export const INSTALLED_SKILL_SNAPSHOTS_DB_KEY = "installed_skill_snapshots";
export const LOCALIZED_ONLINE_SKILL_DETAILS_KEY =
  "ai-modal-localized-online-skill-details";
export const LOCALIZED_ONLINE_SKILL_DETAILS_DB_KEY =
  "localized_online_skill_details";
export const MODEL_CONFIG_KEY = "ai-modal-model-config";
export const MODEL_CONFIG_DB_KEY = "model_config";
export const ONLINE_SKILL_DETAIL_PREFETCH_CONCURRENCY = 4;

// ─── Built-in targets ───────────────────────────────────────────────

export const BUILTIN_TARGETS: BuiltinSkillTarget[] = [
  {
    id: "codex",
    label: "Codex",
    relativePath: ".codex/skills",
    accentClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  },
  {
    id: "claude",
    label: "Claude",
    relativePath: ".claude/skills",
    accentClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  },
  {
    id: "gemini",
    label: "Gemini",
    relativePath: ".gemini/skills",
    accentClass: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200",
  },
  {
    id: "qwen",
    label: "Qwen",
    relativePath: ".qwen/skills",
    accentClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  {
    id: "opencode",
    label: "OpenCode",
    relativePath: ".config/opencode/skills",
    accentClass: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  },
  {
    id: "snow",
    label: "Snow",
    relativePath: ".snow/skills",
    accentClass: "border-sky-500/30 bg-sky-500/10 text-sky-100",
  },
];

// ─── Pure utility functions ─────────────────────────────────────────

export function formatInstalls(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatUpdatedAt(timestamp?: number | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

export function mergeCatalogWithSources(
  catalog: SkillsCatalogSnapshot,
  sources: Record<string, SkillSourceMeta>,
): SkillsCatalogSnapshot {
  return {
    ...catalog,
    skills: catalog.skills.map((skill) => {
      const sourceMeta = sources[skill.dir];
      return {
        ...skill,
        sourceType: sourceMeta?.sourceType ?? "unknown",
        sourceValue: sourceMeta?.sourceValue ?? null,
      };
    }),
  };
}

export function toAbsolutePath(path: string, homePath: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("~/")) {
    return `${homePath}/${trimmed.slice(2)}`;
  }
  return trimmed;
}

export function buildBuiltinTargets(homePath: string): SkillTargetConfig[] {
  if (!homePath) return [];
  return BUILTIN_TARGETS.map((target) => ({
    id: target.id,
    label: target.label,
    path: `${homePath}/${target.relativePath}`,
    isBuiltin: true,
    enabled: true,
  }));
}

export function parseStoredTargets(raw: unknown): SkillTargetConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is SkillTargetConfig =>
        typeof item?.id === "string" &&
        typeof item?.label === "string" &&
        typeof item?.path === "string",
    )
    .map((item) => ({
      id: item.id,
      label: item.label,
      path: item.path,
      isBuiltin: item.isBuiltin === true,
      enabled: item.enabled !== false,
    }));
}

export function parseNameList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function sourceNeedsWildcard(source: string) {
  const trimmed = source.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") || trimmed.startsWith("~/")) return false;
  if (trimmed.includes("/tree/") && trimmed.includes("/skills/")) return false;
  return true;
}

export function describeSkillsCommand(request: SkillsCommandRequest) {
  if (request.action === "add") {
    return request.source ? `安装来源：${request.source}` : "安装技能";
  }
  if (request.action === "remove") {
    return request.skillNames?.length
      ? `移除技能：${request.skillNames.join("、")}`
      : "移除技能";
  }
  return "更新全部全局技能";
}

export function getSkillsCommandActionLabel(action: SkillsCommandAction) {
  if (action === "add") return "安装";
  if (action === "remove") return "移除";
  return "更新全部";
}

export function extractNpmConfigWarnings(stderr: string) {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const warningLines = lines.filter((line) =>
    /^npm warn Unknown (env|user) config\b/i.test(line),
  );
  return {
    warningLines,
    remainingLines: lines.filter(
      (line) => !/^npm warn Unknown (env|user) config\b/i.test(line),
    ),
  };
}

export function summarizeCommandFailure(result: SkillsCommandResult) {
  const { remainingLines, warningLines } = extractNpmConfigWarnings(
    result.stderr,
  );
  const sourceLines =
    remainingLines.length > 0
      ? remainingLines
      : result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
  const detail = sourceLines[0] ?? warningLines[0] ?? "无 stderr/stdout 详情";
  return `退出码 ${result.code ?? "未知"}，${detail}`;
}

export function createEmptyCatalog(
  sourceDir = "~/.agents/skills",
): SkillsCatalogSnapshot {
  return {
    sourceDir,
    scannedAt: null,
    totalSkills: 0,
    skills: [],
  };
}

export function createEmptySkillSources(): Record<string, SkillSourceMeta> {
  return {};
}

export function createEmptyLocalizedOnlineSkillDetails(): Record<
  string,
  LocalizedOnlineSkillDetail
> {
  return {};
}
