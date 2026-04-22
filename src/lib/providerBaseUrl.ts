export type UrlWritebackKind = "claude" | "openai" | "gemini";

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function stripTrailingSuffixes(baseUrl: string, suffixes: string[]) {
  let normalized = normalizeBaseUrl(baseUrl);

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      if (normalized.endsWith(suffix)) {
        normalized = normalized.slice(0, -suffix.length).replace(/\/+$/, "");
        changed = true;
      }
    }
  }

  return normalized;
}

export function buildOpenAiCompatibleWritebackUrl(baseUrl: string) {
  const normalized = stripTrailingSuffixes(baseUrl, [
    "/chat/completions",
    "/models",
  ]);

  return normalized.endsWith("/v1") ||
    normalized.endsWith("/v1beta/openai") ||
    normalized.endsWith("/openai")
    ? normalized
    : `${normalized}/v1`;
}

export function buildClaudeWritebackUrl(baseUrl: string) {
  return stripTrailingSuffixes(baseUrl, ["/messages", "/models", "/v1"]);
}

export function buildGeminiWritebackUrl(baseUrl: string) {
  const normalized = stripTrailingSuffixes(baseUrl, [
    "/openai/chat/completions",
    "/chat/completions",
    "/models",
    "/v1beta/openai",
    "/v1beta",
    "/openai",
    "/v1",
  ]);

  return normalized.endsWith("/v1beta") ? normalized : `${normalized}/v1beta`;
}

export function inferWritebackKindFromModel(
  model: string,
  protocols: string[] | undefined,
): UrlWritebackKind {
  const protocolSet = new Set(
    (protocols ?? []).map((protocol) => protocol.trim().toLowerCase()),
  );
  const lowerModel = model.trim().toLowerCase();

  if (protocolSet.has("gemini") || lowerModel.includes("gemini")) {
    return "gemini";
  }

  if (protocolSet.has("claude") || lowerModel.includes("claude")) {
    return "claude";
  }

  return "openai";
}

export function buildWritebackUrl(
  baseUrl: string,
  kind: UrlWritebackKind,
) {
  if (kind === "claude") return buildClaudeWritebackUrl(baseUrl);
  if (kind === "gemini") return buildGeminiWritebackUrl(baseUrl);
  return buildOpenAiCompatibleWritebackUrl(baseUrl);
}
