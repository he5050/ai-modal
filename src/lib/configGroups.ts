import type {
  ConfigFormat,
  ConfigGroupFileView,
  ConfigGroupId,
  ConfigGroupView,
  ConfigPath,
} from "../types";

interface BuiltinConfigGroupDefinition {
  id: ConfigGroupId;
  label: string;
  rootDir: string;
  accentClass: string;
  files: Array<{
    id: string;
    label: string;
    fileName: string;
    relativePath: string;
    homeRelativePath?: string;
    format: ConfigFormat;
  }>;
}

const BUILTIN_CONFIG_GROUPS: BuiltinConfigGroupDefinition[] = [
  {
    id: "claude",
    label: "Claude",
    rootDir: ".claude",
    accentClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
    files: [
      {
        id: "claude",
        label: "settings.json",
        fileName: "settings.json",
        relativePath: "settings.json",
        format: "json",
      },
      {
        id: "claude::settings.local.json",
        label: "settings.local.json",
        fileName: "settings.local.json",
        relativePath: "settings.local.json",
        format: "json",
      },
      {
        id: "claude::.claude.json",
        label: ".claude.json",
        fileName: ".claude.json",
        relativePath: ".claude.json",
        homeRelativePath: ".claude.json",
        format: "json",
      },
    ],
  },
  {
    id: "codex",
    label: "Codex",
    rootDir: ".codex",
    accentClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    files: [
      {
        id: "codex",
        label: "config.toml",
        fileName: "config.toml",
        relativePath: "config.toml",
        format: "toml",
      },
      {
        id: "codex::auth.json",
        label: "auth.json",
        fileName: "auth.json",
        relativePath: "auth.json",
        format: "json",
      },
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    rootDir: ".gemini",
    accentClass: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200",
    files: [
      {
        id: "gemini",
        label: ".settings.json",
        fileName: ".settings.json",
        relativePath: ".settings.json",
        format: "json",
      },
      {
        id: "gemini::.env",
        label: ".env",
        fileName: ".env",
        relativePath: ".env",
        format: "env",
      },
    ],
  },
  {
    id: "opencode",
    label: "OpenCode",
    rootDir: ".config/opencode",
    accentClass: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    files: [
      {
        id: "opencode",
        label: "opencode.json",
        fileName: "opencode.json",
        relativePath: "opencode.json",
        format: "json",
      },
    ],
  },
  {
    id: "qwen",
    label: "Qwen",
    rootDir: ".qwen",
    accentClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    files: [
      {
        id: "qwen",
        label: "settings.json",
        fileName: "settings.json",
        relativePath: "settings.json",
        format: "json",
      },
      {
        id: "qwen::mcp.json",
        label: "mcp.json",
        fileName: "mcp.json",
        relativePath: "mcp.json",
        format: "json",
      },
    ],
  },
  {
    id: "snow",
    label: "Snow",
    rootDir: ".snow",
    accentClass: "border-sky-500/30 bg-sky-500/10 text-sky-100",
    files: [
      {
        id: "snow",
        label: "active-profile.json",
        fileName: "active-profile.json",
        relativePath: "active-profile.json",
        format: "json",
      },
      {
        id: "snow::config.json",
        label: "config.json",
        fileName: "config.json",
        relativePath: "config.json",
        format: "json",
      },
      {
        id: "snow::mcp-config.json",
        label: "mcp-config.json",
        fileName: "mcp-config.json",
        relativePath: "mcp-config.json",
        format: "json",
      },
      {
        id: "snow::proxy-config.json",
        label: "proxy-config.json",
        fileName: "proxy-config.json",
        relativePath: "proxy-config.json",
        format: "json",
      },
      {
        id: "snow::system-prompt.json",
        label: "system-prompt.json",
        fileName: "system-prompt.json",
        relativePath: "system-prompt.json",
        format: "json",
      },
      {
        id: "snow::custom-headers.json",
        label: "custom-headers.json",
        fileName: "custom-headers.json",
        relativePath: "custom-headers.json",
        format: "json",
      },
      {
        id: "snow::language.json",
        label: "language.json",
        fileName: "language.json",
        relativePath: "language.json",
        format: "json",
      },
      {
        id: "snow::theme.json",
        label: "theme.json",
        fileName: "theme.json",
        relativePath: "theme.json",
        format: "json",
      },
    ],
  },
];

export function normalizeGroupRelativePath(input: string): string | null {
  const trimmed = input.trim().replace(/^\.?\//, "");
  if (!trimmed || trimmed.startsWith("/")) return null;

  const segments = trimmed.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    return null;
  }

  return segments.join("/");
}

export function resolveGroupAbsolutePath(
  homePath: string,
  rootDir: string,
  relativePath = "",
) {
  const home = homePath.replace(/\/$/, "");
  const root = rootDir.replace(/^\/+/, "");
  const relative = relativePath.replace(/^\/+/, "");
  return relative ? `${home}/${root}/${relative}` : `${home}/${root}`;
}

export function inferConfigFormatFromPath(path: string): ConfigFormat {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".env")) return "env";
  if (normalized.endsWith(".toml")) return "toml";
  if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) {
    return "yaml";
  }
  if (normalized.endsWith(".xml")) return "xml";
  return "json";
}

function toGroupRelativePath(path: string, groupRoot: string) {
  if (path === groupRoot) return "";
  if (!path.startsWith(`${groupRoot}/`)) return null;
  return path.slice(groupRoot.length + 1);
}

function resolveBuiltinFile(
  definition: BuiltinConfigGroupDefinition["files"][number],
  group: BuiltinConfigGroupDefinition,
  storedPaths: ConfigPath[],
  homePath: string,
): ConfigGroupFileView {
  const stored = storedPaths.find((item) => item.id === definition.id);
  const defaultAbsolutePath = definition.homeRelativePath
    ? resolveGroupAbsolutePath(homePath, definition.homeRelativePath)
    : resolveGroupAbsolutePath(homePath, group.rootDir, definition.relativePath);
  const absolutePath =
    stored?.path && stored.path.startsWith("/")
      ? stored.path
      : defaultAbsolutePath;
  const groupRoot = resolveGroupAbsolutePath(homePath, group.rootDir);

  return {
    id: definition.id,
    groupId: group.id,
    label: stored?.label || definition.label,
    fileName: definition.fileName,
    relativePath:
      toGroupRelativePath(absolutePath, groupRoot) ?? definition.relativePath,
    absolutePath,
    format: stored?.format ?? definition.format,
    isBuiltin: stored?.isBuiltin ?? true,
  };
}

function inferGroupIdFromAbsolutePath(
  path: string,
  homePath: string,
): ConfigGroupId | null {
  for (const group of BUILTIN_CONFIG_GROUPS) {
    const groupRoot = resolveGroupAbsolutePath(homePath, group.rootDir);
    if (path === groupRoot || path.startsWith(`${groupRoot}/`)) {
      return group.id;
    }
  }
  return null;
}

export function buildConfigGroups(storedPaths: ConfigPath[], homePath: string) {
  const groups = BUILTIN_CONFIG_GROUPS.map<ConfigGroupView>((group) => ({
    id: group.id,
    label: group.label,
    rootDir: group.rootDir,
    accentClass: group.accentClass,
    files: group.files.map((definition) =>
      resolveBuiltinFile(definition, group, storedPaths, homePath),
    ),
  }));

  for (const entry of storedPaths) {
    if (entry.isBuiltin) continue;

    const groupId = inferGroupIdFromAbsolutePath(entry.path, homePath);
    if (!groupId) continue;

    const group = groups.find((item) => item.id === groupId);
    if (!group) continue;

    const groupRoot = resolveGroupAbsolutePath(homePath, group.rootDir);
    const relativePath = toGroupRelativePath(entry.path, groupRoot);
    if (!relativePath) continue;

    const existingIndex = group.files.findIndex((file) => file.id === entry.id);
    const fileName = relativePath.split("/").pop() || entry.label;
    const nextFile: ConfigGroupFileView = {
      id: entry.id,
      groupId,
      label: entry.label,
      fileName,
      relativePath,
      absolutePath: entry.path,
      format: entry.format ?? inferConfigFormatFromPath(entry.path),
      isBuiltin: false,
    };

    if (existingIndex >= 0) {
      group.files[existingIndex] = nextFile;
    } else {
      group.files.push(nextFile);
    }
  }

  return groups;
}
