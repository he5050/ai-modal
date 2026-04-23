import type {
  InstalledSkillSnapshot,
  LlmRequestKind,
  Provider,
  SkillEnrichmentRecord,
  SkillRecord,
  SystemLlmProfile,
} from "../types";

function inferRequestKind(
  model: string,
  supportedProtocols: string[] | undefined,
): LlmRequestKind {
  const normalized = new Set(
    (supportedProtocols ?? []).map((protocol) => protocol.trim().toLowerCase()),
  );
  const lowerModel = model.trim().toLowerCase();

  if (normalized.has("gemini") || lowerModel.includes("gemini")) {
    return "gemini";
  }

  if (normalized.has("claude") || lowerModel.includes("claude")) {
    return "claude";
  }

  return "openai-chat";
}

export function buildFallbackProfiles(providers: Provider[]): SystemLlmProfile[] {
  return providers
    .flatMap((provider) => {
      const availableModels = (provider.lastResult?.results ?? []).filter(
        (result) => result.available,
      );
      if (availableModels.length === 0) return [];

      const preferred = availableModels[0];
      return [
        {
          toolId: `provider:${provider.id}`,
          label: provider.name,
          sourcePath: "provider-fallback",
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: preferred.model,
          requestKind: inferRequestKind(
            preferred.model,
            preferred.supported_protocols,
          ),
          protocols: preferred.supported_protocols ?? [],
          updatedAt: provider.lastResult?.timestamp ?? provider.createdAt,
        },
      ];
    })
    .sort(
      (left, right) =>
        (right.updatedAt ?? 0) - (left.updatedAt ?? 0) ||
        left.label.localeCompare(right.label),
    );
}

export function getSkillEnrichment(
  skill: SkillRecord,
  enrichments: Record<string, SkillEnrichmentRecord>,
) {
  return enrichments[skill.dir] ?? null;
}

export function getSkillDescription(
  skill: SkillRecord,
  enrichments: Record<string, SkillEnrichmentRecord>,
) {
  const enrichment = getSkillEnrichment(skill, enrichments);
  return enrichment?.localizedDescription || skill.description || "暂无说明";
}

export function getSkillTags(
  skill: SkillRecord,
  enrichments: Record<string, SkillEnrichmentRecord>,
) {
  const enrichment = getSkillEnrichment(skill, enrichments);
  if (enrichment && enrichment.tags.length > 0) {
    return enrichment.tags;
  }
  return skill.categories;
}

export function needsSkillEnrichment(
  skill: SkillRecord,
  enrichments: Record<string, SkillEnrichmentRecord>,
) {
  const enrichment = getSkillEnrichment(skill, enrichments);
  if (!enrichment) return true;
  if (enrichment.status !== "success") return true;
  if (!enrichment.localizedDescription.trim()) return true;
  if (enrichment.tags.length < 2) return true;
  if ((enrichment.sourceUpdatedAt ?? null) !== (skill.updatedAt ?? null)) {
    return true;
  }
  if ((enrichment.sourceDescription ?? "") !== (skill.description ?? "")) {
    return true;
  }
  return false;
}

function compactSearchParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .toLowerCase();
}

export function buildInstalledSkillSnapshot(
  skill: SkillRecord,
  enrichment?: SkillEnrichmentRecord | null,
): InstalledSkillSnapshot {
  const displayDescription =
    enrichment?.localizedDescription || skill.description || "暂无说明";
  const tags =
    enrichment && enrichment.tags.length > 0 ? enrichment.tags : skill.categories;

  return {
    skillDir: skill.dir,
    skillName: skill.name,
    skillPath: skill.path,
    sourceDescription: skill.description,
    displayDescription,
    fullDescription: enrichment?.fullDescription || skill.description || "",
    contentSummary: enrichment?.contentSummary || "",
    usage: enrichment?.usage || "",
    scenarios: enrichment?.scenarios || "",
    tags,
    searchText: compactSearchParts([
      skill.name,
      skill.dir,
      skill.description,
      displayDescription,
      enrichment?.fullDescription,
      enrichment?.contentSummary,
      enrichment?.usage,
      enrichment?.scenarios,
      tags.join(" "),
    ]),
    updatedAt: skill.updatedAt ?? null,
    enrichedAt: enrichment?.enrichedAt ?? null,
    status: enrichment?.status ?? "idle",
  };
}

export function buildInstalledSkillSnapshots(
  skills: SkillRecord[],
  enrichments: Record<string, SkillEnrichmentRecord>,
): Record<string, InstalledSkillSnapshot> {
  return Object.fromEntries(
    skills.map((skill) => [
      skill.dir,
      buildInstalledSkillSnapshot(skill, enrichments[skill.dir] ?? null),
    ]),
  );
}
