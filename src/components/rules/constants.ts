interface BuiltinTool {
  id: string;
  label: string;
  fileName: string;
  relativePath: string;
  accentClass: string;
  kind?: "file" | "directory";
}

export const BUILTIN_TOOLS: BuiltinTool[] = [
  {
    id: "claude-code",
    label: "Claude",
    fileName: "CLAUDE.md",
    relativePath: ".claude/CLAUDE.md",
    accentClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  },
  {
    id: "codex",
    label: "Codex",
    fileName: "AGENTS.md",
    relativePath: ".codex/AGENTS.md",
    accentClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  },
  {
    id: "qwen",
    label: "Qwen",
    fileName: "QWEN.md",
    relativePath: ".qwen/QWEN.md",
    accentClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  {
    id: "opencode",
    label: "OpenCode",
    fileName: "AGENTS.md",
    relativePath: ".opencode/AGENTS.md",
    accentClass: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  },
  {
    id: "gemini",
    label: "Gemini",
    fileName: "GEMINI.md",
    relativePath: ".gemini/GEMINI.md",
    accentClass: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200",
  },
];
