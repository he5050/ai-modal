import { invoke } from "@tauri-apps/api/core";
import type {
  ModelResult,
  OnlineSearchResponse,
  SkillTargetConfig,
  SkillTargetStatus,
  SkillsCatalogSnapshot,
  SkillsCommandRequest,
  SkillsCommandResult,
  SyncSkillTargetResult,
} from "./types";

export async function listModels(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  return invoke("list_models", { baseUrl, apiKey });
}

export async function testModels(
  baseUrl: string,
  apiKey: string,
  models: string[],
): Promise<ModelResult[]> {
  return invoke("test_models", { baseUrl, apiKey, models });
}

export async function listModelsByProvider(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  return invoke("list_models_by_provider", { baseUrl, apiKey });
}

export async function testModelsByProvider(
  baseUrl: string,
  apiKey: string,
  models: string[],
): Promise<ModelResult[]> {
  return invoke("test_models_by_provider", { baseUrl, apiKey, models });
}

export async function testSingleModelByProvider(
  baseUrl: string,
  apiKey: string,
  model: string,
  protocols?: string[],
): Promise<ModelResult> {
  return invoke("test_single_model_by_provider", {
    baseUrl,
    apiKey,
    model,
    protocols: protocols ?? null,
  });
}

export async function testModelConfig(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<ModelResult> {
  return invoke("test_model_config", { baseUrl, apiKey, model });
}

export async function scanLocalSkills(): Promise<SkillsCatalogSnapshot> {
  return invoke("scan_local_skills");
}

export async function inspectSkillTargets(
  targets: SkillTargetConfig[],
): Promise<SkillTargetStatus[]> {
  return invoke("inspect_skill_targets", { targets });
}

export async function syncSkillTargets(
  targets: SkillTargetConfig[],
): Promise<SyncSkillTargetResult[]> {
  return invoke("sync_skill_targets", { targets });
}

export async function runSkillsCommand(
  request: SkillsCommandRequest,
): Promise<SkillsCommandResult> {
  return invoke("run_skills_command", { request });
}

export async function searchOnlineSkills(
  query: string,
  limit = 20,
  source?: string,
): Promise<OnlineSearchResponse> {
  return invoke("search_online_skills", {
    query,
    limit,
    source: source ?? null,
  });
}
