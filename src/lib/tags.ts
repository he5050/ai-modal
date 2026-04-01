// 品牌 tag
const BRAND_TAGS: { tag: string; keywords: string[] }[] = [
  { tag: "gpt",      keywords: ["gpt"] },
  { tag: "claude",   keywords: ["claude"] },
  { tag: "gemini",   keywords: ["gemini"] },
  { tag: "deepseek", keywords: ["deepseek"] },
  { tag: "qwen",     keywords: ["qwen"] },
  { tag: "glm",      keywords: ["glm"] },
  { tag: "kimi",     keywords: ["kimi", "moonshot"] },
  { tag: "llama",    keywords: ["llama"] },
  { tag: "mistral",  keywords: ["mistral", "mixtral"] },
  { tag: "minimax",  keywords: ["minimax", "minmax"] },
  { tag: "yi",       keywords: ["-yi-", "/yi-"] },
  { tag: "ernie",    keywords: ["ernie"] },
  { tag: "hunyuan",  keywords: ["hunyuan"] },
  { tag: "doubao",   keywords: ["doubao"] },
  { tag: "spark",    keywords: ["spark"] },
]

// 能力 tag
const ABILITY_TAGS: { tag: string; keywords: string[] }[] = [
  { tag: "vision",    keywords: ["vision", "-vl", "/vl", "visual"] },
  { tag: "embedding", keywords: ["embed", "embedding"] },
  { tag: "rerank",    keywords: ["rerank"] },
  { tag: "code",      keywords: ["code", "coder", "coding"] },
  { tag: "math",      keywords: ["math"] },
  { tag: "audio",     keywords: ["audio", "whisper", "speech", "tts"] },
]

export interface TagResult {
  brands: string[]
  abilities: string[]
}

export function extractTags(models: string[]): TagResult {
  const brands = new Set<string>()
  const abilities = new Set<string>()
  for (const model of models) {
    const lower = model.toLowerCase()
    for (const { tag, keywords } of BRAND_TAGS) {
      if (keywords.some(kw => lower.includes(kw))) brands.add(tag)
    }
    for (const { tag, keywords } of ABILITY_TAGS) {
      if (keywords.some(kw => lower.includes(kw))) abilities.add(tag)
    }
  }
  return {
    brands: Array.from(brands).sort(),
    abilities: Array.from(abilities).sort(),
  }
}
