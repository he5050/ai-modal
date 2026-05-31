import { invoke } from "@tauri-apps/api/core";
import type {
  CodexProxyConfig,
  CodexProxySettings,
  CodexProxyStatus,
  CodexProxyTestResult,
  CodexProxyLogEntry,
} from "@/types";

export async function loadCodexProxyConfig(): Promise<CodexProxyConfig> {
  return invoke("load_codex_proxy_config");
}

export async function saveCodexProxyConfig(config: CodexProxyConfig): Promise<CodexProxyStatus> {
  return invoke("save_codex_proxy_config", { config });
}

export async function loadCodexProxySettings(): Promise<CodexProxySettings> {
  return invoke("load_codex_proxy_settings");
}

export async function saveCodexProxySettings(settings: CodexProxySettings): Promise<void> {
  return invoke("save_codex_proxy_settings", { settings });
}

export async function getCodexProxyStatus(): Promise<CodexProxyStatus> {
  return invoke("get_codex_proxy_status");
}

export async function startCodexProxyGateway(config: CodexProxyConfig): Promise<CodexProxyStatus> {
  return invoke("start_codex_proxy_gateway", { config });
}

export async function stopCodexProxyGateway(): Promise<CodexProxyStatus> {
  return invoke("stop_codex_proxy_gateway");
}

export async function testCodexProxyProvider(
  targetUrl: string,
  apiKey: string,
  model: string
): Promise<CodexProxyTestResult> {
  return invoke("test_codex_proxy_provider", { targetUrl, apiKey, model });
}

export async function getCodexProxyLogs(): Promise<CodexProxyLogEntry[]> {
  return invoke("get_codex_proxy_logs");
}

export async function setCodexProxyAutostart(enabled: boolean): Promise<boolean> {
  return invoke("set_codex_proxy_autostart", { enabled });
}

export async function applyCodexProxyToCodex(config: CodexProxyConfig): Promise<string> {
  return invoke("apply_codex_proxy_to_codex", { config });
}
