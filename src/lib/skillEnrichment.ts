import type {
  InstalledSkillSnapshot,
  SkillEnrichmentRecord,
  SkillRecord,
} from "../types";

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
