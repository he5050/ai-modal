import type { ConfigPath, PromptRecord, Provider, RulePath } from "../types";
import { parsePromptCategories } from "./promptStore";

export function parseProviders(raw: unknown): Provider[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: Provider & { providerType?: string }) => {
    const { providerType: _providerType, ...provider } = item;
    return provider;
  });
}

export function parseRulePaths(raw: unknown): RulePath[] {
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

export function parseConfigPaths(raw: unknown): ConfigPath[] {
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

export function parsePrompts(raw: unknown): PromptRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is {
        id: string;
        title: string;
        content: string;
        tags?: unknown;
        category?: unknown;
        createdAt: number;
        updatedAt: number;
      } =>
        typeof item?.id === "string" &&
        typeof item?.title === "string" &&
        typeof item?.content === "string" &&
        typeof item?.createdAt === "number" &&
        typeof item?.updatedAt === "number",
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      tags:
        typeof item.category === "string" &&
        parsePromptCategories(item.category).length > 0
          ? parsePromptCategories(item.category)
          : Array.isArray(item.tags)
            ? item.tags.filter((tag): tag is string => typeof tag === "string")
            : [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
